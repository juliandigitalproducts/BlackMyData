# Tests

| Befehl | Was | Braucht |
|---|---|---|
| `npm test` | Unit-Tests der Web-Engine (PII-Regeln, OCR-Hilfen, Export, Formularfelder, Dateiauswahl), läuft auch in der CI (`test.yml`) | Node ≥ 18, `npm ci` |
| `npm run test:harness` | Schwärzungs-Harness: erzeugt einen Korpus von Test-PDFs und schickt jedes durch die echte Pipeline der App | Node, Google Chrome |
| `npm run test:e2e` | Browser-E2E über die Oberfläche, Desktop (1280 px) und Smartphone (412 px) | Node, Google Chrome |
| `npm run test:browser` | Harness + E2E | wie oben |

Harness und E2E laufen headless mit dem installierten Google Chrome (Playwright-Kanal `chrome`, macOS und Linux);
ein anderes Chrome/Chromium per `CHROME_PATH=/pfad/zu/chrome`. `HEADED=1` zeigt das Fenster. Sie sind bewusst nicht
Teil von `npm test` (der Pi-Runner hat kein Chrome und wenig RAM). Dauer: Harness mit OCR ca. 5–13 min (OCR jeder Seite in vier Ausrichtungen), E2E ca. 1–2 min.

## Harness (`tests/harness/`)
`corpus.js` erzeugt mit pdf-lib (nur erfundene Personen): Formularfelder (Textfeld, mehrzeilig, Combo-Box mit
Anzeigetext ≠ Exportwert, Listbox), FreeText-Kommentar, 4 Seiten mit Treffern nur auf 1 und 4, gedrehte Seiten
(/Rotate 90/270 mit Formularfeld), reiner Scan (nur Bild → OCR), Info-Dictionary + XMP-Metadaten, eingebettete Dateien
mit Unicode-Namen, Unicode-Namen und Unicode-Dateiname. `run_harness.js` lädt jedes PDF über das Datei-Input der App,
schwärzt mit `batchRedactAll()` und prüft den Download:

- keine Personendaten im Textlayer (pdf.js), in `pdftotext` (falls installiert), in der OCR jeder Seite (Tesseract der
  App, Seite aufrecht gerendert inkl. Annotationen), in Annotationen, Info/XMP, Anhängen und allen PDF-Rohobjekten
  (Strings, Namen, dekomprimierte Streams); Vergleich ohne Groß/Klein, Leerzeichen und Akzente;
- kein AcroForm, keine Anhänge; Dateiname des Exports behält den Unicode-Namen;
- Netzwerk: alles außer der eigenen Origin wird abgebrochen und protokolliert; externe Requests = Fehler. Die lokale
  KI-Autoerkennung (127.0.0.1:11434/1234/1060) wird nur gezählt.

Positivkontrolle: Jede gesuchte Angabe muss im **Eingang** gefunden werden (bei `ocrControl` per OCR), sonst ist der
Fall ungültig. `knownGaps` (Namen mit Diakritika außerhalb ÄÖÜß, Review 20.11.2026 Befund 2) werden gemeldet, lassen den
Lauf aber nicht scheitern. Ergebnisse: `tests/harness/out/` (`report.json`, Ein-/Ausgabe-PDFs, nicht versioniert).

Optionen: `BMD_HARNESS_NO_OCR=1` (schneller, prüft dann aber keine in Seitenbilder gebrannten Texte),
`BMD_APP_DIR=/pfad/app/static` (anderen Stand prüfen, z. B. `git archive main app/static | tar -x -C /tmp/alt`).

## E2E (`tests/e2e/e2e_ui.js`)
Assistent per ✕ schließen → PDF über die Dropzone (Dateiauswahl) → „Vorschau & Detailprüfung“ (Analyse) → Trefferliste
prüfen, Treffer aus/an → Seite 2 (Formularfeldwert als Treffer) → „Schwärzen & PDF herunterladen“ → Download wie im
Harness prüfen → „Sitzungsdaten löschen“ → dieselbe Datei erneut wählen (wird geladen). Keine Seitenfehler, keine
externen Requests. `BASE_URL=<Start-URL des laufenden Go-Launchers>` testet stattdessen den Launcher (mit CSP und Session-Cookie).

## Android (WebView-Hülle)
Die App selbst ist dieselbe Web-App (`app/static`, beim Build kopiert); die Android-Hülle hat nur JVM-Unit-Tests
(`cd android && ./gradlew testDebugUnitTest lintDebug assembleDebug`). Laufzeittest im Emulator (Mac):

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
npm run test:harness        # erzeugt u. a. die Eingangs-PDFs in tests/harness/out/input/
adb push tests/harness/out/input/. /sdcard/Download/bmd-harness/
adb shell am start -n de.juliandigitalproducts.blackmydata/.MainActivity
# dann in der App: Dateien aus Download/bmd-harness wählen, schwärzen, speichern; Export zurückholen und prüfen:
adb pull /sdcard/Download/ ./android-exports/ && pdftotext android-exports/<datei>_geschwaerzt.pdf -
```
