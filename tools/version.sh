#!/usr/bin/env bash
# The app version has one source: versionName in android/app/build.gradle (the release workflow bumps it, code review
# BMD-N3). APK, web deployment and desktop packages all take it from there:
#   tools/version.sh                  prints the version, e.g. 1.0.2
#   tools/version.sh --stamp FILE...  writes it into copies of strato_app.js (CURRENT_BUILD_VERSION) and index.html
#                                     (the ?v=X.Y.Z cache busters)
# The Android build does the same in Gradle (copyWebApp). The literals in app/static (strato_app.js, index.html) are
# the fallback for running the source folder directly; the release workflow stamps them along with the version bump
# and tests/test_sync.js fails when they differ from versionName (BMD-R6).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(sed -n "s/^[[:space:]]*versionName[[:space:]]*['\"]\([^'\"]*\)['\"].*/\1/p" "$ROOT/android/app/build.gradle" | head -n 1)
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "tools/version.sh: no X.Y.Z versionName in android/app/build.gradle (found '$VERSION')" >&2
  exit 1
fi
if [ "${1:-}" = "--stamp" ]; then
  shift
  for f in "$@"; do
    grep -qE '^const CURRENT_BUILD_VERSION = "|\?v=[0-9]+\.[0-9]+\.[0-9]+"' "$f" || { echo "tools/version.sh: nothing to stamp in $f" >&2; exit 1; }
    sed -E -e "s/^const CURRENT_BUILD_VERSION = \".*\";/const CURRENT_BUILD_VERSION = \"$VERSION\";/" \
      -e "s/\?v=[0-9]+\.[0-9]+\.[0-9]+\"/?v=$VERSION\"/g" "$f" > "$f.tmp"
    mv "$f.tmp" "$f"
  done
  exit 0
fi
# Desktop packages belong to a release tag: warn when this checkout is not exactly vX.Y.Z (the build still runs).
if tag=$(git -C "$ROOT" describe --tags --exact-match HEAD 2>/dev/null) && [ "$tag" = "v$VERSION" ]; then :; else
  echo "tools/version.sh: warning: HEAD is not tagged v$VERSION; this build contains changes after release $VERSION" >&2
fi
echo "$VERSION"
