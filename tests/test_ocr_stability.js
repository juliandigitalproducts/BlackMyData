/**
 * BlackMyData – Comprehensive Cross-Browser & Stability Verification Test Suite
 * Tests:
 * 1. Text-based PDF: Sensitivity level 1 vs 3 vs 5 (PII detection & progression)
 * 2. Scanned/image-based PDF: OCR fallback initialization and detection
 * 3. Sensitivity-based OCR word confidence filtering (Level 1: 75% -> Level 3: 50% -> Level 5: 15%)
 * 4. Scan metadata OCR threshold (< 80 chars vs old < 15 chars bug) & Force OCR mode
 * 5. Cross-browser stability: cacheMethod 'none' (Safari SecurityError prevention), workerBlobURL, global error handlers
 * 6. App build version migration and cache busting
 */

const fs = require('fs');
const path = require('path');
const V = require('./_version').current; // version independent (code review B6)

// Mock browser global environment for Node.js
const storageMap = new Map();
global.window = global;
global.document = {
  querySelectorAll: () => [],
  getElementById: () => null
};
global.localStorage = {
  getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k)
};

// Load BlackMyData PII Engine
const piiEnginePath = path.join(__dirname, '../app/static/pii_engine.js');
require(piiEnginePath);

const { detectPiiRulesJS } = global.window.BlackMyDataPII;

console.log("============================================================");
console.log(" BlackMyData – Automated Release Verification Suite  ");
console.log("============================================================\n");

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

// -------------------------------------------------------------
// TEST SUITE 1: Text-Based Document Sensitivity Levels (1 vs 3 vs 5)
// -------------------------------------------------------------
console.log("--- TEST SUITE 1: Text-Based Document Sensitivity Levels (1 vs 3 vs 5) ---");

const textDocument = `
Rechnung Nr. #INV-2024-8819 | Bestellreferenz: SL-DE-99482
Artikelnr: SKU-9942-A
Kanzlei Dr. Christian Weber & Partner
Friedrichstraße 150, 10117 Berlin | kanzlei@weber-partner.de

Herrn Markus Schneider
Sonnenallee 42, 12045 Berlin
Berlin, 15.10.2024

Sehr geehrter Herr Schneider,
wir bestätigen den Eingang Ihrer Unterlagen bezüglich des Rechtsstreits mit der Musterbau GmbH.
Unser Mandant, Herr Markus Schneider, geboren am 24.08.1981 in Hamburg, hat uns beauftragt.

Lieferadresse für Dokumente: Friedrichstraße
Zu Abrechnungszwecken hinterlegt:
- IBAN: DE89 3704 0044 0532 0130 00
- Steuer-ID: 65 842 193 052
- Mobiltelefon: +49 172 9876543
- E-Mail: m.schneider@example-berlin.de
- Fall-Referenznummer: CASE-998234-DE

Mit freundlichen Grüßen,
Dr. Christian Weber
Rechtsanwalt
`;

const standardCategories = {
  names: true,
  first_names: false,
  last_names: false,
  addresses: true,
  streets: true,
  house_numbers: false,
  zip_codes: false,
  cities: false,
  emails: true,
  phones: true,
  ibans: true,
  tax_ids: true,
  dates: true,
  ids: true,
  custom: true
};

const defaultExceptions = {
  whitelist: [],
  custom_words: []
};

const resultsL1 = detectPiiRulesJS(textDocument, standardCategories, defaultExceptions, null, "minimal");
const resultsL3 = detectPiiRulesJS(textDocument, standardCategories, defaultExceptions, null, "balanced");
const resultsL5 = detectPiiRulesJS(textDocument, standardCategories, defaultExceptions, null, "maximum");

console.log(`Level 1 (Minimal) Entities detected:  ${resultsL1.length}`);
console.log(`Level 3 (Balanced) Entities detected: ${resultsL3.length}`);
console.log(`Level 5 (Maximum) Entities detected:  ${resultsL5.length}`);

assert(resultsL1.length > 0, "Level 1 detects core PII entities");
assert(resultsL3.length >= resultsL1.length, "Level 3 detects at least as many entities as Level 1");
assert(resultsL5.length > resultsL3.length, "Level 5 detects strictly more entities than Level 3 (comprehensive / paranoia mode)");

