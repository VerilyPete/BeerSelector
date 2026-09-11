import Foundation
import Security

/// Retains Expo SecureStore's service, binary account keys, and committed-generation format.
struct CredentialStore {
    struct Generation: Codable { var generation: String; var count: Int; var hasSession: Bool? }
    var prefix = "beerknurd_auth_cookies"
    var sessionStorageKey = "beerknurd_session"
    private func query(_ key: String, service: String) -> [String: Any] {
        [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:Data(key.utf8),kSecAttrGeneric as String:Data(key.utf8)]
    }
    func read(_ key: String) throws -> Data? {
        for service in ["app:no-auth", "app", "app:auth"] {
            var q = query(key,service:service); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
            var result: CFTypeRef?
            let status = SecItemCopyMatching(q as CFDictionary,&result)
            if status == errSecSuccess { return result as? Data }
            if status != errSecItemNotFound { throw BeerError.storage("Keychain error \(status)") }
        }
        return nil
    }
    func write(_ key: String, _ data: Data) throws {
        let q = query(key,service:"app:no-auth")
        let updated = SecItemUpdate(q as CFDictionary,[kSecValueData as String:data] as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw BeerError.storage("Keychain error \(updated)") }
        var add = q; add[kSecValueData as String] = data; add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary,nil)
        guard status == errSecSuccess else { throw BeerError.storage("Keychain error \(status)") }
    }
    func delete(_ key: String) throws {
        var failure: OSStatus?
        for service in ["app:no-auth", "app", "app:auth"] {
            let status = SecItemDelete(query(key,service:service) as CFDictionary)
            if status != errSecSuccess && status != errSecItemNotFound { failure = status }
        }
        if let failure { throw BeerError.storage("Keychain error \(failure)") }
    }
    private func generation() throws -> Generation? {
        guard let data = try read(prefix + "_meta") else { return nil }
        let g = try JSONDecoder().decode(Generation.self,from:data)
        guard (1...1000).contains(g.count), g.generation.range(of:#"^[A-Za-z0-9_-]+$"#,options:.regularExpression) != nil else { throw BeerError.storage("Invalid credential commit marker") }
        return g
    }
    func load() throws -> (MemberSession?, [String: String]) {
        let g = try generation()
        let sessionKey = g?.hasSession == true ? "\(prefix)_\(g!.generation)_session" : sessionStorageKey
        let session = try read(sessionKey).map { try JSONDecoder().decode(MemberSession.self,from:$0) }
        if g?.hasSession == true && session == nil { throw BeerError.storage("Incomplete saved session") }
        guard let g else { return (session,[:]) }
        var encoded = ""
        for index in 0..<g.count {
            guard let data = try read("\(prefix)_\(g.generation)_\(index)"), let chunk = String(data:data,encoding:.utf8) else { throw BeerError.storage("Incomplete saved credentials") }
            encoded += chunk
        }
        guard let cookies = Data(base64Encoded:encoded) else { throw BeerError.storage("Unreadable saved credentials") }
        return (session,try JSONDecoder().decode([String:String].self,from:cookies))
    }
    func save(session: MemberSession, cookies: [String: String]) throws {
        let encoded = try JSONEncoder().encode(cookies).base64EncodedString()
        let chars = Array(encoded)
        let chunks = stride(from:0,to:chars.count,by:1500).map { String(chars[$0..<min($0+1500,chars.count)]) }
        let g = Generation(generation:UUID().uuidString,count:chunks.count,hasSession:true)
        let registryData = try read(prefix + "_generations")
        var registry = try registryData.map { try JSONDecoder().decode([Generation].self,from:$0) } ?? []
        registry.append(g)
        try write(prefix + "_generations",JSONEncoder().encode(registry))
        for (index,chunk) in chunks.enumerated() { try write("\(prefix)_\(g.generation)_\(index)",Data(chunk.utf8)) }
        try write("\(prefix)_\(g.generation)_session",JSONEncoder().encode(session))
        try write(prefix + "_meta",JSONEncoder().encode(g))
        // Prune only after the new marker commits. Failed cleanup remains registered for logout.
        var retained = [g]
        for old in registry where old.generation != g.generation {
            do {
                guard (1...1000).contains(old.count), old.generation.range(of:#"^[A-Za-z0-9_-]+$"#,options:.regularExpression) != nil else { retained.append(old); continue }
                for index in 0..<old.count { try delete("\(prefix)_\(old.generation)_\(index)") }
                try delete("\(prefix)_\(old.generation)_session")
            } catch { retained.append(old) }
        }
        try? write(prefix + "_generations",JSONEncoder().encode(retained))
    }
    func clear() throws {
        var keys = [sessionStorageKey,prefix,prefix + "_meta",prefix + "_generations"]
        // Enumeration is limited to the app's accessible items, then to BeerSelector credential keys.
        for service in ["app:no-auth", "app", "app:auth"] {
            let q: [String:Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecReturnAttributes as String:true,kSecMatchLimit as String:kSecMatchLimitAll]
            var result: CFTypeRef?
            let status = SecItemCopyMatching(q as CFDictionary,&result)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw BeerError.storage("Keychain error \(status)") }
            for row in result as? [[String:Any]] ?? [] {
                let data = row[kSecAttrAccount as String] as? Data
                if let key = data.flatMap({String(data:$0,encoding:.utf8)}), key.hasPrefix(prefix) || key == sessionStorageKey { keys.append(key) }
            }
        }
        var error: Error?
        for key in Set(keys) { do { try delete(key) } catch let e { error = e } }
        if let error { throw error }
    }
}
