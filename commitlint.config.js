// Commit messages decide the next version number (see release.config.js), so
// they have to follow Conventional Commits: `type(scope): subject`.
export default {
  extends: ['@commitlint/config-conventional'],
  // Dependabot writes its own subjects.
  ignores: [(message) => /^Bump /.test(message)],
  rules: {
    // "feat: Add mute button" and "feat: add mute button" are both fine.
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
