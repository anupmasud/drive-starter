#!/usr/bin/env bash
# Publish dist/ to the gh-pages branch — and nothing else.
#
# The `gh-pages` npm package seeds a new branch from your current one, which
# quietly drags .gitignore, .claude/ and anything else at the repo root onto a
# branch that serves a public website. Building the commit from inside dist/
# means the branch can only ever contain what was exported.
set -euo pipefail

cd "$(dirname "$0")/.."

[ -d dist ] || { echo "dist/ not found — run 'npm run build:web' first."; exit 1; }
[ -f dist/.nojekyll ] || { echo "dist/.nojekyll missing — Pages will hide _expo/."; exit 1; }

REMOTE=$(git remote get-url origin)
MSG="Deploy web build $(date -u '+%Y-%m-%d %H:%M UTC')"

cd dist
rm -rf .git
git init -q
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-deploy}" -c user.email="${GIT_AUTHOR_EMAIL:-deploy@local}" \
    commit -qm "$MSG"
git push -q -f "$REMOTE" HEAD:gh-pages
rm -rf .git

echo "Published dist/ to gh-pages."
