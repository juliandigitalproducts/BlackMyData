/**
 * BlackMyData – PII rules and OCR layout helpers of the web engine (app/static), version independent.
 * Same cases as AIOMM (AllInOneMediaManager/codebase/src/lib/services/ocrPii.test.ts) plus the false positives of the
 * code review 2026-11-03 (B5 addresses, B27 BIC). Run: node tests/test_ocr_pii.js (or npm test).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/static/pii_engine.js"), "utf8"), ctx);
const { detectPiiRulesJS } = ctx.window.BlackMyDataPII;
const ocrUtils = require("../app/static/ocr_utils.js");

const CATS = { names: true, emails: true, phones: true, ibans: true, addresses: true, social_security_ids: true, tax_ids: true, dates: true };
const found = (text, sens = "high") => detectPiiRulesJS(text, CATS, {}, null, sens).map((m) => `${m.category}:${m.text}`);

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// Standard-quality OCR of a scanned patient form: values are garbled, labels are legible.
const PATIENT_OCR = [
  "ARZTPRAXISDR MED STEFAN KAHLER",
  "Hauptstrans 88. 80331 Mänchen- Tol 069 12345678",
  "Patientin: Erika Mustermann",
  "Geburtsdatum 12051669",
  '"Wohnort Leopoldstrans 14 80802 Manche',
  "(EMail erkamusiermann@webde",
].join("\n");

// OCR of a photographed invoice (two columns on one line, folds, misread letters).
// All values are invented (fictitious person, street, town and number); they only reproduce typical OCR errors.
const INVOICE_OCR = [
  "Bill To   Lukas Schäfer     Ship To  Lukas Scnafer",
  "  Musterfeldbtick 10      Musterfeldbiick 10   os",
  " Musterstadt, 12345    Musterstadt, 12345",
  " Germany Germany",
  "   Tel: +4917012P345     pr",
  " “haa: BRUXTLTS AE",
  "Beispielmarke ALPHA Monitor Arm x2",
].join("\n");
const invoice = found(INVOICE_OCR);

test("labelled phone number with misread digits", () => {
  assert(invoice.some((r) => r.startsWith("phone:") && r.includes("4917012")), invoice.join(" | "));
});

test("misspelled streets above a PLZ line, per column", () => {
  assert(invoice.includes("address:Musterfeldbtick 10"), invoice.join(" | "));
  assert(invoice.includes("address:Musterfeldbiick 10"), invoice.join(" | "));
  assert(invoice.some((r) => r.startsWith("address:") && r.includes("12345")), invoice.join(" | "));
});

test("name of the invoice recipient", () => {
  assert(invoice.some((r) => r.startsWith("name:") && r.includes("Lukas")), invoice.join(" | "));
});

test("product words and unlabelled capital words are no PII", () => {
  assert(!invoice.some((r) => r.includes("Monitor")), invoice.join(" | "));
  assert(!invoice.some((r) => r.includes("BRUXTLTS")), invoice.join(" | "));
});

test("real streets with house numbers", () => {
  const r = found("Bitte an Hauptstraße 10a schicken, Lindenweg 4 b ist falsch.", "balanced");
  assert(r.some((x) => x.startsWith("address:Hauptstraße 10")), r.join(" | "));
  assert(r.some((x) => x.startsWith("address:Lindenweg 4")), r.join(" | "));
});

// B5: belegte Fehltreffer
test("no addresses from business words and numbers (B5)", () => {
  const texts = [
    "Der Faktor 2 ist entscheidend.",
    "Das Gremium sowie Direktor 4 stimmten zu.",
    "Auftrag 4711\n12345 Berlin",
    "Kundengruppe 12\n80331 München",
    "Kapitel 3\n10115 Berlin",
    "Stand 2024\n20095 Hamburg",
  ];
  for (const t of texts) {
    const r = found(t, "balanced").filter((x) => x.startsWith("address:") && !/\d{5}/.test(x));
    assert.strictEqual(r.length, 0, `${JSON.stringify(t)} -> ${r.join(" | ")}`);
  }
});

test("form labels are not part of the street", () => {
  const r = found("Wohnort Leopoldstraße 14, 80802 München", "balanced");
  // the labelled value is one finding for the whole address; the label itself stays visible
  assert(r.includes("address:Leopoldstraße 14, 80802 München"), r.join(" | "));
  assert(!r.some((x) => x.includes("Wohnort")), r.join(" | "));
});

test("street block above the PLZ line is still found", () => {
  const r = found("Max Mustermann\nAm Kirchberg 7\n89073 Ulm", "balanced");
  assert(r.includes("address:Am Kirchberg 7") || r.includes("address:Kirchberg 7"), r.join(" | "));
});

// B27: BIC
test("labelled BIC is found, also German banks (B27)", () => {
  assert(found("BIC: COBADEFFXXX").some((x) => x.includes("COBADEFFXXX")));
  assert(found("BIC: DEUTDEFF").some((x) => x.includes("DEUTDEFF")), "German BIC DEUTDEFF");
});

test("unlabelled capital words next to an IBAN are no BIC (B27)", () => {
  const r = found("IBAN DE89 3704 0044 0532 0130 00 für PRODUCTX bezahlt");
  assert(!r.some((x) => x.includes("PRODUCTX")), r.join(" | "));
  const ok = found("DE89 3704 0044 0532 0130 00 COBADEFFXXX");
  assert(ok.some((x) => x.includes("COBADEFFXXX")), ok.join(" | "));
});

test("OCR stripes are cut in the gap between text lines", () => {
  const dark = Array.from({ length: 100 }, (_, y) => (y >= 40 && y < 60 ? 0 : 50));
  const fn = ocrUtils.findTextGapRows;
  assert(typeof fn === "function", "ocr_utils exports findTextGapRows");
  const [cut] = fn(dark, [45], 20, 3);
  assert(cut >= 43 && cut <= 56, `cut ${cut}`);
});

test("document crop finds a bright sheet, nothing on a plain page", () => {
  const w = 400, h = 600, rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = x >= 80 && x < 320 && y >= 100 && y < 500 ? 245 : 150;
    rgba.set([v, v, v, 255], (y * w + x) * 4);
  }
  const b = ocrUtils.findDocumentBounds(rgba, w, h);
  assert(b && b.x0 <= 80 && b.x1 >= 320 && b.x1 - b.x0 < w * 0.8, JSON.stringify(b));
  assert.strictEqual(ocrUtils.findDocumentBounds(new Uint8ClampedArray(w * h * 4).fill(250), w, h), null);
});

test("values after field labels on a garbled scan (birth date, e-mail, address)", () => {
  const r = found(PATIENT_OCR, "balanced");
  assert(r.includes("date:12051669"), r.join(" | "));
  assert(r.includes("email:erkamusiermann@webde"), r.join(" | "));
  assert(r.includes("address:Leopoldstrans 14 80802 Manche"), r.join(" | "));
  // the postcode found on its own is merged into the labelled address
  assert(!r.includes("address:80802 Manche"), r.join(" | "));
});

test("a labelled birth date in running text is found once, without the next word", () => {
  const r = found("Herr Max Muster, geboren am 24.08.1981 in Hamburg, ist Mandant.", "balanced");
  assert.deepStrictEqual(r.filter((x) => x.startsWith("date:")).length, 1, r.join(" | "));
  assert(!r.some((x) => /1981 i/.test(x)), r.join(" | "));
});

test("a labelled e-mail split by OCR is taken whole, but stops at the next label", () => {
  const r = found("E-Mail: erika mustermann@web de", "balanced");
  assert(r.includes("email:erika mustermann@web de"), r.join(" | "));
  const r2 = found("E-Mail: info@firma.de Telefon: 0171 4567890", "balanced");
  assert(r2.includes("email:info@firma.de"), r2.join(" | "));
  assert(!r2.some((x) => x.startsWith("email:") && x.includes("Telefon")), r2.join(" | "));
});

test("field labels without a value are not redacted", () => {
  const r = found("Bitte E-Mail senden.\nAdresse unbekannt\nGeburtsdatum: siehe Akte", "balanced");
  assert(!r.some((x) => /^(email|address|date):/.test(x)), r.join(" | "));
});

test("a letterhead with OCR errors: street, place and doctor's name are found from the standard level on", () => {
  const head = "ARZTPRAXISDR MED STEFAN KAHLER\nHauptstrans 88. 80331 Mänchen- Tol 069 12345678";
  const r = found(head, "balanced");
  assert(r.includes("address:Hauptstrans 88"), r.join(" | "));
  assert(r.includes("address:80331 Mänchen"), r.join(" | "));
  assert(r.includes("name:STEFAN KAHLER"), r.join(" | "));
  assert(!found(head, "low").includes("address:Hauptstrans 88"), "low level stays strict");
  assert(!found("Die Geldstrafe 500 Euro und eine Strafe 20 folgen.", "high").some((x) => x.startsWith("address:")));
});

test("'Person' is not a name, family roles introduce full names", () => {
  const r = found("Ihre Ehefrau Erika Mustermann\nist als zweite versicherte Person eingetragen.", "balanced");
  assert(!r.some((x) => /Person/.test(x)), r.join(" | "));
  assert(r.includes("name:Erika Mustermann"), r.join(" | "));
});

test("PII whitelist uses exact word/token boundaries (no substring bug)", () => {
  const { isWhitelistedText } = ctx.window.BlackMyDataPII;
  // Whitelist has "Frank": should NOT whitelist "Frankfurt" or "Frankfurter"
  assert.strictEqual(isWhitelistedText("Frankfurt", { whitelist: ["Frank"] }), false);
  assert.strictEqual(isWhitelistedText("Frankfurter Allee", { whitelist: ["Frank"] }), false);
  // Whitelist has "Frank": should whitelist exact "Frank" and "Herr Frank"
  assert.strictEqual(isWhitelistedText("Frank", { whitelist: ["Frank"] }), true);
  assert.strictEqual(isWhitelistedText("Herr Frank", { whitelist: ["Frank"] }), true);
  // Whitelist has "Frankfurt": should NOT whitelist "Frank"
  assert.strictEqual(isWhitelistedText("Frank", { whitelist: ["Frankfurt"] }), false);
  // Whitelist with multi-word entry: "Frank Müller GmbH" must NOT whitelist single words like "Frank" or "Müller" (no reverse-match leak)
  assert.strictEqual(isWhitelistedText("Frank", { whitelist: ["Frank Müller GmbH"] }), false);
  assert.strictEqual(isWhitelistedText("Müller", { whitelist: ["Frank Müller GmbH"] }), false);
  assert.strictEqual(isWhitelistedText("Frank Müller GmbH", { whitelist: ["Frank Müller GmbH"] }), true);
  assert.strictEqual(isWhitelistedText("Die Frank Müller GmbH haftet", { whitelist: ["Frank Müller GmbH"] }), true);
  // Whitelist with umlauts: "München" does not match "Münchener"
  assert.strictEqual(isWhitelistedText("Münchener Straße", { whitelist: ["München"] }), false);
  assert.strictEqual(isWhitelistedText("München", { whitelist: ["München"] }), true);
});

test("groupRectsByLine groups multi-line entity tokens into line-specific boxes", () => {
  assert(typeof ocrUtils.groupRectsByLine === "function", "groupRectsByLine is exposed");
  // Two words on the same line (y: 100..115)
  const line1Words = [
    [50, 100, 120, 115],
    [130, 100, 200, 115]
  ];
  const g1 = ocrUtils.groupRectsByLine(line1Words);
  assert.strictEqual(g1.length, 1);
  assert.deepStrictEqual(g1[0], [50, 100, 200, 115]);

  // Two words across two different lines (line 1: 100..115, line 2: 130..145)
  const multiLineWords = [
    [400, 100, 500, 115], // word at end of line 1
    [50, 130, 150, 145]   // word at start of line 2
  ];
  const g2 = ocrUtils.groupRectsByLine(multiLineWords);
  assert.strictEqual(g2.length, 2, "must be split into 2 separate line boxes instead of 1 giant box");
  assert.deepStrictEqual(g2[0], [400, 100, 500, 115]);
  assert.deepStrictEqual(g2[1], [50, 130, 150, 145]);
});

console.log(`\n${passed} tests passed`);
