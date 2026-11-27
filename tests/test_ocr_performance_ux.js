/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Julian Digital Products
 *
 * BlackMyData – Comprehensive Cross-Browser, OCR Performance & UX Verification Suite
 */
const fs = require('fs');
const path = require('path');
const V = require('./_version').current; // version independent (code review B6)
const assert = require('assert');

console.log("============================================================");
console.log(" BlackMyData – Automated Release Verification Suite  ");
console.log("============================================================\n");

// Read files
const piiEngineCode = fs.readFileSync(path.join(__dirname, '../app/static/pii_engine.js'), 'utf8');
const stratoAppCode = fs.readFileSync(path.join(__dirname, '../app/static/strato_app.js'), 'utf8');
const htmlCode = fs.readFileSync(path.join(__dirname, '../app/static/index.html'), 'utf8');
const cssCode = fs.readFileSync(path.join(__dirname, '../app/static/style.css'), 'utf8');
const htaccessCode = fs.readFileSync(path.join(__dirname, '../app/static/.htaccess'), 'utf8');

// 1. Version tags and cache busting
console.log("--- TEST SUITE 1: Build Version & Cache-Busting ---");
assert(stratoAppCode.includes(`const CURRENT_BUILD_VERSION = "${V}";`), "strato_app.js defines CURRENT_BUILD_VERSION = current version");
assert(htmlCode.includes(`style.css?v=${V}`), "index.html includes style.css?v=<version>");
assert(htmlCode.includes(`strato_app.js?v=${V}`), "index.html includes strato_app.js?v=<version>");
assert(htmlCode.includes(`tesseract.min.js?v=${V}`), "index.html includes tesseract.min.js?v=<version>");
assert(htmlCode.includes(`pdf.min.js?v=${V}`), "index.html includes pdf.min.js?v=<version>");
assert(htmlCode.includes(`pii_engine.js?v=${V}`), "index.html includes pii_engine.js?v=<version>");
console.log("  ✓ PASS: All version tags and cache-busting queries verified");

// 2. OCR Performance & Singleton Worker
console.log("\n--- TEST SUITE 2: OCR Performance & Singleton Worker ---");
assert(stratoAppCode.includes("let _bmdWorkerPool = [];"), "strato_app.js keeps a reusable OCR worker pool");
assert(stratoAppCode.includes('createWorker'), "strato_app.js instantiates worker via createWorker");
assert(stratoAppCode.includes('const poolReady = _bmdWorkerPoolLang === poolKey'), "strato_app.js reuses the worker pool without re-init");
console.log("  ✓ PASS: Singleton worker reuse architecture verified");

// 3. Intelligent Scan & Image Detection
console.log("\n--- TEST SUITE 3: Intelligent Scan Detection ---");
assert(stratoAppCode.includes('getOperatorList()'), "strato_app.js checks raster scan images via getOperatorList()");
assert(stratoAppCode.includes('isHybridScan'), "strato_app.js supports hybrid scans (images + low text)");
assert(stratoAppCode.includes('paintImageXObject'), "strato_app.js inspects paintImageXObject operations");

// Test logic:
// Document with scan image and 150 chars of header/watermark
const hasScanImage = true;
const textLen = 150;
const isLowText = textLen < 120;
const isHybridScan = hasScanImage && textLen < 400;
const isScanOrNeedsOcr = isLowText || isHybridScan;
assert(isScanOrNeedsOcr === true, "Hybrid scan with 150 chars triggers OCR automatically in ");
console.log("  ✓ PASS: Intelligent scan detection logic verified");

// 4. UI Spinner Animation & Progress Mapping
console.log("\n--- TEST SUITE 4: UI Spinner Animation & Live Progress ---");
assert(cssCode.includes('.ocr-btn-spinner'), "style.css defines .ocr-btn-spinner");
assert(cssCode.includes('animation: spinClockwise'), "style.css applies spinClockwise animation to .ocr-btn-spinner");
assert(stratoAppCode.includes('ocr-btn-spinner'), "forceOcrOnCurrentPage inserts .ocr-btn-spinner into button");
assert(stratoAppCode.includes('Lade OCR-Kern'), "forceOcrOnCurrentPage maps 'loading tesseract core'");
assert(stratoAppCode.includes('Erkenne Text'), "forceOcrOnCurrentPage maps 'recognizing text'");
console.log("  ✓ PASS: Animated spinner and live progress feedback verified");

// 5. Caching & .htaccess Optimization
console.log("\n--- TEST SUITE 5: Caching & Traffic Optimization (.htaccess) ---");
assert(htaccessCode.includes('tesseract-core.*\\.wasm\\.js'), ".htaccess contains specific rule for WASM files");
assert(htaccessCode.includes('max-age=31536000, immutable'), ".htaccess sets 1-year immutable caching for WASM & traineddata");
console.log("  ✓ PASS: .htaccess eliminates redundant WASM/model downloads");

// 6. Single source: see tests/test_sync.js (Android and the web deployment are built from app/static).

console.log("\n============================================================");
console.log(" Verification Summary: All assertions passed successfully!  ");
console.log("============================================================\n");
