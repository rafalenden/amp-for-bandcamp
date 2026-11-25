// Runs semantic-release for the Release workflow and shows its result on the
// run's summary page, so the version and release notes can be read there
// instead of in the logs. Pass --dry-run to only show what would be released.
//
// Sets the `version` and `tag` step outputs when a release was made (not in a
// dry run), which the store jobs of the workflow wait for.

import { appendFileSync } from 'node:fs';
import semanticRelease from 'semantic-release';

const dryRun = process.argv.includes('--dry-run');

function append(file, text) {
  if (file) appendFileSync(file, text);
  else process.stdout.write(text);
}

const summary = (text) => append(process.env.GITHUB_STEP_SUMMARY, text);

const result = await semanticRelease({ dryRun });

if (!result) {
  summary(
    [
      '## Nothing to release',
      '',
      'There are no `feat:`, `fix:` or `perf:` commits since the last release, so no version was made and nothing was sent to the stores.',
      '',
    ].join('\n'),
  );
  process.exit(0);
}

const { lastRelease, nextRelease, commits } = result;
const repository = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY ?? 'rafalenden/amp-for-bandcamp'}`;
const previous = lastRelease?.version ?? 'none';

const lines = dryRun
  ? [
      `## Dry run: the next release would be ${nextRelease.version}`,
      '',
      `Previous release: ${previous}. Nothing was tagged or published. Run the workflow again without "Only show which version would be released" to release it.`,
    ]
  : [
      `## Released ${nextRelease.version}`,
      '',
      `Previous release: ${previous}. [GitHub release ${nextRelease.gitTag}](${repository}/releases/tag/${nextRelease.gitTag}). The store jobs below submit this version for review.`,
    ];

lines.push(
  '',
  `${commits.length} commit${commits.length === 1 ? '' : 's'} since ${lastRelease?.gitTag ?? 'the start'}.`,
  '',
  '### Release notes',
  '',
  // The notes start with a heading naming the version, which is said above.
  // Its "### Features" headings go one level below "Release notes".
  nextRelease.notes
    .replace(/^#{1,2} .*\n+/, '')
    .replace(/^### /gm, '#### ')
    .trim() || '_No notes._',
  '',
);
summary(lines.join('\n'));

if (!dryRun) {
  append(
    process.env.GITHUB_OUTPUT,
    `version=${nextRelease.version}\ntag=${nextRelease.gitTag}\n`,
  );
}
