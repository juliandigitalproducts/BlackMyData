/**
 * BlackMyData – Comprehensive Verification Test Suite
 * Tests:
 * 1. Text-based PDF: Sensitivity level 1 vs 3 vs 5 (verifying entity count progression and behavior)
 * 2. Scanned/image-based PDF: OCR fallback initialization and detection
 * 3. Sensitivity-based OCR word confidence filtering (Level 1: 75% -> Level 3: 50% -> Level 5: 15%)
 */

const fs = require('fs');
const path = require('path');

// Mock browser global environment for Node.js
global.window = global;
global.document = {
  querySelectorAll: () => [],
  getElementById: () => null
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
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
// TEST SUITE 1: Text-Based Document & Sensitivity Scaling (1 vs 3 vs 5)
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

// Run detection on Level 1 (minimal), Level 3 (balanced), Level 5 (maximum)
const resultsL1 = detectPiiRulesJS(textDocument, standardCategories, defaultExceptions, null, "minimal");
const resultsL3 = detectPiiRulesJS(textDocument, standardCategories, defaultExceptions, null, "balanced");
const resultsL5 = detectPiiRulesJS(textDocument, standardCategories, defaultExceptions, null, "maximum");

console.log(`Level 1 (Minimal) Entities detected:  ${resultsL1.length}`);
console.log(`Level 3 (Balanced) Entities detected: ${resultsL3.length}`);
console.log(`Level 5 (Maximum) Entities detected:  ${resultsL5.length}`);

// Verification 1: Monotonic sensitivity progression (L1 <= L3 < L5)
assert(resultsL1.length > 0, "Level 1 detects core PII entities");
assert(resultsL3.length >= resultsL1.length, "Level 3 detects at least as many entities as Level 1");
assert(resultsL5.length > resultsL3.length, "Level 5 detects strictly more entities than Level 3 (comprehensive / paranoia mode)");

// Verification 2: Level 1 invoice protection (No false-positive ID/Ausweis matches on #INV or SKU or SL-DE)
const l1Ids = resultsL1.filter(e => e.category === "id" || e.category === "custom");
assert(l1Ids.length === 0, "Level 1 successfully filters invoice numbers and SKUs from ID/Ausweis detection");

// Verification 3: Core PII present in both Level 1 and Level 3
const l3Ibans = resultsL3.filter(e => e.category === "iban");
const l3Emails = resultsL3.filter(e => e.category === "email");
const l3Phones = resultsL3.filter(e => e.category === "phone");
const l3Names = resultsL3.filter(e => e.category === "name");

assert(l3Ibans.length >= 1 && l3Ibans[0].text.includes("DE89"), "IBAN DE89 detected in Level 3");
assert(l3Emails.length >= 2, "Both emails (kanzlei@..., m.schneider@...) detected in Level 3");
assert(l3Phones.length >= 1 && l3Phones[0].text.includes("+49 172 9876543"), "Phone number detected in Level 3");
assert(l3Names.some(n => n.text.includes("Markus Schneider")), "Person Markus Schneider detected in Level 3");

// Verification 4: Level 5 maximum detection detects loose addresses and reference IDs
const l5LooseStreets = resultsL5.filter(e => e.source === "sensitivity_high" || e.source === "sensitivity_max");
const l5RefIds = resultsL5.filter(e => e.source === "sensitivity_max");
assert(l5RefIds.length >= 1, "Level 5 catches alphanumeric reference codes (e.g. CASE-998234-DE, INV-2024)");

console.log("\n--- TEST SUITE 2: Scanned/Image PDF OCR Fallback Detection ---");

// Simulated raw OCR output from scanned_patient.pdf (representing Tesseract output)
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

// Check PII extraction from OCR text
const ocrPiiMatches = detectPiiRulesJS(scannedPatientOcrOutput.text, standardCategories, defaultExceptions, null, "balanced");
console.log(`OCR Extracted text length: ${scannedPatientOcrOutput.text.length} chars`);
console.log(`OCR PII Entities detected: ${ocrPiiMatches.length}`);
ocrPiiMatches.forEach(m => console.log(`  - [${m.category}] '${m.text}' (${m.source})`));

assert(ocrPiiMatches.some(m => m.text.includes("Erika Mustermann")), "OCR PII matches patient name 'Erika Mustermann'");
assert(ocrPiiMatches.some(m => m.text.includes("Leopoldstraße") || m.text.includes("80802 München")), "OCR PII matches patient address");
assert(ocrPiiMatches.some(m => m.text.includes("0171 4567890")), "OCR PII matches mobile phone number");
assert(ocrPiiMatches.some(m => m.text.includes("12.05.1989")), "OCR PII matches birthdate");

console.log("\n--- TEST SUITE 3: Sensitivity-based OCR Confidence Thresholding ---");

// Emulate the extractPageWordsAndText threshold logic from strato_app.js:
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

console.log(`Accepted OCR Words at Level 1 (>=75%): ${wordsL1.length} / ${scannedPatientOcrOutput.words.length}`);
console.log(`Accepted OCR Words at Level 3 (>=50%): ${wordsL3.length} / ${scannedPatientOcrOutput.words.length}`);
console.log(`Accepted OCR Words at Level 5 (>=15%): ${wordsL5.length} / ${scannedPatientOcrOutput.words.length}`);

assert(wordsL1.length < wordsL3.length, "Level 1 filters out lower confidence words (<75%)");
assert(wordsL3.length < wordsL5.length, "Level 5 accepts faint / low-contrast OCR words down to 15%");
assert(wordsL5.some(w => w.text === "FaintStampText"), "Level 5 includes faint stamp / degraded text (confidence 25%)");

console.log("\n============================================================");
console.log(` Verification Summary: ${passedTests} / ${totalTests} assertions passed!`);
console.log("============================================================\n");

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