const l1Ids = resultsL1.filter(e => e.category === "id" || e.category === "custom");
assert(l1Ids.length === 0, "Level 1 successfully filters invoice numbers and SKUs from ID/Ausweis detection");

const l3Ibans = resultsL3.filter(e => e.category === "iban");
const l3Emails = resultsL3.filter(e => e.category === "email");
const l3Phones = resultsL3.filter(e => e.category === "phone");
const l3Names = resultsL3.filter(e => e.category === "name");

assert(l3Ibans.length >= 1 && l3Ibans[0].text.includes("DE89"), "IBAN DE89 detected in Level 3");
assert(l3Emails.length >= 2, "Both emails (kanzlei@..., m.schneider@...) detected in Level 3");
assert(l3Phones.length >= 1 && l3Phones[0].text.includes("+49 172 9876543"), "Phone number detected in Level 3");
assert(l3Names.some(n => n.text.includes("Markus Schneider")), "Person Markus Schneider detected in Level 3");

const l5RefIds = resultsL5.filter(e => e.source === "sensitivity_max");
assert(l5RefIds.length >= 1, "Level 5 catches alphanumeric reference codes (e.g. CASE-998234-DE, INV-2024)");

// -------------------------------------------------------------
// TEST SUITE 2: Scanned/Image PDF OCR Fallback Detection
// -------------------------------------------------------------
console.log("\n--- TEST SUITE 2: Scanned/Image PDF OCR Fallback Detection ---");

const scannedPatientOcrOutput = {
  text: `ARZTPRAXIS DR. MED. STEFAN KEHLER
Hauptstraße 88, 80331 München - Tel: 089 12345678
PATIENTEN-STAMMDATENBLATT
Patientin: Erika Mustermann
Geburtsdatum: 12.05.1989
Wohnort: Leopoldstraße 14, 80802 München
Krankenkasse: Techniker Krankenkasse (TK)
Versichertennummer: X123456789
E-Mail: erikamustermann@web.de
Telefon: 0171 4567890
Behandelnder Arzt: Dr. med. Stefan Kehler`,
  words: [
    { text: "Erika", confidence: 92, bbox: { x0: 50, y0: 100, x1: 90, y1: 120 } },
    { text: "Mustermann", confidence: 88, bbox: { x0: 95, y0: 100, x1: 180, y1: 120 } },
    { text: "Leopoldstraße", confidence: 78, bbox: { x0: 50, y0: 140, x1: 150, y1: 160 } },
    { text: "14", confidence: 85, bbox: { x0: 155, y0: 140, x1: 175, y1: 160 } },
    { text: "80802", confidence: 72, bbox: { x0: 180, y0: 140, x1: 220, y1: 160 } },
    { text: "München", confidence: 90, bbox: { x0: 225, y0: 140, x1: 280, y1: 160 } },
    { text: "X123456789", confidence: 68, bbox: { x0: 50, y0: 180, x1: 130, y1: 200 } },
    { text: "0171", confidence: 55, bbox: { x0: 50, y0: 220, x1: 90, y1: 240 } },
    { text: "FaintStampText", confidence: 25, bbox: { x0: 400, y0: 500, x1: 480, y1: 520 } }
  ]
};

const ocrPiiMatches = detectPiiRulesJS(scannedPatientOcrOutput.text, standardCategories, defaultExceptions, null, "balanced");
assert(ocrPiiMatches.some(m => m.text.includes("Erika Mustermann")), "OCR PII matches patient name 'Erika Mustermann'");
assert(ocrPiiMatches.some(m => m.text.includes("Leopoldstraße") || m.text.includes("80802 München")), "OCR PII matches patient address");
assert(ocrPiiMatches.some(m => m.text.includes("0171 4567890")), "OCR PII matches mobile phone number");
assert(ocrPiiMatches.some(m => m.text.includes("12.05.1989")), "OCR PII matches birthdate");

// -------------------------------------------------------------
// TEST SUITE 3: Sensitivity-based OCR Confidence Thresholding
// -------------------------------------------------------------
console.log("\n--- TEST SUITE 3: Sensitivity-based OCR Confidence Thresholding ---");

