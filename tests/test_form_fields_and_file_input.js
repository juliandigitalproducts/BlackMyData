// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Julian Digital Products

// Fixes of the 20 Nov 2026 review, tested against the real functions of strato_app.js (in a VM):
// - form field values and FreeText comments are checked for personal data (they are drawn into the export image)
// - picking the same file again after removing it loads it again (the file input is emptied after each pick)
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");

const read = (f) => fs.readFileSync(path.join(__dirname, "../app/static", f), "utf8");

function createSandbox(elements = {}) {
  const doc = {
    createElement: () => ({ getContext: () => ({}) }),
    getElementById: (id) => elements[id] || null,
    getElementsByTagName: () => [],
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  const win = {
    addEventListener: () => {},
    location: { origin: "https://example.com", protocol: "https:" },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  };
  const sandbox = { window: win, document: doc, navigator: { userAgent: "Node" }, console, setTimeout, clearTimeout };
  win.window = win;
  win.document = doc;
  vm.createContext(sandbox);
  vm.runInContext(read("pii_engine.js"), sandbox);
  vm.runInContext(read("strato_app.js"), sandbox);
  return sandbox;
}

// pdf.js viewport at scale 1 for an A4 page; rotation 90 swaps width/height like PageViewport does.
function viewport(rotation = 0) {
  const W = 595, H = 842;
  if (rotation === 90) {
    return { width: H, height: W, convertToViewportRectangle: ([x0, y0, x1, y1]) => [y0, x0, y1, x1] };
  }
  return { width: W, height: H, convertToViewportRectangle: ([x0, y0, x1, y1]) => [x0, H - y0, x1, H - y1] };
}

let n = 0;
const failed = [];
const t = (name, fn) => {
  try {
    fn();
    n++;
    console.log("  ✓ " + name);
  } catch (e) {
    failed.push(name);
    console.log("  ✗ " + name + "\n      " + String(e.message).split("\n")[0]);
  }
};
const s = createSandbox();
const words = (annots, vp = viewport()) => JSON.parse(JSON.stringify(s.annotationTextWords(annots, vp)));

console.log("--- form fields and FreeText comments ---");

t("text field value becomes words with the field rectangle (viewport coordinates)", () => {
  const r = words([{ subtype: "Widget", fieldType: "Tx", fieldValue: "Erika Musterfrau", rect: [50, 400, 250, 420] }]);
  assert.deepStrictEqual(r.lines, ["Erika Musterfrau"]);
  assert.deepStrictEqual(r.words.map((w) => w.text), ["Erika", "Musterfrau"]);
  for (const w of r.words) {
    assert.deepStrictEqual(w.rect, [50, 422, 250, 442]);
    assert.strictEqual(w.source, "form");
  }
});

t("multi-line text field: one line per row, punctuation cleaned", () => {
  const r = words([{ subtype: "Widget", fieldType: "Tx", fieldValue: "Herr Max Mustermann,\r\nMusterstraße 12", rect: [0, 0, 100, 40] }]);
  assert.deepStrictEqual(r.lines, ["Herr Max Mustermann,", "Musterstraße 12"]);
  assert.strictEqual(r.words[2].clean, "Mustermann");
});

t("combo box: display text of the chosen value is checked (and the export value)", () => {
  const r = words([{
    subtype: "Widget", fieldType: "Ch", combo: true, fieldValue: ["k1"],
    options: [{ exportValue: "k1", displayValue: "Jürgen Weiß" }, { exportValue: "k2", displayValue: "Anna Schmidt" }],
    rect: [0, 0, 100, 20]
  }]);
  assert.deepStrictEqual(r.lines, ["Jürgen Weiß", "k1"]);
});

t("list box: every entry is visible in the export, so every entry is checked", () => {
  const r = words([{
    subtype: "Widget", fieldType: "Ch", combo: false, fieldValue: [],
    options: [{ exportValue: "a", displayValue: "Anna Schmidt" }, { exportValue: "b", displayValue: "Bernd Meier" }],
    rect: [0, 0, 100, 40]
  }]);
  assert.deepStrictEqual(r.lines, ["Anna Schmidt", "Bernd Meier"]);
});

t("FreeText comment is checked; links, check boxes, empty and broken annotations are ignored", () => {
  const r = words([
    { subtype: "FreeText", contentsObj: { str: "Rückruf an max@example.com" }, rect: [10, 10, 200, 30] },
    { subtype: "Link", url: "https://example.com", rect: [0, 0, 10, 10] },
    { subtype: "Widget", fieldType: "Btn", fieldValue: "Yes", rect: [0, 0, 10, 10] },
    { subtype: "Widget", fieldType: "Tx", fieldValue: "   ", rect: [0, 0, 10, 10] },
    { subtype: "Widget", fieldType: "Tx", fieldValue: null, rect: [0, 0, 10, 10] },
    { subtype: "Widget", fieldType: "Tx", fieldValue: "Max", rect: null },
    null
  ]);
  assert.deepStrictEqual(r.lines, ["Rückruf an max@example.com"]);
});

t("rotated page (90°): rectangle follows the rotation and stays inside the page", () => {
  const r = words([{ subtype: "Widget", fieldType: "Tx", fieldValue: "Erika", rect: [100, 500, 120, 700] }], viewport(90));
  assert.deepStrictEqual(r.words[0].rect, [500, 100, 700, 120]);
  const out = words([{ subtype: "Widget", fieldType: "Tx", fieldValue: "Erika", rect: [-50, -10, 900, 30] }]);
  const [x0, y0, x1, y1] = out.words[0].rect;
  assert(x0 >= 0 && y0 >= 0 && x1 <= 595 && y1 <= 842, "clamped: " + out.words[0].rect);
});

t("a name in a form field is detected and mapped onto the field (rules + word mapping)", () => {
  const page = { text: "Antrag auf Erstattung", words: [] };
  const form = s.annotationTextWords([{ subtype: "Widget", fieldType: "Tx", fieldValue: "Herr Max Mustermann", rect: [50, 400, 250, 420] }], viewport());
  page.text += "\n" + form.lines.join("\n");
  page.words.push(...form.words);
  const hits = s.window.BlackMyDataPII.detectPiiRulesJS(page.text, { names: true }, {}, null, "balanced");
  const mapped = s.mapAndStabilize(hits, page, 0);
  const name = mapped.find((e) => /Mustermann/.test(e.text));
  assert(name, "name found: " + JSON.stringify(hits));
  assert(name.rects.length > 0 && name.rects.every((r) => r[1] >= 421 && r[3] <= 443), JSON.stringify(name.rects));
});

console.log("--- file input ---");

t("same file twice: input is emptied after each pick, the copied list is uploaded", () => {
  const listeners = {};
  const fileInput = { value: "C:\\fakepath\\a.pdf", addEventListener: (ev, fn) => { listeners[ev] = fn; }, click: () => {} };
  const dropzone = { addEventListener: () => {}, classList: { add() {}, remove() {} } };
  const sb = createSandbox({ fileInput, dropzone });
  const uploads = [];
  sb.handleFilesUpload = (list) => uploads.push(list);
  sb.initDropzone();
  const file = { name: "a.pdf" };
  for (let i = 0; i < 2; i++) {
    fileInput.value = "C:\\fakepath\\a.pdf";
    fileInput.files = [file];
    listeners.change({ target: fileInput });
    assert.strictEqual(fileInput.value, "", "input emptied, so the next pick of the same file fires change again");
  }
  assert.strictEqual(uploads.length, 2);
  assert(Array.isArray(uploads[0]) && uploads[0][0] === file, "a copy of the list (the FileList is emptied with the input)");
  fileInput.files = [];
  listeners.change({ target: fileInput });
  assert.strictEqual(uploads.length, 2, "an empty pick uploads nothing");
});

console.log(`\n${n} checks passed` + (failed.length ? `, ${failed.length} FAILED` : ""));
if (failed.length) process.exit(1);
