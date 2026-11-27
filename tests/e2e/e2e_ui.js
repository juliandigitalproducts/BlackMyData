#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Julian Digital Products
// Browser E2E test of the web app, driven through the UI like a user (desktop 1280 px and phone 412 px):
// close the first-start wizard, pick a PDF via the drop zone's file chooser, open "Vorschau & Detailprüfung" (runs the
// analysis), check the hit list (incl. a form field value), switch a hit off and on, change page, then
// "Schwärzen & PDF herunterladen" and check the downloaded PDF (no personal data in text layer, OCR, metadata, raw
// objects; no AcroForm, no attachments). Finally "Sitzungsdaten löschen" and pick the same file again (it loads).
// No request may leave the machine.
//
//   npm run test:e2e        (needs Google Chrome or CHROME_PATH; BASE_URL=<start URL of a running launcher> tests the
//                            Go launcher with its CSP instead of the built-in static server)
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { startServer, launchBrowser, guardNetwork, watchErrors, openApp, findNeedles } = require("../browser/lib");

const OUT = path.join(__dirname, "out");

async function makeInput() {
  // Page 1: letter with name, IBAN, phone; page 2: form with a filled-in name field.
  const { PDFDocument, StandardFonts } = require("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const filler = "Dies ist ein allgemeiner Fliesstext ohne personenbezogene Angaben, der die Seite ausreichend fuellt.";
  const p1 = doc.addPage([595, 842]);
  ["Sehr geehrter Herr Max Mustermann,", "Ihre IBAN: DE89 3704 0044 0532 0130 00", "Telefon: +49 170 1234567",
    ...Array(8).fill(filler)].forEach((t, i) => p1.drawText(t, { x: 50, y: 790 - i * 18, size: 11, font }));
  const p2 = doc.addPage([595, 842]);
  Array(14).fill(filler).forEach((t, i) => p2.drawText(t, { x: 50, y: 790 - i * 18, size: 11, font }));
  const f = doc.getForm().createTextField("kunde");
  f.setText("Erika Musterfrau");
  f.addToPage(p2, { x: 50, y: 400, width: 220, height: 20, font });
  doc.setAuthor("Max Mustermann");
  const file = path.join(OUT, "Antrag Müller-Lüdenscheidt.pdf");
  fs.writeFileSync(file, await doc.save());
  return { file, needles: ["Max Mustermann", "DE89 3704 0044 0532 0130 00", "+49 170 1234567", "Erika Musterfrau"] };
}

async function pickViaDropzone(page, file) {
  const chooser = page.waitForEvent("filechooser");
  await page.click("#dropzone");
  await (await chooser).setFiles(file);
}

async function run(browser, url, input, label, contextOptions) {
  const context = await browser.newContext({ acceptDownloads: true, ...contextOptions });
  const net = await guardNetwork(context, url);
  // B-E1: stand-in for the Android app's bridge, records the bar colour messages (only the theme code uses it here).
  await context.addInitScript(() => {
    window.__bridgeMsgs = [];
    window.BlackMyDataAndroid = { postMessage: (m) => window.__bridgeMsgs.push(JSON.parse(m)), addEventListener: () => {} };
  });
  const page = await context.newPage();
  const errors = watchErrors(page);
  page.on("dialog", (d) => { errors.push("unexpected dialog: " + d.message()); d.dismiss(); });
  const step = (s) => console.log(`  [${label}] ${s}`);

  await openApp(page, url);
  await assert.doesNotReject(page.locator("#setupWizardModal").waitFor({ state: "hidden", timeout: 5000 }), "wizard closes");
  step("Assistent geschlossen");

  const lastBar = () => page.evaluate(() => window.__bridgeMsgs.filter((m) => m.op === "theme").pop());
  assert.deepStrictEqual(await lastBar(), { op: "theme", theme: "dark", top: "#1e293b", bottom: "#0f172a" }, "start: dark bars");
  await page.click("#themeToggleBtn");
  assert.deepStrictEqual(await lastBar(), { op: "theme", theme: "light", top: "#ffffff", bottom: "#f8fafc" }, "light theme: light bars");
  await page.click("#themeToggleBtn");
  assert.strictEqual((await lastBar()).theme, "dark");
  step("Theme-Wechsel meldet der App die Farben für Status- und Navigationsleiste");

  await pickViaDropzone(page, input.file);
  const row = page.locator("#queueCard tr", { hasText: path.basename(input.file) });
  await row.waitFor({ timeout: 30000 });
  step("PDF über Dateiauswahl geladen, steht in der Liste");

  await row.getByRole("button", { name: /Vorschau/ }).click();
  await page.waitForFunction(() => state.files[0] && state.files[0].analyzed, null, { timeout: 120000 });
  const items = page.locator("#entityListContainer .entity-item");
  await items.first().waitFor({ timeout: 30000 });
  const listText = await page.locator("#entityListContainer").innerText();
  for (const n of ["Max Mustermann", "DE89 3704 0044 0532 0130 00"]) assert(listText.includes(n), `${n} in hit list: ${listText}`);
  step(`Analyse: ${await items.count()} Treffer auf Seite 1`);

  const first = items.first();
  await first.locator("input[type=checkbox]").click();
  assert(await first.evaluate((el) => el.classList.contains("deselected")), "hit can be switched off");
  await first.locator("input[type=checkbox]").click();
  assert(!(await first.evaluate((el) => el.classList.contains("deselected"))), "and on again");
  step("Treffer aus- und wieder eingeschaltet");

  await page.click("#btnNextPage");
  await page.waitForFunction(() => state.currentPage === 1);
  await page.waitForFunction(() => document.getElementById("entityListContainer").innerText.includes("Erika Musterfrau"), null, { timeout: 10000 });
  step("Seite 2: Formularfeldwert „Erika Musterfrau“ als Treffer");

  const download = page.waitForEvent("download", { timeout: 180000 });
  await page.getByRole("button", { name: /Schwärzen & PDF herunterladen/ }).click();
  const dl = await download;
  const outFile = path.join(OUT, `${label}_${dl.suggestedFilename()}`);
  await dl.saveAs(outFile);
  assert(dl.suggestedFilename().startsWith("Antrag Müller-Lüdenscheidt"), "output name keeps the Unicode name: " + dl.suggestedFilename());
  const check = await findNeedles(page, fs.readFileSync(outFile), input.needles, { ocr: true, file: outFile });
  assert.deepStrictEqual(check.hits, {}, "personal data in export: " + JSON.stringify(check.hits));
  assert(!check.hasAcroForm && check.attachmentCount === 0 && check.pages === 2, JSON.stringify(check));
  step(`Export ${dl.suggestedFilename()}: keine PII (Textlayer, OCR, Metadaten, Rohobjekte), kein Formular`);

  // B-E3: Back (Android back key → handleAppBack) from the editor shows the document list, not an empty page.
  assert.strictEqual(await page.evaluate(() => state.currentTab), "editor");
  assert.strictEqual(await page.evaluate(() => window.handleAppBack()), true, "Back handled by the page");
  await page.locator("#tab-batch").waitFor({ state: "visible", timeout: 5000 });
  await row.waitFor({ state: "visible", timeout: 5000 });
  assert.strictEqual(await page.evaluate(() => window.handleAppBack()), false, "on the list Back goes to the system");
  step("Zurück aus dem Editor → Dokumentliste sichtbar");

  await page.click('.tab-btn[data-tab="about"]');
  await page.getByRole("button", { name: /Sitzungsdaten jetzt aus Browser löschen/ }).click();
  await page.waitForFunction(() => state.files.length === 0);
  await page.click('.tab-btn[data-tab="batch"]');
  await pickViaDropzone(page, input.file);
  await page.waitForFunction(() => state.files.length === 1, null, { timeout: 30000 });
  step("Sitzungsdaten gelöscht, dieselbe Datei erneut gewählt → geladen");

  assert.deepStrictEqual([...new Set(net.external)], [], "no request leaves the machine");
  assert.deepStrictEqual([...new Set(errors)], [], "no page errors");
  step(`Netzwerk: 0 externe Requests (${net.loopback.length} lokale KI-Autoerkennung abgebrochen), keine Seitenfehler`);
  await context.close();
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const input = await makeInput();
  const local = process.env.BASE_URL ? null : await startServer();
  const url = process.env.BASE_URL || local.url;
  const browser = await launchBrowser();
  let failed = 0;
  const variants = [
    ["desktop", { viewport: { width: 1280, height: 900 } }],
    ["mobile", { viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true,
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36" }]
  ];
  for (const [label, opts] of variants) {
    try {
      await run(browser, url, input, label, opts);
      console.log(`✓ ${label}`);
    } catch (e) {
      failed++;
      console.log(`✗ ${label}: ${String(e.message).split("\n")[0]}`);
    }
  }
  await browser.close();
  if (local) local.server.close();
  console.log(failed ? `\n${failed} E2E-Durchlauf/-läufe FEHLGESCHLAGEN` : "\nE2E grün");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
