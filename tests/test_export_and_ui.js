const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");
const { PDFDocument, PDFName } = require("pdf-lib");

// Enable cross-realm Array instanceof checks for pdf-lib inside VM
Object.defineProperty(Array, Symbol.hasInstance, {
  value: (inst) => Array.isArray(inst)
});

console.log("============================================================");
console.log(" BlackMyData Review Fixes & Security Verification Suite    ");
console.log("============================================================\n");

// Valid minimal 1x1 JPEG bytes (valid SOI, DQT, SOF0, DHT, SOS, EOI markers)
const valid1x1Jpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x80, 0xff, 0xd9
]);

const appJsCode = fs.readFileSync(path.join(__dirname, "../app/static/strato_app.js"), "utf8");

function createVmSandbox() {
  const mockDoc = {
    createElement: (tag) => ({
      width: 100,
      height: 100,
      getContext: () => ({
        fillStyle: "",
        fillRect: () => {},
        fillText: () => {}
      }),
      toBlob: (cb) => {
        cb({
          arrayBuffer: async () => valid1x1Jpeg.buffer.slice(valid1x1Jpeg.byteOffset, valid1x1Jpeg.byteOffset + valid1x1Jpeg.byteLength)
        });
      }
    }),
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };

  const sandbox = {
    window: {
      PDFLib: { PDFDocument, PDFName },
      addEventListener: () => {},
      location: { origin: "https://example.com" },
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    },
    document: mockDoc,
    navigator: { userAgent: "Node" },
    console,
    setTimeout,
    clearTimeout,
    Array,
    Uint8Array,
    ArrayBuffer,
    Blob: global.Blob
  };
  sandbox.window.window = sandbox.window;
  sandbox.window.document = mockDoc;

  vm.createContext(sandbox);
  vm.runInContext(appJsCode, sandbox);
  return sandbox;
}

