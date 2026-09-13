#!/usr/bin/env python3
"""Exercise the Cloud post-clone boundary using only synthetic credentials."""
import base64
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import unittest


class CloudConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(Path(__file__).resolve().parents[1] / "ci_scripts", self.root / "ci_scripts")
        (self.root / "Resources").mkdir()
        self.target = self.root / "Resources/ServiceConfiguration.plist"
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("BEERSELECTOR_")}

    def run_hook(self):
        result = subprocess.run(["sh", str(self.root / "ci_scripts/ci_post_clone.sh")],
                                env=self.env, capture_output=True, text=True)
        self.assertNotIn("synthetic-secret", result.stdout + result.stderr)
        return result

    def test_test_workflow_needs_no_credentials(self):
        self.assertEqual(self.run_hook().returncode, 0)
        self.assertEqual(plistlib.loads(self.target.read_bytes()), {})

    def test_distribution_rejects_missing_or_invalid_configuration(self):
        self.env["BEERSELECTOR_DISTRIBUTION"] = "external"
        for raw in [None, b"not a plist", b"<?xml version='1.0'?><plist><dict>",
                    plistlib.dumps({}),
                    plistlib.dumps({"EnrichmentKey": "synthetic-secret", "EnrichmentURL": "http://example.invalid"}),
                    plistlib.dumps({"EnrichmentKey": "synthetic-secret", "EnrichmentURL": "https://user:password@example.invalid"})]:
            with self.subTest(raw=raw is None):
                if raw is not None:
                    self.env["BEERSELECTOR_SERVICE_CONFIGURATION_BASE64"] = base64.b64encode(raw).decode()
                result = self.run_hook()
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("Traceback", result.stderr)
                self.assertFalse(self.target.exists())

    def test_distribution_imports_valid_configuration_privately(self):
        config = {"EnrichmentKey": "synthetic-secret", "EnrichmentURL": "https://example.invalid"}
        self.env["BEERSELECTOR_DISTRIBUTION"] = "external"
        self.env["BEERSELECTOR_SERVICE_CONFIGURATION_BASE64"] = base64.b64encode(plistlib.dumps(config)).decode()
        self.assertEqual(self.run_hook().returncode, 0)
        self.assertEqual(plistlib.loads(self.target.read_bytes()), config)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)


if __name__ == "__main__":
    unittest.main()
