// Fixes of the 10 Nov 2026 review : detection rules and the safety paths of the export.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/static/pii_engine.js"), "utf8"), ctx);
const P = ctx.window.BlackMyDataPII;
const app = fs.readFileSync(path.join(__dirname, "../app/static/strato_app.js"), "utf8");
const found = (text, cats, exceptions = {}) =>
  P.detectPiiRulesJS(text, cats, exceptions, null, "balanced").map((m) => `${m.category}:${m.text}`);

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ✓ " + name); };

t("custom keywords with umlauts, ß and punctuation", () => {
  const r = found("Herr Özdemir vom Ärztehaus, Gauß & Co. KG", { custom_keywords: ["Özdemir", "Ärztehaus", "Gauß", "Co."] });
  for (const k of ["Özdemir", "Ärztehaus", "Gauß", "Co."]) assert(r.includes("custom:" + k), k + " → " + r);
  assert(!found("Özdemirstraße", { custom_keywords: ["Özdemir"] }).includes("custom:Özdemir"), "no match inside a longer word");
});

t("IBANs with letters (GB, NL) and lower case, checked by mod 97", () => {
  const r = found("GB82 WEST 1234 5698 7654 32 und nl91abna0417164300 und DE89 3704 0044 0532 0130 00", { ibans: true });
  assert(r.includes("iban:GB82 WEST 1234 5698 7654 32"), r);
  assert(r.includes("iban:nl91abna0417164300"), r);
  assert(r.includes("iban:DE89 3704 0044 0532 0130 00"), r);
  assert.strictEqual(found("Artikel AB12 CDEF GHIJ KLMN", { ibans: true }).length, 0, "invalid checksum with letters is no IBAN");
  assert(P.isValidIban("GB82WEST12345698765432") && !P.isValidIban("GB83WEST12345698765432"));
});

t("whitelist only removes the whitelisted words", () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(P.trimWhitelisted("Peter Müller", { whitelist: ["Peter"] }))), { text: "Müller", offset: 6 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(P.trimWhitelisted("10115 Berlin", { whitelist: ["Berlin"] }))), { text: "10115", offset: 0 });
  assert.strictEqual(P.trimWhitelisted("Berlin", { whitelist: ["berlin"] }), null);
});

t("international phone numbers", () => {
  const r = found("Wien +43 1 234 5678, Zürich +41 44 668 18 00, USA +1 212 555 0100", { phones: true });
  assert(r.includes("phone:+43 1 234 5678"), r);
  assert(r.includes("phone:+41 44 668 18 00"), r);
  assert(r.some((x) => x.startsWith("phone:+1 212")), r);
});

t("more date formats, versions are no dates", () => {
  const r = found("12.03.85, 1985-03-12, 12. März 1985, 12/03/1985, 3.4.2024, Version 1.5.15", { dates: true });
  for (const d of ["12.03.85", "1985-03-12", "12. März 1985", "12/03/1985", "3.4.2024"]) assert(r.includes("date:" + d), d + " → " + r);
  assert(!r.includes("date:1.5.15"), r);
});

t("export safety paths are wired in", () => {
  assert(app.includes('pageInfo.ocrStatus === "failed" || pageInfo.ocrStatus === "unavailable"'), "OCR failure blackens the page");
  assert(app.includes("file.analysisSignature !== analysisSignature()"), "stale analysis is re-evaluated before export");
  assert(app.includes("Number.isFinite(padSetting) && padSetting >= 0"), "padding 0 is allowed");
  assert(app.includes("function markFileChanged(file)"), "edits invalidate the produced file");
  assert(app.includes("loadingTask.destroy()"), "cancelled password stops loading");
  assert(app.includes("function confirmExternalAi()"), "external AI servers need confirmation");
  assert(app.includes("if (!beginBusy()) return;"), "only one run at a time");
  assert(app.includes("await page.getAnnotations()") && app.includes('source: "form"'),
    "form field values and FreeText comments are checked like page text (they are drawn into the export)");
});

console.log(`\n${n} checks passed`);

// Plain http:// only to AI servers on the device or in the home network.
{
  const src = fs.readFileSync(path.join(__dirname, "../app/static/strato_app.js"), "utf8");
  const fn = src.match(/function isPlainHttpAllowed[\s\S]*?\n}\n/)[0];
  const sandbox = { window: { location: { href: "https://example.org/" } }, URL };
  vm.createContext(sandbox);
  vm.runInContext(fn + "\nthis.ok = isPlainHttpAllowed;", sandbox);
  for (const u of ["http://127.0.0.1:11434", "http://192.168.1.5:1234", "http://studio.local:1234", "http://[::1]:1", "https://api.example.com"]) assert(sandbox.ok(u), u);
  for (const u of ["http://example.com", "http://8.8.8.8", "http://fdomain.com"]) assert(!sandbox.ok(u), u);
  // BMD-R8: the case list shared with the Android unit test (LocalNetworkTest).
  const cases = fs.readFileSync(path.join(__dirname, "fixtures/plain_http_hosts.txt"), "utf8")
    .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  assert(cases.length > 20, "shared case list");
  for (const line of cases) {
    const [verdict, host, extra] = line.split(/\s+/);
    assert((verdict === "allow" || verdict === "block") && host && !extra, `bad line: ${line}`);
    assert.strictEqual(sandbox.ok(`http://${host}:11434/`), verdict === "allow", line);
  }
  console.log("  ✓ plain http only inside the home network");
}
