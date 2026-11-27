#!/usr/bin/env bash
# Builds the Linux release for BlackMyData:
#   dist/BlackMyData-Linux-Portable-<version>.tar.gz  unzip and start BlackMyData, nothing to install
#   dist/BlackMyData-Linux-amd64-<version>.deb        standard Debian/Ubuntu package
#   dist/SHA256SUMS-Linux-<version>.txt               checksums of both (BMD-N11)
# Not signed: a .deb/tarball signature (e.g. GPG detached .asc) needs the maintainer's key; see README "Signaturen".
# Version: versionName in android/app/build.gradle (tools/version.sh, one source for all platforms, BMD-N3)
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(tools/version.sh)
mkdir -p linux/build dist

echo "Building BlackMyData $VERSION for Linux amd64..."

# 1. Build native launcher executable
(cd windows/launcher && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o ../../linux/build/BlackMyData .)
chmod +x linux/build/BlackMyData

# 2. Build Portable tar.gz
OUT=dist/BlackMyData-Linux-Portable
rm -rf "$OUT" "$OUT-$VERSION.tar.gz"
mkdir -p "$OUT/web/vendor"
cp linux/build/BlackMyData "$OUT/"
cp app/static/icon.svg "$OUT/blackmydata.svg"

for f in index.html strato_app.js style.css pii_engine.js ocr_utils.js icon.svg; do
  cp "app/static/$f" "$OUT/web/"
done
tools/version.sh --stamp "$OUT/web/strato_app.js" "$OUT/web/index.html"
rsync -a --exclude '*.traineddata' --exclude '.DS_Store' app/static/vendor/ "$OUT/web/vendor/"
rsync -a --exclude '.DS_Store' app/static/licenses/ "$OUT/web/licenses/"   # LICENSE, third-party notices
cp app/static/licenses/LICENSE.txt "$OUT/LICENSE.txt"
cp app/static/licenses/LICENSE-EXCEPTIONS.txt "$OUT/LICENSE-EXCEPTIONS.txt"
cp app/static/licenses/THIRD_PARTY_NOTICES.txt "$OUT/THIRD_PARTY_NOTICES.txt"

# Exec: field codes like %k must not stand inside quotes (Desktop Entry spec, BMD-N12); it is passed to sh as $1.
# After the key-file unescaping (\\ -> \) the spec's quoting gives sh: cd "$(dirname "$1")" && exec ./BlackMyData
cat > "$OUT/blackmydata.desktop" <<'DESKTOP'
[Desktop Entry]
Version=1.0
Type=Application
Name=BlackMyData
Comment=100% Lokale PDF-Schwärzung & KI-Anonymisierung
Exec=sh -c "cd \\"\\$(dirname \\"\\$1\\")\\" && exec ./BlackMyData" sh %k
Icon=blackmydata
Terminal=false
Categories=Office;Graphics;Security;
DESKTOP
chmod +x "$OUT/blackmydata.desktop"

cat > "$OUT/start.sh" << 'SH'
#!/usr/bin/env bash
cd "$(dirname "$0")"
exec ./BlackMyData "$@"
SH
chmod +x "$OUT/start.sh"

cat > "$OUT/LIESMICH.txt" <<TXT
BlackMyData $VERSION für Linux (portable)

Start:
- Doppel-Klick auf "BlackMyData" (oder im Terminal: ./BlackMyData oder ./start.sh).
- Es öffnet sich ein App-Fenster in Chrome/Chromium/Edge/Brave oder im Standardbrowser.
- Nichts wird installiert, keine Root-/Adminrechte nötig.

Funktionsweise:
BlackMyData stellt die Web-App ausschließlich lokal für diesen Rechner unter
http://127.0.0.1:47811 bereit und beendet sich automatisch, sobald das Fenster
geschlossen wird. Dokumente und sensible Daten verlassen den Computer zu 100% nicht.

Einstellungen & Cache: ~/.local/share/BlackMyData (oder \$XDG_DATA_HOME/BlackMyData).

