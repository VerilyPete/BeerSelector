#!/usr/bin/env python3
"""Reserve the next distribution build in XcodeGen's shared settings."""
import pathlib
import re
import shutil
import subprocess
import sys


def main():
    native_dir = pathlib.Path(__file__).resolve().parent.parent
    spec = native_dir / 'project.yml'
    xcodegen = shutil.which('xcodegen')
    if xcodegen is None:
        sys.exit('Install XcodeGen before incrementing the build number.')
    original = spec.read_text()
    pattern = r"(?m)^(    CURRENT_PROJECT_VERSION: )'([0-9]+)'$"
    matches = list(re.finditer(pattern, original))
    if len(matches) != 1:
        sys.exit('Expected one shared integer CURRENT_PROJECT_VERSION in project.yml.')
    number = max(60, int(matches[0].group(2)) + 1)
    updated = re.sub(pattern, lambda match: f"{match[1]}'{number}'", original)
    spec.write_text(updated)
    try:
        subprocess.run([xcodegen, 'generate', '--spec', str(spec)], check=True)
    except (OSError, subprocess.CalledProcessError):
        spec.write_text(original)
        # Restore the generated project as well if generation partially completed.
        subprocess.run([xcodegen, 'generate', '--spec', str(spec)], check=False)
        sys.exit('Generation failed; restored the previous version in project.yml.')
    print(f'Reserved build {number} for the app and widget. Review and commit both project files.')


if __name__ == '__main__':
    main()
