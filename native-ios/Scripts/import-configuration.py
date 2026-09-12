#!/usr/bin/env python3
"""Copy only supported public app configuration from an RN dotenv file; never print values."""
import pathlib, plistlib, sys
source = pathlib.Path(sys.argv[1])
values = {}
for line in source.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    key, value = line.removeprefix('export ').split('=', 1)
    values[key.strip()] = value.strip().strip('"\'')
mapping = {'EXPO_PUBLIC_API_BASE_URL': 'BeerAPIBaseURL', 'EXPO_PUBLIC_ENRICHMENT_API_URL': 'EnrichmentURL', 'EXPO_PUBLIC_ENRICHMENT_API_KEY': 'EnrichmentKey',
           'EXPO_PUBLIC_ENRICHMENT_TIMEOUT': 'EnrichmentTimeout',
           'EXPO_PUBLIC_ENRICHMENT_BATCH_SIZE': 'EnrichmentBatchSize',
           'EXPO_PUBLIC_ENRICHMENT_RATE_WINDOW': 'EnrichmentRateWindow',
           'EXPO_PUBLIC_ENRICHMENT_RATE_MAX': 'EnrichmentRateMax'}
config = {target: values[key] for key, target in mapping.items() if values.get(key)}
target = pathlib.Path(__file__).resolve().parents[1] / 'Resources/ServiceConfiguration.plist'
target.write_bytes(plistlib.dumps(config))
print('Wrote ignored native service configuration; values omitted.')
