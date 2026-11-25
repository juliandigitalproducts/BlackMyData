// Fixes after the emulator test of 20 Nov 2026 (reports/emu/BlackMyData-emulator-test.md), tested against the real
// functions of strato_app.js / pii_engine.js (in a VM):
// - B-E3: Back from the editor returns to the document list (tab "batch"), it left an empty page ("queue")
// - B-E1: the Android app gets the theme colours for its status/navigation bars (bridge message "theme")
// - OCR progress showed the percentage twice ("Erkenne Text (39%) (39%)")
// - B-U8: a blocked http:// AI server says why, and the badge is not green
// - B-U9: names ending in ß/umlaut were also hit cut off ("Jürgen Wei" next to "Jürgen Weiß")
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");

const read = (f) => fs.readFileSync(path.join(__dirname, "../app/static", f), "utf8");

function el(id, extra = {}) {
  const classes = new Set();
  return {
    id, style: {}, dataset: {}, innerHTML: "", textContent: "", value: "",
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    addEventListener: () => {}, setAttribute: () => {}, ...extra
  };
}

function createSandbox() {
  const elements = {};
  const tabs = ["batch", "editor", "settings", "about"].map((t) => el("tab-" + t));
  const tabBtns = ["batch", "editor", "settings", "about"].map((t) => { const b = el(""); b.dataset.tab = t; return b; });
  const header = el("", { className: "app-header" });
  const attrs = {};
  const doc = {
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
    body: el("body"),
    createElement: () => ({ getContext: () => ({}) }),
    getElementById: (id) => elements[id] || null,
    getElementsByTagName: () => [],
    querySelector: (sel) => (sel === ".app-header" ? header : null),
    querySelectorAll: (sel) => (sel === ".tab-content" ? tabs : sel.startsWith(".tab-btn") ? tabBtns : []),
    addEventListener: () => {}
  };
  const toasts = [];
  const sent = [];
  const win = {
    addEventListener: () => {},
    location: { origin: "https://example.com", protocol: "https:", href: "https://example.com/" },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  };
  const colours = { light: { header: "rgb(255, 255, 255)", body: "rgb(248, 250, 252)" }, dark: { header: "rgb(30, 41, 59)", body: "rgb(15, 23, 42)" } };
  const sandbox = {
    window: win, document: doc, navigator: { userAgent: "Node" }, console, setTimeout, clearTimeout, URL,
    localStorage: win.localStorage,
    getComputedStyle: (node) => ({ backgroundColor: colours[attrs["data-theme"] || "dark"][node === header ? "header" : "body"] }),
    fetch: () => { throw new Error("fetch must not be called"); }
  };
  win.window = win;
  win.document = doc;
  vm.createContext(sandbox);
  vm.runInContext(read("pii_engine.js"), sandbox);
  vm.runInContext(read("strato_app.js"), sandbox);
  vm.runInContext("this.__state = state; showToast = (m, t) => __toasts.push([t, m]);", Object.assign(sandbox, { __toasts: toasts }));
  return { s: sandbox, tabs, elements, sent, win, toasts, el };
}

let n = 0;
const failed = [];
const t = async (name, fn) => {
  try {
    await fn();
    n++;
    console.log("  ✓ " + name);
  } catch (e) {
    failed.push(name);
    console.log("  ✗ " + name + "\n      " + String(e.message).split("\n")[0]);
  }
};

