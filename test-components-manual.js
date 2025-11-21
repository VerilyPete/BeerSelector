/**
 * Manual component validation script
 * This script performs basic checks on the AboutSection and DataManagementSection components
 */

console.log('=== Component Validation Script ===\n');

// Check 1: File existence
const fs = require('fs');
const aboutPath = './components/settings/AboutSection.tsx';
const dataPath = './components/settings/DataManagementSection.tsx';

console.log('1. Checking file existence...');
if (fs.existsSync(aboutPath)) {
  console.log('   ✓ AboutSection.tsx exists');
} else {
  console.log('   ✗ AboutSection.tsx NOT FOUND');
}

if (fs.existsSync(dataPath)) {
  console.log('   ✓ DataManagementSection.tsx exists');
} else {
  console.log('   ✗ DataManagementSection.tsx NOT FOUND');
}

// Check 2: Basic syntax validation (look for required exports)
console.log('\n2. Checking exports...');
const aboutContent = fs.readFileSync(aboutPath, 'utf8');
const dataContent = fs.readFileSync(dataPath, 'utf8');

if (aboutContent.includes('export default function AboutSection')) {
  console.log('   ✓ AboutSection has default export');
} else {
  console.log('   ✗ AboutSection missing default export');
}

if (dataContent.includes('export default function DataManagementSection')) {
  console.log('   ✓ DataManagementSection has default export');
} else {
  console.log('   ✗ DataManagementSection missing default export');
}

// Check 3: Interface definitions
console.log('\n3. Checking TypeScript interfaces...');
if (aboutContent.includes('interface AboutSectionProps')) {
  console.log('   ✓ AboutSection has Props interface');
} else {
  console.log('   ✗ AboutSection missing Props interface');
}

if (dataContent.includes('interface DataManagementSectionProps')) {
  console.log('   ✓ DataManagementSection has Props interface');
} else {
  console.log('   ✗ DataManagementSection missing Props interface');
}

// Check 4: Required imports
console.log('\n4. Checking imports...');
const aboutRequiredImports = [
  'react-native',
  'expo-constants',
  'expo-web-browser',
  '@/components/ThemedText',
  '@/components/ThemedView',
  '@/hooks/useThemeColor'
];

const dataRequiredImports = [
  'react-native',
  '@/components/ThemedText',
  '@/components/ThemedView',
  '@/hooks/useThemeColor'
];

aboutRequiredImports.forEach(imp => {
  if (aboutContent.includes(`from '${imp}'`)) {
    console.log(`   ✓ AboutSection imports ${imp}`);
  } else {
    console.log(`   ✗ AboutSection missing import: ${imp}`);
  }
});

dataRequiredImports.forEach(imp => {
  if (dataContent.includes(`from '${imp}'`)) {
    console.log(`   ✓ DataManagementSection imports ${imp}`);
  } else {
    console.log(`   ✗ DataManagementSection missing import: ${imp}`);
  }
});

// Check 5: Key features from test specs
console.log('\n5. Checking AboutSection features...');
const aboutFeatures = [
  { name: 'Version display', pattern: /Version.*version/ },
  { name: 'Build number', pattern: /Platform\.select/ },
  { name: 'Copyright notice', pattern: /currentYear/ },
  { name: 'Help URL', pattern: /helpUrl/ },
  { name: 'Privacy URL', pattern: /privacyUrl/ },
  { name: 'WebBrowser usage', pattern: /WebBrowser\.openBrowserAsync/ },
];

aboutFeatures.forEach(({ name, pattern }) => {
  if (pattern.test(aboutContent)) {
    console.log(`   ✓ ${name}`);
  } else {
    console.log(`   ✗ Missing: ${name}`);
  }
});

console.log('\n6. Checking DataManagementSection features...');
const dataFeatures = [
  { name: 'Refresh functionality', pattern: /onRefresh/ },
  { name: 'Login functionality', pattern: /onLogin/ },
  { name: 'Untappd login', pattern: /onUntappdLogin/ },
  { name: 'Untappd logout', pattern: /onUntappdLogout/ },
  { name: 'Loading state', pattern: /refreshing/ },
  { name: 'API configured check', pattern: /apiUrlsConfigured/ },
  { name: 'First login check', pattern: /isFirstLogin/ },
  { name: 'ActivityIndicator', pattern: /ActivityIndicator/ },
];

dataFeatures.forEach(({ name, pattern }) => {
  if (pattern.test(dataContent)) {
    console.log(`   ✓ ${name}`);
  } else {
    console.log(`   ✗ Missing: ${name}`);
  }
});

// Check 7: Accessibility features
console.log('\n7. Checking accessibility...');
const aboutAccessibility = [
  'accessibilityLabel',
  'accessibilityRole',
  'accessibilityHint'
];

const dataAccessibility = [
  'accessibilityLabel',
  'accessibilityRole',
  'accessibilityState'
];

aboutAccessibility.forEach(feature => {
  if (aboutContent.includes(feature)) {
    console.log(`   ✓ AboutSection has ${feature}`);
  } else {
    console.log(`   ⚠ AboutSection missing ${feature}`);
  }
});

dataAccessibility.forEach(feature => {
  if (dataContent.includes(feature)) {
    console.log(`   ✓ DataManagementSection has ${feature}`);
  } else {
    console.log(`   ⚠ DataManagementSection missing ${feature}`);
  }
});

// Check 8: Dark mode support
console.log('\n8. Checking dark mode support...');
if (aboutContent.includes('useThemeColor')) {
  console.log('   ✓ AboutSection uses useThemeColor');
} else {
  console.log('   ✗ AboutSection missing dark mode support');
}

if (dataContent.includes('useThemeColor')) {
  console.log('   ✓ DataManagementSection uses useThemeColor');
} else {
  console.log('   ✗ DataManagementSection missing dark mode support');
}

console.log('\n=== Validation Complete ===\n');
