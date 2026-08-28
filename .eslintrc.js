// https://docs.expo.dev/guides/using-eslint/
const vitestGlobals = [
  'describe',
  'it',
  'test',
  'expect',
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
  'vi',
];

module.exports = {
  extends: 'expo',
  ignorePatterns: ['/dist/*'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/database/db'],
            message:
              'Use repositories directly instead of db.ts compatibility layer. See MIGRATION_GUIDE_REPOSITORIES.md',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // `.test.ts` runs on vitest; `.test.tsx` runs on jest-expo. `@types/jest`
      // has to stay installed for the .tsx suites, and with no `types` array in
      // tsconfig.json it is ambient everywhere -- so without this rule a vitest
      // suite gets jest's *types* for globals that are vitest's at *runtime*.
      // That mismatch hid 55 bare .mockImplementation() calls, 7 unsound
      // mock.calls dereferences, and vitest's toBeOneOf failing to resolve.
      // Importing each global from 'vitest' shadows the ambient declaration for
      // both value and type resolution; this rule stops new files regressing.
      // Deliberately scoped to `.test.ts` so the .tsx suites and the ambient
      // `jest` in __mocks__/ are unaffected.
      files: ['**/*.test.ts'],
      rules: {
        'no-restricted-globals': [
          'error',
          ...vitestGlobals.map(name => ({
            name,
            message: `Import ${name} from 'vitest'. The ambient global is typed by @types/jest but is vitest's at runtime.`,
          })),
          {
            name: 'jest',
            message:
              "Use `vi` imported from 'vitest'. The jest global alias was removed from the vitest suites.",
          },
          {
            name: 'fail',
            message:
              'vitest does not define fail(); it throws ReferenceError. Capture the error outside the try and assert on it instead.',
          },
        ],
      },
    },
  ],
};
