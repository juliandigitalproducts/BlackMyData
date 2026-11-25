// Shared helpers of the redaction harness (tests/harness) and the browser E2E test (tests/e2e):
// a local static server for app/static, a headless Chrome with a network guard, and the output check.
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");
const { PDFDocument, PDFName, PDFRawStream, PDFString, PDFHexString, PDFDict, PDFArray, decodePDFRawStream } = require("pdf-lib");

const ROOT = path.join(__dirname, "../..");
const APP_DIR = path.resolve(process.env.BMD_APP_DIR || path.join(ROOT, "app/static"));

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".wasm": "application/wasm", ".json": "application/json", ".gz": "application/octet-stream"
};

/** Serves APP_DIR on 127.0.0.1 (random port). Files only, no directory listing, no path escape. */
function startServer(dir = APP_DIR) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(dir, rel);
    if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
  }));
}

/** Chrome: CHROME_PATH, else the installed Google Chrome (channel "chrome", Mac and Linux). */
async function launchBrowser() {
  const { chromium } = require("playwright-core");
  const opts = { headless: process.env.HEADED ? false : true, args: ["--disable-gpu", "--no-sandbox"] };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  else opts.channel = "chrome";
  return chromium.launch(opts);
}

const isLoopback = (host) => host === "127.0.0.1" || host === "localhost" || host === "[::1]";

/**
 * Network guard for a browser context: requests to the app's own origin, data: and blob: pass; everything else is
 * recorded and aborted. `external` = other hosts (must stay empty), `loopback` = other local ports (AI autodetection).
 */
async function guardNetwork(context, appUrl) {
  const origin = new URL(appUrl).origin;
  const log = { external: [], loopback: [] };
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.origin === origin || u.protocol === "data:" || u.protocol === "blob:") return route.continue();
    (isLoopback(u.hostname) ? log.loopback : log.external).push(`${route.request().method()} ${u.origin}${u.pathname}`);
    return route.abort();
  });
  context.on("request", (req) => {
    const u = new URL(req.url());
    if (u.protocol.startsWith("http") && u.origin !== origin && !isLoopback(u.hostname)) log.external.push(`(seen) ${u.href}`);
  });
  return log;
}

/** Collects console errors and page errors (loopback connection refusals of the AI autodetection are expected). */
function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/ERR_FAILED|ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300));
  });
  return errors;
}

/** Opens the app and closes the first-start wizard like a user (✕ button). */
async function openApp(page, url) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.pdfjsLib && window.BlackMyDataPII && typeof state === "object", null, { timeout: 30000 });
  const close = page.locator('#setupWizardModal button[onclick="closeSetupWizard()"]');
  try {
    await close.waitFor({ state: "visible", timeout: 5000 });
    await close.click();
  } catch (e) {
    // wizard already seen in this profile
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Output check

// Case, white space and accents are ignored (OCR often reads "José" as "Jose", "ß" as "ss").
const compact = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/ß/g, "ss").replace(/\s+/g, "");

/** All text that pdf-lib can see in the file: strings, names, decoded non-image streams, attachments' names. */
async function rawPdfText(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  const parts = [];
  const visit = (obj) => {
    if (!obj) return;
    if (obj instanceof PDFString || obj instanceof PDFHexString) parts.push(obj.decodeText());
    else if (obj instanceof PDFName) parts.push(obj.decodeText());
    else if (obj instanceof PDFArray) obj.asArray().forEach(visit);
    else if (obj instanceof PDFDict) for (const [k, v] of obj.entries()) { visit(k); visit(v); }
  };
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      visit(obj.dict);
      const filter = String(obj.dict.get(PDFName.of("Filter")) || "");
      if (/DCTDecode|JPXDecode|CCITTFax|JBIG2/.test(filter)) continue; // image data: checked by OCR
      try {
        const data = Buffer.from(decodePDFRawStream(obj).decode());
        parts.push(data.toString("latin1"));
        if (data.length % 2 === 0) parts.push(Buffer.from(data).swap16().toString("utf16le")); // UTF-16BE text
      } catch (e) {
        parts.push(Buffer.from(obj.contents).toString("latin1"));
      }
    } else visit(obj);
  }
  return { text: parts.join("\n"), hasAcroForm: doc.catalog.has(PDFName.of("AcroForm")), pages: doc.getPageCount() };
}

