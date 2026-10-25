#!/bin/sh
# Publishes a Docsku release: bumps package.json, commits, tags vX.Y.Z, pushes,
# and creates the GitHub release that the dashboard's update check reads.
# Usage: pnpm release 0.2.0   (needs a clean, pushed main and the GitHub CLI, gh)
set -eu
cd "$(dirname "$0")/.."

die() {
  echo "$1" >&2
  exit 1
}

version="${1:-}"
version="${version#v}"
echo "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "Usage: pnpm release <version>, e.g. pnpm release 0.2.0"
command -v gh >/dev/null || die "The GitHub CLI (gh) is required: https://cli.github.com"

[ "$(git branch --show-current)" = main ] || die "Releases are made from main."
[ -z "$(git status --porcelain)" ] || die "Commit or stash your changes first."
git fetch --quiet --tags origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "main differs from origin/main: pull or push first."
! git rev-parse -q --verify "refs/tags/v$version" >/dev/null || die "Tag v$version already exists."

current=$(node -p "require('./package.json').version")
newer=$(node -e '
  const [a, b] = process.argv.slice(1).map((v) => v.split(".").map(Number));
  const d = a.map((n, i) => n - b[i]).find((n) => n !== 0) ?? 0;
  console.log(d > 0 ? "yes" : "no");
' "$version" "$current")
[ "$newer" = yes ] || die "v$version is not newer than the current v$current."

# Notes: commit subjects since the previous release (or all of them for the first).
previous=$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)
notes=$(mktemp)
trap 'rm -f "$notes"' EXIT
{
  echo "## Perubahan"
  echo
  if [ -n "$previous" ]; then git log --no-merges --pretty='- %s' "$previous..HEAD"; else git log --no-merges --pretty='- %s'; fi
  echo
  echo "## Cara memperbarui"
  echo
  echo '```sh'
  echo "git fetch --tags origin && git checkout v$version && pnpm prod:deploy"
  echo '```'
} >"$notes"

node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  pkg.version = process.argv[1];
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
' "$version"
git commit --quiet -m "Release v$version" package.json
git tag -a "v$version" -m "Docsku v$version"
git push --quiet origin main "v$version"
gh release create "v$version" --verify-tag --title "Docsku v$version" --notes-file "$notes"
echo "Released v$version (was v$current)."
