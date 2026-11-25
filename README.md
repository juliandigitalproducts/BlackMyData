# 🛡️ BlackMyData

Eine moderne, leistungsstarke Web-Applikation zur **automatisierten Schwärzung und Anonymisierung personenbezogener Daten in PDF-Dokumenten** (digital und gescannt) mit OCR, intelligenter deutscher PII-Erkennung und nativer lokaler KI-Unterstützung (Ollama).

---

## 🚀 Highlights & Features

1. **PDF einlesen (auch mehrere)**:
   - Moderner Drag & Drop Uploader mit Unterstützung für beliebig viele PDF-Dateien gleichzeitig.
   - Warteschlange mit Statusanzeige (Bereit, Analysiert, Geschwärzt, Seitenanzahl, Dateigröße).

2. **Per OCR erkennen lassen**:
   - Erkennt sowohl rein digitale PDFs als auch eingescannte Dokumente und Bilddateien.
   - **Tesseract OCR Integration** mit deutschem (`deu`) und englischem (`eng`) Sprachmodell.
   - Exakte Wort- und Bounding-Box-Ermittlung auf Pixelebene für saubere Schwärzung auf Scans.

3. **Erkennung von Namen & personenbezogenen Daten (auch im Fließtext)**:
   - **Personennamen**: Erkennt Vor- und Nachnamen im laufenden Fließtext (z.B. nach Anreden wie *Herr*, *Frau*, *Dr.*, *Rechtsanwalt*, in Unterschriftenzeilen wie *gez.* oder über deutsche Vornamen-Gazetteers).
   - **Anschriften & Wohnorte**: Straßen, Hausnummern, 5-stellige deutsche Postleitzahlen und Ortsnamen.
   - **Kontaktdaten**: E-Mail-Adressen, Telefon- und Mobilfunknummern (deutsche Nummern wie `+49`, `017x` sowie internationale Nummern wie `+43`, `+41`, `+1`).
   - **Finanzdaten**: Deutsche & europäische IBANs (auch mit Buchstaben wie GB/NL/FR, geprüft per Prüfsumme), BIC/SWIFT-Codes, Kontonummern.
   - **Behörden- & Steuerdaten**: Steuer-ID (11 Ziffern), Steuernummer, Rentenversicherungsnummer (RVNR), Krankenversichertennummer (KVNR).
   - **Datumsangaben**: Geburtsdaten (*geboren am...*, *geb.*, *Geburtsdatum:*) sowie `12.03.1985`, `12.03.85`, `1985-03-12`, `12/03/1985`, `12. März 1985`.
   - **Organisationen / Körperschaften** (GmbH, AG, e.V., etc.).
   - **Eigene Stichwörter / Regex**: Freitext-Eingabe von Begriffen oder Mustern.

4. **Echte Schwärzfunktion (Permanente Löschung)**:
   - **Echte physikalische Entfernung** direkt im Browser: Seiten mit Fundstellen werden gerastert, die Schwärzungen ins Bild eingebrannt und als neues Bild eingebettet – die ursprüngliche Textebene ist danach nicht mehr enthalten. Seiten ohne Fundstelle werden unverändert übernommen. Kein simples "Übermalen", das sich mit Copy-Paste aushebeln ließe.
   - Seiten, auf denen die Texterkennung (OCR) fehlschlägt, werden beim Export **vollständig geschwärzt** statt ungeprüft übernommen. Formularfelder und Anmerkungen werden in das Seitenbild übernommen (abgeflacht); die Werte von Text- und Auswahlfeldern sowie FreeText-Kommentare werden dabei wie Seitentext auf personenbezogene Daten geprüft.
   - Interaktiver PDF-Editor mit Canvas: Bounding-Boxes können einzeln per Klick ein-/ausgeschaltet werden.
   - **Freihand-Rechtecke**: Beliebige Bereiche (z.B. Logos, Stempel, handschriftliche Vermerke) können direkt im Canvas mit der Maus markiert und geschwärzt werden.

5. **Ausgabe als Download**:
   - Geschwärzte PDFs werden als Download angeboten (z.B. `dateiname_geschwaerzt.pdf`) – im Browser, in der Android-App über den System-Speicherdialog.
   - Direkter Einzeldownload oder gebündelter ZIP-Download mit einem Klick. Wird nach dem Schwärzen noch etwas geändert, muss neu geschwärzt werden.

6. **Individuell einstellbar**:
   - **Schwärzungs-Stil & Intensität**:
     - Blickdichtes Schwarz (`#000000`), Dunkelgrau oder Weiß (unsichtbare Textentfernung).
     - Textlabel über der Schwärzung (z.B. `[GESCHWÄRZT]` oder `[{CATEGORY}]`).
     - Einstellbare Polsterung (Padding: 0, 2, 4 oder 5 PDF-Punkt) zum Verhindern von herausblitzenden Buchstaben.
   - **Themengruppen auswählbar**: Checkboxen für jede Datenkategorie.
   - **Ausnahmen / Whitelist**: Begriffe oder Personen, die niemals geschwärzt werden dürfen (z.B. eigener Firmenname oder Sachbearbeiter). Mit Option für Groß-/Kleinschreibung. Nur das freigegebene Wort bleibt stehen: „Peter“ freigeben lässt in „Peter Müller“ den Nachnamen geschwärzt.

