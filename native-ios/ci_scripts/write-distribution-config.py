#!/usr/bin/env python3
"""Validate the Cloud secret without writing its contents to build logs."""
import base64
import os
from pathlib import Path
import plistlib
import sys
from urllib.parse import urlsplit
from xml.parsers.expat import ExpatError


def main():
    try:
        encoded = os.environ["BEERSELECTOR_SERVICE_CONFIGURATION_BASE64"]
        config = plistlib.loads(base64.b64decode(encoded, validate=True))
        if not isinstance(config, dict):
            raise ValueError()
        key = config.get("EnrichmentKey")
        url = config.get("EnrichmentURL")
        if not isinstance(key, str) or not key.strip() or not isinstance(url, str):
            raise ValueError()
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError()
        data = plistlib.dumps(config)
    except (KeyError, ValueError, TypeError, plistlib.InvalidFileException, ExpatError):
        print("External distribution requires a valid secret BEERSELECTOR_SERVICE_CONFIGURATION_BASE64 containing EnrichmentURL (HTTPS) and EnrichmentKey.", file=sys.stderr)
        return 1
    target = Path(sys.argv[1])
    target.write_bytes(data)
    target.chmod(0o600)
    print("Distribution service configuration validated; values omitted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
