// Turns the Markdown release notes of a GitHub release (read from stdin) into
// the plain text that the App Store shows under "What's New".
//
//   gh release view v2.1.0 --json body --jq .body | node scripts/store-release-notes.mjs

const LIMIT = 4000; // App Store Connect's maximum

let markdown = '';
for await (const chunk of process.stdin) markdown += chunk;

const lines = markdown
  .split('\n')
  // The title line only repeats the version number and date.
  .filter((line) => !/^#{1,2} /.test(line))
  .map((line) =>
    line
      // "### Bug Fixes" -> "Bug Fixes"
      .replace(/^#{3,} /, '')
      // "* **popup:** fix x ([abc123](url))" -> "• popup: fix x"
      .replace(/^\s*[*-] /, '• ')
      .replace(/\s*\(\[[0-9a-f]{7,}\]\([^)]*\)\)/g, '')
      .replace(/,? closes \[#\d+\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .trimEnd(),
  );

let text = lines
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();
if (text.length > LIMIT) text = `${text.slice(0, LIMIT - 1).trimEnd()}…`;

process.stdout.write(`${text}\n`);