(async () => {
  console.log("--- emulator test fixes ---");

  await t("B-E3: Back from the editor shows the document list again", () => {
    const { s, tabs } = createSandbox();
    s.switchTab("editor");
    assert.strictEqual(s.handleAppBack(), true, "Back is handled by the page");
    assert.strictEqual(s.__state.currentTab, "batch");
    assert.deepStrictEqual(tabs.map((x) => x.classList.contains("active")), [true, false, false, false], "exactly the list tab is visible");
    assert.strictEqual(s.handleAppBack(), false, "on the list, Back goes to the system (app closes)");
  });

  await t("B-E3: every tab button has a tab panel (no Back target without a page)", () => {
    const html = read("index.html");
    const btns = [...html.matchAll(/class="tab-btn[^"]*"[^>]*data-tab="([^"]+)"/g)].map((m) => m[1]);
    assert(btns.includes("batch"), "tab batch exists: " + btns);
    for (const b of btns) assert(html.includes(`id="tab-${b}"`), `panel tab-${b}`);
    assert(!/switchTab\("queue"\)/.test(read("strato_app.js")), "no switchTab(\"queue\") left");
  });

  await t("B-E1: theme change tells the Android app the bar colours (postMessage bridge)", () => {
    const { s, win } = createSandbox();
    const got = [];
    win.BlackMyDataAndroid = { postMessage: (m) => got.push(JSON.parse(m)), addEventListener: () => {} };
    s.setTheme("light");
    s.setTheme("dark");
    assert.deepStrictEqual(got, [
      { op: "theme", theme: "light", top: "#ffffff", bottom: "#f8fafc" },
      { op: "theme", theme: "dark", top: "#1e293b", bottom: "#0f172a" }
    ]);
  });

  await t("B-E1: legacy bridge (message) works too, browsers without bridge are untouched", () => {
    const { s, win } = createSandbox();
    s.setTheme("light");   // no bridge: no error
    const got = [];
    win.BlackMyDataAndroid = { message: (m) => got.push(JSON.parse(m)) };
    s.setTheme("light");
    assert.strictEqual(got.length, 1);
    assert.strictEqual(got[0].top, "#ffffff");
  });

  await t("cssColorToHex converts computed colours", () => {
    const { s } = createSandbox();
    assert.strictEqual(s.cssColorToHex("rgb(30, 41, 59)"), "#1e293b");
    assert.strictEqual(s.cssColorToHex("rgba(255, 255, 255, 0.9)"), "#ffffff");
    assert.strictEqual(s.cssColorToHex("#ABCDEF"), "#abcdef");
    assert.strictEqual(s.cssColorToHex("transparent"), "");
  });

  await t("OCR progress label carries no percentage of its own (callers add it once)", () => {
    const js = read("strato_app.js");
    assert(/m\.status === "recognizing text"\) label = "Erkenne Text";/.test(js), "logger label without (x%)");
    assert(/subtitle: `OCR Seite \$\{pageIndex \+ 1\}: \$\{status\} \(\$\{Math\.round\(pct \* 100\)\}%\)\.\.\.`/.test(js), "the loading phase adds it");
  });

  await t("wizard: no doubled 🎯 in the precise mode card", () => {
    assert(!/🎯<\/span><div><div class="mode-title">🎯/.test(read("index.html")));
  });

  await t("B-U8: blocked http:// server: reason shown, no request, badge red", async () => {
    const { s, toasts, elements, el } = createSandbox();
    elements.ollamaStatusBadge = el("ollamaStatusBadge");
    s.__state.settings.ollama.remote_endpoint = "http://203.0.113.5:11434";
    s.selectAiProvider("remote", "remote::default");
    await s.probeRemoteAiServer(true);
    assert.strictEqual(toasts.length, 1);
    assert(/http:\/\/.*nur zu KI-Servern im eigenen Netz/.test(toasts[0][1]), toasts[0][1]);
    assert(!/CORS/.test(toasts[0][1]), "not the generic CORS message");
    assert(/dot-red/.test(elements.ollamaStatusBadge.innerHTML) && /blockiert/.test(elements.ollamaStatusBadge.innerHTML), elements.ollamaStatusBadge.innerHTML);
  });

  await t("B-U8: badge stays green for a remote server not checked yet / another address", () => {
    const { s, elements, el } = createSandbox();
    elements.ollamaStatusBadge = el("ollamaStatusBadge");
    s.__state.settings.ollama.remote_endpoint = "https://ki.example.org";
    s.__state.aiDiscovery.remote = { available: false, models: [], count: 0, lastCheckedUrl: "http://203.0.113.5:11434" };
    s.selectAiProvider("remote", "remote::llama");
    assert(/dot-green/.test(elements.ollamaStatusBadge.innerHTML), elements.ollamaStatusBadge.innerHTML);
  });

  await t("B-U9: names ending in ß/umlaut are hit whole, never cut off", () => {
    const { s } = createSandbox();
    const cats = { names: true, addresses: true, emails: true, phones: true, ibans: true, orgs: true };
    for (const [text, name] of [["Kunde: Jürgen Weiß", "Jürgen Weiß"], ["Sehr geehrter Herr Jürgen Weiß,", "Jürgen Weiß"],
      ["Gespräch mit Frau Anna Strauß heute.", "Anna Strauß"], ["10115 Gießen und Herr Peter Groß", "Peter Groß"]]) {
      const res = s.window.BlackMyDataPII.detectPiiRulesJS(text, cats, [], null, "balanced");
      const texts = (res.entities || res).map((e) => e.text);
      assert(texts.some((x) => x.startsWith(name)), `${name} in ${JSON.stringify(texts)}`);
      const cut = texts.filter((x) => name.startsWith(x) && x !== name);
      assert.strictEqual(cut.length, 0, `cut-off hits for "${text}": ${JSON.stringify(texts)}`);
    }
  });

  console.log(failed.length ? `\n${failed.length} FEHLGESCHLAGEN: ${failed.join("; ")}` : `\n${n} checks passed`);
  process.exit(failed.length ? 1 : 0);
})();
