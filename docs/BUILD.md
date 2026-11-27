# BlackMyData – Bauen, Tests, CI und Signatur

Dieser Text wurde unverändert aus der bisherigen README übernommen, damit die Build-Informationen erhalten bleiben.

Pfade und Links in diesem übernommenen Text gelten vom Repository-Stamm aus, nicht von `docs/` aus.

## 🛠️ Schnellstart

### 🍎 Option 1: Native macOS App (M1 / Apple Silicon / ARM64 & Intel) - Empfohlen!
- **`BlackMyData.app`** (aus `BlackMyData-macOS-<Version>.zip`): per **Doppelklick** öffnen. Beim ersten Start einmal Rechtsklick → „Öffnen“, weil die App nicht von Apple notarisiert ist.
- Läuft komplett offline in einem eigenen Fenster (WKWebView), ohne Python und ohne Server. Datei-Auswahl, Speichern-Dialog für geschwärzte PDFs/ZIPs und Kopieren/Einfügen funktionieren wie in einer normalen App.
- Selbst bauen (Apple Silicon + Intel): `./macos/build-app.sh` → `dist/BlackMyData.app` und `dist/BlackMyData-macOS-<Version>.zip`. Quellcode des Fensters: `macos/main.swift`.

### 🌐 Option 2: Im Browser
- **Web-App:** https://allinonemediamanager.de/blackmydata/run/ – läuft komplett im Browser, Dokumente verlassen das Gerät nicht.
- **Lokal ohne Server:** `app/static/index.html` über einen beliebigen statischen Webserver öffnen, z. B. `python3 -m http.server -d app/static` und dann `http://localhost:8000`.

> Der frühere Python-Server (`run.py`, Port 8080) wird nicht mehr gebraucht. Er wurde aus dem Hauptzweig entfernt und liegt im Branch `archive/legacy-python-backend`.

### 🧠 Lokale KI nutzen (Ollama & oMLX)

- **Ollama (Port 11434)**: Starte `ollama serve` im Terminal. Die App findet die Modelle sofort.
- **oMLX (Port 1060)**: Falls oMLX aktiv ist, wird der API-Schlüssel automatisch erkannt und die Apple Silicon MLX-Modelle erscheinen direkt in der Auswahlliste.
- Im Web-UI oben rechts zeigt das Status-Badge sofort 🟢 **KI: Ollama & oMLX aktiv** an.

---

## 🪟 Windows: Startverhalten

`BlackMyData.exe` (Quellcode `windows/launcher`, Go, ohne Abhängigkeiten) startet die App ohne weitere Installation:

1. Stellt den Ordner `web` neben der exe **nur für diesen Computer** unter `http://127.0.0.1:47811` bereit (fester Port,
   damit die Einstellungen erhalten bleiben; ist er belegt, 47812–47830). Dieselben Schutz-Header wie auf der Website,
   nur Anfragen an `127.0.0.1`/`localhost`, keine Verzeichnislisten.
2. Öffnet die App als eigenes Fenster in **Microsoft Edge** (eigenes Profil in `%LOCALAPPDATA%\BlackMyData\AppProfile`),
   sonst in Chrome, sonst im Standardbrowser.
3. Läuft BlackMyData schon, öffnet ein weiterer Start nur ein neues Fenster.
4. Beendet sich etwa 3 Minuten nach dem Schließen des letzten BlackMyData-Fensters (Herzschlag der Seite plus
   Überwachung des Edge-Profils).

Warum nicht mehr `file://`: Unter `file://` blockiert Edge die Hintergrundprozesse der Texterkennung; der dafür nötige
Schalter `--allow-file-access-from-files` hätte jeder Lücke im Seiteninhalt Zugriff auf lokale Dateien gegeben
(Code-Review B13). Mit `http://127.0.0.1` gelten normale Browserregeln, Ollama erlaubt die Adresse ohne Freigabe,
und es werden weder VBScript (in Windows 11 auslaufend) noch PowerShell gebraucht. Fehler beim Start meldet ein
Dialog; Details stehen in `%LOCALAPPDATA%\BlackMyData\launcher.log`.