7. **Schönes grafisches UI**:
   - Modernes, minimalistisches Design mit Dark/Light Mode und Glassmorphism.
   - Responsive Seitenansicht mit Zoom (80%, 100%, 130%) und Seitennavigation.
   - Übersichtliche Seitenleiste mit allen erkannten Entitäten, kategorisiert und farblich codiert.

8. **Geschwindigkeit & Qualität anpassbar**:
   - ⚡ **Turbo (Schnell)**: Pure Regex & Heuristik, kein OCR bei digitalem Text (~0.2s/Seite).
   - ⚖️ **Ausgewogen (Standard)**: Automatische Scan-Erkennung mit 200 DPI OCR + erweiterte Heuristik.
   - 🧠 **KI DeepScan (Maximale Qualität)**: Lokales LLM analysiert den gesamten Fließtext + 300 DPI High-Res OCR.

9. **Lokale KI Out-of-the-Box (Ollama & oMLX Integration)**:
   - **Ollama**: Erkennt automatisch eine lokale Ollama-Instanz (`http://127.0.0.1:11434`) und alle installierten Modelle (z.B. `qwen2.5:1.5b-instruct`, `llama3.1`, `mistral`).
   - **oMLX (Apple Silicon Port 1060)**: Anbindung an **oMLX** auf Port 1060; der API-Key wird in den Einstellungen eingetragen. Unterstützt Apple Silicon MLX-Modelle (z.B. `Qwen3.8-27B`, `gemma-4`).
   - **Datenfluss**: Ohne KI und mit einem KI-Server im eigenen Netz (localhost, LAN) verlässt kein Dokumentinhalt das Gerät bzw. Netz. Wird als „Eigener Server“ eine Adresse außerhalb des eigenen Netzes (z.B. ein Cloud-Anbieter) eingetragen, sendet die KI-Prüfung den Seitentext (und bei der Vision-Korrektur Bildausschnitte) dorthin – die App fragt dafür einmal pro Server ausdrücklich nach.

### 📱 Multi-Plattform Downloads

| Plattform | Format | Beschreibung |
| :--- | :--- | :--- |
| **macOS** | `.zip` (`BlackMyData.app`) | Native App für Apple Silicon und Intel: entpacken und `BlackMyData.app` in den Programme-Ordner ziehen |
| **Windows** | `.exe` / `.zip` | Setup-Installer mit Startmenü-Verknüpfung sowie portables ZIP ohne Installation |
| **Android** | `.apk` | Standalone-App für Android Smartphones & Tablets (ab Android 8.0) |
| **Web / Browser** | HTML / JS | Client-Side Web-App ohne Server-Upload – 100% lokal im Browser ausführbar |

> 🌐 **Website & Online-Portal**: Alle Apps und Downloads findest du auf der offiziellen Projektseite unter **[allinonemediamanager.de/blackmydata/](https://allinonemediamanager.de/blackmydata/)** oder direkt zum Ausführen im Browser unter **[allinonemediamanager.de/blackmydata/run/](https://allinonemediamanager.de/blackmydata/run/)**. Sämtliche Binärdateien stehen zudem in den [Releases](https://git.juliandigitalproducts.de/jdaniels/BlackMyData/releases) bereit (Dateinamen mit Version, z. B. `BlackMyData-Android-1.0.0.apk`). Quellcode: [git.juliandigitalproducts.de/jdaniels/BlackMyData](https://git.juliandigitalproducts.de/jdaniels/BlackMyData) · GitHub (bald)

---

## 📸 Screenshot

<img width="1832" alt="BlackMyData: Web-App und Desktop-Editor mit Schwärzungs-Canvas, automatischer DSGVO-Erkennung und Bounding-Boxes" src="docs/screenshots/bmd-dark.png" />

---

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

---

## 🔒 Datenschutz

- Keine Telemetrie, keine Analyse, keine Konten: Dokumente und Einstellungen bleiben auf dem eigenen Gerät bzw. im Browser.
- Einzige Ausnahme: Wer einen KI-Server (Ollama, LM Studio, oMLX) einträgt, schickt den Dokumenttext an genau diesen Server. Standard ist `127.0.0.1`; Adressen außerhalb des eigenen Netzes fragt die App vorher ausdrücklich ab.
- Die Erkennung ist heuristisch. BlackMyData unterstützt beim Schwärzen, ersetzt aber keine Prüfung: Ergebnisse vor der Weitergabe kontrollieren (siehe Gewährleistungsausschluss in der [MIT-Lizenz](LICENSE)).

## 📄 Lizenz

BlackMyData steht unter der [MIT-Lizenz](LICENSE). Fremdkomponenten und ihre Lizenzen: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md); die Volltexte liegen in [`app/static/licenses/`](app/static/licenses/) und werden in jedes Paket (APK, Windows, macOS, Linux, Web) mitgeliefert – in der App unter „Datenschutz, Architektur & Lizenzen“.

## Anbieter

juliandigitalproducts · [juliandigitalproducts.de](https://juliandigitalproducts.de/) · [Impressum](https://allinonemediamanager.de/impressum/) · [Datenschutzerklärung](https://allinonemediamanager.de/datenschutzerklaerung/)


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
