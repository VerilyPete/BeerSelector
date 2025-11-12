// https://docs.expo.dev/guides/using-eslint/
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
            message: 'Use repositories directly instead of db.ts compatibility layer. See MIGRATION_GUIDE_REPOSITORIES.md'
          }
        ]
      }
    ]
  }
};
