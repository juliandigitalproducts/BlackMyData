#!/usr/bin/env bash
# Builds dist/BlackMyData.app (universal: Apple Silicon + Intel) and
# dist/BlackMyData-macOS-<version>.zip from this repository.
#   ./macos/build-app.sh   (version: versionName in android/app/build.gradle via tools/version.sh, BMD-N3)
# The app is the standalone web app (app/static) in a native WKWebView window,
# see macos/main.swift. Signed ad hoc; without a Developer ID certificate macOS
# asks once on first launch (right click → Open). Developer ID signing with
# hardened runtime and notarization need the maintainer's Apple certificate,
# see README "Signaturen" (BMD-N11). Checksums: dist/SHA256SUMS-macOS-<version>.txt
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=${VERSION:-$(tools/version.sh)}
APP=dist/BlackMyData.app
BUILD=$(mktemp -d)
trap 'rm -rf "$BUILD"' EXIT

# DEBUG=1 builds with the Web Inspector enabled (code review B30); releases do not have it.
SWIFT_FLAGS=(-O)
[ "${DEBUG:-0}" = 1 ] && SWIFT_FLAGS+=(-D DEBUG)
for arch in arm64 x86_64; do
  swiftc "${SWIFT_FLAGS[@]}" -target "$arch-apple-macos12.0" -o "$BUILD/BlackMyData-$arch" macos/main.swift
done

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"
lipo -create -output "$APP/Contents/MacOS/BlackMyData" "$BUILD"/BlackMyData-arm64 "$BUILD"/BlackMyData-x86_64
sed "s/{{VERSION}}/$VERSION/g" macos/Info.plist > "$APP/Contents/Info.plist"
cp macos/AppIcon.icns "$APP/Contents/Resources/"
# Same file set as the Android app (android/app/src/main/assets).
for f in index.html strato_app.js style.css pii_engine.js ocr_utils.js icon.svg; do
  cp "app/static/$f" "$APP/Contents/Resources/web/"
done
for f in strato_app.js index.html; do   # same as tools/version.sh --stamp, but honours a VERSION override
  sed -E -e "s/^const CURRENT_BUILD_VERSION = \".*\";/const CURRENT_BUILD_VERSION = \"$VERSION\";/" \
    -e "s/\?v=[0-9]+\.[0-9]+\.[0-9]+\"/?v=$VERSION\"/g" "app/static/$f" > "$APP/Contents/Resources/web/$f"
done
cp -R app/static/vendor "$APP/Contents/Resources/web/vendor"
cp -R app/static/licenses "$APP/Contents/Resources/web/licenses"   # LICENSE (GPL-3.0), LICENSE-EXCEPTIONS, third-party notices, Apache-2.0 text
rm -f "$APP"/Contents/Resources/web/vendor/*.traineddata  # only the .gz files are used (B19)
find "$APP" -name .DS_Store -delete

codesign --force --sign - "$APP"   # one executable, no nested code: --deep (deprecated for signing) not needed
codesign --verify --deep --strict "$APP"
rm -f "dist/BlackMyData-macOS-$VERSION.zip"
(cd dist && ditto -c -k --sequesterRsrc --keepParent BlackMyData.app "BlackMyData-macOS-$VERSION.zip")
(cd dist && ../tools/sha256sums.sh "SHA256SUMS-macOS-$VERSION.txt" "BlackMyData-macOS-$VERSION.zip")
echo "Built $APP ($VERSION) and dist/BlackMyData-macOS-$VERSION.zip"
