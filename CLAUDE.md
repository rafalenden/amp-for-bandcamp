# Amp for Bandcamp

## Commit messages

Write every commit message as a [Conventional Commit](https://www.conventionalcommits.org/): `type(scope): subject`. The Release workflow derives the version number and the release notes from them (see "Releasing" in the README), and a commit that does not follow the format is left out of the release.

- `feat:` for a new user-facing feature (minor release), `fix:` or `perf:` for a user-facing fix (patch release).
- `chore:`, `docs:`, `test:`, `ci:`, `refactor:`, `style:`, `build:` for everything that should not cause a release.
- `fix(store):` for a change to the App Store listing in `fastlane/`, which needs a release to reach Apple.
- `feat` and `fix` subjects appear in the release notes and in the App Store's "What's New", so write them for users.