Lizenz: GNU GPL v3 oder später (LICENSE.txt) mit Zusatzbedingungen nach Abschnitt 7
(Marken, LICENSE-EXCEPTIONS.txt); Versionen bis einschließlich v1.0.7: MIT.
Fremdkomponenten: THIRD_PARTY_NOTICES.txt; Volltexte auch in web/licenses/.
TXT

(cd dist && tar -czf "BlackMyData-Linux-Portable-$VERSION.tar.gz" BlackMyData-Linux-Portable)

# 3. Build .deb package via dpkg-deb in Docker
# BMD-N11: the image is not pinned yet because its digest is not known on the build machine. Pin it once:
#   docker pull debian:stable-slim && docker image inspect debian:stable-slim --format '{{index .RepoDigests 0}}'
# and set DEB_IMAGE=debian:stable-slim@sha256:<digest> here (same for windows/build.sh).
DEB_IMAGE=${DEB_IMAGE:-debian:stable-slim}
docker run --rm -v "$PWD:/src" -w /src "$DEB_IMAGE" bash -c "
  rm -rf /tmp/deb
  mkdir -p /tmp/deb/DEBIAN /tmp/deb/opt/blackmydata /tmp/deb/usr/bin /tmp/deb/usr/share/applications /tmp/deb/usr/share/icons/hicolor/scalable/apps
  cp linux/build/BlackMyData /tmp/deb/opt/blackmydata/
  cp -r dist/BlackMyData-Linux-Portable/web /tmp/deb/opt/blackmydata/
  cp app/static/icon.svg /tmp/deb/usr/share/icons/hicolor/scalable/apps/blackmydata.svg
  mkdir -p /tmp/deb/usr/share/doc/blackmydata
  cat app/static/licenses/LICENSE.txt app/static/licenses/LICENSE-EXCEPTIONS.txt app/static/licenses/THIRD_PARTY_NOTICES.txt app/static/licenses/Apache-2.0.txt > /tmp/deb/usr/share/doc/blackmydata/copyright
  
  cat > /tmp/deb/usr/bin/blackmydata << 'SH'
#!/usr/bin/env bash
cd /opt/blackmydata
exec ./BlackMyData \"\$@\"
SH
  chmod +x /tmp/deb/usr/bin/blackmydata
  
  cat > /tmp/deb/usr/share/applications/blackmydata.desktop << 'DESKTOP'
[Desktop Entry]
Version=1.0
Type=Application
Name=BlackMyData
Comment=100% Lokale PDF-Schwärzung & KI-Anonymisierung
Exec=/usr/bin/blackmydata
Icon=blackmydata
Terminal=false
Categories=Office;Graphics;Security;
DESKTOP

  cat > /tmp/deb/DEBIAN/control << 'CONTROL'
Package: blackmydata
Version: $VERSION
Section: utils
Priority: optional
Architecture: amd64
Maintainer: juliandigitalproducts <juliandigitalproducts@gmail.com>
Description: 100% Lokale PDF-Schwaerzung & KI-Anonymisierung
 BlackMyData entfernt personenbezogene Daten (PII) unwiderruflich aus PDFs
 direkt auf Ihrem Geraet. Keine Cloud, kein Server-Upload.
CONTROL

  dpkg-deb --build --root-owner-group /tmp/deb dist/BlackMyData-Linux-amd64-$VERSION.deb
"

(cd dist && ../tools/sha256sums.sh "SHA256SUMS-Linux-$VERSION.txt" \
  "BlackMyData-Linux-Portable-$VERSION.tar.gz" "BlackMyData-Linux-amd64-$VERSION.deb")

echo "Built BlackMyData $VERSION Linux packages:"
echo "  - dist/BlackMyData-Linux-Portable-$VERSION.tar.gz"
echo "  - dist/BlackMyData-Linux-amd64-$VERSION.deb"
echo "  - dist/SHA256SUMS-Linux-$VERSION.txt"