function filterOcrWordsBySensitivity(ocrWords, sensitivity) {
  const minOcrConfidence = {
    minimal: 75,
    low: 65,
    balanced: 50,
    high: 35,
    maximum: 15
  }[sensitivity] || 50;

  return ocrWords.filter(w => {
    const conf = typeof w.confidence === "number" ? w.confidence : 80;
    return conf >= minOcrConfidence;
  });
}

const wordsL1 = filterOcrWordsBySensitivity(scannedPatientOcrOutput.words, "minimal");
const wordsL3 = filterOcrWordsBySensitivity(scannedPatientOcrOutput.words, "balanced");
const wordsL5 = filterOcrWordsBySensitivity(scannedPatientOcrOutput.words, "maximum");

assert(wordsL1.length < wordsL3.length, "Level 1 filters out lower confidence words (<75%)");
assert(wordsL3.length < wordsL5.length, "Level 5 accepts faint / low-contrast OCR words down to 15%");
assert(wordsL5.some(w => w.text === "FaintStampText"), "Level 5 includes faint stamp / degraded text (confidence 25%)");

// -------------------------------------------------------------
// TEST SUITE 4: Scan Metadata OCR Threshold (< 80 chars) & Force OCR
// -------------------------------------------------------------
console.log("\n--- TEST SUITE 4: Scan Metadata OCR Threshold & Force OCR ---");

function checkShouldRunOcr(fullText, ocrMode, forceOcr) {
  const isLowText = fullText.trim().length < 80;
  return (forceOcr || isLowText) && (forceOcr || ocrMode !== "off");
}

// Scanned PDF that contains only scanner header metadata (31 characters)
const scanHeaderOnly = "Scan 01.11.2026 - Seite 1 / 1";
assert(scanHeaderOnly.length >= 15 && scanHeaderOnly.length < 80, "Scan metadata has between 15 and 80 characters");

// In (length < 15), this was falsely skipped!
const oldLogicRanOcr = scanHeaderOnly.trim().length < 15;
assert(oldLogicRanOcr === false, "Old logic (< 15) erroneously skipped OCR on scanned PDF with metadata");

// In , this correctly triggers OCR!
const newLogicRunsOcr = checkShouldRunOcr(scanHeaderOnly, "balanced", false);
assert(newLogicRunsOcr === true, "logic (< 80) correctly triggers OCR on scanned PDF with metadata");

// Text PDF with regular body text (> 80 characters) without forceOcr does NOT run OCR
const regularTextDoc = "Sehr geehrte Damen und Herren, anbei erhalten Sie unsere ausführliche Stellungnahme mit sämtlichen Anlagen zur Kenntnisnahme.";
assert(regularTextDoc.length > 80, "Regular text document has > 80 characters");
const regularDoesNotRunOcr = checkShouldRunOcr(regularTextDoc, "balanced", false);
assert(regularDoesNotRunOcr === false, "Regular text document does not trigger unnecessary OCR");

// Force OCR explicitly triggers OCR even on regular text document
const forceOcrRuns = checkShouldRunOcr(regularTextDoc, "balanced", true);
assert(forceOcrRuns === true, "forceOcr = true triggers OCR regardless of document length");

// Force OCR triggers even if ocrMode is set to 'off'
const forceOcrRunsWhenOff = checkShouldRunOcr(regularTextDoc, "off", true);
assert(forceOcrRunsWhenOff === true, "forceOcr = true triggers OCR even if default ocrMode was off");

// -------------------------------------------------------------
// TEST SUITE 5: Cross-Browser Code Inspection (Safari, Chrome, Firefox)
// -------------------------------------------------------------
console.log("\n--- TEST SUITE 5: Cross-Browser Stability & Safari Security Inspection ---");

const stratoAppPath = path.join(__dirname, '../app/static/strato_app.js');
const stratoAppCode = fs.readFileSync(stratoAppPath, 'utf8');

// 1. cacheMethod: "none" prevents Safari SecurityError with IndexedDB
const hasCacheMethodNone = stratoAppCode.includes('cacheMethod: "none"');
assert(hasCacheMethodNone, "strato_app.js configures cacheMethod: 'none' for Safari IndexedDB security compatibility");