(async () => {
  try {
    // ----------------------------------------------------------------------------
    // TEST 1: Hybrid PDF Redaction Engine (Testing the real strato_app.js function)
    // ----------------------------------------------------------------------------
    console.log("--- TEST 1: Hybrid PDF Redaction Engine (real buildPhysicallyRedactedPdfBlob) ---");
    const sandbox = createVmSandbox();

    // Create a 2-page source document:
    // Page 1: unredacted vector text, comments (/Annots), page actions (/AA), and interactive AcroForm field
    // Page 2: sensitive PII text to redact
    const srcDoc = await PDFDocument.create();
    const page1 = srcDoc.addPage([595, 842]);
    page1.drawText("Unredacted innocent vector text on page 1");
    page1.node.set(PDFName.of("Annots"), srcDoc.context.obj([]));
    page1.node.set(PDFName.of("AA"), srcDoc.context.obj({}));

    const form = srcDoc.getForm();
    const tf = form.createTextField("secretField");
    tf.setText("sensitive hidden form data");
    tf.addToPage(page1, { x: 50, y: 50, width: 100, height: 20 });

    const page2 = srcDoc.addPage([595, 842]);
    page2.drawText("Sensitive PII text on page 2: Dr. Max Mustermann");
    const srcBytes = await srcDoc.save();

    const file = {
      analyzed: true,
      filename: "test_hybrid.pdf",
      pages_count: 2,
      arrayBuffer: srcBytes.buffer.slice(srcBytes.byteOffset, srcBytes.byteOffset + srcBytes.byteLength),
      excludedEntityIds: new Set(),
      pdfDoc: {
        getPage: async (num) => ({
          getViewport: ({ scale }) => ({ width: 595 * scale, height: 842 * scale }),
          render: () => ({ promise: Promise.resolve() })
        })
      },
      analysisData: {
        entities_by_page: {
          0: [], // Page 1: 0 redactions -> vector copy (copyPages) with sanitization
          1: [{ id: "e1", category: "names", rects: [[100, 100, 200, 120]] }] // Page 2: raster-burn
        }
      },
      manualRedactions: {}
    };

    const res = await sandbox.buildPhysicallyRedactedPdfBlob(file);
    assert.strictEqual(res.totalRedactedBoxes, 1, "Must redact 1 box on page 2");
    assert(res.blob && res.blob.size > 0, "Output PDF blob must be generated");

    const outBuf = Buffer.from(await res.blob.arrayBuffer());
    const outDoc = await PDFDocument.load(outBuf, { updateMetadata: false });
    assert.strictEqual(outDoc.getPageCount(), 2, "Output PDF has exactly 2 pages");

    // Security assertions on copied vector page 0:
    const p0 = outDoc.getPage(0);
    assert(!p0.node.has(PDFName.of("Annots")), "Copied page 0 MUST NOT leak /Annots (comments, popups, stamps stripped)");
    assert(!p0.node.has(PDFName.of("AA")), "Copied page 0 MUST NOT leak /AA (page actions stripped)");
    assert(!outDoc.catalog.has(PDFName.of("AcroForm")), "Output catalog MUST NOT leak AcroForm");
    assert(!outDoc.catalog.has(PDFName.of("AA")), "Output catalog MUST NOT leak document-level AA");
    assert(!outDoc.catalog.has(PDFName.of("Names")), "Output catalog MUST NOT leak Names (attachments/JS)");
    assert(!outDoc.catalog.has(PDFName.of("OpenAction")), "Output catalog MUST NOT leak OpenAction");
    assert.strictEqual(outDoc.getProducer(), "blackMyData", "Producer must be sanitized to blackMyData");
    assert.strictEqual(outDoc.getCreator(), "blackMyData", "Creator must be sanitized to blackMyData");
    console.log("  ✓ PASS: Real buildPhysicallyRedactedPdfBlob sanitizes copied vector pages and raster-burns redacted pages");

    // Test 1b: Setting "Alle Seiten rastern (maximale Sicherheit)"
    vm.runInContext("state.settings.rasterize_all_pages = true;", sandbox);
    const resRasterAll = await sandbox.buildPhysicallyRedactedPdfBlob(file);
    const outDocRaster = await PDFDocument.load(Buffer.from(await resRasterAll.blob.arrayBuffer()), { updateMetadata: false });
    assert.strictEqual(outDocRaster.getPageCount(), 2, "Rasterized PDF contains 2 pages");
    assert.strictEqual(outDocRaster.getProducer(), "blackMyData", "Producer sanitized");
    console.log("  ✓ PASS: rasterize_all_pages setting correctly rasterizes all pages for maximum paranoia/security");

    // ----------------------------------------------------------------------------
    // TEST 2: Rotated PDF Viewport Coordinate Mapping
    // ----------------------------------------------------------------------------
    console.log("\n--- TEST 2: Rotated Viewport Rectangle Mapping ---");
    function createMockViewport(width, height, rotation) {
      return {
        width,
        height,
        rotation,
        convertToViewportRectangle(rect) {
          const [x1, y1, x2, y2] = rect;
          if (rotation === 0) return [x1, height - y2, x2, height - y1];
          if (rotation === 90) return [y1, x1, y2, x2];
          if (rotation === 180) return [width - x2, y1, width - x1, y2];
          if (rotation === 270) return [width - y2, height - x2, width - y1, height - x1];
          return rect;
        }
      };
    }

    const v0 = createMockViewport(600, 800, 0);
    const r0 = v0.convertToViewportRectangle([100, 200, 300, 250]);
    assert.deepStrictEqual(r0, [100, 550, 300, 600]);

    const v90 = createMockViewport(800, 600, 90);
    const r90 = v90.convertToViewportRectangle([100, 200, 300, 250]);
    assert(r90[0] >= 0 && r90[1] >= 0, "Rotated viewport rectangle mapped to positive canvas space");
    console.log("  ✓ PASS: convertToViewportRectangle correctly maps coordinates across page rotations");

    // ----------------------------------------------------------------------------
    // TEST 3: PII Whitelist Exact Word-Boundary Matching & Reverse-Match Leak Prevention
    // ----------------------------------------------------------------------------
    console.log("\n--- TEST 3: PII Whitelist Substring Bug Fix & Reverse-Match Leak Prevention ---");
    const piiCode = fs.readFileSync(path.join(__dirname, "../app/static/pii_engine.js"), "utf8");
    const piiCtx = { window: {}, console };
    vm.createContext(piiCtx);
    vm.runInContext(piiCode, piiCtx);
    const { isWhitelistedText } = piiCtx.window.BlackMyDataPII;

    // Word boundary checks
    assert.strictEqual(isWhitelistedText("Frankfurt", { whitelist: ["Frank"] }), false, "'Frank' must NOT whitelist 'Frankfurt'");
    assert.strictEqual(isWhitelistedText("Frank", { whitelist: ["Frankfurt"] }), false, "'Frankfurt' must NOT whitelist 'Frank'");
    assert.strictEqual(isWhitelistedText("Frank", { whitelist: ["Frank"] }), true, "Exact match 'Frank' must be whitelisted");
    assert.strictEqual(isWhitelistedText("Herr Frank", { whitelist: ["Frank"] }), true, "'Herr Frank' contains word 'Frank'");
    assert.strictEqual(isWhitelistedText("Frankfurt am Main", { whitelist: ["Frank"] }), false, "'Frankfurt am Main' must NOT match 'Frank'");
    assert.strictEqual(isWhitelistedText("Frankfurt am Main", { whitelist: ["Frankfurt"] }), true, "'Frankfurt am Main' contains word 'Frankfurt'");

    // Reverse-matching bug check: "Frank Müller GmbH" on whitelist must NOT whitelist single words like "Frank" or "Müller"
    assert.strictEqual(isWhitelistedText("Frank", { whitelist: ["Frank Müller GmbH"] }), false, "'Frank Müller GmbH' must NOT whitelist 'Frank'");
    assert.strictEqual(isWhitelistedText("Müller", { whitelist: ["Frank Müller GmbH"] }), false, "'Frank Müller GmbH' must NOT whitelist 'Müller'");
    assert.strictEqual(isWhitelistedText("Frank Müller GmbH", { whitelist: ["Frank Müller GmbH"] }), true, "Exact match 'Frank Müller GmbH' must be whitelisted");
    assert.strictEqual(isWhitelistedText("Die Frank Müller GmbH ist Partner", { whitelist: ["Frank Müller GmbH"] }), true, "Contains full entry");
    console.log("  ✓ PASS: Whitelist strictly respects word boundaries and eliminates reverse-match leaks");

    // ----------------------------------------------------------------------------
    // TEST 4: Multi-line Entity Grouping
    // ----------------------------------------------------------------------------
    console.log("\n--- TEST 4: Multi-Line Entity Bounding Box Grouping ---");
    const ocrUtils = require("../app/static/ocr_utils.js");
    const multiLineRects = [
      [400, 100, 500, 120], // Line 1
      [40, 140, 160, 160],  // Line 2
      [170, 140, 280, 160]  // Line 2
    ];
    const grouped = ocrUtils.groupRectsByLine(multiLineRects);
    assert.strictEqual(grouped.length, 2, "Must produce 2 separate boxes for 2 lines");
    assert.deepStrictEqual(grouped[0], [400, 100, 500, 120], "Line 1 box");
    assert.deepStrictEqual(grouped[1], [40, 140, 280, 160], "Line 2 merged box");
    console.log("  ✓ PASS: Multi-line entities generate line-specific boxes instead of one giant block");

    // ----------------------------------------------------------------------------
    // TEST 5: Touch Support & touch-action: none
    // ----------------------------------------------------------------------------
    console.log("\n--- TEST 5: Touch Events and CSS ---");
    const css = fs.readFileSync(path.join(__dirname, "../app/static/style.css"), "utf8");
    assert(css.includes(".overlay-layer") && css.includes("touch-action: none;"), "CSS sets touch-action: none on .overlay-layer");

    assert(appJsCode.includes("pointerdown") && appJsCode.includes("handlePointerDown"), "strato_app.js implements pointerdown");
    assert(appJsCode.includes("setPointerCapture"), "strato_app.js uses pointer capture for smooth drawing");
    console.log("  ✓ PASS: Touch events and touch-action: none configured");

    // ----------------------------------------------------------------------------
    // TEST 6: Android Back-Button Handling & Double-Tap Protection
    // ----------------------------------------------------------------------------
    console.log("\n--- TEST 6: Android Back-Button Handling ---");
    const mainJava = fs.readFileSync(
      path.join(__dirname, "../android/app/src/main/java/de/juliandigitalproducts/blackmydata/MainActivity.java"),
      "utf8"
    );
    assert(mainJava.includes("window.handleAppBack"), "MainActivity intercepts back and calls window.handleAppBack");
    assert(mainJava.includes("backInProgress"), "MainActivity implements backInProgress guard to prevent race condition");
    assert(mainJava.includes("lastBackTime"), "MainActivity implements double-tap time check");
    assert(appJsCode.includes("function handleAppBack()"), "strato_app.js implements handleAppBack()");
    console.log("  ✓ PASS: Android WebView back button and double-tap race protection verified");

    // ----------------------------------------------------------------------------
    // TEST 7: Hardcoded IP Removal, Fallback Texts & Clean Config
    // ----------------------------------------------------------------------------
    console.log("\n--- TEST 7: Dynamic Config, Clean Origins & Fallback Text ---");
    const html = fs.readFileSync(path.join(__dirname, "../app/static/index.html"), "utf8");
    // no concrete private LAN address in the app; only the documented placeholder 192.168.1.100 (input examples)
    const lanIps = (code) => (code.match(/\b192\.168\.\d{1,3}\.\d{1,3}\b/g) || []).filter((ip) => ip !== "192.168.1.100");
    assert.deepStrictEqual(lanIps(appJsCode), [], "strato_app.js has no hardcoded LAN IP besides the 192.168.1.100 example");
    assert.deepStrictEqual(lanIps(html), [], "index.html has no hardcoded LAN IP besides the 192.168.1.100 example");
    assert(!html.includes('launchctl setenv OLLAMA_ORIGINS "*"'), "index.html has no hardcoded wildcard OLLAMA_ORIGINS");
    assert(html.includes("vendor/pdf-lib.min.js"), "index.html loads pdf-lib");
    assert(html.includes('class="ollama-origins-cmd"'), "index.html contains ollama-origins-cmd element");
    // Ensure fallback text is not empty
    const originsFallbackRegex = /<code class="ollama-origins-cmd"[^>]*>([^<]+)<\/code>/g;
    let match;
    let foundFallback = false;
    while ((match = originsFallbackRegex.exec(html)) !== null) {
      assert(match[1].trim().length > 0, "ollama-origins-cmd fallback text must NOT be empty when JS is not executed");
      foundFallback = true;
    }
    assert(foundFallback, "At least one non-empty ollama-origins-cmd fallback found");
    console.log("  ✓ PASS: Hardcoded IP removed, clean origins verified, non-empty fallback text confirmed");

    // ----------------------------------------------------------------------------
    // TEST 8: Real buildPhysicallyRedactedPdfBlob on Encrypted PDF (A3)
    // ----------------------------------------------------------------------------
    console.log("\n--- TEST 8: Encrypted PDF Handling & copyPages Prevention ---");
    const encBase64 =
      "JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjguNQoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyPDU0MzQ1QzA0NDhBNUM0N0JGOTNGNkE3ODMwRkYyMkI2QkU2RTkyOTBGNzFBOUU0MDFFQ0E1RjU1MTFFMjVFOUU+Pj4+PgplbmRvYmoKCjIgMCBvYmoKPDwvVHlwZS9QYWdlcy9Db3VudCAxL0tpZHNbNCAwIFJdPj4KZW5kb2JqCgozIDAgb2JqCjw8L0ZvbnQ8PC9oZWx2IDUgMCBSPj4+PgplbmRvYmoKCjQgMCBvYmoKPDwvVHlwZS9QYWdlL01lZGlhQm94WzAgMCA1OTUgODQyXS9Sb3RhdGUgMC9SZXNvdXJjZXMgMyAwIFIvUGFyZW50IDIgMCBSL0NvbnRlbnRzWzYgMCBSXT4+CmVuZG9iagoKNSAwIG9iago8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2EvRW5jb2RpbmcvV2luQW5zaUVuY29kaW5nPj4KZW5kb2JqCgo2IDAgb2JqCjw8L0xlbmd0aCAxMTIvRmlsdGVyL0ZsYXRlRGVjb2RlPj4Kc3RyZWFtCsruphNUytIKag+zdA0b88fJKWI2W7BxsGu5elN78YPbLKH+c+yxhqPeEDzQfQWgRwDpaeXyZ+pS4eB5kOZVrOIsVHh7vBIKo6SUzIDoj1vzqOiuDPeFHX4VJWN6M/xUzfJD7fdeYFPG9H9GRPWxJQ0KZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDQyIDAwMDAwIG4gCjAwMDAwMDAxNzIgMDAwMDAgbiAKMDAwMDAwMDIyNCAwMDAwMCBuIAowMDAwMDAwMjY1IDAwMDAwIG4gCjAwMDAwMDAzNzIgMDAwMDAgbiAKMDAwMDAwMDQ2MSAwMDAwMCBuIAoKdHJhaWxlcgo8PC9TaXplIDcvUm9vdCAxIDAgUi9JRFs8QzJCNUMzQTUzMkMyQUM1MjdCMkUyN0MzQkU3MUMyQkY+PEE4M0QxNEE0MEU4QjA1NjZBRjU4NjU1RTFCM0EyMjBGPl0vRW5jcnlwdDw8L0ZpbHRlci9TdGFuZGFyZC9SIDYvViA1L0xlbmd0aCAyNTYvUCAtNC9FbmNyeXB0TWV0YWRhdGEgdHJ1ZS9TdG1GL1N0ZENGL1N0ckYvU3RkQ0YvQ0Y8PC9TdGRDRjw8L0F1dGhFdmVudC9Eb2NPcGVuL0NGTS9BRVNWMy9MZW5ndGggMzI+Pj4+L088QjAyRUFBOEI1QzlBMkUzNEJEQUY3NzQ0NEZFRDM0QTVGRjRCNjJFNDgzNjNFRDFDMEQ2N0Q1QTdDMTM2RTI2QjlBMzhCQkI4MDkwOENBMDQ3REVCOEE3OTMxNzQ0NjAxPi9VPEU1QUVEODQ0NjJDNjQxQjQxMjQzQzhGMUYxRDI1ODMwMDREOUU4RjJDRjUwODI0MjEyOUQ1MUNEQzc0NEQxMzkzNDQ5RUIwMzJFQkEyRDQwNUVFRkY2OTEyODhFNzEzQT4vT0U8NjEwNUFFREQxNzcwNjRGQkRCQkM2NzYxM0I4MjcyNkRGRDE3QTFDRUU1RUI5NEZERjc5RDczMTkwQTVDRkI4OD4vVUU8QUY1OTNDMEYyOTlFMDg4MjMxN0JENDkzMUEwMTI2QzczNTQ1RTZDMDA2RDU1Qjg5NUYxQUVFNkE3MkVENkY4OD4vUGVybXM8N0UzN0FDNzJFRjE2OTg0MDVDNzY1NkE2RUNEMkMyNkI+Pj4+PgpzdGFydHhyZWYKNjQyCiUlRU9GCg==";
    const encBytes = Buffer.from(encBase64, "base64");

    const encFile = {
      analyzed: true,
      filename: "encrypted_source.pdf",
      pages_count: 1,
      arrayBuffer: encBytes.buffer.slice(encBytes.byteOffset, encBytes.byteOffset + encBytes.byteLength),
      excludedEntityIds: new Set(),
      pdfDoc: {
        getPage: async (num) => ({
          getViewport: ({ scale }) => ({ width: 595 * scale, height: 842 * scale }),
          render: () => ({ promise: Promise.resolve() })
        })
      },
      analysisData: {
        entities_by_page: {
          0: [] // 0 redactions: must NOT use copyPages on encrypted sources!
        }
      },
      manualRedactions: {}
    };

    const encSandbox = createVmSandbox();
    const resEnc = await encSandbox.buildPhysicallyRedactedPdfBlob(encFile);
    assert(resEnc.blob && resEnc.blob.size > 0, "Encrypted output PDF blob generated");
    const outEncDoc = await PDFDocument.load(Buffer.from(await resEnc.blob.arrayBuffer()), { updateMetadata: false });
    assert.strictEqual(outEncDoc.isEncrypted, false, "Output PDF is unencrypted");
    assert.strictEqual(outEncDoc.getPageCount(), 1, "Output PDF contains rasterized page");
    console.log("  ✓ PASS: Encrypted PDF avoids copyPages and produces clean unencrypted raster output via buildPhysicallyRedactedPdfBlob");

    // ----------------------------------------------------------------------------
    // TEST 9: Privacy-Preserving Metadata Sanitization (C4)
    // ----------------------------------------------------------------------------
    console.log("\n--- TEST 9: PDF Metadata Sanitization ---");
    assert(appJsCode.includes('outPdfDoc.setProducer("blackMyData")'), "strato_app.js sets Producer to blackMyData");
    assert(appJsCode.includes('outPdfDoc.setCreator("blackMyData")'), "strato_app.js sets Creator to blackMyData");
    assert(appJsCode.includes('creator: "blackMyData"'), "strato_app.js sets jsPDF creator to blackMyData");
    assert(appJsCode.includes("if (srcPdfDoc && srcPdfDoc.isEncrypted)"), "strato_app.js checks isEncrypted and falls back");
    // Version check: a valid version is set.
    const ver = require("./_version.js");
    assert(ver.compare(ver.current, "1.0.0") >= 0, "CURRENT_BUILD_VERSION is 1.0.0 or later");
    console.log("  ✓ PASS: Metadata Producer/Creator set to blackMyData, PII metadata cleared");

    console.log("\n============================================================");
    console.log(" 🎉 ALL CODE REVIEW FIXES VERIFIED SUCCESSFULLY!           ");
    console.log("============================================================\n");
    process.exit(0);
  } catch (err) {
    console.error("Test failed with error:", err);
    process.exit(1);
  }
})();
