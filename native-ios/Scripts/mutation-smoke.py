#!/usr/bin/env python3
"""Seed a small set of known regressions in a disposable copy; never edit the checkout."""
import argparse
import json
import pathlib
import plistlib
import shutil
import subprocess
import tempfile

MUTATIONS = [
    ('unknown-abv-first', 'Core/Models.swift',
     'if a.element.abv == nil && b.element.abv != nil { return false }',
     'if a.element.abv == nil && b.element.abv != nil { return true }'),
    ('replay-other-member', 'Core/AppModel.swift',
     'if let owner = op.payload["memberId"], owner != member.memberId { continue }',
     'if false { continue }'),
    ('replay-other-store', 'Core/AppModel.swift',
     'if let store = op.payload["storeId"], store != member.storeId { continue }',
     'if false { continue }'),
    ('accept-missing-session', 'Core/Credentials.swift',
     'if g?.hasSession == true && session == nil { throw BeerError.storage("Incomplete saved session") }',
     'if false { throw BeerError.storage("Incomplete saved session") }'),
]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--destination', required=True, help='An isolated iOS Simulator xcodebuild destination')
    args = parser.parse_args()
    if not args.destination.startswith('platform=iOS Simulator,'):
        parser.error('Mutation probes only support an isolated simulator.')
    source = pathlib.Path(__file__).resolve().parents[1]
    work = pathlib.Path(tempfile.mkdtemp(prefix='beerselector-mutations-'))
    native = work / 'native-ios'
    shutil.copytree(source, native, ignore=shutil.ignore_patterns(
        'ServiceConfiguration.plist', 'xcuserdata', 'project.xcworkspace', '.build', '__pycache__'))
    # Prove tests build without production credentials. The project references this optional local resource.
    (native / 'Resources/ServiceConfiguration.plist').write_bytes(plistlib.dumps({}))
    command = ['xcodebuild', '-project', str(native / 'BeerSelectorNative.xcodeproj'),
               '-scheme', 'BeerSelectorNative', '-testPlan', 'All', '-destination', args.destination,
               '-parallel-testing-enabled', 'NO', '-derivedDataPath', str(work / 'build'),
               'CODE_SIGN_IDENTITY=-', 'CODE_SIGNING_ALLOWED=YES', 'SWIFT_TREAT_WARNINGS_AS_ERRORS=NO', 'test']
    results = []
    print(f'Artifacts: {work}', flush=True)

    def run(name):
        result = work / (name + '.xcresult')
        with (work / (name + '.log')).open('w') as log:
            try:
                completed = subprocess.run(command + ['-resultBundlePath', str(result)],
                                           stdout=log, stderr=subprocess.STDOUT, timeout=300)
            except subprocess.TimeoutExpired:
                return {'name':name, 'outcome':'timeout'}
        try:
            summary = json.loads(subprocess.check_output(
                ['xcrun','xcresulttool','get','test-results','summary','--path',str(result)], stderr=subprocess.DEVNULL))
        except (subprocess.CalledProcessError, json.JSONDecodeError):
            return {'name':name, 'outcome':'invalid-run', 'exitCode':completed.returncode}
        failed = summary.get('failedTests', 0)
        passed = summary.get('passedTests', 0)
        outcome = 'survived' if completed.returncode == 0 and passed > 0 else 'killed' if failed > 0 else 'invalid-run'
        return {'name':name, 'outcome':outcome, 'passed':passed, 'failed':failed,
                'failures':summary.get('testFailures', [])}

    baseline = run('baseline')
    results.append(baseline)
    print(f'baseline: {baseline["outcome"]}', flush=True)
    if baseline['outcome'] != 'survived':
        (work / 'report.json').write_text(json.dumps(results, indent=2))
        raise SystemExit('Baseline did not pass; no mutations were run.')
    for name, filename, old, new in MUTATIONS:
        path = native / filename
        original = path.read_text()
        if original.count(old) != 1:
            raise SystemExit(f'{name}: mutation anchor changed; review this probe.')
        try:
            path.write_text(original.replace(old, new, 1))
            result = run(name)
            results.append(result)
            print(f'{name}: {result["outcome"]}', flush=True)
        finally:
            path.write_text(original)
        (work / 'report.json').write_text(json.dumps(results, indent=2))
    raise SystemExit(0 if all(r['outcome'] == 'killed' for r in results[1:]) else 1)

if __name__ == '__main__':
    main()
