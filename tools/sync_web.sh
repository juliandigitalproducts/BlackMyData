#!/usr/bin/env bash
# Builds the web deployment folder dist/web_deployment/blackmydata/run from app/static (the only place to edit the
# web app). The folder is build output (git-ignored); the Android build copies app/static itself (copyWebApp).
# Only the compressed language data (*.traineddata.gz) is copied: every platform loads those (B19).
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=app/static
FILES="index.html strato_app.js style.css pii_engine.js ocr_utils.js icon.svg"
for DEST in dist/web_deployment/blackmydata/run; do
  mkdir -p "$DEST/vendor"
  for f in $FILES; do cp "$SRC/$f" "$DEST/$f"; done
  tools/version.sh --stamp "$DEST/strato_app.js" "$DEST/index.html"   # same version as the APK (BMD-N3)
  rsync -a --delete --delete-excluded --exclude '*.traineddata' --exclude '.DS_Store' "$SRC/vendor/" "$DEST/vendor/"
  rsync -a --delete --exclude '.DS_Store' "$SRC/licenses/" "$DEST/licenses/"   # license texts
done
# Apache settings only for the web deployment
cp "$SRC/.htaccess" dist/web_deployment/blackmydata/run/.htaccess
cp "$SRC/index.php" dist/web_deployment/blackmydata/run/index.php   # entry behind the AIO gate (/gate/)
echo "Synced $SRC -> dist/…/run"
