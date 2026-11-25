#!/usr/bin/env node
// Redaction harness: generates a corpus of test PDFs (tests/harness/corpus.js), runs each one through the real
// pipeline of the web app (upload → analysis → physical redaction → export) in headless Chrome, and checks the export:
// no personal data in the text layer, OCR of the rendered pages, annotations, metadata/XMP, attachments, raw PDF
// objects (and pdftotext if installed); no AcroForm, no attachments; no network request leaves the machine.
//
//   npm run test:harness            (needs Google Chrome or CHROME_PATH; see tests/README.md)
//   BMD_HARNESS_NO_OCR=1 npm run test:harness   skips the OCR check of the exports (faster, but then a name drawn
//                                               into a flattened page image is NOT checked)
//   BMD_APP_DIR=/path/to/app/static            runs the harness against another build (e.g. an old commit)
//   BMD_HARNESS_CASES=01,04                    runs only these cases
"use strict";
const fs = require("fs");
const path = require("path");
const { startServer, launchBrowser, guardNetwork, watchErrors, openApp, findNeedles } = require("../browser/lib");
const corpus = require("./corpus");

// BMD_HARNESS_CASES=01,04 runs only the cases whose file name starts with one of these prefixes.
const only = (process.env.BMD_HARNESS_CASES || "").split(",").map((x) => x.trim()).filter(Boolean);
const cases = only.length ? corpus.cases.filter((c) => only.some((o) => c.file.startsWith(o))) : corpus.cases;

const OUT = path.join(__dirname, "out");
const OCR = !process.env.BMD_HARNESS_NO_OCR;

async function scanPng(page) {
  // A "scanned" letter: text drawn into a bitmap (no text layer).
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1240; c.height = 1754;
    const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#000"; x.font = "36px serif";
    ["Sehr geehrter Herr Max Mustermann,", "Ihre IBAN lautet DE89 3704 0044 0532 0130 00.",
      "E-Mail: max.mustermann@example.com", "Wohnhaft in der Musterstrasse 12, 10115 Berlin."]
      .forEach((t, i) => x.fillText(t, 100, 200 + i * 70));
    return c.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(b64, "base64");
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "input"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "output"), { recursive: true });

  const { server, url } = await startServer();
  const browser = await launchBrowser();
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const net = await guardNetwork(context, url);
  const page = await context.newPage();
  const errors = watchErrors(page);
  page.on("dialog", (d) => d.dismiss());
  await openApp(page, url);

  const scan = await scanPng(page);
  const results = [];
  let failed = 0;

  for (const c of cases) {
    const started = Date.now();
    const r = { file: c.file, title: c.title, problems: [], knownGapsFound: [] };
    try {
      const inFile = path.join(OUT, "input", c.file);
      const bytes = await c.build({ scanPng: scan });
      fs.writeFileSync(inFile, bytes);

      // Positive control: the checker must find every needle in the input, otherwise the case proves nothing.
      const all = [...c.needles, ...(c.knownGaps || [])];
      const inHits = await findNeedles(page, bytes, all, { ocr: Boolean(c.ocrControl), file: inFile });
      const seen = new Set(Object.values(inHits.hits).flat());
      const missing = all.filter((n) => !seen.has(n));
      if (missing.length) r.problems.push(`Kontrolle: im Eingang nicht gefunden: ${missing.join(", ")}`);
      const ocrMissing = (c.ocrControl || []).filter((n) => !(inHits.hits.ocr || []).includes(n));
      if (ocrMissing.length) r.problems.push(`Kontrolle: OCR liest im Eingang nicht: ${ocrMissing.join(", ")}`);

      await page.evaluate(() => cleanupTemporaryData());
      await page.setInputFiles("#fileInput", inFile);
      await page.waitForFunction(() => state.files.length === 1 && state.files[0].pdfDoc, null, { timeout: 60000 });
      const download = page.waitForEvent("download", { timeout: 300000 });
      await page.evaluate(() => batchRedactAll());
      const dl = await download;
      r.outputName = dl.suggestedFilename();
      const outFile = path.join(OUT, "output", r.outputName);
      await dl.saveAs(outFile);
      const outBytes = fs.readFileSync(outFile);
      r.hits = await page.evaluate(() => Object.values(state.files[0].entities_by_page || {}).flat().map((e) => `${e.category}:${e.text}`));

      const out = await findNeedles(page, outBytes, all, { ocr: OCR, file: outFile });
      r.pages = out.pages;
      for (const [ch, found] of Object.entries(out.hits)) {
        const real = found.filter((n) => c.needles.includes(n));
        const gaps = found.filter((n) => !c.needles.includes(n));
        if (real.length) r.problems.push(`PII im Export (${ch}): ${real.join(", ")}`);
        r.knownGapsFound.push(...gaps.map((g) => `${g} (${ch})`));
      }
      if (out.hasAcroForm) r.problems.push("AcroForm im Export");
      if (out.attachmentCount) r.problems.push(`${out.attachmentCount} Anhang/Anhänge im Export`);
      const base = c.file.replace(/\.pdf$/i, "").normalize("NFC");
      if (!r.outputName.normalize("NFC").startsWith(base)) r.problems.push(`Dateiname des Exports: ${r.outputName}`);
    } catch (e) {
      r.problems.push("Abbruch: " + String(e.message).split("\n")[0]);
    }
    r.seconds = Math.round((Date.now() - started) / 100) / 10;
    if (r.problems.length) failed++;
    results.push(r);
    console.log(`${r.problems.length ? "✗" : "✓"} ${c.file} (${r.seconds}s) – ${c.title}`);
    for (const p of r.problems) console.log("    " + p);
    if (r.knownGapsFound.length) console.log("    bekannte Lücke (kein Fehler): " + r.knownGapsFound.join(", "));
  }

  const netProblems = net.external.length ? [`Externe Requests: ${[...new Set(net.external)].join(", ")}`] : [];
  if (netProblems.length) failed++;
  if (errors.length) failed++;
  console.log(`\nNetzwerk: ${net.external.length} externe Requests` +
    (net.loopback.length ? `; ${net.loopback.length} lokale KI-Autoerkennung (127.0.0.1, abgebrochen)` : ""));
  if (errors.length) console.log("Seitenfehler:\n  " + [...new Set(errors)].join("\n  "));
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ ocr: OCR, results, network: net, errors }, null, 2));

  await browser.close();
  server.close();
  console.log(`\n${cases.length - results.filter((r) => r.problems.length).length}/${cases.length} Fälle sauber` +
    (failed ? " – FEHLER" : "") + ` (Bericht: tests/harness/out/report.json, OCR-Prüfung ${OCR ? "an" : "aus"})`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
