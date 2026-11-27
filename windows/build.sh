#!/usr/bin/env bash
# Builds the Windows release from this repository (runs on macOS/Linux, needs Go and makensis):
#   windows/build/BlackMyData.exe          native starter (windows/launcher, x64; runs on ARM64 Windows via emulation)
#   dist/BlackMyData-Windows-Portable-<version>.zip  unzip and start BlackMyData.exe, nothing to install
#   dist/BlackMyData-Windows-Setup-<version>.exe     per-user installer (no admin rights)
#   dist/SHA256SUMS-Windows-<version>.txt            checksums of ZIP and installer (BMD-N11)
# EXE and installer are not Authenticode-signed (needs a code-signing certificate; see README "Signaturen").
# Version: versionName in android/app/build.gradle (tools/version.sh, one source for all platforms, B32/BMD-N3).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(tools/version.sh)
mkdir -p windows/build dist

# -H windowsgui: no console window. -s -w: smaller file.
(cd windows/launcher && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o ../build/BlackMyData.exe .)

OUT=dist/BlackMyData-Windows-Portable
rm -rf "$OUT" "$OUT-$VERSION.zip"
mkdir -p "$OUT/web/vendor"
cp windows/build/BlackMyData.exe windows/icon.ico "$OUT/"
for f in index.html strato_app.js style.css pii_engine.js ocr_utils.js icon.svg; do cp "app/static/$f" "$OUT/web/"; done
tools/version.sh --stamp "$OUT/web/strato_app.js" "$OUT/web/index.html"
rsync -a --exclude '*.traineddata' --exclude '.DS_Store' app/static/vendor/ "$OUT/web/vendor/"
rsync -a --exclude '.DS_Store' app/static/licenses/ "$OUT/web/licenses/"   # LICENSE, third-party notices
cp app/static/licenses/LICENSE.txt app/static/licenses/LICENSE-EXCEPTIONS.txt app/static/licenses/THIRD_PARTY_NOTICES.txt "$OUT/"
cat > "$OUT/LIESMICH.txt" <<TXT
BlackMyData $VERSION fuer Windows (portable)

Start: Doppelklick auf BlackMyData.exe. Es oeffnet sich ein App-Fenster in Microsoft Edge
(ersatzweise Chrome oder der Standardbrowser). Nichts wird installiert, keine Adminrechte noetig.

BlackMyData.exe stellt die App nur fuer diesen Computer unter http://127.0.0.1:47811 bereit
und beendet sich kurz nachdem das letzte BlackMyData-Fenster geschlossen wurde.
Dokumente verlassen den Computer nicht.

Beim ersten Start meldet Windows SmartScreen eventuell "Unbekannter Herausgeber"
(die Datei ist nicht kommerziell signiert): "Weitere Informationen" > "Trotzdem ausfuehren".

Einstellungen: %LOCALAPPDATA%\BlackMyData (beim Loeschen des Ordners ist alles zurueckgesetzt).

Lizenz: GNU GPL v3 oder spaeter (LICENSE.txt) mit Zusatzbedingungen nach Abschnitt 7
(Marken, LICENSE-EXCEPTIONS.txt); Versionen bis einschliesslich v1.0.7: MIT.
Fremdkomponenten: THIRD_PARTY_NOTICES.txt; Volltexte auch in web\licenses\.
TXT
(cd dist && zip -qr "BlackMyData-Windows-Portable-$VERSION.zip" BlackMyData-Windows-Portable)

# makensis from Homebrew crashes on current macOS (its iconv lacks WCHAR_T, which NSIS needs): then the installer
# is built with Debian's NSIS in a container (Docker), same script, Unicode.
if ! (cd windows && makensis -V2 -DVERSION="$VERSION" installer.nsi 2>/dev/null); then
  # BMD-N11: not pinned yet (digest unknown on the build machine); set DEB_IMAGE=debian:stable-slim@sha256:<digest>,
  # see linux/build.sh. NSIS is installed from Debian on every run; a prebuilt image with nsis would avoid that.
  DEB_IMAGE=${DEB_IMAGE:-debian:stable-slim}
  echo "makensis failed locally, building the installer in Docker ($DEB_IMAGE)" >&2
  docker run --rm -v "$PWD:/src" -w /src/windows "$DEB_IMAGE" bash -c \
    "apt-get update -qq >/dev/null && apt-get install -y -qq nsis >/dev/null && makensis -V2 -DVERSION=$VERSION installer.nsi"
fi
(cd dist && ../tools/sha256sums.sh "SHA256SUMS-Windows-$VERSION.txt" \
  "BlackMyData-Windows-Portable-$VERSION.zip" "BlackMyData-Windows-Setup-$VERSION.exe")
echo "Built BlackMyData $VERSION: windows/build/BlackMyData.exe, $OUT-$VERSION.zip, dist/BlackMyData-Windows-Setup-$VERSION.exe, dist/SHA256SUMS-Windows-$VERSION.txt"