/** pdftotext (poppler) if installed; null otherwise. */
function popplerText(file) {
  try {
    return execFileSync("pdftotext", ["-q", file, "-"], { encoding: "utf8" });
  } catch (e) {
    return e.code === "ENOENT" ? null : "";
  }
}

/**
 * Reads a PDF in the page with the app's own pdf.js: text layer, annotations, metadata (Info + XMP), attachments,
 * and (ocr: true) the text that the app's Tesseract reads from each page in all four orientations.
 */
async function readPdfInBrowser(page, bytes, { ocr }) {
  return page.evaluate(async ({ b64, ocr }) => {
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
    const out = { pages: doc.numPages, text: [], annots: [], ocr: [], meta: "", attachments: [] };
    const md = await doc.getMetadata().catch(() => null);
    if (md) out.meta = JSON.stringify(md.info || {}) + "\n" + (md.metadata ? md.metadata.getRaw() : "");
    const att = await doc.getAttachments().catch(() => null);
    if (att) out.attachments = Object.values(att).map((a) => a.filename + " " + new TextDecoder().decode(a.content));
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.getPage(p);
      const tc = await pg.getTextContent();
      out.text.push(tc.items.map((i) => i.str).join(" "));
      const an = await pg.getAnnotations();
      out.annots.push(...an.map((a) => [a.subtype, a.fieldValue, a.contentsObj && a.contentsObj.str, a.url].join(" ")));
      if (ocr) {
        // The export bakes a page's /Rotate into the image, so text can lie in any direction: OCR reads the page in
        // all four orientations (~160 dpi, annotations drawn) and every reading counts.
        for (const rotation of [0, 90, 180, 270]) {
          const vp = pg.getViewport({ scale: 2.2, rotation });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(vp.width);
          canvas.height = Math.round(vp.height);
          const cx = canvas.getContext("2d");
          cx.fillStyle = "#fff";
          cx.fillRect(0, 0, canvas.width, canvas.height);
          await pg.render({ canvasContext: cx, viewport: vp, annotationMode: pdfjsLib.AnnotationMode.ENABLE }).promise;
          const res = await runTesseractOcrOnCanvas(canvas, "deu+eng", () => {});
          out.ocr.push((res && res.data && res.data.text) || "");
        }
      }
    }
    await doc.destroy();
    return out;
  }, { b64: Buffer.from(bytes).toString("base64"), ocr });
}

/**
 * Searches every channel of a PDF for the needles. Returns { channel: [needles found] } (empty object = clean).
 */
async function findNeedles(page, bytes, needles, { ocr = true, file } = {}) {
  const channels = {};
  const br = await readPdfInBrowser(page, bytes, { ocr });
  channels.textLayer = br.text.join("\n");
  channels.annotations = br.annots.join("\n");
  channels.metadata = br.meta;
  channels.attachments = br.attachments.join("\n");
  if (ocr) channels.ocr = br.ocr.join("\n");
  const raw = await rawPdfText(bytes);
  channels.rawObjects = raw.text;
  if (file) {
    const pt = popplerText(file);
    if (pt !== null) channels.pdftotext = pt;
  }
  const hits = {};
  for (const [ch, text] of Object.entries(channels)) {
    const hay = compact(text);
    const found = needles.filter((n) => hay.includes(compact(n)));
    if (found.length) hits[ch] = found;
  }
  return { hits, hasAcroForm: raw.hasAcroForm, attachmentCount: br.attachments.length, pages: br.pages };
}

module.exports = { ROOT, APP_DIR, startServer, launchBrowser, guardNetwork, watchErrors, openApp, findNeedles, compact };
