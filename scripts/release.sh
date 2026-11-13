#!/bin/bash
# Automated release script for ytd
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

# Get version bump type (default: patch)
BUMP_TYPE="${1:-patch}"

echo "📦 Creating new $BUMP_TYPE release..."

# Bump version in package.json
npm version "$BUMP_TYPE" --no-git-tag-version

# Get the new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "📌 New version: v$NEW_VERSION"

# Stage package.json
git add package.json

# Commit the version bump
git commit -m "Release v$NEW_VERSION

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Create and push git tag (this triggers GitHub Actions)
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
git push origin main
git push origin "v$NEW_VERSION"

echo "✅ Released v$NEW_VERSION"
echo "🔗 GitHub Actions will build and publish: https://github.com/jpurusho/ytd/actions"
echo ""
echo "Check progress with: gh run watch"