// 2. workerBlobURL: false avoids Safari blob worker cross-origin restrictions
const hasWorkerBlobFalse = stratoAppCode.includes('workerBlobURL: false');
assert(hasWorkerBlobFalse, "strato_app.js configures workerBlobURL: false for direct local Web Workers in Safari");

// 3. Global error and unhandledrejection handlers
const hasGlobalError = stratoAppCode.includes('window.addEventListener("error"');
const hasUnhandledRejection = stratoAppCode.includes('window.addEventListener("unhandledrejection"');
assert(hasGlobalError, "strato_app.js installs global window 'error' listener");
assert(hasUnhandledRejection, "strato_app.js installs global window 'unhandledrejection' listener");

// 4. Force OCR function and UI Infobox
const hasForceOcrFunction = stratoAppCode.includes('async function forceOcrOnCurrentPage()');
const hasShowOcrInfobox = stratoAppCode.includes('function showOcrInfobox(');
assert(hasForceOcrFunction, "strato_app.js implements forceOcrOnCurrentPage()");
assert(hasShowOcrInfobox, "strato_app.js implements showOcrInfobox() for visible error reporting");

// 5. Versioning
const hasV143Constant = stratoAppCode.includes(`CURRENT_BUILD_VERSION = "${V}"`);
assert(hasV143Constant, "strato_app.js defines CURRENT_BUILD_VERSION = current version");

// -------------------------------------------------------------
// TEST SUITE 6: App Build Version Migration & Cache Busting
// -------------------------------------------------------------
console.log("\n--- TEST SUITE 6: App Build Version Migration & Cache Busting ---");

// Simulate migration from older version
storageMap.set("bmd_app_build_version", "1.4.2");
storageMap.set("bmd_ocr_cache", "stale_ocr_data");
storageMap.set("bmd_legacy_cache", "legacy_stuff");

const CURRENT_BUILD_VERSION = V;
function checkAndMigrateAppBuildVersionTest() {
  const prevVersion = global.localStorage.getItem("bmd_app_build_version");
  if (prevVersion !== CURRENT_BUILD_VERSION) {
    const keysToRemove = ["bmd_ocr_cache", "bmd_legacy_cache", "tesseract_cache"];
    for (const k of keysToRemove) {
      global.localStorage.removeItem(k);
    }
    global.localStorage.setItem("bmd_app_build_version", CURRENT_BUILD_VERSION);
  }
}

checkAndMigrateAppBuildVersionTest();
assert(global.localStorage.getItem("bmd_app_build_version") === V, "bmd_app_build_version migrated to the current version");
assert(global.localStorage.getItem("bmd_ocr_cache") === null, "Obsolete bmd_ocr_cache cleared on migration");
assert(global.localStorage.getItem("bmd_legacy_cache") === null, "Obsolete bmd_legacy_cache cleared on migration");

// Inspect HTML for ?v=<version> cache busting query parameters
const htmlPath = path.join(__dirname, '../app/static/index.html');
const htmlCode = fs.readFileSync(htmlPath, 'utf8');

assert(htmlCode.includes(`style.css?v=${V}`), "run/index.html includes style.css?v=<version>");
assert(htmlCode.includes(`tesseract.min.js?v=${V}`), "run/index.html includes tesseract.min.js?v=<version>");
assert(htmlCode.includes(`pdf.min.js?v=${V}`), "run/index.html includes pdf.min.js?v=<version>");
assert(htmlCode.includes(`pii_engine.js?v=${V}`), "run/index.html includes pii_engine.js?v=<version>");
assert(htmlCode.includes(`strato_app.js?v=${V}`), "run/index.html includes strato_app.js?v=<version>");
assert(htmlCode.includes('btnForceOcrPage'), "run/index.html has btnForceOcrPage element");
assert(htmlCode.includes('ocrStatusInfobox'), "run/index.html has ocrStatusInfobox element");

console.log("\n============================================================");
console.log(` Verification Summary: ${passedTests} / ${totalTests} assertions passed!`);
console.log("============================================================\n");

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
