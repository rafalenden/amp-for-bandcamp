// semantic-release, run by the Release workflow (.github/workflows/release.yml).
//
// It reads the commits since the last `v*` tag and picks the next version:
//   fix: / perf:        -> patch
//   feat:               -> minor
//   BREAKING CHANGE     -> major
// Other types (chore, docs, test, ci, refactor...) do not cause a release.
export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/exec',
      {
        // Write the new version into package.json and the Xcode project, then
        // build the store zips so that they carry it.
        prepareCmd:
          'bash scripts/version ${nextRelease.version} && npm run build:zip',
        // Tell the store jobs of the workflow what was released.
        successCmd:
          'echo "version=${nextRelease.version}" >> "$GITHUB_OUTPUT" && echo "tag=${nextRelease.gitTag}" >> "$GITHUB_OUTPUT"',
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: [
          'package.json',
          'package-lock.json',
          'safari/xcconfig/Base.xcconfig',
        ],
        message: 'chore(release): ${nextRelease.version} [skip ci]',
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          { path: '.output/*-chrome.zip', label: 'Chrome extension' },
          { path: '.output/*-firefox.zip', label: 'Firefox add-on' },
          {
            path: '.output/*-sources.zip',
            label: 'Sources (for Mozilla review)',
          },
        ],
        successComment: false,
        failComment: false,
        releasedLabels: false,
      },
    ],
  ],
};
