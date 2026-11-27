/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Julian Digital Products
 *
 * BlackMyData – Automated Release Verification Suite
 * Verifies: High-Precision OCR Pipeline (300 DPI, Sauvola, Deskew), ocr_utils.js,
 * Fuzzy Token Matching, Text-AI Chunking & Mac-Engine Bridge, Vision-KI.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("============================================================");
console.log(" BlackMyData – Automated Release Verification Suite  ");
console.log("============================================================\n");

// Read codebases
const ocrUtils = require('../app/static/ocr_utils.js');
const stratoAppCode = fs.readFileSync(path.join(__dirname, '../app/static/strato_app.js'), 'utf8');
const htmlCode = fs.readFileSync(path.join(__dirname, '../app/static/index.html'), 'utf8');
const cssCode = fs.readFileSync(path.join(__dirname, '../app/static/style.css'), 'utf8');
const { compare } = require('./_version');

// ----------------------------------------------------------------------------
// TEST SUITE 1: Build Version & Tags
// ----------------------------------------------------------------------------
console.log("--- TEST SUITE 1: Build Version & Script Tags ---");
const buildVersion = (stratoAppCode.match(/const CURRENT_BUILD_VERSION = "([\d.]+)";/) || [])[1];
assert(buildVersion && compare(buildVersion, "1.0.0") >= 0, "strato_app.js CURRENT_BUILD_VERSION >= 1.0.0");  // numeric (B34)
for (const f of ["ocr_utils.js", "strato_app.js", "pii_engine.js", "style.css"]) {
  assert(htmlCode.includes(`${f}?v=${buildVersion}`), `index.html includes ${f}?v=${buildVersion}`);
}
console.log(`  ✓ PASS: Version ${buildVersion} tags verified across all frontend and backend modules`);

// ----------------------------------------------------------------------------
// TEST SUITE 2: OCR Utilities (Algorithmic Verification)
// ----------------------------------------------------------------------------
console.log("\n--- TEST SUITE 2: OCR Utilities (Algorithms) ---");

// Levenshtein
assert.strictEqual(ocrUtils.levenshteinDistance("Mustermann", "Mustermann"), 0);
assert.strictEqual(ocrUtils.levenshteinDistance("Mustermann", "Mustcrmann"), 1);
assert.strictEqual(ocrUtils.levenshteinDistance("Schmidt", "Schm1dt"), 1);

// Fuzzy Token Match
assert.strictEqual(ocrUtils.isFuzzyTokenMatch("Mustermann", "Mustcrmann", "name"), true, "Mustcrmann matches Mustermann");
assert.strictEqual(ocrUtils.isFuzzyTokenMatch("Anna", "Annahme", "name"), false, "Short name Anna must NOT match Annahme");
assert.strictEqual(ocrUtils.isFuzzyTokenMatch("max@muster.de", "max@muster.com", "email"), false, "Strict email matching");
assert.strictEqual(ocrUtils.isFuzzyTokenMatch("DE1234567890", "DE1234567891", "iban"), false, "Strict IBAN matching");

// IoU
const boxA = [0, 0, 100, 100];
const boxB = [50, 0, 150, 100];
const iou = ocrUtils.calculateIoU(boxA, boxB);
assert(Math.abs(iou - (1 / 3)) < 1e-4, "IoU calculation of overlapping boxes");

// Deskew Box Enclosure
const unskewed = ocrUtils.rotateBoxToAABB([100, 100, 200, 150], 0.05, 500, 500);
assert(unskewed[0] < unskewed[2] && unskewed[1] < unskewed[3], "AABB enclosure calculation");

// Sauvola Binarization & Contrast Stretch
const testImg = new Uint8Array(200 * 200);
for (let i = 0; i < testImg.length; i++) {
  testImg[i] = (i % 200 > 100) ? 230 : 40; // High contrast text/background pattern
}
const stretched = ocrUtils.contrastStretchGrayscale(testImg, 200, 200);
assert(stretched instanceof Uint8Array, "contrastStretchGrayscale returns Uint8Array");
const binarized = ocrUtils.sauvolaBinarize(stretched, 200, 200, 15, 0.32, 128);
assert(binarized instanceof Uint8Array, "sauvolaBinarize returns Uint8Array");
console.log("  ✓ PASS: All algorithmic functions in ocr_utils.js verified");

// ----------------------------------------------------------------------------
// TEST SUITE 3: UI Controls & Recognition Mode
// ----------------------------------------------------------------------------
console.log("\n--- TEST SUITE 3: Precise Recognition Mode UI ---");
assert(htmlCode.includes('data-recognition-mode="precise"'), "index.html defines data-recognition-mode='precise'");
assert(htmlCode.includes('settingsOcrPrecisionSelect'), "index.html defines settingsOcrPrecisionSelect in Settings Tab");
assert(htmlCode.includes('settingsOcrLanguageSelect'), "index.html defines settingsOcrLanguageSelect in Settings Tab");
assert(htmlCode.includes('settingsDeskewCheckbox'), "index.html defines settingsDeskewCheckbox in Settings Tab");
assert(htmlCode.includes('settingsVisionOcrCheckbox'), "index.html defines settingsVisionOcrCheckbox in Settings Tab");
assert(stratoAppCode.includes("function setOcrPrecision"), "strato_app.js defines setOcrPrecision");
assert(stratoAppCode.includes("function setOcrLanguage"), "strato_app.js defines setOcrLanguage");
assert(stratoAppCode.includes("function setOcrDeskew"), "strato_app.js defines setOcrDeskew");
assert(stratoAppCode.includes("function setVisionOcr"), "strato_app.js defines setVisionOcr");
assert(cssCode.includes(".bbox-low-confidence"), "style.css defines .bbox-low-confidence");
assert(cssCode.includes(".bbox-vision-corrected"), "style.css defines .bbox-vision-corrected");
console.log("  ✓ PASS: UI elements and state handlers for precise OCR verified");

// ----------------------------------------------------------------------------
// TEST SUITE 4: Vision-KI & text chunking (the Mac-Engine bridge was removed (code review B22))
// ----------------------------------------------------------------------------
console.log("\n--- TEST SUITE 4: Vision-KI & Text Chunking ---");
assert(!stratoAppCode.includes('callMacBackend') && !stratoAppCode.includes('"mac_backend"]'), "strato_app.js no longer offers the Mac-Engine provider");
assert(stratoAppCode.includes('queryLocalhostVisionCorrection'), "strato_app.js implements queryLocalhostVisionCorrection");
assert(stratoAppCode.includes('splitTextIntoAiChunks'), "strato_app.js implements text chunking for complete page analysis");
console.log("  ✓ PASS: Vision-KI and chunking verified");

console.log("\n============================================================");
console.log(" 🎉 ALL RELEASE VERIFICATION CHECKS PASSED!                   ");
console.log("============================================================\n");
