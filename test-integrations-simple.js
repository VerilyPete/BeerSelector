/**
 * Simple manual test to verify SkeletonLoader integration
 */

const fs = require('fs');
const path = require('path');

console.log('=== SkeletonLoader Integration Manual Test ===\n');

const components = [
  { name: 'AllBeers', path: 'components/AllBeers.tsx' },
  { name: 'Beerfinder', path: 'components/Beerfinder.tsx' },
  { name: 'TastedBrewList', path: 'components/TastedBrewList.tsx' },
];

let allPassed = true;

components.forEach(component => {
  console.log(`\nChecking ${component.name}:`);
  const filePath = path.join(__dirname, component.path);

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');

    const checks = [
      { name: 'Imports SkeletonLoader', test: content.includes("from './beer/SkeletonLoader'") || content.includes('from "./beer/SkeletonLoader"') },
      { name: 'Renders SkeletonLoader', test: content.includes('<SkeletonLoader') },
      { name: 'Shows skeleton on loading', test: content.includes('loading') && content.includes('length === 0') },
      { name: 'Passes count prop', test: content.includes('count={20}') || content.includes('count={') },
    ];

    checks.forEach(check => {
      const status = check.test ? '✓' : '✗';
      console.log(`  ${status} ${check.name}`);
      if (!check.test) allPassed = false;
    });

    const passedCount = checks.filter(c => c.test).length;
    console.log(`  Result: ${passedCount}/${checks.length} checks passed`);
  } else {
    console.log(`  ✗ File does not exist: ${component.path}`);
    allPassed = false;
  }
});

if (allPassed) {
  console.log('\n✓✓✓ All integration checks passed! ✓✓✓');
  process.exit(0);
} else {
  console.log('\n✗✗✗ Some integration checks failed ✗✗✗');
  process.exit(1);
}