Bauen (auf macOS/Linux mit Go und Docker oder makensis): `./windows/build.sh` → `dist/BlackMyData-Windows-Setup.exe`
und `dist/BlackMyData-Windows-Portable.zip`. Die Deinstallation fragt, ob Einstellungen und gespeicherte API-Schlüssel
gelöscht werden sollen.

## 📁 Ordnerstruktur

```
blackMyData/
├── app/static/                # Die App: index.html, strato_app.js, pii_engine.js, ocr_utils.js, style.css, vendor/
├── tools/sync_web.sh          # Erzeugt dist/…/run aus app/static (Android kopiert app/static beim Build selbst)
├── android/                   # Android-App (WebView, eigener Gradle-Wrapper)
├── macos/                     # macOS-App (WKWebView, build-app.sh)
├── windows/                   # Windows: nativer Starter (launcher/), Installer, build.sh
├── dist/web_deployment/    # Website: Landingpage und Web-App (run/) zum Hochladen
├── tests/                     # Tests der Web-Engine (npm test)
```

---

## 🧪 Tests ausführen

```bash
npm test          # Schwärzungsregeln, OCR-Layout, Gleichheit der drei Kopien, Release-Checks
npm run sync      # vor dem Hochladen: dist/…/run aus app/static erzeugen
```

## Release signing

Release builds are signed with the release key from four environment variables (locally) or
repository secrets (CI). This applies to the Android app (`android/`); without a key the release build stops (it is never signed with the debug key). Switching keys changes the signature: an installed debug-signed APK has to be uninstalled once. Set the secrets under
**GitHub → Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `BLACKMYDATA_KEYSTORE_BASE64` | the keystore as base64: `base64 -i blackmydata-release.jks` |
| `BLACKMYDATA_KEYSTORE_PASSWORD` | keystore password |
| `BLACKMYDATA_KEY_ALIAS` | key alias (`blackmydata`) |
| `BLACKMYDATA_KEY_PASSWORD` | key password (same as the keystore password, PKCS12) |

Locally, Gradle reads `BLACKMYDATA_KEYSTORE_FILE` (absolute path to `blackmydata-release.jks`), `BLACKMYDATA_KEYSTORE_PASSWORD`,
`BLACKMYDATA_KEY_ALIAS` and `BLACKMYDATA_KEY_PASSWORD`, or the same values (`storeFile`, `storePassword`, `keyAlias`,
`keyPassword`) from `blackmydata-release.keystore.properties` next to the repository folder. Build with
`cd android && ./gradlew assembleRelease`.

Keep the `.jks` file and its passwords safe and **out of git** — losing them means you can't ship
signed updates that install over an existing install.

### Signaturen der Desktop-Pakete (offen, BMD-N11)

Die Desktop-Pakete werden lokal gebaut und sind noch nicht signiert. Jedes Build-Skript schreibt `dist/SHA256SUMS-<Plattform>-<Version>.txt`
(prüfen mit `sha256sum -c` bzw. `shasum -a 256 -c`); diese Datei gehört mit ins Release. Für echte Signaturen braucht es Schlüssel des Maintainers:

- **macOS:** Developer-ID-Zertifikat, dann `codesign --force --options runtime --timestamp --sign "Developer ID Application: …" dist/BlackMyData.app`, ZIP mit `xcrun notarytool submit … --wait` notarisieren und `xcrun stapler staple dist/BlackMyData.app`. `macos/build-app.sh` signiert bisher nur ad hoc.
- **Windows:** Authenticode-Zertifikat, dann `BlackMyData.exe` und den Installer z. B. mit `osslsigncode sign … -t <Zeitstempel-URL>` signieren (vor dem Packen des ZIP bzw. nach `makensis`).
- **Linux:** GPG-Schlüssel, dann `gpg --detach-sign --armor` für `.tar.gz`, `.deb` und die SHA256SUMS-Datei.
- **Docker-Image:** `debian:stable-slim` ist in `linux/build.sh` und `windows/build.sh` noch nicht per Digest gepinnt; Digest einmal ermitteln (`docker pull` + `docker image inspect --format '{{index .RepoDigests 0}}'`) und als `DEB_IMAGE` eintragen.
