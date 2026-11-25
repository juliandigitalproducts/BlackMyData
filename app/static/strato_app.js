/**
 * BlackMyData - Dual-Mode Browser & Local-AI WebApp Controller
 * - Mode 1: 100% Browser-Standalone (PDF.js + German PII Engine + jsPDF Physical Redaction + JSZip)
 * - Mode 2: Direct Bridge to Localhost 127.0.0.1 (Ollama :11434, LM Studio :1234, oMLX :1060) or Remote LAN AI Server
 */

// Configure PDF.js worker with resilient absolute path resolution
function initPdfWorker() {
  if (!window.pdfjsLib) return;
  try {
    const scripts = document.getElementsByTagName("script");
    let baseUri = "";
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].src || "";
      if (src.includes("pdf.min.js") || src.includes("strato_app.js")) {
        baseUri = src.substring(0, src.lastIndexOf("/") + 1);
        break;
      }
    }
    if (!baseUri) {
      baseUri = new URL("./", window.location.href).href;
      if (!baseUri.endsWith("/")) baseUri += "/";
    }
    const workerUrl = baseUri.includes("/vendor/")
      ? baseUri + "pdf.worker.min.js"
      : baseUri + "vendor/pdf.worker.min.js";
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch (e) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.js";
  }
}
initPdfWorker();

// ============================================================================
// GLOBAL CROSS-BROWSER ERROR & REJECTION MONITORING (SAFARI, CHROME, FIREFOX)
// ============================================================================
window.addEventListener("error", (event) => {
  // Ignore harmless ResizeObserver loop limit errors
  if (event.message && event.message.includes("ResizeObserver")) return;
  const msg = event.message || (event.error && event.error.message) || "Ein unerwarteter Fehler ist aufgetreten.";
  console.error("[BlackMyData Global Error]", event);
  if (typeof showToast === "function") {
    showToast(`⚠️ Fehler: ${msg}`, "danger", 6000);
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const msg = (reason && (reason.message || reason.toString())) || "Ein asynchroner Verarbeitungsfehler ist aufgetreten.";
  console.error("[BlackMyData Unhandled Rejection]", reason);
  if (typeof showToast === "function") {
    showToast(`⚠️ Verarbeitungsfehler: ${msg}`, "danger", 6000);
  }
});

// One version source (BMD-N3): every build writes versionName from android/app/build.gradle here (Gradle copyWebApp,
// tools/version.sh --stamp). The literal is only the fallback for running app/static directly.
const CURRENT_BUILD_VERSION = "1.0.7";

// Visible version labels (<span class="app-version">) always show the build version, never a stale literal.
// The script loads at the end of <body>, so the elements already exist.
document.querySelectorAll(".app-version").forEach((el) => { el.textContent = CURRENT_BUILD_VERSION; });

function checkAndMigrateAppBuildVersion() {
  try {
    const prevVersion = localStorage.getItem("bmd_app_build_version");
    if (prevVersion !== CURRENT_BUILD_VERSION) {
      // A new version starts with fresh caches; the user's settings stay.
      const keysToRemove = [
        "bmd_ocr_cache",
        "bmd_legacy_cache",
        "tesseract_cache"
      ];
      for (const k of keysToRemove) {
        try { localStorage.removeItem(k); } catch (_) {}
      }

      localStorage.setItem("bmd_app_build_version", CURRENT_BUILD_VERSION);
    }
  } catch (err) {
    console.warn("Could not check/migrate app build version:", err);
  }
}

function showOcrInfobox(message, type = "warning") {
  const box = document.getElementById("ocrStatusInfobox");
  const content = document.getElementById("ocrStatusInfoboxContent");
  if (!box || !content) return;
  box.className = `ocr-status-infobox ${type}`;
  content.innerHTML = message;
  box.style.display = "flex";
}

function dismissOcrInfobox() {
  const box = document.getElementById("ocrStatusInfobox");
  if (box) box.style.display = "none";
}

/**
 * Calculates a safe canvas render scale so that high-resolution scans (300-600 DPI)
 * never exceed browser memory limits (especially on Safari / WebKit or mobile devices).
 */
function getSafeRenderScale(baseWidth, baseHeight, targetScale = 1.8, maxDimension = 3200) {
  let scale = targetScale;
  const w = Number(baseWidth) || 595;
  const h = Number(baseHeight) || 842;
  if (w * scale > maxDimension || h * scale > maxDimension) {
    scale = Math.min(maxDimension / w, maxDimension / h);
  }
  return Math.max(0.75, scale);
}


const CATEGORY_LABELS = {
  name: "Name",
  names: "Name",
  first_name: "Vorname",
  first_names: "Vorname",
  last_name: "Nachname",
  last_names: "Nachname",
  title: "Titel / Anrede",
  titles: "Titel / Anrede",
  address: "Adresse",
  addresses: "Adresse",
  street: "Straße",
  streets: "Straße",
  house_number: "Hausnummer",
  house_numbers: "Hausnummer",
  zip_code: "PLZ",
  zip_codes: "PLZ",
  city: "Stadt / Ort",
  cities: "Stadt / Ort",
  email: "E-Mail",
  emails: "E-Mail",
  phone: "Telefon",
  phones: "Telefon",
  iban: "IBAN",
  ibans: "IBAN",
  bic: "BIC / SWIFT",
  bics: "BIC / SWIFT",
  tax_id: "Steuer-ID",
  tax_ids: "Steuer-ID",
  social_security_id: "Sozialvers.-Nr.",
  social_security_ids: "Sozialvers.-Nr.",
  id: "Ausweis / ID",
  date: "Datum",
  dates: "Datum",
  birth_date: "Geburtsdatum",
  birth_dates: "Geburtsdatum",
  general_date: "Datum",
  general_dates: "Datum",
  org: "Firma / Org",
  organization: "Firma / Org",
  organizations: "Firma / Org",
  manual: "Manuell",
  custom: "Benutzerdefiniert"
};

function formatCategoryLabel(category) {
  if (!category) return "Daten";
  return CATEGORY_LABELS[category] || CATEGORY_LABELS[String(category).toLowerCase()] || String(category).toUpperCase();
}

const STRENGTH_DESCRIPTIONS = {
  light: "<strong>🔉 Leicht (Fokus auf Kerndaten):</strong> Schwärzt primär Nachnamen, Straßen/Hausnummern, E-Mail, Telefon, IBAN und Steuer-/Ausweis-IDs mit exaktem 0px Rand. Orte, PLZ und allgemeine Daten bleiben sichtbar.",
  standard: "<strong>⚖️ Standard (DSGVO-Empfehlung):</strong> Schwärzt alle personenbezogenen Daten (Vor-/Nachnamen, komplette Adressen, Kontaktdaten, Bank- & Steuerdaten, Datumsangaben) mit 2 Pixeln Sicherheitsrand gegen überstehende Buchstaben.",
  strict: "<strong>🔒 Streng (Erweiterter Schutz):</strong> Schwärzt zusätzlich auch alle Firmen, Banken, Behörden & Organisationen sowie sämtliche Datumsangaben mit einem großzügigen 4 Pixel Sicherheitspuffer.",
  maximum: "<strong>🛡️ Maximal (Komplettschutz):</strong> Aktiviert ausnahmslos alle 15 granularen Kategorien (inkl. Titel, PLZ, Ort, BIC, Firmen, alle Daten) mit maximalem 5 Pixel Sicherheitsrand."
};

const DEFAULT_OPEN_SOURCE_PACKAGES = [
  { name: "PDF.js (Mozilla)", version: "3.11.174", license: "Apache-2.0", purpose: "100% Client-Side PDF-Parsing, Wort-Koordinaten & Seiten-Rendering direkt im Browser" },
  { name: "pdf-lib (inkl. pako, tslib, @pdf-lib/standard-fonts, @pdf-lib/upng)", version: "1.17.1", license: "MIT (pako: MIT/Zlib, tslib: 0BSD)", purpose: "Vektor-Kopie von PDF-Seiten und Zusammenbau der geschwärzten PDFs" },
  { name: "jsPDF", version: "2.5.1", license: "MIT License", purpose: "Erzeugung physisch geschwärzter, vektorbereinigter PDF-Dokumente im Browser-Speicher" },
  { name: "Tesseract.js (WASM)", version: "5.1.1", license: "Apache-2.0", purpose: "Optionale Browser-basierte optische Texterkennung (OCR) für gescannte PDFs; tesseract.js-core enthält Leptonica, libpng, zlib und libtiff (BSD-artige Lizenzen)" },
  { name: "Tesseract OCR traineddata (deu, eng)", version: "4.0.0 Fast", license: "Apache-2.0", purpose: "Deutsche & englische OCR-Sprachmodelle © Google LLC / Tesseract contributors" },
  { name: "JSZip", version: "3.10.1", license: "MIT License", purpose: "Lokaler ZIP-Sammeldownload bei Stapelverarbeitung mehrerer PDFs" },
  { name: "BlackMyData PII-Engine (JS)", version: "1.4.0", license: "MIT", purpose: "Deutsche Vor-/Nachnamen-, Polysem- (Rose/Winter/Schwarz/Wolf) & Kontexterkennung" },
  { name: "Ollama Localhost Bridge", version: "Port 11434", license: "MIT (eigener Code)", purpose: "Wird nicht mitgeliefert, nur angesprochen: Optionale direkte Verbindung (127.0.0.1:11434 oder LAN) zu lokalem Ollama LLM" },
  { name: "LM Studio OpenAI Bridge", version: "Port 1234", license: "MIT (eigener Code)", purpose: "Wird nicht mitgeliefert, nur angesprochen: Optionale direkte Verbindung (127.0.0.1:1234 oder LAN) zu LM Studio Server" },
  { name: "AndroidX, Kotlin-Standardbibliothek, kotlinx-coroutines (nur Android-App)", version: "div.", license: "Apache-2.0", purpose: "WebView-Hülle der Android-App" },
  { name: "Go-Standardbibliothek (nur Windows-/Linux-Starter)", version: "Go", license: "BSD-3-Clause", purpose: "Lokaler Starter, der die App auf 127.0.0.1 bereitstellt" },
  { name: "oMLX Localhost Bridge", version: "Port 1060", license: "MIT (eigener Code)", purpose: "Wird nicht mitgeliefert, nur angesprochen: Optionale direkte Loopback-Verbindung (127.0.0.1:1060) zu Apple Silicon oMLX" }
];

// Model Advisor Profiles (Default: 12 GB VRAM)
const ADVISOR_VRAM_PROFILES = {
  "8gb": {
    label: "6–8 GB VRAM / Einsteiger-GPU & Laptops",
    cards: [
      {
        tier: "⚡ Maximale Geschwindigkeit (Turbo auf 6–8 GB VRAM)",
        badge: "Ultra-Schnell",
        badgeColor: "var(--accent-light)",
        ollamaModel: "qwen2.5:1.5b-instruct",
        altModel: "llama3.2:1b",
        lmstudioModel: "Qwen2.5-1.5B-Instruct-GGUF (Q4_K_M)",
        vram: "~1,3 GB VRAM",
        speed: "~110+ Token/s",
        desc: "Läuft selbst auf kleineren Grafikkarten und älteren Laptops extrem flüssig. Ideal für große PDF-Stapel mit vielen Seiten."
      },
      {
        tier: "⚖️ Beste Balance aus Geschwindigkeit & Qualität ⭐ (Empfehlung für 8 GB)",
        badge: "Empfehlung für 8 GB",
        badgeColor: "var(--success)",
        ollamaModel: "qwen2.5:3b-instruct",
        altModel: "llama3.2:3b",
        lmstudioModel: "Qwen2.5-3B-Instruct-GGUF (Q4_K_M)",
        vram: "~2,3 GB VRAM",
        speed: "~75 Token/s",
        desc: "Sehr gutes deutsches Sprachverständnis für Vor-/Nachnamen im Fließtext bei minimalem Speicherbedarf."
      },
      {
        tier: "🧠 Maximale Qualität auf 8 GB VRAM (Tiefenanalyse)",
        badge: "Hohe Präzision",
        badgeColor: "#a855f7",
        ollamaModel: "qwen2.5:7b-instruct",
        altModel: "mistral:7b-instruct",
        lmstudioModel: "Qwen2.5-7B-Instruct-GGUF (Q4_K_M)",
        vram: "~4,8 GB VRAM",
        speed: "~35 Token/s",
        desc: "Starkes 7B-Modell in 4-Bit-Quantisierung. Erkennt auch schwierige deutsche Mehrwort-Kontexte und Polyseme zuverlässig."
      }
    ]
  },
  "12gb": {
    label: "12 GB VRAM (Standard-Empfehlung ⭐ – z.B. RTX 3060 / 4070 / 4070 Super)",
    cards: [
      {
        tier: "⚡ Maximale Geschwindigkeit (Turbo auf 12 GB VRAM)",
        badge: "High-Speed Stapelmodus",
        badgeColor: "var(--accent-light)",
        ollamaModel: "qwen2.5:3b-instruct",
        altModel: "llama3.2:3b",
        lmstudioModel: "Qwen2.5-3B-Instruct-GGUF (Q6_K)",
        vram: "~2,2 GB VRAM",
        speed: "> 85 Token/s",
        desc: "Ideal für große PDF-Stapel (10–100+ Seiten). Analysiert eine komplette Dokumentseite in wenigen Millisekunden."
      },
      {
        tier: "⚖️ Beste Balance aus Geschwindigkeit & Qualität ⭐ (Top-Empfehlung für 12 GB VRAM)",
        badge: "Testsieger 12 GB VRAM ⭐",
        badgeColor: "var(--success)",
        ollamaModel: "qwen2.5:7b-instruct",
        altModel: "gemma2:9b",
        lmstudioModel: "Qwen2.5-7B-Instruct-GGUF (Q5_K_M)",
        vram: "~5,0–6,2 GB VRAM",
        speed: "~45–55 Token/s",
        desc: "Der perfekte Sweet-Spot für 12 GB VRAM: Exzellentes deutsches Kontextverständnis (trennt zuverlässig Personennamen wie 'Herr Schwarz' oder 'Rose geht nach Hause' von Substantiven) bei hoher Geschwindigkeit."
      },
      {
        tier: "🧠 Maximale Qualität auf 12 GB VRAM (Tiefenanalyse für Verträge & Kanzleien)",
        badge: "Maximale Genauigkeit",
        badgeColor: "#a855f7",
        ollamaModel: "qwen2.5:14b",
        altModel: "mistral-nemo:12b",
        lmstudioModel: "Qwen2.5-14B-Instruct-GGUF (Q4_K_M) / Mistral-Nemo-12B",
        vram: "~8,5–9,5 GB VRAM",
        speed: "~25–30 Token/s",
        desc: "Schöpft 12 GB VRAM optimal aus: Höchste Erkennungsrate für verschachtelte juristische Texte, Arztbriefe, Rollenbezeichnungen und komplexe deutsche Satzstrukturen."
      }
    ]
  },
  "16gb": {
    label: "16 GB VRAM / Apple Silicon (M1/M2/M3/M4 mit 16–18 GB Unified Memory)",
    cards: [
      {
        tier: "⚡ Maximale Geschwindigkeit (Turbo auf 16 GB)",
        badge: "Sofort-Analyse",
        badgeColor: "var(--accent-light)",
        ollamaModel: "qwen2.5:7b-instruct",
        altModel: "llama3.1:8b",
        lmstudioModel: "Qwen2.5-7B-Instruct-GGUF (Q5_K_M)",
        vram: "~5,2 GB VRAM",
        speed: "~60 Token/s",
        desc: "Auf 16 GB Systemen läuft die 7B-Klasse bereits im absoluten Turbo-Modus ohne jede Wartezeit."
      },
      {
        tier: "⚖️ Beste Balance aus Geschwindigkeit & Qualität ⭐ (Empfehlung für 16 GB)",
        badge: "Empfehlung für 16 GB ⭐",
        badgeColor: "var(--success)",
        ollamaModel: "mistral-nemo:12b",
        altModel: "gemma2:9b",
        lmstudioModel: "Mistral-Nemo-Instruct-2407-GGUF (Q5_K_M)",
        vram: "~7,8–8,5 GB VRAM",
        speed: "~38 Token/s",
        desc: "Gemeinsam von Mistral & NVIDIA entwickelt: Herausragend bei deutschen Geschäftsbriefen, Verträgen und präziser JSON-Ausgabe."
      },
      {
        tier: "🧠 Maximale Qualität auf 16 GB (14B Referenzklasse)",
        badge: "Referenz-Qualität",
        badgeColor: "#a855f7",
        ollamaModel: "qwen2.5:14b",
        altModel: "phi4:14b",
        lmstudioModel: "Qwen2.5-14B-Instruct-GGUF (Q5_K_M)",
        vram: "~10,5 GB VRAM",
        speed: "~28 Token/s",
        desc: "Nahezu auf GPT-4-Niveau bei der Entitätserkennung im deutschen Fließtext – zu 100 % offline auf deinem Gerät."
      }
    ]
  },
  "24gb": {
    label: "24+ GB VRAM / Workstation (RTX 3090 / 4090 / Mac Studio / M-Max)",
    cards: [
      {
        tier: "⚡ Maximale Geschwindigkeit (High-Speed 14B)",
        badge: "Workstation-Turbo",
        badgeColor: "var(--accent-light)",
        ollamaModel: "qwen2.5:14b",
        altModel: "mistral-nemo:12b",
        lmstudioModel: "Qwen2.5-14B-Instruct-GGUF (Q6_K)",
        vram: "~11,5 GB VRAM",
        speed: "~55 Token/s",
        desc: "14-Milliarden-Parameter-Modell mit rasend schneller Antwortzeit für große Dokumenten-Archive."
      },
      {
        tier: "⚖️ Beste Balance aus Geschwindigkeit & Qualität ⭐ (Empfehlung für 24+ GB)",
        badge: "Empfehlung 24+ GB ⭐",
        badgeColor: "var(--success)",
        ollamaModel: "qwen2.5:32b",
        altModel: "gemma2:27b",
        lmstudioModel: "Qwen2.5-32B-Instruct-GGUF (Q4_K_M)",
        vram: "~19,5 GB VRAM",
        speed: "~28 Token/s",
        desc: "Die 27B–32B-Klasse bietet ein extrem tiefes Sprachverständnis für komplexe Akten, Gutachten und mehrdeutige Namen."
      },
      {
        tier: "🧠 Maximale Qualität (High-Precision Q6/Q8)",
        badge: "Kanzlei-Maximum",
        badgeColor: "#a855f7",
        ollamaModel: "qwen2.5:32b-instruct-q5_K_M",
        altModel: "llama3.3:70b",
        lmstudioModel: "Qwen2.5-32B-Instruct-GGUF (Q5_K_M)",
        vram: "~22+ GB VRAM",
        speed: "~20 Token/s",
        desc: "Höchste lokale Analyse-Tiefe ohne Kompromisse für besonders sensible Dokumente."
      }
    ]
  }
};

const state = {
  theme: "dark",
  currentTab: "batch",
  wizardStep: 1,
  advisorVramTier: "12gb",
  files: [],
  activeFileId: null,
  activePageNum: 0,
  currentPage: 0,
  analysisData: null,
  manualRedactions: {},
  granularity: "coarse",
  aiDiscovery: {
    scanned: false,
    ollama: { available: false, models: [], count: 0, corsHint: false },
    lmstudio: { available: false, models: [], count: 0 },
    omlx: { available: false, models: [], count: 0, needsKey: false },
    remote: { available: false, models: [], count: 0, lastCheckedUrl: "" },
    models: []
  },
  settings: {
    preset: "balanced",
    recognition_mode: "good",
    sensitivity: "balanced",
    redaction_strength: "standard",
    rasterize_all_pages: false,
    filename_config: {
      mode: "suffix_default", // "suffix_default" | "keep_original" | "custom"
      custom_pattern: "{original}_anonymisiert"
    },
    style: {
      fill_color: "#000000",
      text_color: "#ffffff",
      add_label: false,
      custom_label: "[GESCHWÄRZT]",
      padding: 2
    },
    categories: {
      granularity: "coarse",
      names: true,
      addresses: true,
      emails: true,
      phones: true,
      ibans: true,
      tax_ids: true,
      dates: true,
      organizations: false,
      first_names: true,
      last_names: true,
      titles: true,
      streets: true,
      house_numbers: true,
      zip_codes: true,
      cities: true,
      bics: true,
      social_security_ids: true,
      birth_dates: true,
      general_dates: true,
      custom_keywords: []
    },
    exceptions: {
      whitelist: [],
      case_sensitive: false
    },
    ocr: {
      mode: "auto",
      language: "deu+eng",
      dpi: 200,
      precision: "standard", // "standard" | "precise"
      deskew: true,
      vision_ocr: true
    },
    ollama: {
      enabled: false,
      provider: "none", // "none" | "ollama" | "lmstudio" | "omlx" | "remote"
      endpoint: "http://127.0.0.1:11434",
      lmstudio_endpoint: "http://127.0.0.1:1234",
      omlx_endpoint: "http://127.0.0.1:1060",
      omlx_api_key: "",
      remote_endpoint: "",
      remote_api_type: "openai", // "openai" | "ollama"
      remote_api_key: "",
      model: "",
      vision_model: ""
    }
  }
};

function normalizeGranularity(value) {
  if (value === "fine" || value === "granular") return "granular";
  return "coarse";
}

function isGranularMode(value) {
  const g = value !== undefined ? value : state.settings.categories.granularity;
  return g === "granular" || g === "fine";
}

// ============================================================================
// OUTPUT FILENAME CUSTOMIZATION ("_geschwaerzt.pdf" optional or custom)
// ============================================================================
function computeOutputFilename(originalFilename, batchIndex = null) {
  const rawName = String(originalFilename || "Dokument.pdf");
  const baseName = rawName.replace(/\.pdf$/i, "") || "Dokument";
  const cfg = state.settings.filename_config || { mode: "suffix_default", custom_pattern: "{original}_anonymisiert" };

  if (cfg.mode === "keep_original") {
    return `${baseName}.pdf`;
  }

  if (cfg.mode === "custom") {
    const pat = String(cfg.custom_pattern || "").trim();
    if (!pat) {
      return `${baseName}_geschwaerzt.pdf`;
    }

    let out = "";
    if (/\{original\}/i.test(pat)) {
      out = pat.replace(/\{original\}/gi, baseName);
    } else if (pat.startsWith("_") || pat.startsWith("-") || pat.startsWith(".")) {
      out = `${baseName}${pat}`;
    } else {
      out = pat;
      if (batchIndex !== null && batchIndex > 0) {
        out = out.replace(/\.pdf$/i, "") + `_${batchIndex + 1}`;
      }
    }

    if (!/\.pdf$/i.test(out)) {
      out += ".pdf";
    }
    return out;
  }

  return `${baseName}_geschwaerzt.pdf`;
}

function setFilenameMode(mode) {
  const allowed = ["suffix_default", "keep_original", "custom"];
  const norm = allowed.includes(mode) ? mode : "suffix_default";
  if (!state.settings.filename_config) {
    state.settings.filename_config = { mode: "suffix_default", custom_pattern: "{original}_anonymisiert" };
  }
  state.settings.filename_config.mode = norm;
  syncFilenameUI();
  saveSettingsToLocalStorage();
  if (state.files.length > 0) {
    renderDocumentQueue();
  }
}

function onCustomFilenamePatternInput(value) {
  if (!state.settings.filename_config) {
    state.settings.filename_config = { mode: "custom", custom_pattern: "{original}_anonymisiert" };
  }
  state.settings.filename_config.custom_pattern = value;
  state.settings.filename_config.mode = "custom";
  syncFilenameUI(false);
  saveSettingsToLocalStorage();
  if (state.files.length > 0) {
    renderDocumentQueue();
  }
}

function syncFilenameUI(updateInputs = true) {
  const cfg = state.settings.filename_config || { mode: "suffix_default", custom_pattern: "{original}_anonymisiert" };
  const sampleOrig = state.files[0]?.filename || "Dokument.pdf";
  const previewName = computeOutputFilename(sampleOrig);

  document.querySelectorAll("[data-filename-mode-btn]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filenameModeBtn === cfg.mode);
  });

  const quickCustomRow = document.getElementById("quickCustomFilenameRow");
  if (quickCustomRow) {
    quickCustomRow.style.display = cfg.mode === "custom" ? "flex" : "none";
  }

  const settingsModeSelect = document.getElementById("settingsFilenameModeSelect");
  if (settingsModeSelect) {
    settingsModeSelect.value = cfg.mode;
  }

  const settingsCustomBox = document.getElementById("settingsCustomFilenameBox");
  if (settingsCustomBox) {
    settingsCustomBox.style.display = cfg.mode === "custom" ? "block" : "none";
  }

  if (updateInputs) {
    const qInput = document.getElementById("quickCustomFilenameInput");
    if (qInput && qInput.value !== cfg.custom_pattern) qInput.value = cfg.custom_pattern;
    const sInput = document.getElementById("settingsCustomFilenameInput");
    if (sInput && sInput.value !== cfg.custom_pattern) sInput.value = cfg.custom_pattern;
  }

  const quickPreview = document.getElementById("quickFilenamePreview");
  if (quickPreview) {
    quickPreview.innerHTML = `Vorschau: <strong>${escapeHtml(previewName)}</strong>`;
  }

  const settingsPreview = document.getElementById("settingsFilenamePreview");
  if (settingsPreview) {
    settingsPreview.innerHTML = `Vorschau: <strong>${escapeHtml(previewName)}</strong>`;
  }

  const downloadCardExample = document.getElementById("downloadCardExampleName");
  if (downloadCardExample) {
    downloadCardExample.textContent = previewName;
  }
}

// ============================================================================
// INTERACTIVE CANVAS VIEWER (100% Client-Side PDF.js Rendering)
// ============================================================================
class BrowserPDFViewer {
  constructor(canvasContainerId, overlayLayerId) {
    this.container = document.getElementById(canvasContainerId);
    this.overlayLayer = document.getElementById(overlayLayerId);
    this.canvas = document.createElement("canvas");
    this.canvas.id = "pdfCanvas";
    this.ctx = this.canvas.getContext("2d");

    if (this.container && this.overlayLayer && this.overlayLayer.parentNode === this.container) {
      this.container.insertBefore(this.canvas, this.overlayLayer);
    } else if (this.container) {
      this.container.appendChild(this.canvas);
    }

    this.currentFileId = null;
    this.currentPageNum = 0;
    this.totalPages = 0;
    this.pageData = null; // { width, height, image_width, image_height }
    this.entities = [];
    this.manualRedactions = {};
    this.excludedEntityIds = new Set();
    this.zoom = 1.0;

    this.onEntityToggleCallback = null;
    this.onManualRedactionChangeCallback = null;

    this.isDrawing = false;
    this.hasMoved = false;
    this.justFinishedDrawing = false;
    this.drawStartNormX = 0;
    this.drawStartNormY = 0;
    this.drawStartClientX = 0;
    this.drawStartClientY = 0;
    this.activeDrawBox = null;

    this.initEvents();
  }

  initEvents() {
    if (!this.overlayLayer) return;
    if (typeof window !== "undefined" && window.PointerEvent) {
      this.overlayLayer.addEventListener("pointerdown", (e) => this.handlePointerDown(e));
      window.addEventListener("pointermove", (e) => this.handlePointerMove(e));
      window.addEventListener("pointerup", (e) => this.handlePointerUp(e));
      window.addEventListener("pointercancel", (e) => this.handlePointerUp(e));
    } else {
      this.overlayLayer.addEventListener("mousedown", (e) => this.handleMouseDown(e));
      window.addEventListener("mousemove", (e) => this.handleMouseMove(e));
      window.addEventListener("mouseup", (e) => this.handleMouseUp(e));
    }
  }

  getManualRedactionsForPage(pageNum) {
    if (!this.manualRedactions) this.manualRedactions = {};
    const key = Number(pageNum);
    const strKey = String(pageNum);
    if (Array.isArray(this.manualRedactions[key])) return this.manualRedactions[key];
    if (Array.isArray(this.manualRedactions[strKey])) {
      this.manualRedactions[key] = this.manualRedactions[strKey];
      if (strKey !== String(key)) delete this.manualRedactions[strKey];
      return this.manualRedactions[key];
    }
    this.manualRedactions[key] = [];
    return this.manualRedactions[key];
  }

  removeManualRedaction(pageNum, index) {
    const list = this.getManualRedactionsForPage(pageNum);
    if (index >= 0 && index < list.length) {
      list.splice(index, 1);
      this.renderOverlays();
      if (this.onManualRedactionChangeCallback) {
        this.onManualRedactionChangeCallback(pageNum, list);
      }
    }
  }

  clearManualRedactionsForPage(pageNum) {
    const key = Number(pageNum);
    this.manualRedactions[key] = [];
    delete this.manualRedactions[String(pageNum)];
    this.renderOverlays();
    if (this.onManualRedactionChangeCallback) {
      this.onManualRedactionChangeCallback(pageNum, []);
    }
  }

  async loadPage(fileObj, pageNum, entities = []) {
    if (!fileObj || !fileObj.pdfDoc) return false;
    this.currentFileId = fileObj.id;
    this.currentPageNum = Number(pageNum) || 0;
    this.entities = Array.isArray(entities) ? entities : [];

    try {
      const page = await fileObj.pdfDoc.getPage(this.currentPageNum + 1);
      const baseViewport = page.getViewport({ scale: 1.0 });
      const renderScale = getSafeRenderScale(baseViewport.width, baseViewport.height, 1.65, 3000);
      const renderViewport = page.getViewport({ scale: renderScale });

      this.pageData = {
        width: baseViewport.width,
        height: baseViewport.height,
        image_width: Math.round(renderViewport.width),
        image_height: Math.round(renderViewport.height)
      };

      this.canvas.width = this.pageData.image_width;
      this.canvas.height = this.pageData.image_height;
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      await page.render({
        canvasContext: this.ctx,
        viewport: renderViewport
      }).promise;

      this.overlayLayer.style.width = "100%";
      this.overlayLayer.style.height = "100%";
      this.applyZoomStyle();
      this.renderOverlays();
      return true;
    } catch (err) {
      console.error("Failed to render PDF page in browser:", err);
      return false;
    }
  }

  applyZoomStyle() {
    if (!this.canvas || !this.pageData) return;
    if (this.container) this.container.style.transform = "none";
    const scale = this.zoom || 1.0;
    if (Math.abs(scale - 1.0) < 0.01) {
      this.canvas.style.width = `${this.pageData.image_width}px`;
      this.canvas.style.maxWidth = "100%";
    } else {
      this.canvas.style.width = `${Math.round(this.pageData.image_width * scale)}px`;
      this.canvas.style.maxWidth = "none";
    }
    this.canvas.style.height = "auto";
  }

  renderOverlays() {
    if (!this.overlayLayer) return;
    this.overlayLayer.innerHTML = "";
    if (!this.pageData || !this.pageData.width || !this.pageData.height) return;

    const pdfWidth = this.pageData.width;
    const pdfHeight = this.pageData.height;

    this.entities.forEach((entity) => {
      const isExcluded = this.excludedEntityIds.has(entity.id);
      const rects = entity.rects || [];
      const catLabel = formatCategoryLabel(entity.category);

      rects.forEach((r) => {
        if (!Array.isArray(r) || r.length < 4) return;
        const box = document.createElement("div");
        const isLowConf = Boolean(entity.lowConfidence);
        const isVision = (entity.source === "vision");
        box.className = `redact-bbox redaction-box bbox-${entity.category} ${isExcluded ? "deselected" : ""} ${isLowConf ? "bbox-low-confidence" : ""} ${isVision ? "bbox-vision-corrected" : ""}`;
        box.dataset.entityId = entity.id;

        const leftPct = (r[0] / pdfWidth) * 100;
        const topPct = (r[1] / pdfHeight) * 100;
        const widthPct = ((r[2] - r[0]) / pdfWidth) * 100;
        const heightPct = ((r[3] - r[1]) / pdfHeight) * 100;

        box.style.left = `${leftPct}%`;
        box.style.top = `${topPct}%`;
        box.style.width = `${Math.max(widthPct, 0.5)}%`;
        box.style.height = `${Math.max(heightPct, 0.4)}%`;
        const warnPrefix = isLowConf ? "⚠️ Unsichere Erkennung – " : isVision ? "👁️ Vision-KI – " : "";
        box.title = `${warnPrefix}${catLabel}: "${entity.text}" (Klicken zum Ein-/Ausschalten)`;

        box.addEventListener("click", (e) => {
          e.stopPropagation();
          if (this.justFinishedDrawing) return;
          this.toggleEntity(entity.id);
        });

        this.overlayLayer.appendChild(box);
      });
    });

    const pageManuals = this.getManualRedactionsForPage(this.currentPageNum);
    pageManuals.forEach((r, idx) => {
      if (!Array.isArray(r) || r.length < 4) return;
      const box = document.createElement("div");
      box.className = "redact-bbox redaction-box bbox-custom manual-redaction-box";
      box.dataset.manualIndex = String(idx);

      const leftPct = (r[0] / pdfWidth) * 100;
      const topPct = (r[1] / pdfHeight) * 100;
      const widthPct = ((r[2] - r[0]) / pdfWidth) * 100;
      const heightPct = ((r[3] - r[1]) / pdfHeight) * 100;

      box.style.left = `${leftPct}%`;
      box.style.top = `${topPct}%`;
      box.style.width = `${Math.max(widthPct, 0.6)}%`;
      box.style.height = `${Math.max(heightPct, 0.6)}%`;
      box.title = `Manuelle Schwärzung #${idx + 1} – Klicken zum Entfernen`;

      const delBtn = document.createElement("span");
      delBtn.className = "manual-box-delete";
      delBtn.textContent = "×";
      delBtn.title = "Klicken zum Entfernen der manuellen Schwärzung";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeManualRedaction(this.currentPageNum, idx);
      });
      box.appendChild(delBtn);

      box.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.justFinishedDrawing) return;
        this.removeManualRedaction(this.currentPageNum, idx);
      });

      this.overlayLayer.appendChild(box);
    });
  }

  toggleEntity(entityId) {
    if (this.excludedEntityIds.has(entityId)) {
      this.excludedEntityIds.delete(entityId);
    } else {
      this.excludedEntityIds.add(entityId);
    }
    this.renderOverlays();
    if (this.onEntityToggleCallback) {
      this.onEntityToggleCallback(entityId, !this.excludedEntityIds.has(entityId));
    }
  }

  handlePointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!this.pageData) return;
    if (e.target.closest(".manual-box-delete") || e.target.closest(".manual-redaction-box")) return;

    const rect = this.overlayLayer.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    if (this.overlayLayer.setPointerCapture && e.pointerId !== undefined) {
      try {
        this.overlayLayer.setPointerCapture(e.pointerId);
      } catch (_) {}
    }

    this.isDrawing = true;
    this.hasMoved = false;
    this.drawStartClientX = e.clientX;
    this.drawStartClientY = e.clientY;
    this.drawStartNormX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.drawStartNormY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  }

  handlePointerMove(e) {
    this.handleMouseMove(e);
  }

  handlePointerUp(e) {
    if (this.overlayLayer && this.overlayLayer.releasePointerCapture && e.pointerId !== undefined) {
      try {
        if (this.overlayLayer.hasPointerCapture && this.overlayLayer.hasPointerCapture(e.pointerId)) {
          this.overlayLayer.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    }
    this.handleMouseUp(e);
  }

  handleMouseDown(e) {
    this.handlePointerDown(e);
  }

  handleMouseMove(e) {
    if (!this.isDrawing || !this.pageData) return;
    const dx = Math.abs(e.clientX - this.drawStartClientX);
    const dy = Math.abs(e.clientY - this.drawStartClientY);
    if (!this.hasMoved && dx < 4 && dy < 4) return;
    this.hasMoved = true;

    const rect = this.overlayLayer.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    if (!this.activeDrawBox) {
      this.activeDrawBox = document.createElement("div");
      this.activeDrawBox.className = "drawing-rect";
      this.overlayLayer.appendChild(this.activeDrawBox);
    }

    const currentNormX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const currentNormY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    this.activeDrawBox.style.left = `${Math.min(this.drawStartNormX, currentNormX) * 100}%`;
    this.activeDrawBox.style.top = `${Math.min(this.drawStartNormY, currentNormY) * 100}%`;
    this.activeDrawBox.style.width = `${Math.abs(currentNormX - this.drawStartNormX) * 100}%`;
    this.activeDrawBox.style.height = `${Math.abs(currentNormY - this.drawStartNormY) * 100}%`;
  }

  handleMouseUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.activeDrawBox) {
      this.activeDrawBox.remove();
      this.activeDrawBox = null;
    }

    if (!this.hasMoved || !this.pageData) {
      this.hasMoved = false;
      return;
    }

    this.hasMoved = false;
    this.justFinishedDrawing = true;
    setTimeout(() => { this.justFinishedDrawing = false; }, 60);

    const rect = this.overlayLayer.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const endNormX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const endNormY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const x0Norm = Math.min(this.drawStartNormX, endNormX);
    const y0Norm = Math.min(this.drawStartNormY, endNormY);
    const x1Norm = Math.max(this.drawStartNormX, endNormX);
    const y1Norm = Math.max(this.drawStartNormY, endNormY);

    if ((x1Norm - x0Norm) * rect.width > 5 && (y1Norm - y0Norm) * rect.height > 5) {
      const pdfX0 = Math.round(x0Norm * this.pageData.width * 100) / 100;
      const pdfY0 = Math.round(y0Norm * this.pageData.height * 100) / 100;
      const pdfX1 = Math.round(x1Norm * this.pageData.width * 100) / 100;
      const pdfY1 = Math.round(y1Norm * this.pageData.height * 100) / 100;

      const pageList = this.getManualRedactionsForPage(this.currentPageNum);
      pageList.push([pdfX0, pdfY0, pdfX1, pdfY1]);

      this.renderOverlays();
      if (this.onManualRedactionChangeCallback) {
        this.onManualRedactionChangeCallback(this.currentPageNum, pageList);
      }
    }
  }

  setZoom(scale) {
    this.zoom = scale;
    this.applyZoomStyle();
  }
}

let pdfViewer = null;
let loadingTimerInterval = null;
let loadingStartTime = 0;
let loadingPhaseTimeouts = [];

// ============================================================================
// INITIALIZATION
// ============================================================================
// ============================================================================
// ACCESSIBILITY (B17): keyboard access for clickable non-buttons, dialogs with ARIA, Escape and focus
// ============================================================================
const MODAL_CLOSERS = {
  aiProviderModal: () => closeAiProviderModal(),
  modelAdvisorModal: () => closeModelAdvisorModal(),
  setupWizardModal: () => closeSetupWizard(),
};
const NATIVE_INTERACTIVE = new Set(["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "LABEL", "OPTION"]);

function makeKeyboardClickable(root) {
  const nodes = root.querySelectorAll ? root.querySelectorAll("[onclick]") : [];
  [root, ...nodes].forEach((el) => {
    if (!el.getAttribute || !el.getAttribute("onclick") || NATIVE_INTERACTIVE.has(el.tagName) || el.dataset.kbd) return;
    el.dataset.kbd = "1";
    if (!el.hasAttribute("role")) el.setAttribute("role", "button");
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
    el.addEventListener("keydown", (e) => {
      if (e.target !== el || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      el.click();
    });
  });
}

function initAccessibility() {
  makeKeyboardClickable(document.body);
  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => n.nodeType === 1 && makeKeyboardClickable(n));
  }).observe(document.body, { childList: true, subtree: true });

  document.querySelectorAll(".wizard-modal-backdrop").forEach((modal) => {
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const title = modal.querySelector(".wizard-header .wizard-title, .wizard-header h2, .wizard-header h3, .wizard-header strong");
    if (title) {
      if (!title.id) title.id = `${modal.id}Title`;
      modal.setAttribute("aria-labelledby", title.id);
    }
    // Move the focus into a dialog when it opens and back when it closes.
    let opener = null;
    new MutationObserver(() => {
      const open = modal.style.display !== "none";
      if (open && !modal.contains(document.activeElement)) {
        opener = document.activeElement;
        const first = modal.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
        if (first) first.focus();
      } else if (!open && opener && opener.focus) {
        opener.focus();
        opener = null;
      }
    }).observe(modal, { attributes: true, attributeFilter: ["style"] });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = [...document.querySelectorAll(".wizard-modal-backdrop")]
      .filter((m) => m.style.display !== "none")
      .sort((a, b) => (parseInt(getComputedStyle(b).zIndex) || 0) - (parseInt(getComputedStyle(a).zIndex) || 0));
    const top = open[0];
    if (top && MODAL_CLOSERS[top.id]) {
      e.preventDefault();
      MODAL_CLOSERS[top.id]();
    }
  });
}

function handleAppBack() {
  const open = [...document.querySelectorAll(".wizard-modal-backdrop")]
    .filter((m) => m.style.display !== "none")
    .sort((a, b) => (parseInt(getComputedStyle(b).zIndex) || 0) - (parseInt(getComputedStyle(a).zIndex) || 0));
  if (open.length > 0) {
    const top = open[0];
    if (top && MODAL_CLOSERS[top.id]) {
      MODAL_CLOSERS[top.id]();
    } else if (top) {
      top.style.display = "none";
    }
    return true;
  }
  // B-E3: the first tab (document list) is "batch"; "queue" matched no tab and left an empty page.
  if (state.currentTab && state.currentTab !== "batch") {
    switchTab("batch");
    return true;
  }
  return false;
}
if (typeof window !== "undefined") {
  window.handleAppBack = handleAppBack;
}

document.addEventListener("DOMContentLoaded", () => {
  initAccessibility();
  const originsCmd = ollamaOriginsCommand();
  document.querySelectorAll(".ollama-origins-cmd").forEach((el) => (el.textContent = originsCmd || "Keine Freigabe nötig: Ollama erlaubt diese App von Haus aus."));
  document.querySelectorAll(".ollama-origins-copy").forEach((el) => (el.style.display = originsCmd ? "" : "none"));
  checkAndMigrateAppBuildVersion();
  loadSavedSettingsFromLocalStorage();
  initViewer();
  initTheme();
  initTabs();
  initDropzone();
  initPresetSelectors();
  initSettingsForm();
  initKeyboardNavigation();
  renderAdvisorRecommendations(state.advisorVramTier || "12gb");
  syncUIFromState();
  loadAboutAndPackages();

  const wizardDone = localStorage.getItem("bmd_wizard_seen") === "true";
  if (!wizardDone) {
    setTimeout(() => {
      openSetupWizard();
    }, 250);
    runAutodiscoverOnly(false);
  } else {
    const rememberProvider = localStorage.getItem("bmd_web_remember_provider") === "true";
    if (!rememberProvider) {
      openAiProviderModal();
      runAutodiscoverOnly(false);
    } else {
      runAutodiscoverOnly(false);
    }
  }
});

function loadSavedSettingsFromLocalStorage() {
  try {
    const raw = localStorage.getItem("bmd_web_settings");
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.preset) state.settings.preset = saved.preset;
    if (saved.recognition_mode) state.settings.recognition_mode = saved.recognition_mode;
    if (saved.sensitivity) state.settings.sensitivity = saved.sensitivity;
    if (saved.redaction_strength) state.settings.redaction_strength = saved.redaction_strength;
    if (saved.filename_config) {
      Object.assign(state.settings.filename_config, saved.filename_config);
    }
    if (saved.style) Object.assign(state.settings.style, saved.style);
    if (saved.categories) {
      Object.assign(state.settings.categories, saved.categories);
      state.settings.categories.granularity = normalizeGranularity(state.settings.categories.granularity);
      state.granularity = state.settings.categories.granularity;
    }
    if (saved.ocr) {
      Object.assign(state.settings.ocr, saved.ocr);
      if (state.settings.ocr.mode === "off") {
        state.settings.ocr.mode = "auto";
      }
      if (saved.ocr.precision !== "precise") {
        state.settings.ocr.precision = (saved.recognition_mode === "precise") ? "precise" : "standard";
      }
    } else if (saved.recognition_mode === "precise") {
      state.settings.ocr.precision = "precise";
    }
    if (typeof saved.rasterize_all_pages === "boolean") {
      state.settings.rasterize_all_pages = saved.rasterize_all_pages;
    }
    if (saved.ollama) {
      if (localStorage.getItem("bmd_web_remember_provider") === "true") {
        Object.assign(state.settings.ollama, saved.ollama);
      }
    }
  } catch (e) {
    console.warn("Could not restore saved settings:", e);
  }
}

function saveSettingsToLocalStorage() {
  try {
    // B37: API keys and remote endpoint configurations stay in the browser only when the user chose "remember the AI provider".
    const toSave = JSON.parse(JSON.stringify(state.settings));
    if (localStorage.getItem("bmd_web_remember_provider") !== "true" && toSave.ollama) {
      toSave.ollama.omlx_api_key = "";
      toSave.ollama.remote_api_key = "";
      toSave.ollama.remote_endpoint = "";
      toSave.ollama.remote_api_type = "";
    }
    localStorage.setItem("bmd_web_settings", JSON.stringify(toSave));
  } catch (e) {
    console.warn("Could not persist settings:", e);
  }
}

function initViewer() {
  pdfViewer = new BrowserPDFViewer("canvasContainer", "overlayLayer");
  pdfViewer.onEntityToggleCallback = (entityId, isSelected) => {
    const activeFile = getActiveFile();
    if (activeFile) activeFile.excludedEntityIds = pdfViewer.excludedEntityIds;
    markFileChanged(activeFile);
    updateEntityItemCheckbox(entityId, isSelected);
    if (activeFile) renderPageThumbnails(activeFile);
  };
  pdfViewer.onManualRedactionChangeCallback = () => {
    const activeFile = getActiveFile();
    if (activeFile) activeFile.manualRedactions = pdfViewer.manualRedactions;
    state.manualRedactions = pdfViewer.manualRedactions;
    markFileChanged(activeFile);
    updateManualToolbarUI();
    if (activeFile) {
      renderPageThumbnails(activeFile);
      renderDetectedEntitiesList(getPageEntities(activeFile, state.currentPage));
    }
  };
}

function initKeyboardNavigation() {
  window.addEventListener("keydown", (e) => {
    if (state.currentTab !== "editor") return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;
    if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      changeEditorPage(-1);
    } else if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      changeEditorPage(1);
    }
  });
}

// ============================================================================
// DIRECT BROWSER -> LOCALHOST (127.0.0.1) & REMOTE SERVER AUTODISCOVERY
// ============================================================================
/**
 * Plain http:// is only allowed for AI servers on this device or in the home network (Ollama, LM Studio …).
 * Everything else must use https://, so documents never travel unencrypted over the internet.
 */
function isPlainHttpAllowed(rawUrl) {
  let u;
  try { u = new URL(rawUrl, window.location.href); } catch (e) { return false; }
  if (u.protocol !== "http:") return true;
  const h = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home.arpa") || h.endsWith(".ts.net")) return true;
  const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (!h.includes(":")) return false;
  return h === "::1" || h.startsWith("fe80:") || /^f[cd][0-9a-f]{2}:/.test(h);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2200) {
  if (!isPlainHttpAllowed(url)) {
    throw new Error("Unverschlüsselte Verbindung (http://) ist nur zu KI-Servern im eigenen Netz erlaubt. Bitte https:// verwenden.");
  }
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(id);
    return resp;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function runAutodiscoverOnly(showOverlay = true) {
  if (showOverlay) {
    showLoadingOverlay({
      title: "Autodiscovery: Scanne lokale KI-Dienste (127.0.0.1)...",
      subtitle: "Prüfe direkt vom Browser aus Ollama (11434), LM Studio (1234) & oMLX (1060) ohne Auto-Connect",
      fileLabel: "Prüfe Loopback-Schnittstelle 127.0.0.1...",
      useAi: false,
      initialPhase: 1,
      initialProgress: 40
    });
  }

  const ollamaEp = (document.getElementById("ollamaEndpointInput")?.value || state.settings.ollama.endpoint || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const lmstudioEp = (document.getElementById("lmstudioEndpointInput")?.value || state.settings.ollama.lmstudio_endpoint || "http://127.0.0.1:1234").replace(/\/+$/, "");
  const omlxEp = (document.getElementById("omlxEndpointInput")?.value || state.settings.ollama.omlx_endpoint || "http://127.0.0.1:1060").replace(/\/+$/, "");
  const omlxKey = (document.getElementById("omlxApiKeyInput")?.value || state.settings.ollama.omlx_api_key || "").trim();

  const ollamaRes = { available: false, models: [], count: 0, corsHint: false };
  const lmstudioRes = { available: false, models: [], count: 0 };
  const omlxRes = { available: false, models: [], count: 0, needsKey: false };

  // 1. Probe Ollama (127.0.0.1:11434/api/tags)
  try {
    const resp = await fetchWithTimeout(`${ollamaEp}/api/tags`, { method: "GET" }, 2000);
    if (resp.ok) {
      const data = await resp.json();
      const models = (data.models || []).map((m) => m.name).filter(Boolean);
      ollamaRes.available = true;
      ollamaRes.models = models;
      ollamaRes.count = models.length;
    }
  } catch (e) {
    ollamaRes.corsHint = window.location.protocol === "https:" || window.location.hostname !== "127.0.0.1";
  }

  // 2. Probe LM Studio (127.0.0.1:1234/v1/models)
  try {
    const resp = await fetchWithTimeout(`${lmstudioEp}/v1/models`, { method: "GET", headers: { Accept: "application/json" } }, 2000);
    if (resp.ok) {
      const data = await resp.json();
      const models = (data.data || []).map((m) => m.id).filter(Boolean);
      lmstudioRes.available = true;
      lmstudioRes.models = models;
      lmstudioRes.count = models.length;
    }
  } catch (e) {
    // LM Studio not running or CORS not enabled
  }

  // 3. Probe oMLX (127.0.0.1:1060/v1/models)
  try {
    const headers = { Accept: "application/json" };
    if (omlxKey) headers.Authorization = `Bearer ${omlxKey}`;
    const resp = await fetchWithTimeout(`${omlxEp}/v1/models`, { method: "GET", headers }, 2000);
    if (resp.ok) {
      const data = await resp.json();
      const models = (data.data || []).map((m) => m.id).filter(Boolean);
      omlxRes.available = true;
      omlxRes.models = models;
      omlxRes.count = models.length;
    } else if (resp.status === 401) {
      omlxRes.available = true;
      omlxRes.needsKey = true;
    }
  } catch (e) {
    // not running or blocked
  }

  state.aiDiscovery = {
    ...state.aiDiscovery,
    scanned: true,
    ollama: ollamaRes,
    lmstudio: lmstudioRes,
    omlx: omlxRes
  };

  updateAIUI();

  if (showOverlay) {
    setLoadingPhase(4, { progressPct: 100, subtitle: "Autodiscovery abgeschlossen!" });
    await new Promise((r) => setTimeout(r, 240));
    hideLoadingOverlay();

    const found = [];
    if (ollamaRes.available) found.push(`🦙 Ollama (${ollamaRes.count} Modelle)`);
    if (lmstudioRes.available) found.push(`🎸 LM Studio (${lmstudioRes.count} Modelle)`);
    if (omlxRes.available) found.push(omlxRes.needsKey ? "🍏 oMLX (API-Key nötig)" : `🍏 oMLX (${omlxRes.count} Modelle)`);

    if (found.length > 0) {
      showToast(`Erkannt: ${found.join(", ")}. Wähle deinen gewünschten Modus aus!`, "success");
    } else {
      showToast("Kein lokaler Server auf 127.0.0.1 erkannt – 100% Browser-Modus steht sofort bereit oder lade Ollama/LM Studio herunter!", "info");
    }
  }
}

function syncRemoteInputs(source) {
  let url = state.settings.ollama.remote_endpoint || "";
  let apiType = state.settings.ollama.remote_api_type || "openai";
  let apiKey = state.settings.ollama.remote_api_key || "";

  if (source === "quick") {
    url = document.getElementById("quickRemoteUrlInput")?.value || url;
    apiType = document.getElementById("quickRemoteApiTypeSelect")?.value || apiType;
    apiKey = document.getElementById("quickRemoteApiKeyInput")?.value || "";
  } else if (source === "modal") {
    url = document.getElementById("modalRemoteUrlInput")?.value || url;
    apiType = document.getElementById("modalRemoteApiTypeSelect")?.value || apiType;
    apiKey = document.getElementById("modalRemoteApiKeyInput")?.value || "";
  } else if (source === "settings") {
    url = document.getElementById("remoteEndpointInput")?.value || url;
    apiType = document.getElementById("remoteApiTypeSelect")?.value || apiType;
    apiKey = document.getElementById("remoteApiKeyInput")?.value || "";
  }

  state.settings.ollama.remote_endpoint = url.trim();
  state.settings.ollama.remote_api_type = apiType;
  state.settings.ollama.remote_api_key = apiKey.trim();

  const ids = [
    ["quickRemoteUrlInput", state.settings.ollama.remote_endpoint],
    ["modalRemoteUrlInput", state.settings.ollama.remote_endpoint],
    ["remoteEndpointInput", state.settings.ollama.remote_endpoint],
    ["quickRemoteApiTypeSelect", state.settings.ollama.remote_api_type],
    ["modalRemoteApiTypeSelect", state.settings.ollama.remote_api_type],
    ["remoteApiTypeSelect", state.settings.ollama.remote_api_type],
    ["quickRemoteApiKeyInput", state.settings.ollama.remote_api_key],
    ["modalRemoteApiKeyInput", state.settings.ollama.remote_api_key],
    ["remoteApiKeyInput", state.settings.ollama.remote_api_key]
  ];

  ids.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el && el !== document.activeElement && el.value !== val) {
      el.value = val;
    }
  });
}

async function probeRemoteAiServer(showFeedback = true) {
  syncRemoteInputs();
  const rawEp = (state.settings.ollama.remote_endpoint || "").trim().replace(/\/+$/, "");
  if (!rawEp) {
    showToast("Bitte zuerst eine gültige Server-URL eingeben (z.B. http://192.168.1.100:11434).", "warning");
    return;
  }

  // B-U8: a blocked plain-http address was reported as "nicht erreichbar … CORS"; say why it is refused instead.
  if (!isPlainHttpAllowed(rawEp)) {
    state.aiDiscovery.remote = { available: false, blocked: true, models: [], count: 0, lastCheckedUrl: rawEp };
    updateAIUI();
    syncAiProviderSelectionUI();
    if (showFeedback) {
      showToast(`${rawEp} wird nicht verwendet: Unverschlüsselte Verbindungen (http://) sind nur zu KI-Servern im eigenen Netz erlaubt. Bitte https:// verwenden.`, "warning");
    }
    return;
  }

  const preferredType = state.settings.ollama.remote_api_type || "openai";
  const apiKey = state.settings.ollama.remote_api_key || "";
  const headers = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let detectedModels = [];
  let workingType = preferredType;
  let reachable = false;

  const tryOpenAi = async () => {
    const resp = await fetchWithTimeout(`${rawEp}/v1/models`, { method: "GET", headers }, 3000);
    if (resp.ok) {
      const data = await resp.json();
      detectedModels = (data.data || []).map((m) => m.id).filter(Boolean);
      workingType = "openai";
      reachable = true;
    }
  };

  const tryOllama = async () => {
    const resp = await fetchWithTimeout(`${rawEp}/api/tags`, { method: "GET" }, 3000);
    if (resp.ok) {
      const data = await resp.json();
      detectedModels = (data.models || []).map((m) => m.name).filter(Boolean);
      workingType = "ollama";
      reachable = true;
    }
  };

  try {
    if (preferredType === "ollama") {
      await tryOllama();
      if (!reachable) await tryOpenAi();
    } else {
      await tryOpenAi();
      if (!reachable) await tryOllama();
    }
  } catch (e) {
    // fallback if first probe threw
    try {
      if (preferredType === "ollama") await tryOpenAi();
      else await tryOllama();
    } catch (_) {
      // unreachable
    }
  }

  state.settings.ollama.remote_api_type = workingType;
  syncRemoteInputs();

  state.aiDiscovery.remote = {
    available: reachable,
    models: detectedModels,
    count: detectedModels.length,
    lastCheckedUrl: rawEp
  };

  if (reachable) {
    const firstModel = detectedModels[0] ? `remote::${detectedModels[0]}` : "remote::default";
    selectAiProvider("remote", firstModel);
    updateAIUI();
    if (showFeedback) {
      showToast(`KI-Server unter ${rawEp} erreicht (${detectedModels.length} Modell(e) über ${workingType.toUpperCase()}-API erkannt)!`, "success");
    }
  } else {
    updateAIUI();
    syncAiProviderSelectionUI();
    if (showFeedback) {
      showToast(`Server unter ${rawEp} nicht erreichbar. Prüfe IP, Port und CORS-Freigabe auf dem Zielrechner.`, "warning");
    }
  }
}

function updateAIUI() {
  const { ollama: ollamaInfo, lmstudio: lmstudioInfo, omlx: omlxInfo, remote: remoteInfo } = state.aiDiscovery;
  const ollamaOk = Boolean(ollamaInfo?.available);
  const lmstudioOk = Boolean(lmstudioInfo?.available);
  const omlxOk = Boolean(omlxInfo?.available);
  const remoteOk = Boolean(remoteInfo?.available);
  const anyLocalFound = ollamaOk || lmstudioOk || omlxOk || remoteOk;

  // 1. Ollama Modal UI
  const modalOllamaBadge = document.getElementById("modalOllamaBadge");
  const modalOllamaSub = document.getElementById("modalOllamaSubtitle");
  const modalOllamaSelect = document.getElementById("modalOllamaModelSelect");

  if (modalOllamaBadge) {
    modalOllamaBadge.innerHTML = ollamaOk
      ? `<span class="badge-dot dot-green"></span> Erkannt (${ollamaInfo.count} Modelle)`
      : `<span class="badge-dot dot-yellow"></span> Nicht erreicht`;
  }
  if (modalOllamaSub) {
    modalOllamaSub.textContent = ollamaOk
      ? `Erreichbar auf 127.0.0.1:11434 • ${ollamaInfo.count} Modelle bereit`
      : "http://127.0.0.1:11434 (Nicht gestartet oder CORS in Ollama noch nicht freigegeben)";
  }
  if (modalOllamaSelect) {
    modalOllamaSelect.innerHTML = "";
    if (ollamaInfo.models && ollamaInfo.models.length > 0) {
      ollamaInfo.models.forEach((mName) => {
        const fullId = mName.startsWith("ollama::") ? mName : `ollama::${mName}`;
        const opt = document.createElement("option");
        opt.value = fullId;
        opt.textContent = mName;
        if (state.settings.ollama.model === fullId) opt.selected = true;
        modalOllamaSelect.appendChild(opt);
      });
    } else {
      modalOllamaSelect.innerHTML = `<option value="ollama::qwen2.5:7b-instruct">Standard (qwen2.5:7b-instruct) – Klicke auf Autodiscovery</option>`;
    }
  }

  // 2. LM Studio Modal UI
  const modalLmstudioBadge = document.getElementById("modalLmstudioBadge");
  const modalLmstudioSub = document.getElementById("modalLmstudioSubtitle");
  const modalLmstudioSelect = document.getElementById("modalLmstudioModelSelect");

  if (modalLmstudioBadge) {
    modalLmstudioBadge.innerHTML = lmstudioOk
      ? `<span class="badge-dot dot-green"></span> Erkannt (${lmstudioInfo.count} Modelle)`
      : `<span class="badge-dot dot-yellow"></span> Nicht erreicht`;
  }
  if (modalLmstudioSub) {
    modalLmstudioSub.textContent = lmstudioOk
      ? `Erreichbar auf 127.0.0.1:1234 • ${lmstudioInfo.count} Modelle bereit`
      : "http://127.0.0.1:1234 (Local Server in LM Studio auf Port 1234 starten)";
  }
  if (modalLmstudioSelect) {
    modalLmstudioSelect.innerHTML = "";
    if (lmstudioInfo.models && lmstudioInfo.models.length > 0) {
      lmstudioInfo.models.forEach((mName) => {
        const fullId = mName.startsWith("lmstudio::") ? mName : `lmstudio::${mName}`;
        const opt = document.createElement("option");
        opt.value = fullId;
        opt.textContent = mName;
        if (state.settings.ollama.model === fullId) opt.selected = true;
        modalLmstudioSelect.appendChild(opt);
      });
    } else {
      modalLmstudioSelect.innerHTML = `<option value="lmstudio::default">LM Studio Standardmodell – Klicke auf Autodiscovery</option>`;
    }
  }

  // 3. oMLX Modal UI
  const modalOmlxBadge = document.getElementById("modalOmlxBadge");
  const modalOmlxSub = document.getElementById("modalOmlxSubtitle");
  const modalOmlxSelect = document.getElementById("modalOmlxModelSelect");

  if (modalOmlxBadge) {
    modalOmlxBadge.innerHTML = omlxOk
      ? `<span class="badge-dot dot-green"></span> ${omlxInfo.needsKey ? "Port 1060 aktiv (API-Key)" : `Erkannt (${omlxInfo.count} Modelle)`}`
      : `<span class="badge-dot dot-yellow"></span> Nicht erreicht`;
  }
  if (modalOmlxSub) {
    modalOmlxSub.textContent = omlxOk
      ? (omlxInfo.needsKey ? "127.0.0.1:1060 aktiv – Bitte optionalen oMLX API-Key eingeben" : `Erreichbar auf 127.0.0.1:1060 • ${omlxInfo.count} Modelle bereit`)
      : "http://127.0.0.1:1060 (Nicht gestartet)";
  }
  if (modalOmlxSelect) {
    modalOmlxSelect.innerHTML = "";
    if (omlxInfo.models && omlxInfo.models.length > 0) {
      omlxInfo.models.forEach((mName) => {
        const fullId = mName.startsWith("omlx::") ? mName : `omlx::${mName}`;
        const opt = document.createElement("option");
        opt.value = fullId;
        opt.textContent = mName;
        if (state.settings.ollama.model === fullId) opt.selected = true;
        modalOmlxSelect.appendChild(opt);
      });
    } else {
      modalOmlxSelect.innerHTML = `<option value="omlx::default">oMLX Standardmodell – Klicke auf Autodiscovery</option>`;
    }
  }

  // 4. Remote Server Modal & Quick UI
  const modalRemoteBadge = document.getElementById("modalRemoteBadge");
  const quickRemoteBadge = document.getElementById("quickRemoteStatusBadge");
  const modalRemoteSelect = document.getElementById("modalRemoteModelSelect");
  const remoteBadgeHtml = remoteOk
    ? `<span class="badge-dot dot-green"></span> Verbunden (${remoteInfo.count} Modelle)`
    : `<span class="badge-dot dot-yellow"></span> Manuelle URL`;

  if (modalRemoteBadge) modalRemoteBadge.innerHTML = remoteBadgeHtml;
  if (quickRemoteBadge) quickRemoteBadge.innerHTML = remoteBadgeHtml;

  if (modalRemoteSelect) {
    modalRemoteSelect.innerHTML = "";
    if (remoteInfo?.models && remoteInfo.models.length > 0) {
      remoteInfo.models.forEach((mName) => {
        const fullId = mName.startsWith("remote::") ? mName : `remote::${mName}`;
        const opt = document.createElement("option");
        opt.value = fullId;
        opt.textContent = mName;
        if (state.settings.ollama.model === fullId) opt.selected = true;
        modalRemoteSelect.appendChild(opt);
      });
    } else {
      modalRemoteSelect.innerHTML = `<option value="remote::default">Nach Server-Prüfung Modell auswählen...</option>`;
    }
  }

  // Quick Bar Meta Texts
  const quickOllamaMeta = document.getElementById("quickOllamaDetectedMeta");
  if (quickOllamaMeta) {
    quickOllamaMeta.textContent = ollamaOk ? `🟢 Erkannt (${ollamaInfo.count} Modelle)` : "⚪ Lokal Port 11434";
  }
  const quickLmstudioMeta = document.getElementById("quickLmstudioDetectedMeta");
  if (quickLmstudioMeta) {
    quickLmstudioMeta.textContent = lmstudioOk ? `🟢 Erkannt (${lmstudioInfo.count} Modelle)` : "⚪ Lokal Port 1234";
  }
  const quickOmlxMeta = document.getElementById("quickOmlxDetectedMeta");
  if (quickOmlxMeta) {
    quickOmlxMeta.textContent = omlxOk ? `🟢 Erkannt (${omlxInfo.count} Modelle)` : "⚪ Lokal Port 1060";
  }
  const quickRemoteMeta = document.getElementById("quickRemoteDetectedMeta");
  if (quickRemoteMeta) {
    quickRemoteMeta.textContent = remoteOk
      ? `🟢 ${remoteInfo.lastCheckedUrl || "Verbunden"} (${remoteInfo.count})`
      : "Manuelle Server-URL eingeben";
  }

  // Highlight download boxes when no local AI is detected
  const modalDownloadBox = document.getElementById("modalNoAiDownloadBox");
  if (modalDownloadBox) {
    modalDownloadBox.style.borderColor = anyLocalFound ? "var(--border-color)" : "rgba(16, 185, 129, 0.55)";
  }

  // Wizard Step 4 Badges
  const wizOllamaBadge = document.getElementById("wizardOllamaBadge");
  const wizLmstudioBadge = document.getElementById("wizardLmstudioBadge");
  const wizOmlxBadge = document.getElementById("wizardOmlxBadge");
  if (wizOllamaBadge) {
    wizOllamaBadge.innerHTML = ollamaOk
      ? `<span class="badge-dot dot-green"></span> Erkannt (${ollamaInfo.count} Modelle)`
      : `<span class="badge-dot dot-yellow"></span> Nicht erkannt`;
  }
  if (wizLmstudioBadge) {
    wizLmstudioBadge.innerHTML = lmstudioOk
      ? `<span class="badge-dot dot-green"></span> Erkannt (${lmstudioInfo.count} Modelle)`
      : `<span class="badge-dot dot-yellow"></span> Nicht erkannt`;
  }
  if (wizOmlxBadge) {
    wizOmlxBadge.innerHTML = omlxOk
      ? `<span class="badge-dot dot-green"></span> Erkannt (${omlxInfo.count} Modelle)`
      : `<span class="badge-dot dot-yellow"></span> Nicht erkannt`;
  }

  syncAiProviderSelectionUI();
}

function selectAiProvider(provider, explicitModel = null) {
  const allowed = ["none", "ollama", "lmstudio", "omlx", "remote"];
  const normProvider = allowed.includes(provider) ? provider : "none";
  state.settings.ollama.provider = normProvider;

  if (normProvider === "none") {
    state.settings.ollama.enabled = false;
    state.settings.ollama.model = "";
  } else {
    state.settings.ollama.enabled = true;
    if (explicitModel) {
      state.settings.ollama.model = explicitModel;
    } else if (normProvider === "ollama") {
      const list = (state.aiDiscovery.ollama?.models || []).map((m) => m.startsWith("ollama::") ? m : `ollama::${m}`);
      if (!state.settings.ollama.model.startsWith("ollama::")) {
        state.settings.ollama.model = list[0] || "ollama::qwen2.5:7b-instruct";
      }
    } else if (normProvider === "lmstudio") {
      const list = (state.aiDiscovery.lmstudio?.models || []).map((m) => m.startsWith("lmstudio::") ? m : `lmstudio::${m}`);
      if (!state.settings.ollama.model.startsWith("lmstudio::")) {
        state.settings.ollama.model = list[0] || "lmstudio::default";
      }
    } else if (normProvider === "omlx") {
      const list = (state.aiDiscovery.omlx?.models || []).map((m) => m.startsWith("omlx::") ? m : `omlx::${m}`);
      if (!state.settings.ollama.model.startsWith("omlx::")) {
        state.settings.ollama.model = list[0] || "omlx::default";
      }
    } else if (normProvider === "remote") {
      const list = (state.aiDiscovery.remote?.models || []).map((m) => m.startsWith("remote::") ? m : `remote::${m}`);
      if (!state.settings.ollama.model.startsWith("remote::")) {
        state.settings.ollama.model = list[0] || "remote::default";
      }
    }
  }

  syncAiProviderSelectionUI();
  saveSettingsToLocalStorage();
}

function onProviderModelChange(modelValue) {
  if (!modelValue) return;
  state.settings.ollama.model = modelValue;
  if (modelValue.startsWith("ollama::")) {
    state.settings.ollama.provider = "ollama";
    state.settings.ollama.enabled = true;
  } else if (modelValue.startsWith("lmstudio::")) {
    state.settings.ollama.provider = "lmstudio";
    state.settings.ollama.enabled = true;
  } else if (modelValue.startsWith("omlx::")) {
    state.settings.ollama.provider = "omlx";
    state.settings.ollama.enabled = true;
  } else if (modelValue.startsWith("remote::")) {
    state.settings.ollama.provider = "remote";
    state.settings.ollama.enabled = true;
  }
  syncAiProviderSelectionUI();
  saveSettingsToLocalStorage();
}

function onAiEnableCheckboxChange(checked) {
  state.settings.ollama.enabled = Boolean(checked);
  if (!checked) {
    state.settings.ollama.provider = "none";
  } else if (state.settings.ollama.provider === "none") {
    if (state.aiDiscovery.lmstudio?.available && !state.aiDiscovery.ollama?.available) {
      state.settings.ollama.provider = "lmstudio";
    } else if (state.aiDiscovery.omlx?.available && !state.aiDiscovery.ollama?.available) {
      state.settings.ollama.provider = "omlx";
    } else {
      state.settings.ollama.provider = "ollama";
    }
    selectAiProvider(state.settings.ollama.provider);
    return;
  }
  syncAiProviderSelectionUI();
  saveSettingsToLocalStorage();
}

function syncAiProviderSelectionUI() {
  const provider = state.settings.ollama.provider || "none";
  const enabled = Boolean(state.settings.ollama.enabled) && provider !== "none";
  const currentModel = state.settings.ollama.model || "";

  const badge = document.getElementById("ollamaStatusBadge");
  if (badge) {
    if (!enabled || provider === "none") {
      badge.innerHTML = `<span class="badge-dot dot-green"></span> Modus: ⚡ 100% Browser (Ohne KI)`;
    } else if (provider === "ollama") {
      const shortModel = currentModel.replace(/^ollama::/, "") || "Lokal :11434";
      badge.innerHTML = `<span class="badge-dot dot-green"></span> KI: 🦙 Ollama (${escapeHtml(shortModel)})`;
    } else if (provider === "lmstudio") {
      const shortModel = currentModel.replace(/^lmstudio::/, "") || "Lokal :1234";
      badge.innerHTML = `<span class="badge-dot dot-green"></span> KI: 🎸 LM Studio (${escapeHtml(shortModel)})`;
    } else if (provider === "omlx") {
      const shortModel = currentModel.replace(/^omlx::/, "") || "Lokal :1060";
      badge.innerHTML = `<span class="badge-dot dot-green"></span> KI: 🍏 oMLX (${escapeHtml(shortModel)})`;
    } else if (provider === "remote") {
      const shortModel = currentModel.replace(/^remote::/, "") || state.settings.ollama.remote_endpoint;
      // B-U8: green only while the last check of this address did not fail.
      const remoteInfo = state.aiDiscovery.remote;
      const endpoint = (state.settings.ollama.remote_endpoint || "").trim().replace(/\/+$/, "");
      const failed = Boolean(endpoint && remoteInfo && remoteInfo.available === false && remoteInfo.lastCheckedUrl === endpoint);
      const note = !failed ? "" : remoteInfo.blocked ? " – blockiert (http)" : " – nicht erreichbar";
      badge.innerHTML = `<span class="badge-dot ${failed ? "dot-red" : "dot-green"}"></span> KI: 🌐 Remote (${escapeHtml(shortModel)})${note}`;
    }
  }

  document.querySelectorAll("[data-ai-provider-btn]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.aiProviderBtn === provider);
  });

  document.querySelectorAll("[data-modal-provider]").forEach((card) => {
    card.classList.toggle("active", card.dataset.modalProvider === provider);
  });

  const quickRemotePanel = document.getElementById("quickRemoteServerPanel");
  if (quickRemotePanel) {
    quickRemotePanel.style.display = provider === "remote" ? "block" : "none";
  }

  const quickRow = document.getElementById("quickAiModelRow");
  if (quickRow) {
    quickRow.style.display = (enabled && ["ollama", "lmstudio", "omlx", "remote"].includes(provider)) ? "flex" : "none";
  }

  let providerModels = [];
  if (provider === "ollama") {
    providerModels = (state.aiDiscovery.ollama?.models || []).map((m) => ({
      id: m.startsWith("ollama::") ? m : `ollama::${m}`,
      label: `🦙 Ollama: ${m.replace(/^ollama::/, "")}`
    }));
  } else if (provider === "lmstudio") {
    providerModels = (state.aiDiscovery.lmstudio?.models || []).map((m) => ({
      id: m.startsWith("lmstudio::") ? m : `lmstudio::${m}`,
      label: `🎸 LM Studio: ${m.replace(/^lmstudio::/, "")}`
    }));
  } else if (provider === "omlx") {
    providerModels = (state.aiDiscovery.omlx?.models || []).map((m) => ({
      id: m.startsWith("omlx::") ? m : `omlx::${m}`,
      label: `🍏 oMLX: ${m.replace(/^omlx::/, "")}`
    }));
  } else if (provider === "remote") {
    providerModels = (state.aiDiscovery.remote?.models || []).map((m) => ({
      id: m.startsWith("remote::") ? m : `remote::${m}`,
      label: `🌐 Remote: ${m.replace(/^remote::/, "")}`
    }));
  }

  [document.getElementById("quickAiModelSelect"), document.getElementById("ollamaModelSelect")].forEach((sel) => {
    if (!sel) return;
    sel.innerHTML = "";
    if (!enabled) {
      sel.innerHTML = `<option value="">100% Browser-Modus (Ohne KI)</option>`;
      return;
    }
    if (providerModels.length === 0) {
      const fallbackVal = currentModel || `${provider}::default`;
      sel.innerHTML = `<option value="${escapeHtml(fallbackVal)}">Standardmodell (${provider.toUpperCase()}) – Klicke auf Autodiscovery / Server prüfen</option>`;
      return;
    }
    providerModels.forEach((pm) => {
      const opt = document.createElement("option");
      opt.value = pm.id;
      opt.textContent = pm.label;
      if (pm.id === currentModel) opt.selected = true;
      sel.appendChild(opt);
    });
  });

  const aiProviderSelectEl = document.getElementById("aiProviderSelect");
  if (aiProviderSelectEl) aiProviderSelectEl.value = provider;

  const ollamaEnableEl = document.getElementById("ollamaEnableCheckbox");
  if (ollamaEnableEl) ollamaEnableEl.checked = enabled;
}

function openAiProviderModal() {
  syncAiProviderSelectionUI();
  syncRemoteInputs();
  const rememberCb = document.getElementById("rememberProviderStartupCheckbox");
  if (rememberCb) {
    rememberCb.checked = localStorage.getItem("bmd_web_remember_provider") === "true";
  }
  const modal = document.getElementById("aiProviderModal");
  if (modal) modal.style.display = "flex";
}

function closeAiProviderModal() {
  const modal = document.getElementById("aiProviderModal");
  if (modal) modal.style.display = "none";
}

function confirmAiProviderModal() {
  const omlxKeyInput = document.getElementById("modalOmlxApiKeyInput");
  if (omlxKeyInput && omlxKeyInput.value.trim()) {
    state.settings.ollama.omlx_api_key = omlxKeyInput.value.trim();
    const settingsKeyInput = document.getElementById("omlxApiKeyInput");
    if (settingsKeyInput) settingsKeyInput.value = state.settings.ollama.omlx_api_key;
  }

  syncRemoteInputs("modal");

  const rememberCb = document.getElementById("rememberProviderStartupCheckbox");
  if (rememberCb && rememberCb.checked) {
    localStorage.setItem("bmd_web_remember_provider", "true");
  } else {
    localStorage.removeItem("bmd_web_remember_provider");
  }
  saveSettingsToLocalStorage();
  closeAiProviderModal();

  const p = state.settings.ollama.provider;
  if (p === "ollama") {
    showToast("KI-Provider gewählt: 🦙 Lokales Ollama (127.0.0.1:11434)", "success");
  } else if (p === "lmstudio") {
    showToast("KI-Provider gewählt: 🎸 Lokales LM Studio (127.0.0.1:1234)", "success");
  } else if (p === "omlx") {
    showToast("KI-Provider gewählt: 🍏 Lokales oMLX (127.0.0.1:1060)", "success");
  } else if (p === "remote") {
    showToast(`KI-Provider gewählt: 🌐 Externer KI-Server (${state.settings.ollama.remote_endpoint})`, "success");
  } else {
    showToast("⚡ 100% Browser-Modus aktiv: Sofort einsatzbereit ohne lokalen Server!", "success");
  }
}

/**
 * Command that lets Ollama accept requests from this page, for the system this page runs on (B15). It names this
 * page's own origin instead of "*", which would let every website use the local Ollama. The Mac app (app://) and
 * the Windows app (http://127.0.0.1:47811) need no command: Ollama allows these origins by default. On Android Ollama runs on
 * another computer, whose system is unknown, so the macOS form is shown with a note.
 */
function ollamaOriginsCommand() {
  const origin = window.location.origin;
  if (!/^https?:/.test(origin)) return "";
  // Pages on this computer (Windows app on http://127.0.0.1:47811) are allowed by Ollama by default.
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return "";
  const ua = navigator.userAgent || "";
  if (/Windows/i.test(ua)) return `setx OLLAMA_ORIGINS "${origin}"`;
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return `sudo systemctl edit ollama  →  Environment="OLLAMA_ORIGINS=${origin}"`;
  return `launchctl setenv OLLAMA_ORIGINS "${origin}"`;
}

function copyCorsCommand(cmd = ollamaOriginsCommand()) {
  navigator.clipboard.writeText(cmd).then(() => {
    showToast("Befehl in die Zwischenablage kopiert!", "success");
  });
}

// ============================================================================
// KI-MODELL BERATER ("Welches KI-Modell soll ich nutzen?" + Hardware Check)
// ============================================================================
function openModelAdvisorModal() {
  renderAdvisorRecommendations(state.advisorVramTier || "12gb");
  const modal = document.getElementById("modelAdvisorModal");
  if (modal) modal.style.display = "flex";
}

function closeModelAdvisorModal() {
  const modal = document.getElementById("modelAdvisorModal");
  if (modal) modal.style.display = "none";
}

function selectAdvisorVramTier(tier) {
  const norm = ADVISOR_VRAM_PROFILES[tier] ? tier : "12gb";
  state.advisorVramTier = norm;
  renderAdvisorRecommendations(norm);
}

function renderAdvisorRecommendations(tier) {
  const norm = ADVISOR_VRAM_PROFILES[tier] ? tier : "12gb";
  const profile = ADVISOR_VRAM_PROFILES[norm];

  document.querySelectorAll("[data-vram-tier-btn]").forEach((btn) => {
    const isActive = btn.dataset.vramTierBtn === norm;
    btn.className = isActive ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm";
  });

  const badge = document.getElementById("advisorActiveTierBadge");
  if (badge) {
    badge.textContent = profile.label;
  }

  const container = document.getElementById("advisorRecommendationsContainer");
  if (!container) return;

  container.innerHTML = profile.cards.map((c) => `
    <div style="padding: 0.9rem 1.05rem; background: var(--bg-secondary); border: 1.5px solid var(--border-color); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 0.45rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <strong style="font-size: 0.94rem; color: var(--text-primary);">${escapeHtml(c.tier)}</strong>
        <div style="display: flex; gap: 0.4rem; align-items: center;">
          <span class="status-badge" style="font-size: 0.7rem;">${escapeHtml(c.vram)}</span>
          <span class="status-badge" style="font-size: 0.7rem; color: var(--accent-light);">${escapeHtml(c.speed)}</span>
        </div>
      </div>
      <p style="font-size: 0.81rem; color: var(--text-secondary); margin: 0;">
        ${escapeHtml(c.desc)}
      </p>
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.25rem; padding-top: 0.45rem; border-top: 1px solid var(--border-color); font-size: 0.78rem;">
        <div>
          <span style="color: var(--text-secondary);">🦙 Ollama:</span> <code>${escapeHtml(c.ollamaModel)}</code>
          <span style="color: var(--text-muted); margin: 0 0.35rem;">|</span>
          <span style="color: var(--text-secondary);">Alternative:</span> <code>${escapeHtml(c.altModel)}</code>
          <span style="color: var(--text-muted); margin: 0 0.35rem;">|</span>
          <span style="color: var(--text-secondary);">🎸 LM Studio:</span> <code>${escapeHtml(c.lmstudioModel)}</code>
        </div>
        <div style="display: flex; gap: 0.4rem;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="copyCorsCommand('ollama run ${escapeHtml(c.ollamaModel)}')">
            📋 „ollama run ${escapeHtml(c.ollamaModel)}“ kopieren
          </button>
        </div>
      </div>
    </div>
  `).join("");
}

function runHardwareAdvisorCheck() {
  const resultBox = document.getElementById("hardwareCheckResultBox");
  let gpuRenderer = "Standard WebGL GPU";
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        gpuRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || gpuRenderer;
      } else {
        gpuRenderer = gl.getParameter(gl.RENDERER) || gpuRenderer;
      }
    }
  } catch (e) {
    // ignore WebGL error
  }

  const cores = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} logische CPU-Kerne` : "CPU-Kerne unbekannt";
  const devMem = navigator.deviceMemory ? `~${navigator.deviceMemory}+ GB Browser-RAM-Klasse` : "RAM-Klasse durch Browser geschützt";
  const rLower = gpuRenderer.toLowerCase();

  let suggestedTier = "12gb";
  let reason = "Standard-Empfehlung für 12 GB VRAM (bestes Verhältnis aus Geschwindigkeit & Qualität).";

  if (/rtx\s*(3090|4090|5090)|radeon\s*rx\s*7900\s*xtx|m[1234]\s*(max|ultra)/i.test(rLower)) {
    suggestedTier = "24gb";
    reason = "High-End GPU / Apple Silicon Max/Ultra erkannt – 24+ GB VRAM Modelle (z.B. Qwen2.5-32B) sind problemlos möglich!";
  } else if (/m[1234]\s*pro|rtx\s*(4080|4070\s*ti\s*super|3080\s*ti)|rx\s*(7800|7900|6800|6900)/i.test(rLower)) {
    suggestedTier = "16gb";
    reason = "Leistungsstarke 16 GB GPU / Apple Silicon Pro erkannt – 12B bis 14B Modelle laufen mit sehr hoher Geschwindigkeit!";
  } else if (/rtx\s*(3060|4070|3080|2080\s*ti|4060\s*ti)|rx\s*(6700|6750|7700)|apple\s*m[1234]/i.test(rLower)) {
    suggestedTier = "12gb";
    reason = "12 GB VRAM Klasse bzw. Apple Silicon erkannt – Qwen2.5-7B (Balance) und Qwen2.5-14B (Max. Qualität) passen optimal!";
  } else if (/intel|iris|uhd|gtx\s*16|rtx\s*(3050|2060|4050)/i.test(rLower) || (navigator.deviceMemory && navigator.deviceMemory <= 8)) {
    suggestedTier = "8gb";
    reason = "Kompakte GPU / 8 GB Klasse erkannt – wir empfehlen schnelle, speichersparende 3B bis 7B (Q4) Modelle.";
  }

  selectAdvisorVramTier(suggestedTier);

  if (resultBox) {
    resultBox.style.display = "block";
    resultBox.innerHTML = `
      <div><strong>🖥️ Lokal erkannte Hardware-Hinweise (100% im Browser, keine Daten gesendet):</strong></div>
      <div style="margin-top: 0.25rem; color: var(--text-secondary);">
        • <strong>GPU / Grafik-Renderer:</strong> <code>${escapeHtml(gpuRenderer)}</code><br>
        • <strong>Prozessor &amp; Speicher-Hinweis:</strong> ${escapeHtml(cores)} • ${escapeHtml(devMem)}
      </div>
      <div style="margin-top: 0.4rem; color: var(--accent-light); font-weight: 600;">
        👉 Automatisch gewähltes Profil: ${escapeHtml(reason)}
      </div>
    `;
  }
  showToast("Lokale Geräteprüfung abgeschlossen – Modell-Empfehlung angepasst!", "success");
}

// ============================================================================
// PDF.JS WORD EXTRACTION & ROBUST OCR ENGINE (LOCAL VENDOR, OFFLINE)
// ============================================================================
// Parallel OCR: the page is cut into horizontal stripes, one Tesseract worker per stripe.
// Each worker holds its own copy of the language data and of its stripe (B16): 2 on Android and on devices
// with 4 GB or less, otherwise up to 4 depending on the CPU.
const IS_ANDROID_APP = (window.__bmdHost && window.__bmdHost.platform === "android") || window.location.hostname === "appassets.androidplatform.net" || /Android/i.test(navigator.userAgent || "");
const OCR_POOL_SIZE = (IS_ANDROID_APP || (navigator.deviceMemory && navigator.deviceMemory <= 4))
  ? 2
  : Math.max(2, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2)));
let _bmdWorkerPool = [];
let _bmdWorkerPoolLang = null;
// B24: a pool that failed to start for a language/precision is not retried on every page.
let _bmdPoolFailedKey = null;
let _bmdActiveProgressCallback = null;

async function terminateOcrWorker() {
  if (_bmdWorkerPool.length > 0) {
    for (const w of _bmdWorkerPool) {
      try { await w.terminate(); } catch (_) {}
    }
    _bmdWorkerPool = [];
    _bmdWorkerPoolLang = null;
  }
}

async function runTesseractOcrOnCanvas(canvas, lang = "deu", progressCallback = null) {
  if (!window.Tesseract) {
    const errMsg = "Tesseract.js OCR-Bibliothek nicht geladen";
    showOcrInfobox("⚠️ <strong>OCR-Engine nicht geladen:</strong> Bitte Seite neu laden oder Netzwerkverbindung prüfen.", "warning");
    throw new Error(errMsg);
  }

  _bmdActiveProgressCallback = progressCallback;

  // Determine current page origin / base URL safely (ensuring trailing slash)
  let baseUrl = window.location.href.split("?")[0].split("#")[0];
  if (!baseUrl.endsWith("/")) {
    baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1);
  }

  // Robust runtime detection for WebAssembly SIMD support across browsers (Safari, Chrome, Firefox)
  let hasSimd = false;
  try {
    hasSimd = typeof WebAssembly === "object" && typeof WebAssembly.validate === "function" &&
      WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 127, 0, 253, 15, 26, 11]));
  } catch (e) {
    hasSimd = false;
  }

  const selectedCore = hasSimd ? "tesseract-core-simd-lstm.wasm.js" : "tesseract-core-lstm.wasm.js";
  // The Android build tool unpacks *.gz assets when packaging (vendor/deu.traineddata.gz is
  // stored as vendor/deu.traineddata), so the Android app must request the plain files.
  // B28: the Android host says so itself (window.__bmdHost); the host name check stays as fallback for old WebViews.
  const plainLangData = (window.__bmdHost && window.__bmdHost.plainLanguageData) || window.location.hostname === "appassets.androidplatform.net";
  const gzipLangData = !plainLangData;
  const isPrecise = (state.settings.ocr.precision === "precise");
  const poolKey = `${lang}|${isPrecise ? "precise" : "standard"}`;

  const workerOptions = {
    workerPath: new URL("vendor/worker.min.js", baseUrl).href,
    corePath: new URL("vendor/" + selectedCore, baseUrl).href,
    langPath: new URL("vendor", baseUrl).href,
    workerBlobURL: false,
    cacheMethod: "none",
    gzip: gzipLangData,
    logger: (m) => {
      if (_bmdActiveProgressCallback && m && m.status) {
        const p = typeof m.progress === "number" ? m.progress : 0;
        let label = "OCR läuft...";
        if (m.status === "loading tesseract core") label = "Lade OCR-Kern...";
        else if (m.status === "initializing tesseract") label = "Initialisiere OCR...";
        else if (m.status === "loading language traineddata") label = "Lade Sprachdaten...";
        else if (m.status === "initializing api") label = "Bereite OCR vor...";
        // The callers add the percentage themselves; here it showed twice ("(39%) (39%)").
        else if (m.status === "recognizing text") label = "Erkenne Text";
        _bmdActiveProgressCallback(label, p);
      }
    }
  };

  // Ensure worker pool is initialized (not again after it failed for this key: then the single worker below is reused)
  const poolReady = _bmdWorkerPoolLang === poolKey && _bmdWorkerPool.length === OCR_POOL_SIZE;
  if (!poolReady && _bmdPoolFailedKey !== poolKey) {
    await terminateOcrWorker();
    try {
      if (progressCallback) progressCallback("Initialisiere parallele OCR-Kerne...", 0.15);
      // Warm up worker 0 first so local browser disk cache guarantees 0 duplicate network traffic
      const w0 = await window.Tesseract.createWorker(lang, 1, workerOptions);
      const rest = await Promise.all(
        Array.from({ length: OCR_POOL_SIZE - 1 }, () => window.Tesseract.createWorker(lang, 1, workerOptions))
      );
      _bmdWorkerPool = [w0, ...rest];
      _bmdWorkerPoolLang = poolKey;

      if (isPrecise) {
        try {
          await Promise.all(_bmdWorkerPool.map((w) => w.setParameters({
            preserve_interword_spaces: "1",
            user_defined_dpi: "300"
          })));
        } catch (_) {}
      }
    } catch (poolInitErr) {
      console.warn("[OCR Worker Pool fehlgeschlagen, versuche Fallback auf Einzel-Worker]:", poolInitErr);
      await terminateOcrWorker();
      _bmdPoolFailedKey = poolKey;
    }
  }

  // If pool is available and canvas has sufficient height, execute parallel striped recognition.
  // Stripes are cut in the whitespace between text lines, so no line is split and none is read twice.
  const numStripes = Math.min(OCR_POOL_SIZE, Math.floor(canvas.height / 350));
  if (_bmdWorkerPool.length === OCR_POOL_SIZE && numStripes >= 2) {
    try {
      if (progressCallback) progressCallback(`Erkenne Text parallel (${numStripes} Kerne)...`, 0.35);
      const ctx = canvas.getContext("2d");
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const dark = new Float32Array(canvas.height);
      for (let y = 0; y < canvas.height; y++) {
        let n = 0;
        for (let x = 0, p = y * canvas.width * 4; x < canvas.width; x += 2, p += 8) {
          if (px[p] + px[p + 1] + px[p + 2] < 384) n++;
        }
        dark[y] = n;
      }
      const stripeHeight = canvas.height / numStripes;
      const targets = Array.from({ length: numStripes - 1 }, (_, i) => Math.round((i + 1) * stripeHeight));
      const cuts = window.BlackMyDataOCRUtils?.findTextGapRows
        ? window.BlackMyDataOCRUtils.findTextGapRows(dark, targets, Math.round(stripeHeight * 0.2))
        : targets;
      const bounds = [0, ...cuts, canvas.height];

      const stripes = [];
      for (let i = 0; i < numStripes; i++) {
        const y0 = bounds[i];
        const y1 = bounds[i + 1];
        const h = y1 - y0;
        const sCanvas = document.createElement("canvas");
        sCanvas.width = canvas.width;
        sCanvas.height = h;
        const sCtx = sCanvas.getContext("2d");
        if (sCtx) {
          sCtx.fillStyle = "#ffffff";
          sCtx.fillRect(0, 0, canvas.width, h);
          sCtx.drawImage(canvas, 0, y0, canvas.width, h, 0, 0, canvas.width, h);
        }
        stripes.push({ canvas: sCanvas, y0, y1 });
      }

      const results = await Promise.all(
        stripes.map((s, idx) => _bmdWorkerPool[idx].recognize(s.canvas))
      );

      // Remap & deduplicate words across stripe borders
      const combinedWords = [];
      const textParts = [];

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const s = stripes[i];
        if (res.data?.text) textParts.push(res.data.text);
        const words = res.data?.words || [];
        for (const w of words) {
          if (!w.text || !w.text.trim() || !w.bbox) continue;
          const realY0 = w.bbox.y0 + s.y0;
          const realY1 = w.bbox.y1 + s.y0;
          const wordRect = [w.bbox.x0, realY0, w.bbox.x1, realY1];

          const isDup = combinedWords.some((existing) => {
            if (window.BlackMyDataOCRUtils) {
              const iou = window.BlackMyDataOCRUtils.calculateIoU(existing.rect, wordRect);
              if (iou > 0.45) return true;
            }
            return (
              existing.text === w.text.trim() &&
              Math.abs(existing.bbox.x0 - w.bbox.x0) < 20 &&
              Math.abs(existing.bbox.y0 - realY0) < 20
            );
          });

          if (!isDup) {
            combinedWords.push({
              ...w,
              rect: wordRect,
              bbox: {
                x0: w.bbox.x0,
                y0: realY0,
                x1: w.bbox.x1,
                y1: realY1
              }
            });
          }
        }
      }

      dismissOcrInfobox();
      if (progressCallback) progressCallback("Text erkannt", 1.0);
      return {
        data: {
          text: textParts.join("\n"),
          words: combinedWords
        }
      };
    } catch (parallelErr) {
      console.warn("[OCR Parallel Striped Recognition fehlgeschlagen, wechsle auf Single-Worker Fallback]:", parallelErr);
    }
  }

  // Single Worker fallback (if pool failed or canvas is small)
  if (_bmdWorkerPool.length > 0 && _bmdWorkerPoolLang === poolKey) {
    try {
      const res = await _bmdWorkerPool[0].recognize(canvas);
      dismissOcrInfobox();
      return res;
    } catch (e) {
      console.warn("[OCR Worker 0 fallback fehlgeschlagen]:", e);
    }
  }

  // Attempt creating single reusable worker
  if (typeof window.Tesseract.createWorker === "function") {
    try {
      await terminateOcrWorker();
      const worker = await window.Tesseract.createWorker(lang, 1, workerOptions);
      _bmdWorkerPool = [worker];
      _bmdWorkerPoolLang = poolKey;
      const res = await worker.recognize(canvas);
      dismissOcrInfobox();
      return res;
    } catch (createErr) {
      console.warn("[OCR createWorker fehlgeschlagen, wechsle auf Tier-Fallback]:", createErr);
    }
  }

  // Stage 1: Local options with workerBlobURL: false and cacheMethod: 'none' to avoid Safari SecurityErrors
  const localOptions = {
    workerPath: new URL("vendor/worker.min.js", baseUrl).href,
    corePath: new URL("vendor/" + selectedCore, baseUrl).href,
    langPath: new URL("vendor", baseUrl).href,
    workerBlobURL: false,
    cacheMethod: "none",
    gzip: gzipLangData,
    logger: (m) => {
      if (progressCallback && m && m.status) {
        progressCallback(m.status, m.progress || 0);
      }
    }
  };

  try {
    console.log(`[OCR Tier 1] Starte Texterkennung (SIMD: ${hasSimd ? "Ja" : "Nein"}, Core: ${selectedCore}, workerBlobURL:false, cacheMethod:none):`, localOptions.corePath);
    const res = await window.Tesseract.recognize(canvas, lang, localOptions);
    dismissOcrInfobox();
    return res;
  } catch (tier1Err) {
    // B18: one more local attempt with the plain (non-SIMD) core and a blob worker. There is no CDN fallback any
    // more: BlackMyData works offline, the language data ships with every build.
    console.warn("[OCR Tier 1 fehlgeschlagen] Versuche Tier 2 (Non-SIMD Core, workerBlobURL: true):", tier1Err);
    try {
      const res = await window.Tesseract.recognize(canvas, lang, {
        ...localOptions,
        corePath: new URL("vendor/tesseract-core-lstm.wasm.js", baseUrl).href,
        workerBlobURL: true,
      });
      dismissOcrInfobox();
      return res;
    } catch (tier2Err) {
      const errDetail = tier2Err?.message || tier1Err?.message || String(tier2Err);
      console.error("[OCR Alle Stufen fehlgeschlagen]:", { tier1Err, tier2Err });
      showOcrInfobox(`⚠️ <strong>OCR konnte in diesem Browser nicht gestartet werden:</strong> ${escapeHtml(errDetail)}.<br>Bitte Cookies / Speicherfreigabe in Safari prüfen (z.B. Privater Modus deaktivieren) oder Google Chrome / native App nutzen.`, "warning");
      showToast(`⚠️ OCR konnte in diesem Browser nicht gestartet werden: ${errDetail}. Bitte Safari-Einstellungen prüfen oder Chrome nutzen.`, "danger", 8000);
      throw tier2Err;
    }
  }
}

/** A word as the rules and the AI see it: punctuation at both ends removed. */
function cleanWordText(text) {
  return String(text).replace(/^[.,;:!?"'()[\]{}<>«»„“”]+|[.,;:!?"'()[\]{}<>«»„“”]+$/g, "");
}

/**
 * Text that pdf.js draws for an annotation when the page is rendered (export, M5), as lines:
 * text fields, the chosen entries of a combo box, every entry of a list box (all are visible) and FreeText comments.
 */
function visibleAnnotationText(a) {
  if (a.subtype === "FreeText") return [String((a.contentsObj && a.contentsObj.str) || "")];
  if (a.subtype !== "Widget") return [];
  const values = (Array.isArray(a.fieldValue) ? a.fieldValue : [a.fieldValue]).filter((v) => v != null).map(String);
  if (a.fieldType === "Tx") return values;
  if (a.fieldType !== "Ch") return [];
  const options = Array.isArray(a.options) ? a.options : [];
  if (!a.combo) return options.map((o) => String(o.displayValue ?? o.exportValue ?? ""));
  // A combo box shows the display text of the chosen export value (kept as well, it may be shown when no option fits).
  return values.flatMap((v) => {
    const opt = options.find((o) => o.exportValue === v);
    return opt && opt.displayValue != null && String(opt.displayValue) !== v ? [String(opt.displayValue), v] : [v];
  });
}

/**
 * Words of form field values and FreeText comments (see visibleAnnotationText), each with the rectangle of its
 * annotation in viewport coordinates (rotation handled by convertToViewportRectangle), marked source "form".
 */
function annotationTextWords(annots, viewport) {
  const lines = [];
  const words = [];
  for (const a of annots || []) {
    if (!a || !Array.isArray(a.rect) || a.rect.length !== 4) continue;
    const text = visibleAnnotationText(a).join("\n");
    if (!text.trim()) continue;
    const vr = typeof viewport.convertToViewportRectangle === "function"
      ? viewport.convertToViewportRectangle(a.rect)
      : [a.rect[0], viewport.height - a.rect[1], a.rect[2], viewport.height - a.rect[3]];
    const clamp = (v, max) => Math.round(Math.max(0, Math.min(max, v)) * 100) / 100;
    const rect = [
      clamp(Math.min(vr[0], vr[2]), viewport.width), clamp(Math.min(vr[1], vr[3]), viewport.height),
      clamp(Math.max(vr[0], vr[2]), viewport.width), clamp(Math.max(vr[1], vr[3]), viewport.height)
    ];
    for (const line of text.split(/\r?\n/)) {
      const tokens = line.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;
      lines.push(tokens.join(" "));
      for (const tok of tokens) words.push({ text: tok, clean: cleanWordText(tok), rect: rect.slice(), source: "form" });
    }
  }
  return { lines, words };
}

async function extractPageWordsAndText(pdfDoc, pageIndex, forceOcr = false, progressCallback = null) {
  const page = await pdfDoc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1.0 });
  const textContent = await page.getTextContent();

  const words = [];
  const textLines = [];
  let lastY = null;
  let currentLine = [];
  // Word boxes inside a text item: split the item's width by the measured width of the text before/through each
  // word. Splitting by character count put boxes up to a letter too far right in proportional fonts
  // ("C|hristian Weber"), so the first letter could stay visible after redaction.
  const measureCtx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  const fontStyles = textContent.styles || {};
  // M1: some PDFs split one word into several text items (kerning, single glyphs). Items that touch on the same
  // line are glued without a space, and the word boxes are merged, so "Mus"+"termann" is found as "Mustermann".
  let prevEndX = null;
  let prevEndsWithSpace = true;

  for (const item of textContent.items) {
    const str = item.str || "";
    if (!str.trim()) continue;

    // Transform matrix: [scaleX, skewY, skewX, scaleY, tx, ty] in PDF bottom-left coords
    const tx = item.transform[4];
    const ty = item.transform[5];
    const fontHeight = Math.max(8, Math.hypot(item.transform[2], item.transform[3]) || item.height || 11);
    const itemWidth = item.width && item.width > 0 ? item.width : str.length * (fontHeight * 0.52);

    // Convert bottom-left PDF coords to top-left coords used by viewer & canvas
    const boxX0 = Math.max(0, tx);
    const boxY0 = Math.max(0, viewport.height - ty - fontHeight * 0.88);
    const boxX1 = Math.min(viewport.width, tx + itemWidth);
    const boxY1 = Math.min(viewport.height, viewport.height - ty + fontHeight * 0.22);

    if (lastY !== null && Math.abs(ty - lastY) > fontHeight * 0.65) {
      if (currentLine.length > 0) {
        textLines.push(currentLine.join(" "));
        currentLine = [];
      }
    }
    const sameLine = lastY !== null && Math.abs(ty - lastY) <= fontHeight * 0.65;
    const glued = sameLine && prevEndX !== null && !prevEndsWithSpace && !/^\s/.test(str) &&
      Math.abs(tx - prevEndX) < fontHeight * 0.12 && currentLine.length > 0;
    lastY = ty;
    if (glued) currentLine[currentLine.length - 1] += str;
    else currentLine.push(str);
    prevEndX = tx + itemWidth;
    prevEndsWithSpace = /\s$/.test(str) || Boolean(item.hasEOL);

    // Split item into individual word tokens with proportional horizontal bounding boxes
    const totalLen = Math.max(1, str.length);
    let widthOf = null;
    if (measureCtx) {
      const family = (fontStyles[item.fontName] && fontStyles[item.fontName].fontFamily) || "sans-serif";
      measureCtx.font = `${Math.round(fontHeight)}px ${family}`;
      const full = measureCtx.measureText(str).width;
      if (full > 0) widthOf = (end) => measureCtx.measureText(str.slice(0, end)).width / full;
    }
    const tokenRegex = /\S+/g;
    let tokMatch;
    while ((tokMatch = tokenRegex.exec(str)) !== null) {
      const tokStr = tokMatch[0];
      const startRatio = widthOf ? widthOf(tokMatch.index) : tokMatch.index / totalLen;
      const endRatio = widthOf ? widthOf(tokMatch.index + tokStr.length) : (tokMatch.index + tokStr.length) / totalLen;

      let wX0, boxY0, wX1, boxY1;
      if (typeof viewport.convertToViewportRectangle === "function") {
        // PDF user space rectangle [x0, y0, x1, y1] with bottom-left origin; convert to top-left viewport coordinates
        // Handles 0°, 90°, 180°, and 270° rotated PDFs properly
        const pdfRect = [
          tx + itemWidth * startRatio,
          ty - fontHeight * 0.22,
          tx + itemWidth * endRatio,
          ty + fontHeight * 0.88
        ];
        const vRect = viewport.convertToViewportRectangle(pdfRect);
        wX0 = Math.max(0, Math.min(viewport.width, Math.min(vRect[0], vRect[2])));
        boxY0 = Math.max(0, Math.min(viewport.height, Math.min(vRect[1], vRect[3])));
        wX1 = Math.max(0, Math.min(viewport.width, Math.max(vRect[0], vRect[2])));
        boxY1 = Math.max(0, Math.min(viewport.height, Math.max(vRect[1], vRect[3])));
      } else {
        const itemBoxX0 = Math.max(0, tx);
        const itemBoxY0 = Math.max(0, viewport.height - ty - fontHeight * 0.88);
        const itemBoxX1 = Math.min(viewport.width, tx + itemWidth);
        const itemBoxY1 = Math.min(viewport.height, viewport.height - ty + fontHeight * 0.22);
        wX0 = itemBoxX0 + (itemBoxX1 - itemBoxX0) * startRatio;
        wX1 = itemBoxX0 + (itemBoxX1 - itemBoxX0) * endRatio;
        boxY0 = itemBoxY0;
        boxY1 = itemBoxY1;
      }

      const rect = [
        Math.round(wX0 * 100) / 100,
        Math.round(boxY0 * 100) / 100,
        Math.round(wX1 * 100) / 100,
        Math.round(boxY1 * 100) / 100
      ];
      const prevWord = words[words.length - 1];
      if (glued && tokMatch.index === 0 && prevWord) {
        // Continuation of the previous item's last word: one word, one box.
        prevWord.text += tokStr;
        prevWord.clean = cleanWordText(prevWord.text);
        prevWord.rect = [
          Math.min(prevWord.rect[0], rect[0]), Math.min(prevWord.rect[1], rect[1]),
          Math.max(prevWord.rect[2], rect[2]), Math.max(prevWord.rect[3], rect[3])
        ];
        continue;
      }
      words.push({
        text: tokStr,
        clean: cleanWordText(tokStr),
        rect
      });
    }
  }

  if (currentLine.length > 0) {
    textLines.push(currentLine.join(" "));
  }

  let fullText = textLines.join("\n");

  // Intelligent Scan Detection: check if page contains raster images (scanned PDF / photos)
  let hasScanImage = false;
  try {
    const ops = await page.getOperatorList();
    if (ops && ops.fnArray) {
      hasScanImage = ops.fnArray.some(fn => 
        fn === pdfjsLib.OPS.paintImageXObject || 
        fn === pdfjsLib.OPS.paintInlineImageXObject ||
        fn === pdfjsLib.OPS.paintImageMaskXObject
      );
    }
  } catch (opErr) {
    console.debug("OperatorList check:", opErr);
  }

  // A page is considered a scan or hybrid if:
  // 1. Forced OCR explicitly requested
  // 2. Very low text count (< 120 chars)
  // 3. Page has raster scan images and low/medium text density (< 400 chars, e.g. watermark/stamp/header)
  // Scan determination:
  // - Any page with < 350 chars is treated as low-text / scan
  // - Any page with raster images and < 500 chars is treated as hybrid scan
  // - Pure digital documents with rich text (> 500 chars) use fast digital textlayer
  const isPrecise = (state.settings.ocr.precision === "precise");
  const isLowText = fullText.trim().length < 350;
  const isHybridScan = hasScanImage && fullText.trim().length < 500;
  const isScanOrNeedsOcr = isLowText || isHybridScan;

  // Scanned pages, forced OCR, or precise mode with scan images trigger OCR
  const shouldRunOcr = forceOcr || isScanOrNeedsOcr || (isPrecise && hasScanImage);
  // K1: whether OCR was needed and actually worked. A page whose OCR failed must never leave the app unredacted.
  let ocrStatus = shouldRunOcr ? "failed" : "none";

  if (shouldRunOcr) {
    if (!window.Tesseract) {
      ocrStatus = "unavailable";
      console.warn("OCR angefordert, aber window.Tesseract ist nicht geladen.");
      if (forceOcr) {
        showToast("⚠️ Tesseract.js OCR-Bibliothek ist nicht verfügbar.", "warning", 5000);
        showOcrInfobox("⚠️ <strong>Tesseract OCR nicht verfügbar:</strong> Die Texterkennungs-Bibliothek konnte im Browser nicht initialisiert werden. Bitte Seite neu laden oder Internetverbindung prüfen.", "warning");
      }
    } else {
      try {
        const targetScale = isPrecise ? (300 / 72) : 1.8;
        // M12: phones and tablets run out of memory with 4400 px pages (canvas + grayscale + integral images per
        // page); there "precise" stays at ~250 dpi for A4.
        const isMobileDevice = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        const maxDim = isPrecise ? (isMobileDevice ? 3000 : 4400) : 2800;
        const ocrScale = getSafeRenderScale(viewport.width, viewport.height, targetScale, maxDim);
        const ocrViewport = page.getViewport({ scale: ocrScale });
        const offCanvas = document.createElement("canvas");
        offCanvas.width = Math.round(ocrViewport.width);
        offCanvas.height = Math.round(ocrViewport.height);
        const offCtx = offCanvas.getContext("2d");
        offCtx.fillStyle = "#ffffff";
        offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
        await page.render({ canvasContext: offCtx, viewport: ocrViewport }).promise;

        // Photographed pages: OCR only the sheet of paper, not the background around it.
        // Word boxes are shifted back by (cropX, cropY) below.
        let srcCanvas = offCanvas;
        let cropX = 0;
        let cropY = 0;
        if (window.BlackMyDataOCRUtils?.findDocumentBounds && hasScanImage) {
          try {
            const full = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
            const b = window.BlackMyDataOCRUtils.findDocumentBounds(full.data, offCanvas.width, offCanvas.height);
            if (b) {
              srcCanvas = document.createElement("canvas");
              srcCanvas.width = b.x1 - b.x0;
              srcCanvas.height = b.y1 - b.y0;
              srcCanvas.getContext("2d").drawImage(offCanvas, b.x0, b.y0, srcCanvas.width, srcCanvas.height, 0, 0, srcCanvas.width, srcCanvas.height);
              cropX = b.x0;
              cropY = b.y0;
              console.log(`[OCR] Blatt erkannt, Hintergrund abgeschnitten: ${srcCanvas.width}×${srcCanvas.height} von ${offCanvas.width}×${offCanvas.height}`);
            }
          } catch (cropErr) {
            console.debug("[OCR document crop skipped]:", cropErr);
          }
        }

        let canvasForOcr = srcCanvas;
        let skewAngleRad = 0;
        const imgCx = srcCanvas.width / 2;
        const imgCy = srcCanvas.height / 2;

        if (isPrecise && window.BlackMyDataOCRUtils) {
          try {
            const imgData = srcCanvas.getContext("2d").getImageData(0, 0, srcCanvas.width, srcCanvas.height);
            const gray = window.BlackMyDataOCRUtils.rgbaToGrayscale(imgData.data, srcCanvas.width, srcCanvas.height);
            const stretched = window.BlackMyDataOCRUtils.contrastStretchGrayscale(gray, srcCanvas.width, srcCanvas.height);
            const binary = window.BlackMyDataOCRUtils.sauvolaBinarize(stretched, srcCanvas.width, srcCanvas.height);

            if (state.settings.ocr.deskew !== false) {
              const skewDeg = window.BlackMyDataOCRUtils.estimateDeskewAngle(binary, srcCanvas.width, srcCanvas.height);
              if (Math.abs(skewDeg) >= 0.35) {
                console.log(`[Deskew] Detected document tilt of ${skewDeg}°. Re-aligning...`);
                skewAngleRad = (-skewDeg * Math.PI) / 180;
              }
            }

            const binCanvas = document.createElement("canvas");
            binCanvas.width = srcCanvas.width;
            binCanvas.height = srcCanvas.height;
            const binCtx = binCanvas.getContext("2d");
            const binImgData = binCtx.createImageData(srcCanvas.width, srcCanvas.height);
            let p = 0;
            for (let i = 0; i < binary.length; i++) {
              const v = binary[i];
              binImgData.data[p] = v;
              binImgData.data[p + 1] = v;
              binImgData.data[p + 2] = v;
              binImgData.data[p + 3] = 255;
              p += 4;
            }
            binCtx.putImageData(binImgData, 0, 0);

            if (skewAngleRad !== 0) {
              const rotCanvas = document.createElement("canvas");
              rotCanvas.width = srcCanvas.width;
              rotCanvas.height = srcCanvas.height;
              const rotCtx = rotCanvas.getContext("2d");
              rotCtx.fillStyle = "#ffffff";
              rotCtx.fillRect(0, 0, rotCanvas.width, rotCanvas.height);
              rotCtx.translate(imgCx, imgCy);
              rotCtx.rotate(skewAngleRad);
              rotCtx.drawImage(binCanvas, -imgCx, -imgCy);
              canvasForOcr = rotCanvas;
            } else {
              canvasForOcr = binCanvas;
            }
          } catch (prepErr) {
            console.warn("[Precise OCR preprocessing fallback to raw canvas]:", prepErr);
            canvasForOcr = srcCanvas;
          }
        }

        const allowedLangs = ["deu", "eng", "deu+eng"];
        const lang = allowedLangs.includes(state.settings.ocr.language) ? state.settings.ocr.language : "deu+eng";
        showToast(`🔍 ${isPrecise ? "Genaue OCR" : "OCR-Texterkennung"} für Seite ${pageIndex + 1} läuft...`, "info", 4000);

        // A failing Tesseract worker can leave the promise pending forever (e.g. Workers blocked
        // under file://); give up after 4 minutes so the analysis continues with the rules.
        let ocrTimer;
        const ocrTimeout = new Promise((_, reject) => {
          // B4: also stop the hanging workers, otherwise they keep CPU and memory busy after the timeout.
          ocrTimer = setTimeout(() => { terminateOcrWorker(); reject(new Error("OCR-Zeitüberschreitung (4 min)")); }, 240000);
        });
        const res = await Promise.race([ocrTimeout, runTesseractOcrOnCanvas(canvasForOcr, lang, (status, pct) => {
          if (typeof progressCallback === "function") {
            progressCallback(status, pct);
          }
          if (typeof setLoadingPhase === "function") {
            setLoadingPhase(2, {
              progressPct: Math.round(20 + pct * 30),
              subtitle: `OCR Seite ${pageIndex + 1}: ${status} (${Math.round(pct * 100)}%)...`
            });
          }
        })]).finally(() => clearTimeout(ocrTimer));

        if (res && res.data) {
          ocrStatus = "ok";
          const ocrText = (res.data.text || "").trim();
          if (ocrText.length > 0) {
            if (fullText.trim().length > 0) {
              fullText = fullText.trim() + "\n" + ocrText;
            } else {
              fullText = ocrText;
            }
          }
          const ocrWords = res.data.words || [];
          const currentSens = state.settings.sensitivity || "balanced";
          const minOcrConfidence = {
            minimal: 75,
            low: 65,
            balanced: 50,
            high: 35,
            maximum: 15
          }[currentSens] || 50;

          let addedOcrWords = 0;
          for (const w of ocrWords) {
            if (!w.text || !w.text.trim() || !w.bbox) continue;
            const conf = typeof w.confidence === "number" ? w.confidence : 80;
            // Reject obvious single-char noise
            if (conf < 15 && w.text.trim().length <= 1) continue;

            let rawBox = [w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1];
            if (skewAngleRad !== 0 && window.BlackMyDataOCRUtils) {
              rawBox = window.BlackMyDataOCRUtils.rotateBoxToAABB(
                rawBox,
                -skewAngleRad,
                imgCx,
                imgCy,
                srcCanvas.width,
                srcCanvas.height
              );
            }
            rawBox = [rawBox[0] + cropX, rawBox[1] + cropY, rawBox[2] + cropX, rawBox[3] + cropY];

            const scaledRect = [
              Math.round((rawBox[0] / ocrScale) * 100) / 100,
              Math.round((rawBox[1] / ocrScale) * 100) / 100,
              Math.round((rawBox[2] / ocrScale) * 100) / 100,
              Math.round((rawBox[3] / ocrScale) * 100) / 100
            ];

            // Deduplicate with digital textlayer words if present
            if (words.length > 0 && window.BlackMyDataOCRUtils) {
              const overlapsDigital = words.some(
                (dw) => window.BlackMyDataOCRUtils.calculateIoU(dw.rect, scaledRect) > 0.45
              );
              if (overlapsDigital) continue;
            }

            const isLowConf = conf < minOcrConfidence;
            const wText = w.text.trim();

            words.push({
              text: wText,
              clean: cleanWordText(wText),
              confidence: conf,
              lowConfidence: isLowConf,
              rawPixelBox: rawBox,
              rect: scaledRect
            });
            addedOcrWords++;
          }

          // Vision-KI Correction for uncertain words (Phase 5)
          if (
            isPrecise &&
            state.settings.ollama.enabled &&
            state.settings.ocr.vision_ocr &&
            state.settings.ollama.vision_model
          ) {
            const difficultWords = words.filter((w) => w.lowConfidence && w.rawPixelBox && w.clean.length >= 3).slice(0, 25);
            if (difficultWords.length > 0) {
              showToast(`👁️ Vision-KI prüft ${difficultWords.length} unklare Textstellen...`, "info", 3500);
              for (const dw of difficultWords) {
                try {
                  const [bx0, by0, bx1, by1] = dw.rawPixelBox;
                  const pad = 6;
                  const cx0 = Math.max(0, bx0 - pad);
                  const cy0 = Math.max(0, by0 - pad);
                  const cw = Math.min(offCanvas.width - cx0, (bx1 - bx0) + pad * 2);
                  const ch = Math.min(offCanvas.height - cy0, (by1 - by0) + pad * 2);
                  if (cw > 10 && ch > 10) {
                    const cropCanvas = document.createElement("canvas");
                    cropCanvas.width = cw;
                    cropCanvas.height = ch;
                    const cropCtx = cropCanvas.getContext("2d");
                    cropCtx.drawImage(offCanvas, cx0, cy0, cw, ch, 0, 0, cw, ch);
                    const corrected = await queryLocalhostVisionCorrection(cropCanvas, dw.clean);
                    if (corrected && corrected !== dw.clean) {
                      console.log(`[Vision AI Correction] '${dw.clean}' -> '${corrected}'`);
                      dw.text = corrected;
                      dw.clean = cleanWordText(corrected);
                      dw.source = "vision";
                      dw.lowConfidence = false;
                    }
                  }
                } catch (visionErr) {
                  console.debug("[Vision AI Word crop error]:", visionErr);
                }
              }
            }
          }

          if (addedOcrWords > 0) {
            showToast(`✅ ${isPrecise ? "Genaue OCR" : "OCR"} erfolgreich: ${addedOcrWords} Wörter auf Seite ${pageIndex + 1} erkannt`, "success", 3000);
          }
        }
      } catch (ocrErr) {
        ocrStatus = "failed";
        console.warn("Browser OCR fehlgeschlagen:", ocrErr);
        showToast(`⚠️ Texterkennung auf Seite ${pageIndex + 1} fehlgeschlagen: ${ocrErr.message || ocrErr}`, "warning", 8000);
        // Error notification handled in runTesseractOcrOnCanvas
      }
    }
  }

  // Form field values and FreeText comments are not part of the text layer, but the export draws them into the page
  // image (M5: such pages are flattened). They are checked like page text; a hit blackens the whole field.
  try {
    const formWords = annotationTextWords(await page.getAnnotations(), viewport);
    for (const line of formWords.lines) fullText = fullText ? fullText + "\n" + line : line;
    words.push(...formWords.words);
  } catch (annotErr) {
    console.debug("Form field check:", annotErr);
  }

  return {
    width: viewport.width,
    height: viewport.height,
    text: fullText,
    words,
    ocrStatus,
    // H2: images on a text-rich page were not read by OCR (e.g. an ID copy inside a letter).
    imagesUnchecked: hasScanImage && !shouldRunOcr
  };
}

let busyDepth = 0;
function beginBusy() {
  if (busyDepth > 0) {
    showToast("Bitte warten, bis die laufende Analyse/Schwärzung fertig ist.", "info", 3000);
    return false;
  }
  busyDepth++;
  return true;
}
function endBusy() {
  busyDepth = Math.max(0, busyDepth - 1);
}

/** Password dialog with a masked field. Resolves to the password, or null when cancelled. */
function askPassword(fileName, wrong) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:100000;padding:16px";
    const box = document.createElement("form");
    box.style.cssText = "background:var(--bg-panel,#fff);color:var(--text-main,#111);border-radius:12px;padding:20px;max-width:420px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.35)";
    const title = document.createElement("p");
    title.style.cssText = "margin:0 0 12px;font-weight:600";
    title.textContent = wrong
      ? `Falsches Kennwort für „${fileName}“. Bitte erneut eingeben:`
      : `„${fileName}“ ist passwortgeschützt. Bitte Kennwort eingeben:`;
    const input = document.createElement("input");
    input.type = "password";
    input.autocomplete = "off";
    input.style.cssText = "width:100%;padding:10px;border-radius:8px;border:1px solid #888;box-sizing:border-box";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:14px";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Abbrechen";
    const ok = document.createElement("button");
    ok.type = "submit";
    ok.textContent = "Öffnen";
    row.append(cancel, ok);
    box.append(title, input, row);
    overlay.append(box);
    const done = (value) => { overlay.remove(); resolve(value); };
    cancel.addEventListener("click", () => done(null));
    box.addEventListener("submit", (e) => { e.preventDefault(); done(input.value); });
    overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") done(null); });
    document.body.append(overlay);
    input.focus();
  });
}

// B23: one implementation, in ocr_utils.js (loaded before this file).
const isSameRect = (r1, r2) => window.BlackMyDataOCRUtils.isSameRect(r1, r2);

/**
 * Maps detected texts to word boxes and gives every hit a stable id (page, category, text, position), so the
 * user's "do not redact" choices survive re-evaluation and forced OCR (N2). Hits that could not be placed on
 * the page are remembered in pageInfo.unmapped and reported instead of vanishing silently (M1).
 */
function mapAndStabilize(rawMatches, pageInfo, pageIndex) {
  const mapped = mapEntitiesToWordRects(rawMatches, pageInfo.words);
  const seen = new Map();
  for (const ent of mapped) {
    const r = (ent.rects && ent.rects[0]) || [];
    const base = `${pageIndex}|${ent.category}|${String(ent.text || "").toLowerCase()}|${r.map((v) => Math.round(v)).join(",")}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    ent.id = "e" + stableHash(base + "#" + n);
  }
  const placed = new Set(mapped.map((e) => String(e.text || "").toLowerCase().trim()));
  pageInfo.unmapped = [...new Set((rawMatches || [])
    .map((m) => String(m.text || "").trim())
    .filter((t) => t && !placed.has(t.toLowerCase())))];
  return mapped;
}

function stableHash(str) {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 ^= str.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
  }
  return h1.toString(36);
}

/** Inputs of the rule/AI evaluation; when they change after the analysis, the hits are recomputed before export. */
function analysisSignature() {
  return JSON.stringify([state.settings.categories, state.settings.exceptions, state.settings.sensitivity]);
}

function mapEntitiesToWordRects(rawEntities, pageWords) {
  const mapped = [];
  if (!Array.isArray(rawEntities) || !Array.isArray(pageWords) || pageWords.length === 0) return mapped;
  const isPrecise = (state.settings.ocr.precision === "precise");

  for (const ent of rawEntities) {
    const targetText = (ent.text || "").trim();
    if (!targetText) continue;
    const cat = ent.category || "name";

    const targetTokens = targetText
      .split(/\s+/)
      .map((t) => cleanWordText(t).toLowerCase())
      .filter(Boolean);

    if (targetTokens.length === 0) continue;

    const rects = [];
    let hasLowConf = false;

    if (targetTokens.length === 1) {
      const needle = targetTokens[0];
      for (const pw of pageWords) {
        const wClean = (pw.clean || "").toLowerCase();
        let matched = (wClean === needle);
        if (!matched && needle.length >= 4 && wClean.includes(needle)) {
          if (wClean.length <= needle.length + 3) matched = true;
        }
        if (!matched && isPrecise && window.BlackMyDataOCRUtils) {
          matched = window.BlackMyDataOCRUtils.isFuzzyTokenMatch(needle, wClean, cat);
          if (matched) hasLowConf = true;
        }
        if (matched) {
          if (pw.lowConfidence) hasLowConf = true;
          if (!rects.some((r) => isSameRect(r, pw.rect))) {
            rects.push(pw.rect);
          }
        }
      }
    } else {
      const n = targetTokens.length;
      for (let i = 0; i <= pageWords.length - n; i++) {
        let allMatch = true;
        let chainLowConf = false;
        for (let k = 0; k < n; k++) {
          const wClean = (pageWords[i + k].clean || "").toLowerCase();
          const tClean = targetTokens[k];
          let tokenMatched = (wClean === tClean || wClean.includes(tClean));
          if (!tokenMatched && isPrecise && window.BlackMyDataOCRUtils) {
            tokenMatched = window.BlackMyDataOCRUtils.isFuzzyTokenMatch(tClean, wClean, cat);
            if (tokenMatched) chainLowConf = true;
          }
          if (!tokenMatched) {
            allMatch = false;
            break;
          }
          if (pageWords[i + k].lowConfidence) chainLowConf = true;
        }
        if (allMatch) {
          if (chainLowConf) hasLowConf = true;
          const matchedRects = [];
          for (let k = 0; k < n; k++) {
            matchedRects.push(pageWords[i + k].rect);
          }
          // Group multi-line entity tokens line-by-line instead of drawing a single giant box across lines
          const lineBoxes = (window.BlackMyDataOCRUtils && window.BlackMyDataOCRUtils.groupRectsByLine)
            ? window.BlackMyDataOCRUtils.groupRectsByLine(matchedRects)
            : [ [
                Math.min(...matchedRects.map(r => r[0])),
                Math.min(...matchedRects.map(r => r[1])),
                Math.max(...matchedRects.map(r => r[2])),
                Math.max(...matchedRects.map(r => r[3]))
              ] ];
          for (const box of lineBoxes) {
            if (!rects.some((r) => isSameRect(r, box))) {
              rects.push(box);
            }
          }
        }
      }
    }

    if (rects.length > 0) {
      mapped.push({
        id: ent.id || Math.random().toString(36).substring(2, 10),
        text: targetText,
        category: cat,
        confidence: ent.confidence || 0.9,
        source: ent.source || "rule",
        lowConfidence: Boolean(hasLowConf || ent.lowConfidence),
        rects
      });
    }
  }

  return mapped;
}

// ============================================================================
// DIRECT BROWSER -> LOCALHOST / LAN LLM EXTRACTION (Ollama, LM Studio, oMLX, Remote)
// ============================================================================
function filterValidAiEntities(rawList, sensitivity = "balanced") {
  if (!Array.isArray(rawList)) return [];
  const ALLOWED_CATEGORIES = new Set([
    "name", "names", "first_name", "first_names", "last_name", "last_names", "title", "titles", "person",
    "address", "addresses", "street", "streets", "house_number", "house_numbers", "zip_code", "zip_codes", "city", "cities", "location",
    "email", "emails", "phone", "phones", "iban", "ibans", "bic", "bics",
    "id", "ids", "tax_id", "tax_ids", "social_security_id", "social_security_ids",
    "date", "dates", "birth_date", "birth_dates", "general_date", "general_dates",
    "organization", "organizations", "org"
  ]);

  const FORMULAS = new Set([
    "sehr geehrte damen und herren", "sehr geehrter herr", "sehr geehrte frau",
    "hallo zusammen", "guten tag", "liebe kolleginnen und kollegen",
    "mit freundlichen grüßen", "mit freundlichem gruß", "viele grüße", "beste grüße",
    "hochachtungsvoll", "herzliche grüße", "mit besten grüßen", "an die"
  ]);

  const PROSE_STOPWORDS = [
    "beispiel für", "adressformate", "din 5008", "standardmäßig", "inländisch", "versandt",
    "zielland", "großbuchstaben", "zeile gesetzt", "vertragspartner", "nachfolgend",
    "dies ist ein", "dies sind"
  ];

  const valid = [];
  for (const ent of rawList) {
    if (!ent || typeof ent.text !== "string") continue;
    const textVal = ent.text.trim();
    if (textVal.length < 2) continue;
    let cat = (ent.category || "name").toLowerCase().trim();
    if (cat.includes("|")) cat = cat.split("|")[0].trim();
    if (!ALLOWED_CATEGORIES.has(cat)) continue;

    const tLower = textVal.toLowerCase().replace(/[.,!?:;]+$/, "");
    if (FORMULAS.has(tLower)) continue;
    if (PROSE_STOPWORDS.some((sw) => tLower.includes(sw))) continue;

    if (cat === "email" || cat === "emails") {
      if (!textVal.includes("@") || !/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(textVal)) {
        continue;
      }
    } else if (cat === "phone" || cat === "phones") {
      const digits = textVal.replace(/\D/g, "");
      if (digits.length < 5) continue;
    } else if (cat === "iban" || cat === "ibans") {
      const cleanIban = textVal.replace(/\s+/g, "").toUpperCase();
      if (!/^[A-Z]{2}\d{10,32}$/.test(cleanIban)) continue;
    } else if (cat.includes("date")) {
      if (["deutschland", "germany", "österreich", "schweiz", "berlin"].includes(tLower)) continue;
      const hasDigit = /\d/.test(textVal);
      const hasMonth = /januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember/i.test(textVal);
      if (!hasDigit && !hasMonth) continue;
    } else if (cat.includes("name") || cat === "person") {
      if (textVal.split(/\s+/).length > 5 || textVal.length > 45) continue;
    } else if (cat.includes("address") || cat === "location") {
      if (textVal.split(/\s+/).length > 6 || textVal.length > 55) continue;
    } else if (cat.includes("id")) {
      // Rechnungsnummern (#...), Bestellnummern und Produkt-SKUs sind NIEMALS persönliche Ausweise
      if (textVal.startsWith("#")) continue;
      const invWords = [
        "invoice", "rechnung", "order", "bestell", "artikel", "item", "sku", "produkt", "product",
        "tracking", "cable", "hanger", "extender", "black", "white", "mount", "arm", "strip",
        "rgb", "bundle", "edition", "mag-", "cbl", "splitit", "payment", "versand", "shipping",
        "sl-", "de-", "ref", "eur", "usd", "mwst", "ust", "total", "subtotal", "qty", "stk"
      ];
      if (invWords.some((w) => tLower.includes(w))) continue;

      // In Stufe 1 (Minimal) & Stufe 2 (Niedrig): Extrem strikte Ausweisung
      if (sensitivity === "minimal" || sensitivity === "low") {
        const cleanVal = textVal.replace(/[^A-Za-z0-9]/g, "");
        const isTaxId = /^\d{11}$/.test(cleanVal);
        const isPassport = /^[A-Z0-9]{9,10}$/i.test(cleanVal) && !/^\d{9,10}$/.test(cleanVal);
        if (!isTaxId && !isPassport) {
          continue; // Rechnungs- und Bestellnummern abweisen!
        }
      }

      const cleanVal = textVal.replace(/[^A-Za-z0-9]/g, "");
      if (cleanVal.length < 8 || cleanVal.length > 22) continue;
      if (textVal.includes("-") && textVal.split("-").some((p) => p.length > 3 && /^[A-Za-z]+$/.test(p))) {
        continue;
      }
    }

    valid.push({ ...ent, text: textVal, category: cat });
  }
  return valid;
}

/**
 * OCR of photos produces many lines of garbage (background, folds). Sending them to the
 * model costs time and confuses small models. Keeps lines that contain readable words,
 * numbers or e-mail addresses and collapses the column spacing.
 */
function cleanTextForAi(text) {
  const keep = [];
  for (const raw of (text || "").split("\n")) {
    const line = raw.replace(/\s{2,}/g, "  ").trim();
    if (!line) continue;
    const tokens = line.split(/\s+/);
    const good = tokens.filter((t) =>
      /@|\d{2,}/.test(t) || (/^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.,:;()'-]{2,}$/.test(t) && /[aeiouäöüyAEIOUÄÖÜ]/.test(t))
    ).length;
    // B36: a line with a single readable word (a surname, a city) is kept too.
    if ((tokens.length === 1 && good === 1) || (good >= 2 && good / tokens.length >= 0.45)) keep.push(line);
  }
  return keep.join("\n");
}

/** Human-readable reason for a failed AI request, with what to do about it. */
function describeAiFailure(err, endpoint, timeoutMs) {
  if (err && err.name === "AbortError") {
    return `keine Antwort nach ${Math.round(timeoutMs / 1000)} s – Modell lädt noch oder ist zu groß; ein kleineres Modell wählen oder erneut versuchen`;
  }
  const msg = String((err && err.message) || err || "");
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    const origin = window.location.origin;
    const isWeb = /^https?:/.test(origin) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(origin);
    return isWeb
      ? `Browser darf ${endpoint} nicht erreichen. Ollama erlaubt diese Website erst nach einmaliger Freigabe im Terminal: ${ollamaOriginsCommand()} und Ollama neu starten`
      : `${endpoint} nicht erreichbar – läuft Ollama?`;
  }
  return msg || "Verbindungsabbruch";
}

let _lastAiErrorNotificationTime = 0;
function notifyAiUnavailable(provider, reason = "") {
  const now = Date.now();
  if (now - _lastAiErrorNotificationTime > 15000) {
    _lastAiErrorNotificationTime = now;
    const detail = reason ? ` (${reason})` : "";
    showToast(`⚠️ KI (${provider.toUpperCase()}) ohne Ergebnis${detail} – Analyse wird mit der lokalen Regel-Engine fortgesetzt.`, "warning", 9000);
  }
}

function splitTextIntoAiChunks(text, maxChars = 3200, overlap = 250) {
  if (!text || text.length <= maxChars) return [text || ""];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const lastNl = text.lastIndexOf("\n", end);
      if (lastNl > start + maxChars * 0.6) {
        end = lastNl + 1;
      } else {
        const lastSpace = text.lastIndexOf(" ", end);
        if (lastSpace > start + maxChars * 0.6) end = lastSpace + 1;
      }
    }
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

/** Endpoint the configured AI provider sends text to. */
function currentAiEndpoint() {
  const o = state.settings.ollama;
  switch (o.provider) {
    case "ollama": return o.endpoint || "http://127.0.0.1:11434";
    case "lmstudio": return o.lmstudio_endpoint || "http://127.0.0.1:1234";
    case "omlx": return o.omlx_endpoint || "http://127.0.0.1:1060";
    case "remote": return o.remote_endpoint || "";
    default: return "";
  }
}

/** Loopback, private LAN ranges and .local names: the text stays in the user's own network. */
function isPrivateAiHost(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, ""); } catch (e) { return false; }
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost") || host === "::1") return true;
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  return /^f[cd][0-9a-f]{2}:/.test(host) || host.startsWith("fe80:");
}

/**
 * M9: page text leaves the device. For a server outside the own network the user confirms once per host, so the
 * README's "no data to the internet" stays true unless they knowingly choose a cloud endpoint.
 */
function confirmExternalAi() {
  const ep = currentAiEndpoint();
  if (!ep || isPrivateAiHost(ep)) return true;
  let host = ep;
  try { host = new URL(ep).host; } catch (e) { /* keep raw */ }
  state.settings.ollama.external_consent = state.settings.ollama.external_consent || [];
  if (state.settings.ollama.external_consent.includes(host)) return true;
  const ok = window.confirm(
    `Achtung: Die KI-Prüfung sendet den Text Ihrer Dokumente (und bei Vision-Korrektur Bildausschnitte) an „${host}“ – ` +
      "einen Server außerhalb Ihres eigenen Netzes. Nur fortfahren, wenn Sie diesem Anbieter vertrauen.\n\nFortfahren?",
  );
  if (ok) {
    state.settings.ollama.external_consent.push(host);
    try { saveSettingsToLocalStorage(); } catch (e) { /* ignore */ }
  }
  return ok;
}

async function queryLocalhostLLM(pageText) {
  if (!state.settings.ollama.enabled || state.settings.ollama.provider === "none") return [];
  if (!pageText || pageText.trim().length < 10) return [];
  if (!confirmExternalAi()) return [];

  const provider = state.settings.ollama.provider;
  pageText = cleanTextForAi(pageText);
  if (pageText.trim().length < 10) return [];
  const sysPrompt =
    "Du bist ein DSGVO-Assistent zur PDF-Schwärzung. Extrahiere ausschließlich tatsächliche personenbezogene Einzeldaten (vollständige Namen von Personen, Straßen, Orte, IBANs, Telefonnummern, E-Mails, Geburtsdaten).\n" +
    "WICHTIG ZUR SCHREIBWEISE: Der Text stammt teilweise aus einer OCR-Texterkennung und kann Tippfehler enthalten. Gib jeden gefundenen Wert ZEICHENGENAU SO ZURÜCK, WIE ER IM EINGABETEXT STEHT. Korrigiere keine Schreibweise, damit die Fundstellen im Dokument zugeordnet werden können!\n" +
    "WICHTIG ZU AUSWEIS/ID: 'id' meint AUSSCHLIESSLICH Personalausweisnummern, Reisepassnummern oder Steuer-IDs von Personen! Rechnungsnummern (#...), Bestellnummern (Order-ID, SL-...), Kundennummern, Artikelnummern, SKUs, Tracking-IDs oder Seriennummern sind GESCHÄFTSDATEN und dürfen NIEMALS als 'id' oder personenbezogene Daten erfasst werden!\n" +
    "WICHTIG ZU E-MAIL: 'email' bedeutet AUSSCHLIESSLICH konkrete E-Mail-Adressen mit '@' und Domain (z.B. max@muster.de). NIEMALS Anreden wie 'Sehr geehrte Damen und Herren', Grußformeln wie 'Mit freundlichen Grüßen', Fließtextsätze oder Betreffzeilen als 'email' einstufen!\n" +
    "Floskeln, Begrüßungen, Absätze und gewöhnlicher Text sind KEINE personenbezogenen Daten!\n" +
    "Erlaubte Werte für category: name, address, email, phone, iban, id, date.\n" +
    'Antworte NUR mit JSON in genau dieser Form, z.B.: {"entities": [{"text": "Erika Mustermann", "category": "name"}, {"text": "Hauptstraße 5", "category": "address"}, {"text": "+49 170 1234567", "category": "phone"}]}. ' +
    'Gibt es nichts, antworte {"entities": []}.';
  const AI_TIMEOUT_MS = 90000;
  const parseEntities = (raw) => {
    const content = String(raw || "").replace(/<think>[\s\S]*?<\/think>/g, "");
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      // Small models sometimes copy a category list ("name|address") instead of choosing one.
      const list = (parsed.entities || []).filter((e) => e && typeof e.category === "string" && !e.category.includes("|"));
      return filterValidAiEntities(list, state.settings.sensitivity);
    } catch (_) {
      return [];
    }
  };

  const chunks = splitTextIntoAiChunks(pageText, 3200, 250);
  const collectedEntities = [];
  const seenEntities = new Set();

  const callOllamaGenerate = async (ep, model, chunk) => {
    // num_predict caps the answer: with format "json" small models otherwise keep emitting
    // whitespace until the request times out. think:false stops reasoning models from
    // spending the budget on thinking (ignored by models without thinking).
    const resp = await fetchWithTimeout(`${ep}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        system: sysPrompt,
        prompt: `Dokumenttext:\n${chunk}`,
        stream: false,
        format: "json",
        think: false,
        keep_alive: "10m",
        options: { temperature: 0.0, num_predict: 768, num_ctx: 8192 }
      })
    }, AI_TIMEOUT_MS);

    if (resp.ok) {
      const data = await resp.json();
      return parseEntities(data.response);
    }
    let detail = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (body.error) detail += `: ${body.error}`;
    } catch (_) {}
    notifyAiUnavailable("ollama", detail);
    return [];
  };

  const callOpenAiChat = async (ep, model, chunk, apiKey = "") => {
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const resp = await fetchWithTimeout(`${ep}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: chunk }
        ],
        max_tokens: 768,
        temperature: 0.0
      })
    }, AI_TIMEOUT_MS);

    if (resp.ok) {
      const data = await resp.json();
      return parseEntities(data.choices?.[0]?.message?.content);
    }
    notifyAiUnavailable(provider, `HTTP ${resp.status}`);
    return [];
  };

  // B36: one failing section no longer drops the following ones. Only when the server is unreachable or does not
  // answer in time, the remaining sections are skipped (they would fail the same way).
  for (const chunk of chunks) {
    try {
      let chunkEntities = [];
      if (provider === "ollama") {
        const ep = (state.settings.ollama.endpoint || "http://127.0.0.1:11434").replace(/\/+$/, "");
        const model = (state.settings.ollama.model || "qwen2.5:7b-instruct").replace(/^ollama::/, "");
        chunkEntities = await callOllamaGenerate(ep, model, chunk);
      } else if (provider === "lmstudio") {
        const ep = (state.settings.ollama.lmstudio_endpoint || "http://127.0.0.1:1234").replace(/\/+$/, "");
        const model = (state.settings.ollama.model || "default").replace(/^lmstudio::/, "");
        chunkEntities = await callOpenAiChat(ep, model, chunk);
      } else if (provider === "omlx") {
        const ep = (state.settings.ollama.omlx_endpoint || "http://127.0.0.1:1060").replace(/\/+$/, "");
        const model = (state.settings.ollama.model || "default").replace(/^omlx::/, "");
        chunkEntities = await callOpenAiChat(ep, model, chunk, state.settings.ollama.omlx_api_key || "");
      } else if (provider === "remote") {
        const ep = (state.settings.ollama.remote_endpoint || "").replace(/\/+$/, "");
        const model = (state.settings.ollama.model || "default").replace(/^remote::/, "");
        if (state.settings.ollama.remote_api_type === "ollama") {
          chunkEntities = await callOllamaGenerate(ep, model, chunk);
        } else {
          chunkEntities = await callOpenAiChat(ep, model, chunk, state.settings.ollama.remote_api_key || "");
        }
      }

      for (const ent of chunkEntities) {
        const key = `${ent.category}:${ent.text.toLowerCase()}`;
        if (!seenEntities.has(key)) {
          seenEntities.add(key);
          collectedEntities.push(ent);
        }
      }
    } catch (err) {
      console.warn("Local/Remote AI request skipped/fell back to browser engine:", err);
      const ep = provider === "ollama" ? state.settings.ollama.endpoint || "http://127.0.0.1:11434" : provider;
      notifyAiUnavailable(provider, describeAiFailure(err, ep, AI_TIMEOUT_MS));
      const msg = String((err && err.message) || err || "");
      if ((err && err.name === "AbortError") || /Failed to fetch|NetworkError|Load failed/i.test(msg)) break;
    }
  }
  // Keep what the sections found.
  return collectedEntities;
}

async function queryLocalhostVisionCorrection(imageCanvas, ocrHint) {
  if (!state.settings.ollama.enabled || state.settings.ollama.provider === "none") return ocrHint;
  const provider = state.settings.ollama.provider;
  const visionModel = state.settings.ollama.vision_model || "";
  if (!visionModel) return ocrHint;
  if (!confirmExternalAi()) return ocrHint;

  const dataUrl = imageCanvas.toDataURL("image/png", 0.95);
  const cleanB64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;

  try {
    if (provider === "ollama") {
      const ep = (state.settings.ollama.endpoint || "http://127.0.0.1:11434").replace(/\/+$/, "");
      const rawModel = visionModel.replace(/^ollama::/, "");
      const resp = await fetchWithTimeout(`${ep}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: rawModel,
          messages: [{
            role: "user",
            content: `Lies den Text in diesem Bildausschnitt präzise ab. Vorläufige OCR-Vermutung: '${ocrHint}'. Antworte AUSSCHLIESSLICH mit dem erkannten Text ohne Anführungszeichen.`,
            images: [cleanB64]
          }],
          stream: false,
          options: { temperature: 0.0 }
        })
      }, 25000);
      if (resp.ok) {
        const data = await resp.json();
        let txt = (data.message?.content || "").replace(/['"`]/g, "").trim();
        for (const p of ["der text lautet:", "der text ist:", "erkannt:", "text:"]) {
          if (txt.toLowerCase().startsWith(p)) txt = txt.slice(p.length).trim();
        }
        if (txt && Math.abs(txt.length - ocrHint.length) <= Math.max(4, ocrHint.length * 1.5)) {
          return txt;
        }
      }
    } else if (["lmstudio", "omlx", "remote"].includes(provider)) {
      const ep = (provider === "lmstudio"
        ? (state.settings.ollama.lmstudio_endpoint || "http://127.0.0.1:1234")
        : provider === "omlx"
        ? (state.settings.ollama.omlx_endpoint || "http://127.0.0.1:1060")
        : (state.settings.ollama.remote_endpoint || "")
      ).replace(/\/+$/, "");
      const base = ep.endsWith("/v1") ? ep : `${ep}/v1`;
      const rawModel = visionModel.replace(/^[a-z_]+::/, "");
      const headers = { "Content-Type": "application/json" };
      if (provider === "omlx" && state.settings.ollama.omlx_api_key) {
        headers.Authorization = `Bearer ${state.settings.ollama.omlx_api_key}`;
      } else if (provider === "remote" && state.settings.ollama.remote_api_key) {
        headers.Authorization = `Bearer ${state.settings.ollama.remote_api_key}`;
      }
      const resp = await fetchWithTimeout(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: rawModel,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: `Lies den Text in diesem Bildausschnitt präzise ab. Vorläufige OCR: '${ocrHint}'. Antworte NUR mit dem Text.` },
              { type: "image_url", image_url: { url: dataUrl } }
            ]
          }],
          max_tokens: 100,
          temperature: 0.0
        })
      }, 25000);
      if (resp.ok) {
        const data = await resp.json();
        let txt = (data.choices?.[0]?.message?.content || "").replace(/['"`]/g, "").trim();
        if (txt && Math.abs(txt.length - ocrHint.length) <= Math.max(4, ocrHint.length * 1.5)) {
          return txt;
        }
      }
    }
  } catch (err) {
    console.debug("[Vision AI Correction skip]:", err);
  }
  return ocrHint;
}

// ============================================================================
// FILE UPLOAD & CLIENT-SIDE ANALYSIS
// ============================================================================
function initDropzone() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files?.length > 0) handleFilesUpload(e.dataTransfer.files);
  });
  fileInput.addEventListener("change", (e) => {
    // Copy the list and empty the input: otherwise picking the same file again (after removing it or clearing the
    // session) fires no change event and nothing happens.
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (picked.length > 0) handleFilesUpload(picked);
  });
}

function ensureFileState(doc) {
  if (!doc) return doc;
  doc.pages_count = Number(doc.pages_count || doc.page_count || 1);
  doc.page_count = doc.pages_count;
  if (!doc.manualRedactions) doc.manualRedactions = {};
  if (!(doc.excludedEntityIds instanceof Set)) {
    doc.excludedEntityIds = new Set(Array.isArray(doc.excludedEntityIds) ? doc.excludedEntityIds : []);
  }
  return doc;
}

function getActiveFile() {
  if (!state.activeFileId) return null;
  return state.files.find((f) => f.id === state.activeFileId) || null;
}

function getPageEntities(fileOrData, pageNum) {
  const p = Number(pageNum) || 0;
  const eb =
    fileOrData?.analysisData?.entities_by_page ||
    fileOrData?.entities_by_page ||
    state.analysisData?.entities_by_page ||
    {};
  return eb[p] || eb[String(p)] || [];
}

// N3: only Safari/WebKit decodes TIFF in <img>; Chrome, Edge and the Android WebView do not.
const CAN_DECODE_TIFF = typeof navigator !== "undefined" &&
  /Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg\/|Android|Firefox/.test(navigator.userAgent);
const TIFF_EXTS = CAN_DECODE_TIFF ? [".tiff", ".tif"] : [];
const SUPPORTED_EXTS = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ...TIFF_EXTS];
const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ...TIFF_EXTS];
if (typeof document !== "undefined" && !CAN_DECODE_TIFF) {
  document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("fileInput");
    if (input) input.accept = ".pdf,image/png,image/jpeg,image/webp,image/bmp,.png,.jpg,.jpeg,.webp,.bmp";
  });
}

async function convertImageFileToPdfBytes(imageFile) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(imageFile);
    img.onload = () => {
      try {
        URL.revokeObjectURL(objectUrl);
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

        const { jsPDF } = window.jspdf;
        const orientation = width > height ? "l" : "p";
        const pdf = new jsPDF({
          orientation,
          unit: "pt",
          format: [width, height]
        });
        pdf.addImage(dataUrl, "JPEG", 0, 0, width, height);
        const arrayBuffer = pdf.output("arraybuffer");
        resolve(arrayBuffer);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Bild konnte nicht dekodiert werden"));
    };
    img.src = objectUrl;
  });
}

async function handleFilesUpload(fileList) {
  if (!window.pdfjsLib) {
    showToast("PDF.js wird noch geladen, bitte kurz warten...", "warning");
    return;
  }

  let added = 0;
  for (let i = 0; i < fileList.length; i++) {
    const rawFile = fileList[i];
    const nameLower = rawFile.name.toLowerCase();
    if (!CAN_DECODE_TIFF && (nameLower.endsWith(".tif") || nameLower.endsWith(".tiff"))) {
      showToast(`„${rawFile.name}“: TIFF kann dieser Browser nicht öffnen. Bitte als PDF, PNG oder JPG speichern (oder Safari nutzen).`, "warning", 7000);
      continue;
    }
    const isImage = IMAGE_EXTS.some((ext) => nameLower.endsWith(ext));
    const isPdf = nameLower.endsWith(".pdf");

    if (!isPdf && !isImage) continue;

    try {
      let arrayBuffer;
      let displayFilename = rawFile.name;

      if (isImage) {
        showToast(`Wandle Bild "${rawFile.name}" in PDF um...`, "info");
        arrayBuffer = await convertImageFileToPdfBytes(rawFile);
        displayFilename = rawFile.name.replace(/\.[^.]+$/, "") + ".pdf";
      } else {
        arrayBuffer = await rawFile.arrayBuffer();
      }

      const loadingTask = window.pdfjsLib.getDocument({
        data: arrayBuffer.slice(0),
        stopAtErrors: false,
        isEvalSupported: false,
        useSystemFonts: true,
        disableFontFace: false
      });

      // M6: masked input, a new question after a wrong password, and "Cancel" really stops loading (the old code
      // answered "" to a wrong password, so pdf.js asked again forever).
      let passwordTries = 0;
      loadingTask.onPassword = (callback, reason) => {
        const wrong = reason === window.pdfjsLib.PasswordResponses?.INCORRECT_PASSWORD;
        passwordTries++;
        if (passwordTries > 5) {
          loadingTask.destroy();
          return;
        }
        askPassword(rawFile.name, wrong).then((pwd) => {
          if (pwd === null) loadingTask.destroy();
          else callback(pwd);
        });
      };

      const pdfDoc = await loadingTask.promise;
      const docObj = ensureFileState({
        id: "doc_" + Math.random().toString(36).substring(2, 10),
        filename: displayFilename,
        originalFilename: rawFile.name,
        isImageSource: isImage,
        size_bytes: rawFile.size,
        pages_count: pdfDoc.numPages,
        rawFile,
        arrayBuffer,
        pdfDoc,
        analyzed: false,
        redacted: false,
        redactedBlobUrl: null,
        redactedBlob: null,
        entities_by_page: {},
        total_entities_count: 0
      });
      state.files.push(docObj);
      added++;
    } catch (err) {
      let errMsg = err.message || "Unbekannter Fehler";
      if (err.name === "InvalidPDFException" || errMsg.includes("Invalid PDF") || errMsg.includes("FormatError")) {
        errMsg = "Das Dokument ist ungültig oder beschädigt. Hinweis: Für hochauflösende Scans empfehlen wir einen Chromium-Browser (Google Chrome, Microsoft Edge, Brave) oder laden Sie die Datei als Bild (PNG/JPG) hoch.";
      } else if (err.name === "PasswordException") {
        errMsg = "Das Dokument ist kennwortgeschützt.";
      }
      showToast(`Fehler beim Lesen von "${rawFile.name}": ${errMsg}`, "error");
    }
  }

  if (added > 0) {
    syncFilenameUI();
    renderDocumentQueue();
    showToast(`${added} Dokument(e) zu 100% lokal geladen!`, "success");
  } else {
    showToast("Keine gültigen PDF- oder Bild-Dateien ausgewählt.", "warning");
  }
}

function renderDocumentQueue() {
  const tbody = document.getElementById("docTableBody");
  const queueCard = document.getElementById("queueCard");
  if (!tbody || !queueCard) return;

  if (state.files.length === 0) {
    queueCard.style.display = "none";
    return;
  }

  queueCard.style.display = "block";
  tbody.innerHTML = "";

  state.files.forEach((file, idx) => {
    ensureFileState(file);
    const tr = document.createElement("tr");

    let statusHtml = '<span class="status-badge"><span class="badge-dot dot-yellow"></span> Bereit im Browser</span>';
    if (file.redacted) {
      statusHtml = '<span class="status-badge"><span class="badge-dot dot-green"></span> Physisch geschwärzt</span>';
    } else if (file.analyzed) {
      statusHtml = `<span class="status-badge"><span class="badge-dot dot-green"></span> Analysiert (${file.total_entities_count || 0} Treffer)</span>`;
    }

    const sizeKb = (file.size_bytes / 1024).toFixed(1);
    const outName = computeOutputFilename(file.filename, idx);

    tr.innerHTML = `
      <td><strong>${escapeHtml(file.filename)}</strong></td>
      <td>${sizeKb} KB</td>
      <td>${file.pages_count} ${file.pages_count === 1 ? "Seite" : "Seiten"}</td>
      <td>${statusHtml}</td>
      <td>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button class="btn btn-secondary btn-sm" onclick="openEditorForFile('${file.id}')">
            🔍 Vorschau &amp; Detailprüfung
          </button>
          <button class="btn btn-primary btn-sm" onclick="redactSingleFile('${file.id}', true)">
            ⬛ Direkt schwärzen &amp; Download
          </button>
          ${file.redacted && file.redactedBlobUrl ? `
            <a href="${file.redactedBlobUrl}" download="${escapeHtml(outName)}" class="btn btn-success btn-sm">
              ⬇️ Download (${escapeHtml(outName)})
            </a>
          ` : ""}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const countEl = document.getElementById("outputFilesCount");
  if (countEl) {
    countEl.textContent = String(state.files.filter((f) => f.redacted).length);
  }
}

async function analyzeFileInBrowser(file) {
  ensureFileState(file);
  syncSettingsFromForm();

  const knownNames = { first_names: new Set(), last_names: new Set() };
  const pageContents = [];
  const rawAiEntitiesByPage = {};

  for (let p = 0; p < file.pages_count; p++) {
    setLoadingPhase(2, {
      progressPct: Math.round(20 + ((p + 1) / file.pages_count) * 35),
      subtitle: `Extrahiere Text & Wort-Koordinaten auf Seite ${p + 1} von ${file.pages_count}...`
    });
    const pageInfo = await extractPageWordsAndText(file.pdfDoc, p);
    pageContents.push(pageInfo);

    window.BlackMyDataPII.detectPiiRulesJS(
      pageInfo.text,
      state.settings.categories,
      state.settings.exceptions,
      knownNames,
      state.settings.sensitivity
    );
  }

  const entitiesByPage = {};
  let totalCount = 0;

  for (let p = 0; p < file.pages_count; p++) {
    const pageInfo = pageContents[p];
    let rawMatches = window.BlackMyDataPII.detectPiiRulesJS(
      pageInfo.text,
      state.settings.categories,
      state.settings.exceptions,
      knownNames,
      state.settings.sensitivity
    );

    if (state.settings.ollama.enabled && state.settings.ollama.provider !== "none") {
      setLoadingPhase(3, {
        progressPct: Math.round(58 + ((p + 1) / file.pages_count) * 25),
        subtitle: `KI (${state.settings.ollama.provider.toUpperCase()}) prüft Fließtext auf Seite ${p + 1}...`
      });
      const aiEntities = await queryLocalhostLLM(pageInfo.text);
      rawAiEntitiesByPage[p] = aiEntities;
      for (const aiEnt of aiEntities) {
        const keptAi = aiEnt.text ? window.BlackMyDataPII.trimWhitelisted(aiEnt.text.trim(), state.settings.exceptions) : null;
        if (!keptAi) continue;
        rawMatches.push({
          id: Math.random().toString(36).substring(2, 10),
          text: keptAi.text,
          category: aiEnt.category || "name",
          confidence: 0.92,
          source: "ai"
        });
      }
    }

    setLoadingPhase(4, {
      progressPct: Math.round(85 + ((p + 1) / file.pages_count) * 14),
      subtitle: `Berechne präzise PDF-Schwärzungs-Koordinaten für Seite ${p + 1}...`
    });

    const mapped = mapAndStabilize(rawMatches, pageInfo, p);
    entitiesByPage[p] = mapped;
    totalCount += mapped.length;
  }

  file.pageContents = pageContents;
  file.cachedAiEntities = rawAiEntitiesByPage;
  file.knownNames = knownNames;
  file.entities_by_page = entitiesByPage;
  file.analysisData = { entities_by_page: entitiesByPage, total_entities_count: totalCount };
  file.analyzed = true;
  file.analysisSignature = analysisSignature();
  file.total_entities_count = totalCount;
  reportAnalysisWarnings(file);
  return file.analysisData;
}

async function analyzeCurrentFile() {
  // N4: analysis, redaction and forced OCR share the OCR pool and progress UI; only one runs at a time.
  if (!beginBusy()) return;
  try {
    return await _analyzeCurrentFileImpl();
  } finally {
    endBusy();
  }
}

async function _analyzeCurrentFileImpl() {
  const file = getActiveFile();
  if (!file) return;

  const useAi = Boolean(state.settings.ollama.enabled && state.settings.ollama.provider !== "none");
  showLoadingOverlay({
    title: useAi ? "KI & Browser-Engine analysieren PDF..." : "Browser-PII-Engine analysiert PDF...",
    subtitle: `Analysiere "${file.filename}" (${file.pages_count} Seiten) zu 100% lokal im Browser`,
    fileLabel: `${file.filename} (${file.pages_count} Seiten)`,
    useAi,
    initialPhase: 1,
    initialProgress: 15
  });

  try {
    const data = await analyzeFileInBrowser(file);
    state.analysisData = data;
    renderDocumentQueue();
    renderPageThumbnails(file);
    await loadPageInEditor(state.currentPage < file.pages_count ? state.currentPage : 0);
    hideLoadingOverlay();
    showToast(`Analyse abgeschlossen! ${data.total_entities_count} sensible Einträge auf ${file.pages_count} Seite(n) erkannt.`, "success");
  } catch (err) {
    hideLoadingOverlay();
    showToast("Analysefehler: " + err.message, "error");
  }
}

// ============================================================================
// TRUE IRREVERSIBLE PHYSICAL PDF REDACTION IN THE BROWSER (Hybrid Raster & Vector)
// ============================================================================
async function buildPhysicallyRedactedPdfBlob(file) {
  syncSettingsFromForm();
  if (!file.analyzed) {
    await analyzeFileInBrowser(file);
  } else if (file.analysisSignature !== analysisSignature()) {
    // H1: categories, keywords, whitelist or sensitivity changed after the analysis: recompute the hits from the
    // stored page text (no new OCR needed) so newly added keywords are redacted too.
    reEvaluateFileEntitiesWithSensitivity(file, state.settings.sensitivity || "balanced");
  }

  let totalRedactedBoxes = 0;
  const fillColor = state.settings.style.fill_color || "#000000";
  const addLabel = Boolean(state.settings.style.add_label);
  const customLabel = state.settings.style.custom_label || "[GESCHWÄRZT]";
  // N1: 0 is a valid padding ("|| 2" turned it into 2). Values are PDF points.
  const padSetting = Number(state.settings.style.padding);
  const padPt = Number.isFinite(padSetting) && padSetting >= 0 ? padSetting : 2;
  // M2: word boxes are estimated from the text item; a little extra width keeps edge letters covered.
  const padX = padPt + 1;
  const excludedSet = file.excludedEntityIds || new Set();

  const PDFLib = (typeof window !== "undefined" && window.PDFLib) ? window.PDFLib : null;
  let srcPdfDoc = null;

  if (PDFLib && file.arrayBuffer) {
    try {
      srcPdfDoc = await PDFLib.PDFDocument.load(file.arrayBuffer.slice(0), { ignoreEncryption: true });
      if (srcPdfDoc && srcPdfDoc.isEncrypted) {
        // pdf-lib cannot decrypt encrypted PDF streams; vector-copying encrypted pages results in broken/unreadable output.
        // Fall back to rastering all pages (rendered in decrypted form by pdf.js) while still producing a clean unencrypted PDF via pdf-lib.
        srcPdfDoc = null;
      }
    } catch (e) {
      console.warn("Could not load PDF via pdf-lib for hybrid vector copy:", e);
      srcPdfDoc = null;
    }
  }

  // HYBRID / PDF-LIB APPROACH:
  // - Pages WITHOUT redactions on unencrypted documents: copied 1:1 as original vector pages (zero quality loss, minimal size)
  // - Pages WITH redactions OR from encrypted sources: raster-burned via canvas-to-image (sensitive text/vectors physically destroyed, decrypted pages safely flattened)
  // - Memory protection: canvas width/height reset to 0 after each page, Uint8Array instead of huge Base64 data URLs
  if (PDFLib) {
    const outPdfDoc = await PDFLib.PDFDocument.create();

    for (let p = 0; p < file.pages_count; p++) {
      setLoadingPhase(4, {
        progressPct: Math.round(35 + ((p + 1) / file.pages_count) * 60),
        subtitle: `Physische Schwärzung (Hybrid-Verfahren) auf Seite ${p + 1} von ${file.pages_count}...`
      });

      const pageEntities = getPageEntities(file, p);
      const boxesToBurn = [];

      for (const ent of pageEntities) {
        if (excludedSet.has(ent.id)) continue;
        for (const r of ent.rects || []) {
          boxesToBurn.push({ rect: r, label: customLabel.replace("{CATEGORY}", formatCategoryLabel(ent.category)) });
        }
      }

      const manualList = file.manualRedactions?.[p] || file.manualRedactions?.[String(p)] || [];
      for (const mr of manualList) {
        boxesToBurn.push({ rect: mr, label: customLabel.replace("{CATEGORY}", "MANUELL") });
      }

      // K1: OCR failed or was unavailable on this page – its content is unknown, so nothing of it may leave.
      const pageInfo = (file.pageContents || [])[p] || {};
      const ocrFailed = pageInfo.ocrStatus === "failed" || pageInfo.ocrStatus === "unavailable";
      // M5: form fields and annotations are not part of the copied text check; such pages are flattened (rendered
      // with their values) instead of copied, so values are neither lost nor passed on unchecked.
      let hasAnnotations = false;
      try {
        const annots = await (await file.pdfDoc.getPage(p + 1)).getAnnotations();
        hasAnnotations = Array.isArray(annots) && annots.length > 0;
      } catch (e) { /* treat as none */ }

      // Hybrid vector copy ONLY for unencrypted sources on pages with NO redactions, unless full rasterization is requested
      const rasterizeAll = Boolean(state.settings.rasterize_all_pages);
      if (srcPdfDoc && !srcPdfDoc.isEncrypted && !rasterizeAll && boxesToBurn.length === 0 && !ocrFailed && !hasAnnotations) {
        // Page WITHOUT redactions: copy 1:1 original vector page (zero quality loss, minimal size)
        const [copiedPage] = await outPdfDoc.copyPages(srcPdfDoc, [p]);
        // Strip comments, annotations, popups, attachments, stamps, and page-level actions
        copiedPage.node.delete(PDFLib.PDFName.of("Annots"));
        copiedPage.node.delete(PDFLib.PDFName.of("AA"));
        outPdfDoc.addPage(copiedPage);
        continue;
      }

      // Page WITH redactions: Raster-Burn to physically eradicate sensitive text and vector paths
      const page = await file.pdfDoc.getPage(p + 1);
      const ptViewport = page.getViewport({ scale: 1.0 });
      const burnScale = getSafeRenderScale(ptViewport.width, ptViewport.height, 2.0, 3200);
      const burnViewport = page.getViewport({ scale: burnScale });

      const offCanvas = document.createElement("canvas");
      offCanvas.width = Math.round(burnViewport.width);
      offCanvas.height = Math.round(burnViewport.height);
      const ctx = offCanvas.getContext("2d");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

      // Form field values and annotations are drawn into the image too (they are flattened).
      const pdfjs = typeof window !== "undefined" ? window.pdfjsLib : undefined;
      const annotationMode = pdfjs && pdfjs.AnnotationMode ? pdfjs.AnnotationMode.ENABLE : undefined;
      await page.render({ canvasContext: ctx, viewport: burnViewport, annotationMode }).promise;

      if (ocrFailed) {
        ctx.fillStyle = fillColor;
        ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.max(12, Math.round(14 * burnScale))}px sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText("[Seite vollständig geschwärzt – Texterkennung fehlgeschlagen]", 20 * burnScale, offCanvas.height / 2, offCanvas.width - 40 * burnScale);
        totalRedactedBoxes++;
        boxesToBurn.length = 0;
      }

      for (const item of boxesToBurn) {
        const [x0, y0, x1, y1] = item.rect;
        const rx = Math.max(0, (x0 - padX) * burnScale);
        const ry = Math.max(0, (y0 - padPt) * burnScale);
        const rw = Math.min(offCanvas.width - rx, (x1 - x0 + padX * 2) * burnScale);
        const rh = Math.min(offCanvas.height - ry, (y1 - y0 + padPt * 2) * burnScale);

        ctx.fillStyle = fillColor;
        ctx.fillRect(rx, ry, rw, rh);

        if (addLabel && rw > 28 && rh > 8) {
          ctx.fillStyle = "#ffffff";
          const fontPx = Math.max(7, Math.min(13, Math.floor(rh * 0.65)));
          ctx.font = `bold ${fontPx}px sans-serif`;
          ctx.textBaseline = "middle";
          ctx.fillText(item.label, rx + 3, ry + rh / 2, rw - 6);
        }
        totalRedactedBoxes++;
      }

      // Convert canvas to Uint8Array directly via toBlob (avoids large base64 strings in heap)
      const imgBytes = await new Promise((resolve, reject) => {
        offCanvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Canvas toBlob fehlgeschlagen"));
              return;
            }
            blob.arrayBuffer()
              .then((buf) => resolve(new Uint8Array(buf)))
              .catch(reject);
          },
          "image/jpeg",
          0.92
        );
      });

      // Clear offscreen canvas immediately to free backing store and prevent OOM
      offCanvas.width = 0;
      offCanvas.height = 0;

      const embeddedJpg = await outPdfDoc.embedJpg(imgBytes);
      const newPage = outPdfDoc.addPage([ptViewport.width, ptViewport.height]);
      newPage.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width: ptViewport.width,
        height: ptViewport.height
      });
    }

    // Strip interactive form fields (AcroForm) so hidden form values don't leak
    try {
      const form = outPdfDoc.getForm();
      if (form) form.flatten();
    } catch (e) {
      // Ignore if flatten fails or if form has no fields
    }
    outPdfDoc.catalog.delete(PDFLib.PDFName.of("AcroForm"));
    // Strip document-level actions, names (attachments, embedded files), and open actions
    outPdfDoc.catalog.delete(PDFLib.PDFName.of("AA"));
    outPdfDoc.catalog.delete(PDFLib.PDFName.of("Names"));
    outPdfDoc.catalog.delete(PDFLib.PDFName.of("OpenAction"));

    // C4: Neutral, privacy-preserving metadata
    outPdfDoc.setProducer("blackMyData");
    outPdfDoc.setCreator("blackMyData");
    outPdfDoc.setTitle("");
    outPdfDoc.setAuthor("");
    outPdfDoc.setSubject("");
    outPdfDoc.setKeywords([]);

    const finalPdfBytes = await outPdfDoc.save({ updateMetadata: false });
    const blob = new Blob([finalPdfBytes], { type: "application/pdf" });
    return { blob, totalRedactedBoxes };
  }

  // Fallback to jsPDF if pdf-lib is unavailable (with OOM protection)
  const { jsPDF } = window.jspdf;
  let pdfOut = null;

  for (let p = 0; p < file.pages_count; p++) {
    setLoadingPhase(4, {
      progressPct: Math.round(35 + ((p + 1) / file.pages_count) * 60),
      subtitle: `Physische Schwärzung & Vektor-Bereinigung auf Seite ${p + 1} von ${file.pages_count}...`
    });

    const page = await file.pdfDoc.getPage(p + 1);
    const ptViewport = page.getViewport({ scale: 1.0 });
    const burnScale = getSafeRenderScale(ptViewport.width, ptViewport.height, 2.0, 3200);
    const burnViewport = page.getViewport({ scale: burnScale });

    const offCanvas = document.createElement("canvas");
    offCanvas.width = Math.round(burnViewport.width);
    offCanvas.height = Math.round(burnViewport.height);
    const ctx = offCanvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

    await page.render({ canvasContext: ctx, viewport: burnViewport }).promise;

    const pageEntities = getPageEntities(file, p);
    const boxesToBurn = [];

    for (const ent of pageEntities) {
      if (excludedSet.has(ent.id)) continue;
      for (const r of ent.rects || []) {
        boxesToBurn.push({ rect: r, label: customLabel.replace("{CATEGORY}", formatCategoryLabel(ent.category)) });
      }
    }

    const manualList = file.manualRedactions?.[p] || file.manualRedactions?.[String(p)] || [];
    for (const mr of manualList) {
      boxesToBurn.push({ rect: mr, label: customLabel.replace("{CATEGORY}", "MANUELL") });
    }

    const fallbackInfo = (file.pageContents || [])[p] || {};
    if (fallbackInfo.ocrStatus === "failed" || fallbackInfo.ocrStatus === "unavailable") {
      // K1: unknown content after a failed OCR – the whole page is blacked out.
      ctx.fillStyle = fillColor;
      ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);
      totalRedactedBoxes++;
      boxesToBurn.length = 0;
    }
    for (const item of boxesToBurn) {
      const [x0, y0, x1, y1] = item.rect;
      const rx = Math.max(0, (x0 - padX) * burnScale);
      const ry = Math.max(0, (y0 - padPt) * burnScale);
      const rw = Math.min(offCanvas.width - rx, (x1 - x0 + padX * 2) * burnScale);
      const rh = Math.min(offCanvas.height - ry, (y1 - y0 + padPt * 2) * burnScale);

      ctx.fillStyle = fillColor;
      ctx.fillRect(rx, ry, rw, rh);

      if (addLabel && rw > 28 && rh > 8) {
        ctx.fillStyle = "#ffffff";
        const fontPx = Math.max(7, Math.min(13, Math.floor(rh * 0.65)));
        ctx.font = `bold ${fontPx}px sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText(item.label, rx + 3, ry + rh / 2, rw - 6);
      }
      totalRedactedBoxes++;
    }

    const imgDataUrl = offCanvas.toDataURL("image/jpeg", 0.92);
    // Free canvas backing memory to prevent OOM
    offCanvas.width = 0;
    offCanvas.height = 0;

    const orientation = ptViewport.width > ptViewport.height ? "l" : "p";

    if (p === 0) {
      pdfOut = new jsPDF({
        orientation,
        unit: "pt",
        format: [ptViewport.width, ptViewport.height],
        compress: true
      });
    } else {
      pdfOut.addPage([ptViewport.width, ptViewport.height], orientation);
    }

    pdfOut.addImage(imgDataUrl, "JPEG", 0, 0, ptViewport.width, ptViewport.height, undefined, "FAST");
  }

  if (pdfOut.setProperties) {
    pdfOut.setProperties({
      title: "",
      subject: "",
      author: "",
      keywords: "",
      creator: "blackMyData"
    });
  }

  const blob = pdfOut.output("blob");
  return { blob, totalRedactedBoxes };
}

async function redactSingleFile(fileId, triggerDownload = true) {
  // N4: analysis, redaction and forced OCR share the OCR pool and progress UI; only one runs at a time.
  if (!beginBusy()) return;
  try {
    return await _redactSingleFileImpl(fileId, triggerDownload);
  } finally {
    endBusy();
  }
}

async function _redactSingleFileImpl(fileId, triggerDownload = true) {
  state.activeFileId = fileId;
  const fileIndex = state.files.findIndex((f) => f.id === fileId);
  const file = state.files[fileIndex];
  if (!file) return;
  ensureFileState(file);

  const useAi = Boolean(state.settings.ollama.enabled && state.settings.ollama.provider !== "none") && !file.analyzed;
  showLoadingOverlay({
    title: "Physische PDF-Schwärzung im Browser...",
    subtitle: `Unwiderrufliche Entfernung von Text-Vektoren & Pixeln in "${file.filename}"`,
    fileLabel: `${file.filename} (${file.pages_count} Seiten)`,
    useAi,
    initialPhase: file.analyzed ? 4 : 1,
    initialProgress: file.analyzed ? 55 : 15
  });

  try {
    const { blob, totalRedactedBoxes } = await buildPhysicallyRedactedPdfBlob(file);
    if (file.redactedBlobUrl) URL.revokeObjectURL(file.redactedBlobUrl);
    file.redactedBlob = blob;
    file.redactedBlobUrl = URL.createObjectURL(blob);
    file.redacted = true;

    const outName = computeOutputFilename(file.filename, fileIndex);
    hideLoadingOverlay();
    renderDocumentQueue();
    showToast(`"${outName}" unwiderruflich geschwärzt (${totalRedactedBoxes} Bereiche)!`, "success");

    if (triggerDownload) {
      const a = document.createElement("a");
      a.href = file.redactedBlobUrl;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  } catch (err) {
    hideLoadingOverlay();
    showToast("Fehler beim Schwärzen: " + err.message, "error");
  }
}

async function redactCurrentDocument() {
  if (!state.activeFileId) return;
  await redactSingleFile(state.activeFileId, true);
}

async function batchRedactAll() {
  // N4: analysis, redaction and forced OCR share the OCR pool and progress UI; only one runs at a time.
  if (!beginBusy()) return;
  try {
    return await _batchRedactAllImpl();
  } finally {
    endBusy();
  }
}

async function _batchRedactAllImpl() {
  if (state.files.length === 0) {
    showToast("Bitte zuerst mindestens eine PDF-Datei auswählen.", "warning");
    return;
  }

  for (const file of state.files) {
    await _redactSingleFileImpl(file.id, state.files.length === 1);
  }

  if (state.files.length > 1) {
    await downloadAllAsZip();
  }
}

async function downloadAllAsZip() {
  const redactedFiles = state.files.filter((f) => f.redacted && f.redactedBlob);
  if (redactedFiles.length === 0) {
    showToast("Noch keine geschwärzten Dateien vorhanden. Klicke zuerst auf 'Alle Dokumente jetzt schwärzen'.", "warning");
    return;
  }

  if (!window.JSZip) {
    redactedFiles.forEach((f, idx) => {
      const a = document.createElement("a");
      a.href = f.redactedBlobUrl;
      a.download = computeOutputFilename(f.filename, idx);
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    return;
  }

  const zip = new window.JSZip();
  const usedNames = new Set();
  redactedFiles.forEach((f, idx) => {
    let outName = computeOutputFilename(f.filename, idx);
    if (usedNames.has(outName.toLowerCase())) {
      outName = outName.replace(/\.pdf$/i, "") + `_${idx + 1}.pdf`;
    }
    usedNames.add(outName.toLowerCase());
    zip.file(outName, f.redactedBlob);
  });

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const zipUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = zipUrl;
  a.download = "BlackMyData_Geschwaerzte_PDFs.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);
  showToast(`ZIP-Archiv mit ${redactedFiles.length} geschwärzten PDF(s) heruntergeladen!`, "success");
}

// ============================================================================
// EDITOR NAVIGATION & UI HELPERS
// ============================================================================
async function openEditorForFile(fileId) {
  state.activeFileId = fileId;
  const file = state.files.find((f) => f.id === fileId);
  if (!file) return;
  ensureFileState(file);

  state.analysisData = file.analysisData || { entities_by_page: file.entities_by_page || {} };
  state.manualRedactions = file.manualRedactions;
  if (pdfViewer) {
    pdfViewer.manualRedactions = file.manualRedactions;
    pdfViewer.excludedEntityIds = file.excludedEntityIds;
    pdfViewer.totalPages = file.pages_count;
  }

  switchTab("editor");

  const fileNameEl = document.getElementById("editorFileName");
  if (fileNameEl) fileNameEl.textContent = file.filename;

  const totalPagesEl = document.getElementById("editorTotalPages");
  if (totalPagesEl) totalPagesEl.textContent = String(file.pages_count);

  const sidebarCountEl = document.getElementById("sidebarPageCountBadge");
  if (sidebarCountEl) {
    sidebarCountEl.textContent = `${file.pages_count} ${file.pages_count === 1 ? "Seite" : "Seiten"}`;
  }

  renderPageThumbnails(file);

  if (!file.analyzed) {
    await analyzeCurrentFile();
  } else {
    await loadPageInEditor(0);
  }
}

function renderPageThumbnails(file) {
  if (!file) file = getActiveFile();
  if (!file) return;
  ensureFileState(file);

  const container = document.getElementById("pageThumbnailsList");
  const pageSelect = document.getElementById("editorPageSelect");
  const totalPages = file.pages_count || 1;

  if (pageSelect) {
    pageSelect.innerHTML = "";
    for (let i = 0; i < totalPages; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `Seite ${i + 1} / ${totalPages}`;
      if (i === state.currentPage) opt.selected = true;
      pageSelect.appendChild(opt);
    }
  }

  if (!container) return;
  container.innerHTML = "";
  const excludedSet = file.excludedEntityIds || pdfViewer?.excludedEntityIds || new Set();

  for (let i = 0; i < totalPages; i++) {
    const pageEntities = getPageEntities(file, i);
    const activePiiCount = pageEntities.filter((e) => !excludedSet.has(e.id)).length;
    const manualList = file.manualRedactions?.[i] || file.manualRedactions?.[String(i)] || [];
    const manualCount = Array.isArray(manualList) ? manualList.length : 0;

    const card = document.createElement("button");
    card.type = "button";
    card.className = `page-thumb-card ${i === state.currentPage ? "active" : ""}`;
    card.dataset.pageIndex = String(i);

    let badgesHtml = "";
    if (file.analyzed) {
      badgesHtml += `<span class="page-mini-badge ${activePiiCount > 0 ? "has-pii" : ""}">🔍 ${activePiiCount} PII</span>`;
    } else {
      badgesHtml += `<span class="page-mini-badge">Noch nicht gescannt</span>`;
    }
    if (manualCount > 0) {
      badgesHtml += `<span class="page-mini-badge has-manual">✏️ ${manualCount} manuell</span>`;
    }

    card.innerHTML = `
      <div class="page-thumb-header">
        <span>📄 Seite ${i + 1}</span>
        <span style="font-size: 0.7rem; color: var(--text-secondary);">#${i + 1}/${totalPages}</span>
      </div>
      <div class="page-thumb-badges">${badgesHtml}</div>
    `;
    card.addEventListener("click", () => loadPageInEditor(i));
    container.appendChild(card);
  }
}

async function loadPageInEditor(pageNum) {
  const activeFile = getActiveFile();
  if (!activeFile) return;
  ensureFileState(activeFile);

  const totalPages = activeFile.pages_count || 1;
  const clampedPage = Math.max(0, Math.min(totalPages - 1, Number(pageNum) || 0));
  state.currentPage = clampedPage;
  state.activePageNum = clampedPage;

  const currentPageEl = document.getElementById("editorCurrentPage");
  if (currentPageEl) currentPageEl.textContent = String(clampedPage + 1);
  const totalPagesEl = document.getElementById("editorTotalPages");
  if (totalPagesEl) totalPagesEl.textContent = String(totalPages);
  const pageSelectEl = document.getElementById("editorPageSelect");
  if (pageSelectEl) pageSelectEl.value = String(clampedPage);

  const prevBtn = document.getElementById("btnPrevPage");
  if (prevBtn) prevBtn.disabled = clampedPage <= 0;
  const nextBtn = document.getElementById("btnNextPage");
  if (nextBtn) nextBtn.disabled = clampedPage >= totalPages - 1;

  const viewport = document.getElementById("canvasViewport");
  if (viewport) viewport.scrollTop = 0;

  const thumbCards = document.getElementById("pageThumbnailsList")?.children || [];
  for (let i = 0; i < thumbCards.length; i++) {
    thumbCards[i].classList.toggle("active", i === clampedPage);
  }

  if (pdfViewer) {
    pdfViewer.manualRedactions = activeFile.manualRedactions;
    pdfViewer.excludedEntityIds = activeFile.excludedEntityIds;
  }

  const pageEntities = getPageEntities(activeFile, clampedPage);
  if (pdfViewer) {
    await pdfViewer.loadPage(activeFile, clampedPage, pageEntities);
  }

  updateManualToolbarUI();
  renderDetectedEntitiesList(pageEntities);
}

function changeEditorPage(delta) {
  const activeFile = getActiveFile();
  if (!activeFile) return;
  const target = state.currentPage + delta;
  if (target < 0 || target >= activeFile.pages_count) return;
  loadPageInEditor(target);
}

function setEditorZoom(scale) {
  if (!pdfViewer) return;
  pdfViewer.setZoom(scale);
  document.querySelectorAll(".zoom-btn").forEach((btn) => {
    const z = parseFloat(btn.dataset.zoom);
    btn.classList.toggle("active", Math.abs(z - scale) < 0.01);
  });
}

function updateManualToolbarUI() {
  const clearBtn = document.getElementById("btnClearManualPage");
  const countBadge = document.getElementById("manualPageCountBadge");
  if (!clearBtn || !pdfViewer) return;
  const manuals = pdfViewer.getManualRedactionsForPage(state.currentPage);
  if (countBadge) countBadge.textContent = String(manuals.length);
  clearBtn.style.display = manuals.length > 0 ? "inline-flex" : "none";
}

function clearManualRedactionsOnCurrentPage() {
  if (!pdfViewer) return;
  pdfViewer.clearManualRedactionsForPage(state.currentPage);
  showToast(`Manuelle Schwärzungen auf Seite ${state.currentPage + 1} entfernt.`, "info");
}

async function forceOcrOnCurrentPage() {
  // N4: analysis, redaction and forced OCR share the OCR pool and progress UI; only one runs at a time.
  if (!beginBusy()) return;
  try {
    return await _forceOcrOnCurrentPageImpl();
  } finally {
    endBusy();
  }
}

async function _forceOcrOnCurrentPageImpl() {
  const activeFile = getActiveFile();
  if (!activeFile) {
    showToast("⚠️ Kein Dokument geöffnet.", "warning");
    return;
  }
  if (!activeFile.pdfDoc) {
    showToast("⚠️ PDF-Dokument noch nicht geladen.", "warning");
    return;
  }

  const pIndex = state.currentPage;
  const pageNum = pIndex + 1;
  const forceBtn = document.getElementById("btnForceOcrPage");
  const origHtml = forceBtn ? forceBtn.innerHTML : "";
  if (forceBtn) {
    forceBtn.disabled = true;
    forceBtn.innerHTML = `<span class="ocr-btn-spinner"></span> Initialisiere OCR Seite ${pageNum}...`;
  }

  showToast(`🔍 Starte Texterkennung (OCR) für Seite ${pageNum}...`, "info", 4000);

  const progressHandler = (status, pct) => {
    if (!forceBtn) return;
    const statusMap = {
      "loading tesseract core": "Lade OCR-Kern",
      "initializing tesseract": "Initialisiere",
      "loading language traineddata": "Lade Sprachdaten",
      "initializing api": "Starte Engine",
      "recognizing text": "Erkenne Text"
    };
    const label = statusMap[status] || status || "OCR läuft";
    const percent = Math.round((pct || 0) * 100);
    forceBtn.innerHTML = `<span class="ocr-btn-spinner"></span> ${label} (${percent}%)...`;
  };

  try {
    const pageInfo = await extractPageWordsAndText(activeFile.pdfDoc, pIndex, true, progressHandler);
    if (!activeFile.pageContents) {
      activeFile.pageContents = [];
    }
    activeFile.pageContents[pIndex] = pageInfo;

    const knownNames = activeFile.knownNames || { first_names: new Set(), last_names: new Set() };
    const rawMatches = window.BlackMyDataPII.detectPiiRulesJS(
      pageInfo.text,
      state.settings.categories,
      state.settings.exceptions,
      knownNames,
      state.settings.sensitivity
    );

    if (activeFile.cachedAiEntities && activeFile.cachedAiEntities[pIndex]) {
      for (const aiEnt of activeFile.cachedAiEntities[pIndex]) {
        const keptAi = aiEnt.text ? window.BlackMyDataPII.trimWhitelisted(aiEnt.text.trim(), state.settings.exceptions) : null;
        if (!keptAi) continue;
        rawMatches.push({
          id: Math.random().toString(36).substring(2, 10),
          text: keptAi.text,
          category: aiEnt.category || "name",
          confidence: 0.92,
          source: "ai"
        });
      }
    }

    const mapped = mapAndStabilize(rawMatches, pageInfo, pIndex);
    markFileChanged(activeFile);
    if (!activeFile.entities_by_page) activeFile.entities_by_page = {};
    activeFile.entities_by_page[pIndex] = mapped;

    let totalCount = 0;
    for (const p in activeFile.entities_by_page) {
      totalCount += (activeFile.entities_by_page[p] || []).length;
    }
    activeFile.total_entities_count = totalCount;
    if (activeFile.analysisData) {
      activeFile.analysisData.entities_by_page = activeFile.entities_by_page;
      activeFile.analysisData.total_entities_count = totalCount;
    }

    renderPageThumbnails(activeFile);
    await loadPageInEditor(pIndex);

    if (forceBtn) {
      forceBtn.innerHTML = `✅ Seite ${pageNum} erkannt (${pageInfo.words.length} Wörter)`;
      await new Promise(r => setTimeout(r, 1500));
    }

    showToast(`✅ OCR für Seite ${pageNum} abgeschlossen: ${pageInfo.words.length} Wörter erkannt, ${mapped.length} PII markiert!`, "success", 5000);
  } catch (err) {
    console.error("Fehler bei manueller OCR-Erkennung:", err);
    showToast(`⚠️ OCR-Fehler auf Seite ${pageNum}: ${err?.message || err}`, "danger", 6000);
  } finally {
    if (forceBtn) {
      forceBtn.disabled = false;
      forceBtn.innerHTML = origHtml || "🔍 Texterkennung (OCR) für diese Seite erzwingen / erneut ausführen";
    }
  }
}

function removeManualRedactionFromSidebar(pageNum, index) {
  if (!pdfViewer) return;
  pdfViewer.removeManualRedaction(pageNum, index);
}

function renderDetectedEntitiesList(entities) {
  const container = document.getElementById("entityListContainer");
  const countEl = document.getElementById("entityCountBadge");
  if (!container || !countEl) return;

  const safeEntities = Array.isArray(entities) ? entities : [];
  const manualRects = pdfViewer ? pdfViewer.getManualRedactionsForPage(state.currentPage) : [];
  const excludedSet = pdfViewer ? pdfViewer.excludedEntityIds : new Set();
  const activeAutoCount = safeEntities.filter((e) => !excludedSet.has(e.id)).length;

  countEl.textContent = String(activeAutoCount + manualRects.length);
  container.innerHTML = "";

  if (manualRects.length > 0) {
    const manualHeader = document.createElement("div");
    manualHeader.className = "entity-section-header";
    manualHeader.innerHTML = `
      <span>✏️ Manuelle Schwärzungen (${manualRects.length})</span>
      <button type="button" class="btn btn-secondary btn-sm" style="padding: 0.1rem 0.4rem; font-size: 0.68rem;" onclick="clearManualRedactionsOnCurrentPage()">Alle löschen</button>
    `;
    container.appendChild(manualHeader);

    manualRects.forEach((r, idx) => {
      const item = document.createElement("div");
      item.className = "entity-item manual-entity-item";
      const wPt = Math.max(1, Math.round(r[2] - r[0]));
      const hPt = Math.max(1, Math.round(r[3] - r[1]));
      item.innerHTML = `
        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 225px;">
          <span class="category-tag tag-manual">MANUELL</span>
          <strong>Bereich #${idx + 1}</strong>
          <span style="font-size: 0.7rem; color: var(--text-secondary);">(${wPt}×${hPt} pt)</span>
        </div>
        <button type="button" class="btn btn-danger btn-sm" style="padding: 0.15rem 0.45rem; font-size: 0.72rem;" onclick="event.stopPropagation(); removeManualRedactionFromSidebar(${state.currentPage}, ${idx})">🗑️</button>
      `;
      item.addEventListener("click", () => removeManualRedactionFromSidebar(state.currentPage, idx));
      container.appendChild(item);
    });
  }

  if (safeEntities.length === 0 && manualRects.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.84rem; text-align: center; padding: 1.75rem 0.75rem;">Keine sensiblen Daten auf Seite ${state.currentPage + 1} erkannt.<br><br><span style="font-size: 0.76rem;">Tipp: Ziehe mit der Maus ein Rechteck direkt auf dem Dokument, um eigene Bereiche manuell zu schwärzen.</span></div>`;
    return;
  }

  if (safeEntities.length > 0) {
    const autoHeader = document.createElement("div");
    autoHeader.className = "entity-section-header";
    autoHeader.innerHTML = `<span>🔍 Automatisch erkannt (${safeEntities.length})</span>`;
    container.appendChild(autoHeader);

    safeEntities.forEach((ent) => {
      const isExcluded = excludedSet.has(ent.id);
      const item = document.createElement("div");
      item.className = `entity-item ${isExcluded ? "deselected" : ""}`;
      item.id = `entity-item-${ent.id}`;
      const labelDe = formatCategoryLabel(ent.category);
      const isLowConf = Boolean(ent.lowConfidence);
      const isVision = (ent.source === "vision");
      const badgeSuffix = isLowConf
        ? ' <span title="⚠️ Unsichere Erkennung / OCR – bitte prüfen" style="color: #f59e0b; font-size: 0.75rem;">⚠️</span>'
        : (isVision ? ' <span title="👁️ Von Vision-KI korrigiert" style="color: #10b981; font-size: 0.75rem;">👁️</span>' : '');

      item.innerHTML = `
        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;" title="${escapeHtml(labelDe)}: ${escapeHtml(ent.text)}">
          <span class="category-tag tag-${ent.category}">${escapeHtml(labelDe)}</span>
          <strong>${escapeHtml(ent.text)}</strong>${badgeSuffix}
        </div>
        <input type="checkbox" ${isExcluded ? "" : "checked"} onclick="event.stopPropagation(); toggleEntityFromList('${ent.id}')" />
      `;
      item.onclick = () => toggleEntityFromList(ent.id);
      container.appendChild(item);
    });
  }
}

function toggleEntityFromList(entityId) {
  if (!pdfViewer) return;
  pdfViewer.toggleEntity(entityId);
}

function updateEntityItemCheckbox(entityId, isSelected) {
  const item = document.getElementById(`entity-item-${entityId}`);
  if (item) {
    item.classList.toggle("deselected", !isSelected);
    const cb = item.querySelector("input[type='checkbox']");
    if (cb) cb.checked = isSelected;
  }
  const activeFile = getActiveFile();
  if (activeFile) {
    const pageEntities = getPageEntities(activeFile, state.currentPage);
    const manualRects = pdfViewer ? pdfViewer.getManualRedactionsForPage(state.currentPage) : [];
    const excludedSet = pdfViewer ? pdfViewer.excludedEntityIds : new Set();
    const activeAutoCount = pageEntities.filter((e) => !excludedSet.has(e.id)).length;
    const countEl = document.getElementById("entityCountBadge");
    if (countEl) countEl.textContent = String(activeAutoCount + manualRects.length);
  }
}

function selectAllEntitiesOnPage(select) {
  const activeFile = getActiveFile();
  if (!activeFile || !pdfViewer) return;
  const pageEntities = getPageEntities(activeFile, state.currentPage);
  pageEntities.forEach((ent) => {
    if (select) pdfViewer.excludedEntityIds.delete(ent.id);
    else pdfViewer.excludedEntityIds.add(ent.id);
  });
  activeFile.excludedEntityIds = pdfViewer.excludedEntityIds;
  markFileChanged(activeFile);
  pdfViewer.renderOverlays();
  renderPageThumbnails(activeFile);
  renderDetectedEntitiesList(pageEntities);
}

// ============================================================================
// SETTINGS, THEME, TABS, WIZARD & LOADING MODAL
// ============================================================================
function initTheme() {
  const saved = localStorage.getItem("bmd_web_theme") || "dark";
  setTheme(saved);
  document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
    setTheme(state.theme === "dark" ? "light" : "dark");
  });
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("bmd_web_theme", theme);
  const icon = document.getElementById("themeToggleIcon");
  if (icon) icon.textContent = theme === "dark" ? "☀️" : "🌙";
  notifyHostSystemBars(theme);
}

/** "rgb(30, 41, 59)" / "rgba(…)" / "#1e293b" → "#1e293b"; anything else → "". */
function cssColorToHex(value) {
  const v = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  const m = v.match(/^rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/i);
  if (!m) return "";
  return "#" + m.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("");
}

/**
 * B-E1: the Android app draws edge-to-edge and keeps the page clear of the status and navigation bars. It colours
 * those bars like the header (top) and the page (bottom) and picks dark or light bar icons, so it needs the colours
 * of the current theme. Only the Android app has the bridge; browsers and desktop builds skip this.
 */
function notifyHostSystemBars(theme) {
  const bridge = typeof window !== "undefined" ? window.BlackMyDataAndroid : null;
  if (!bridge || (typeof bridge.postMessage !== "function" && typeof bridge.message !== "function")) return;
  try {
    const header = document.querySelector(".app-header");
    const top = header ? cssColorToHex(getComputedStyle(header).backgroundColor) : "";
    const bottom = document.body ? cssColorToHex(getComputedStyle(document.body).backgroundColor) : "";
    const msg = JSON.stringify({ op: "theme", theme, top, bottom });
    if (typeof bridge.postMessage === "function") bridge.postMessage(msg);
    else bridge.message(msg);
  } catch (e) {
    // bars keep their colours
  }
}

function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    if (!btn.dataset.tab) return;
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  state.currentTab = tabId;
  document.querySelectorAll(".tab-btn[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabId));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.toggle("active", c.id === `tab-${tabId}`));
  if (tabId === "about") {
    loadAboutAndPackages();
  } else if (tabId === "editor") {
    if (!state.activeFileId && state.files.length > 0) {
      openEditorForFile(state.files[0].id);
    } else if (pdfViewer) {
      setTimeout(() => pdfViewer.renderOverlays(), 60);
    }
  }
}

function setRecognitionMode(mode) {
  state.settings.recognition_mode = mode;
  if (mode === "fast") {
    state.settings.preset = "turbo";
    state.settings.ocr.mode = "auto";
    state.settings.ocr.precision = "standard";
    state.settings.ollama.enabled = false;
  } else if (mode === "precise") {
    state.settings.preset = "balanced";
    state.settings.ocr.mode = "auto";
    state.settings.ocr.precision = "precise";
    state.settings.ollama.enabled = state.settings.ollama.provider !== "none";
  } else {
    state.settings.preset = "balanced";
    state.settings.ocr.mode = "auto";
    state.settings.ocr.precision = "standard";
    state.settings.ollama.enabled = state.settings.ollama.provider !== "none";
  }
  syncUIFromState();
  saveSettingsToLocalStorage();
}

function setOcrPrecision(precision) {
  state.settings.ocr.precision = precision === "precise" ? "precise" : "standard";
  if (precision === "precise") {
    state.settings.recognition_mode = "precise";
  } else if (state.settings.recognition_mode === "precise") {
    state.settings.recognition_mode = "good";
  }
  syncUIFromState();
  saveSettingsToLocalStorage();
}

function toggleOcrPrecision() {
  const current = state.settings.ocr.precision;
  const next = current === "precise" ? "standard" : "precise";
  setOcrPrecision(next);
  const label = next === "precise" ? "🎯 Genaue OCR (300 DPI + Deskew) aktiviert" : "⚡ Standard-OCR aktiviert";
  showToast(label, "info");
}

function setOcrLanguage(lang) {
  state.settings.ocr.language = ["deu+eng", "deu", "eng"].includes(lang) ? lang : "deu+eng";
  saveSettingsToLocalStorage();
}

function setOcrDeskew(enabled) {
  state.settings.ocr.deskew = Boolean(enabled);
  saveSettingsToLocalStorage();
}

function setVisionOcr(enabled) {
  state.settings.ocr.vision_ocr = Boolean(enabled);
  saveSettingsToLocalStorage();
}

function setVisionModel(model) {
  state.settings.ollama.vision_model = model || "";
  saveSettingsToLocalStorage();
}

function setRedactionStrength(strength) {
  state.settings.redaction_strength = strength;
  const c = state.settings.categories;
  if (strength === "light") {
    state.settings.style.padding = 0;
    Object.assign(c, {
      names: true, addresses: true, emails: true, phones: true, ibans: true, tax_ids: true, dates: false, organizations: false,
      first_names: false, last_names: true, titles: false, streets: true, house_numbers: true, zip_codes: false, cities: false,
      bics: false, social_security_ids: true, birth_dates: true, general_dates: false
    });
  } else if (strength === "standard") {
    state.settings.style.padding = 2;
    Object.assign(c, {
      names: true, addresses: true, emails: true, phones: true, ibans: true, tax_ids: true, dates: true, organizations: false,
      first_names: true, last_names: true, titles: true, streets: true, house_numbers: true, zip_codes: true, cities: true,
      bics: true, social_security_ids: true, birth_dates: true, general_dates: true
    });
  } else if (strength === "strict") {
    state.settings.style.padding = 4;
    Object.assign(c, {
      names: true, addresses: true, emails: true, phones: true, ibans: true, tax_ids: true, dates: true, organizations: true,
      first_names: true, last_names: true, titles: true, streets: true, house_numbers: true, zip_codes: true, cities: true,
      bics: true, social_security_ids: true, birth_dates: true, general_dates: true
    });
  } else if (strength === "maximum") {
    state.settings.style.padding = 5;
    state.settings.style.fill_color = "#000000";
    Object.assign(c, {
      names: true, addresses: true, emails: true, phones: true, ibans: true, tax_ids: true, dates: true, organizations: true,
      first_names: true, last_names: true, titles: true, streets: true, house_numbers: true, zip_codes: true, cities: true,
      bics: true, social_security_ids: true, birth_dates: true, general_dates: true
    });
  }
  syncUIFromState();
  saveSettingsToLocalStorage();
}

function setCategoryGranularity(granularity) {
  const normalized = normalizeGranularity(granularity);
  state.settings.categories.granularity = normalized;
  state.granularity = normalized;
  syncUIFromState();
  saveSettingsToLocalStorage();
}

function onCoarseCategoryChange(key, checked) {
  const c = state.settings.categories;
  c[key] = checked;
  if (key === "names") c.first_names = c.last_names = c.titles = checked;
  else if (key === "addresses") c.streets = c.house_numbers = c.zip_codes = c.cities = checked;
  else if (key === "ibans") c.bics = checked;
  else if (key === "tax_ids") c.social_security_ids = checked;
  else if (key === "dates") c.birth_dates = c.general_dates = checked;
  syncUIFromState();
  saveSettingsToLocalStorage();
}

function onFineCategoryChange(key, checked) {
  const c = state.settings.categories;
  c[key] = checked;
  c.names = Boolean(c.first_names || c.last_names || c.titles);
  c.addresses = Boolean(c.streets || c.house_numbers || c.zip_codes || c.cities);
  c.dates = Boolean(c.birth_dates || c.general_dates);
  syncUIFromState();
  saveSettingsToLocalStorage();
}

function toggleAllGranularCategories(enable) {
  const c = state.settings.categories;
  [
    "names", "addresses", "emails", "phones", "ibans", "tax_ids", "dates", "organizations",
    "first_names", "last_names", "titles", "streets", "house_numbers", "zip_codes", "cities",
    "bics", "social_security_ids", "birth_dates", "general_dates"
  ].forEach((k) => { c[k] = enable; });
  syncUIFromState();
  saveSettingsToLocalStorage();
}

function syncUIFromState() {
  const s = state.settings;
  const c = s.categories;
  const granularActive = isGranularMode(c.granularity);

  document.querySelectorAll(".mode-card[data-recognition-mode]").forEach((card) => {
    card.classList.toggle("active", card.dataset.recognitionMode === s.recognition_mode);
  });
  document.querySelectorAll(".preset-card[data-preset]").forEach((card) => {
    card.classList.toggle("active", card.dataset.preset === s.preset);
  });
  document.querySelectorAll(".strength-btn[data-strength]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.strength === s.redaction_strength);
  });

  const strengthDescEl = document.getElementById("strengthDescriptionBox");
  if (strengthDescEl && STRENGTH_DESCRIPTIONS[s.redaction_strength]) {
    strengthDescEl.innerHTML = STRENGTH_DESCRIPTIONS[s.redaction_strength];
  }
  const settingsStrengthSelect = document.getElementById("settingsStrengthSelect");
  if (settingsStrengthSelect) settingsStrengthSelect.value = s.redaction_strength;

  document.querySelectorAll(".seg-btn[data-granularity]").forEach((btn) => {
    btn.classList.toggle("active", isGranularMode(btn.dataset.granularity) === granularActive);
  });
  document.querySelectorAll(".mode-card[data-wizard-granularity]").forEach((card) => {
    card.classList.toggle("active", isGranularMode(card.dataset.wizardGranularity) === granularActive);
  });

  const coarsePanel = document.getElementById("coarseCategoriesPanel");
  const finePanel = document.getElementById("fineCategoriesPanel");
  if (coarsePanel && finePanel) {
    coarsePanel.style.display = granularActive ? "none" : "block";
    finePanel.style.display = granularActive ? "block" : "none";
  }

  const settingsCoarseBox = document.getElementById("settingsCoarseBox");
  const settingsFineNote = document.getElementById("settingsFineNote");
  if (settingsCoarseBox && settingsFineNote) {
    settingsCoarseBox.style.display = granularActive ? "none" : "grid";
    settingsFineNote.style.display = granularActive ? "block" : "none";
  }

  document.querySelectorAll("input[data-cat-coarse]").forEach((cb) => {
    cb.checked = Boolean(c[cb.dataset.catCoarse]);
  });
  document.querySelectorAll("input[data-cat-fine]").forEach((cb) => {
    cb.checked = Boolean(c[cb.dataset.catFine]);
  });

  const tab3Map = {
    catNames: "names", catAddresses: "addresses", catEmails: "emails", catPhones: "phones",
    catIbans: "ibans", catTaxIds: "tax_ids", catDates: "dates", catOrgs: "organizations"
  };
  Object.entries(tab3Map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(c[key]);
  });

  const paddingEl = document.getElementById("paddingInput");
  if (paddingEl) paddingEl.value = String(s.style.padding);
  const colorEl = document.getElementById("redactColorInput");
  if (colorEl) colorEl.value = s.style.fill_color;
  const rasterizeAllCb = document.getElementById("rasterizeAllPagesCheckbox");
  if (rasterizeAllCb) rasterizeAllCb.checked = Boolean(s.rasterize_all_pages);

  const ocrPrecSel = document.getElementById("settingsOcrPrecisionSelect");
  if (ocrPrecSel) ocrPrecSel.value = s.ocr.precision || "standard";

  const ocrLangSel = document.getElementById("settingsOcrLanguageSelect");
  if (ocrLangSel) ocrLangSel.value = s.ocr.language || "deu+eng";

  const deskewCb = document.getElementById("settingsDeskewCheckbox");
  if (deskewCb) deskewCb.checked = s.ocr.deskew !== false;

  const visionCb = document.getElementById("settingsVisionOcrCheckbox");
  if (visionCb) visionCb.checked = s.ocr.vision_ocr !== false;

  const ocrBadge = document.getElementById("ocrStatusBadge");
  if (ocrBadge) {
    if (s.ocr.precision === "precise") {
      ocrBadge.innerHTML = '<span class="badge-dot dot-green"></span> 🎯 Genaue OCR (300 DPI + Deskew)';
      ocrBadge.title = 'Klicken zum Umschalten auf ⚡ Standard-OCR';
    } else {
      ocrBadge.innerHTML = '<span class="badge-dot dot-green"></span> ⚡ Standard-OCR';
      ocrBadge.title = 'Klicken zum Umschalten auf 🎯 Genaue OCR (300 DPI + Deskew)';
    }
  }

  syncFilenameUI();
  syncRemoteInputs();
  syncAiProviderSelectionUI();
  setSensitivity(s.sensitivity || "balanced");
}

function initPresetSelectors() {
  document.querySelectorAll(".preset-card").forEach((card) => {
    card.addEventListener("click", () => {
      const preset = card.dataset.preset;
      state.settings.preset = preset;
      state.settings.recognition_mode = preset === "turbo" ? "fast" : "good";
      syncUIFromState();
    });
  });
}

function initSettingsForm() {
  document.getElementById("saveSettingsBtn")?.addEventListener("click", () => {
    syncSettingsFromForm();
    saveSettingsToLocalStorage();
    showToast("Einstellungen im Browser gespeichert!", "success");
  });
  document.getElementById("testOllamaBtn")?.addEventListener("click", () => runAutodiscoverOnly(true));
}

function syncSettingsFromForm() {
  const colorEl = document.getElementById("redactColorInput");
  if (colorEl) state.settings.style.fill_color = colorEl.value;
  const labelCb = document.getElementById("addLabelCheckbox");
  if (labelCb) state.settings.style.add_label = labelCb.checked;
  const customLabelEl = document.getElementById("customLabelInput");
  if (customLabelEl) state.settings.style.custom_label = customLabelEl.value;
  const paddingEl = document.getElementById("paddingInput");
  if (paddingEl) state.settings.style.padding = parseInt(paddingEl.value, 10) || 0;
  const rasterizeAllCb = document.getElementById("rasterizeAllPagesCheckbox");
  if (rasterizeAllCb) state.settings.rasterize_all_pages = rasterizeAllCb.checked;

  const kwEl = document.getElementById("customKeywordsInput");
  if (kwEl) {
    state.settings.categories.custom_keywords = kwEl.value.trim()
      ? kwEl.value.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  }

  const wlEl = document.getElementById("whitelistInput");
  if (wlEl) {
    state.settings.exceptions.whitelist = wlEl.value.trim()
      ? wlEl.value.split("\n").map((s) => s.trim()).filter(Boolean)
      : [];
  }
  const caseCb = document.getElementById("caseSensitiveCheckbox");
  if (caseCb) state.settings.exceptions.case_sensitive = caseCb.checked;

  const ocrPrecEl = document.getElementById("settingsOcrPrecisionSelect");
  if (ocrPrecEl) state.settings.ocr.precision = ocrPrecEl.value;
  const ocrLangEl = document.getElementById("settingsOcrLanguageSelect");
  if (ocrLangEl) state.settings.ocr.language = ocrLangEl.value;
  const deskewEl = document.getElementById("settingsDeskewCheckbox");
  if (deskewEl) state.settings.ocr.deskew = deskewEl.checked;
  const visionEl = document.getElementById("settingsVisionOcrCheckbox");
  if (visionEl) state.settings.ocr.vision_ocr = visionEl.checked;

  const ollamaEpEl = document.getElementById("ollamaEndpointInput");
  if (ollamaEpEl) state.settings.ollama.endpoint = ollamaEpEl.value;
  const lmstudioEpEl = document.getElementById("lmstudioEndpointInput");
  if (lmstudioEpEl) state.settings.ollama.lmstudio_endpoint = lmstudioEpEl.value;
  const omlxEpEl = document.getElementById("omlxEndpointInput");
  if (omlxEpEl) state.settings.ollama.omlx_endpoint = omlxEpEl.value;
  const omlxKeyEl = document.getElementById("omlxApiKeyInput");
  if (omlxKeyEl) state.settings.ollama.omlx_api_key = omlxKeyEl.value.trim();

  syncRemoteInputs("settings");
}

function getSensitivityLevelNumber(level) {
  switch (level) {
    case "minimal": return 1;
    case "low": return 2;
    case "balanced": return 3;
    case "high": return 4;
    case "maximum": return 5;
    default: return 3;
  }
}

function getSensitivityLevelName(level) {
  switch (level) {
    case "minimal": return "Minimal";
    case "low": return "Niedrig (Präzise)";
    case "balanced": return "Standard";
    case "high": return "Hoch (Sensitiv)";
    case "maximum": return "Maximal";
    default: return "Standard";
  }
}

function getSensitivityLevelHint(level) {
  switch (level) {
    case "minimal": return "Stufe 1: Nur harte PII (IBAN, E-Mail, Pass/ID mit Prüfziffer). Rechnungen & Bestellungen geschützt.";
    case "low": return "Stufe 2: Hohe Präzision. Rechnungsnummern (#...), SKUs und Bestell-IDs werden ignoriert.";
    case "balanced": return "Stufe 3: Ausgewogene Standard DSGVO-Erkennung für Briefe & Verträge.";
    case "high": return "Stufe 4: Sensitivere Erkennung für Namen, Adressen und Kontextbegriffe.";
    case "maximum": return "Stufe 5: Maximaler Paranoia-Modus – erfasst alle Entitäten und Grenzfälle.";
    default: return "Stufe 3: Ausgewogene Standard DSGVO-Erkennung für Briefe & Verträge.";
  }
}

function setSensitivity(mode) {
  const allowed = ["minimal", "low", "balanced", "high", "maximum"];
  if (!allowed.includes(mode)) mode = "balanced";
  state.settings.sensitivity = mode;

  // Sync Tab 1 & Tab 3 & Wizard buttons
  document.querySelectorAll("[data-sensitivity]").forEach((el) => {
    el.classList.toggle("active", el.dataset.sensitivity === mode);
  });

  // Sync Tab 2 buttons
  document.querySelectorAll("[data-editor-sens]").forEach((el) => {
    el.classList.toggle("active", el.dataset.editorSens === mode);
  });

  const activeBadge = document.getElementById("sensitivityActiveBadge");
  if (activeBadge) {
    activeBadge.textContent = `Stufe ${getSensitivityLevelNumber(mode)}: ${getSensitivityLevelName(mode)}`;
  }

  const editorBadge = document.getElementById("editorSensitivityBadge");
  if (editorBadge) {
    editorBadge.textContent = `${getSensitivityLevelNumber(mode)}: ${getSensitivityLevelName(mode)}`;
  }

  const editorHint = document.getElementById("editorSensitivityHint");
  if (editorHint) {
    editorHint.textContent = getSensitivityLevelHint(mode);
  }

  const helpEl = document.getElementById("sensitivityHelpText");
  if (helpEl) {
    helpEl.innerHTML = `<strong>💡 ${getSensitivityLevelName(mode)}:</strong> ${getSensitivityLevelHint(mode)}`;
  }

  saveSettingsToLocalStorage();
}

function setEditorSensitivity(mode) {
  setSensitivity(mode);

  // Re-evaluate current active file in Tab 2 in real time!
  const file = getActiveFile() || state.files.find((f) => f.id === state.activeFileId);
  if (file && file.pageContents && file.pageContents.length > 0) {
    reEvaluateFileEntitiesWithSensitivity(file, mode);

    const clampedPage = Math.min(Math.max(0, state.currentPage || 0), (file.pages_count || 1) - 1);
    const pageEntities = getPageEntities(file, clampedPage);

    // Refresh overlay and detected entities in real-time on screen!
    if (pdfViewer) {
      pdfViewer.entities = pageEntities;
      pdfViewer.renderOverlays();
    }
    renderPageThumbnails(file);
    renderDetectedEntitiesList(pageEntities);

    const badge = document.getElementById("entityCountBadge");
    if (badge) {
      badge.textContent = file.total_entities_count || 0;
    }
    showToast(`Empfindlichkeit auf Stufe ${getSensitivityLevelNumber(mode)} (${getSensitivityLevelName(mode)}) gesetzt. ${file.total_entities_count} Fundstelle(n) neu berechnet!`, "info", 1800);
  }
}

function reEvaluateFileEntitiesWithSensitivity(file, level) {
  if (!file || !Array.isArray(file.pageContents)) return;
  const entitiesByPage = {};
  let totalCount = 0;

  for (let p = 0; p < file.pageContents.length; p++) {
    const pageInfo = file.pageContents[p];
    if (!pageInfo) continue;

    let rawMatches = window.BlackMyDataPII.detectPiiRulesJS(
      pageInfo.text,
      state.settings.categories,
      state.settings.exceptions,
      file.knownNames || null,
      level
    );

    if (file.cachedAiEntities && Array.isArray(file.cachedAiEntities[p])) {
      const filteredAi = filterValidAiEntities(file.cachedAiEntities[p], level);
      for (const aiEnt of filteredAi) {
        const keptAi = aiEnt.text ? window.BlackMyDataPII.trimWhitelisted(aiEnt.text.trim(), state.settings.exceptions) : null;
        if (!keptAi) continue;
        rawMatches.push({
          id: Math.random().toString(36).substring(2, 10),
          text: keptAi.text,
          category: aiEnt.category || "name",
          confidence: 0.92,
          source: "ai"
        });
      }
    }

    const mapped = mapAndStabilize(rawMatches, pageInfo, p);
    entitiesByPage[p] = mapped;
    totalCount += mapped.length;
  }

  file.entities_by_page = entitiesByPage;
  file.total_entities_count = totalCount;
  file.analysisData = { entities_by_page: entitiesByPage, total_entities_count: totalCount };
  file.analysisSignature = analysisSignature();
  markFileChanged(file);
}

/** K1/H2/M1: tell the user about pages that could not be checked completely. */
function reportAnalysisWarnings(file) {
  const pages = file.pageContents || [];
  const failed = [];
  const unchecked = [];
  let unmapped = 0;
  pages.forEach((pi, i) => {
    if (!pi) return;
    if (pi.ocrStatus === "failed" || pi.ocrStatus === "unavailable") failed.push(i + 1);
    if (pi.imagesUnchecked) unchecked.push(i + 1);
    unmapped += (pi.unmapped || []).length;
  });
  file.ocrFailedPages = failed;
  if (failed.length > 0) {
    showToast(`⚠️ Texterkennung fehlgeschlagen auf Seite ${failed.join(", ")}. Diese Seiten werden beim Export vollständig geschwärzt, bis die OCR erneut erfolgreich läuft.`, "warning", 10000);
  }
  if (unchecked.length > 0) {
    showToast(`ℹ️ Seite ${unchecked.join(", ")} enthält Bilder, die nicht per OCR geprüft wurden (z. B. eingefügte Ausweiskopien). Bitte prüfen oder „OCR erzwingen“ nutzen.`, "info", 9000);
  }
  if (unmapped > 0) {
    showToast(`⚠️ ${unmapped} erkannte Stelle(n) konnten nicht auf der Seite verortet werden. Bitte manuell prüfen und ggf. per Hand schwärzen.`, "warning", 9000);
  }
}

/** Any change after "redact" makes the produced file outdated: it has to be built again (M8). */
function markFileChanged(file) {
  if (!file || !file.redacted) return;
  file.redacted = false;
  if (file.redactedBlobUrl) {
    try { URL.revokeObjectURL(file.redactedBlobUrl); } catch (e) { /* already revoked */ }
  }
  file.redactedBlobUrl = null;
  file.redactedBlob = null;
  if (typeof renderDocumentQueue === "function") renderDocumentQueue();
}

// Setup Wizard
function openSetupWizard() {
  state.wizardStep = 1;
  updateWizardModalUI();
  const modal = document.getElementById("setupWizardModal");
  if (modal) modal.style.display = "flex";
}
function closeSetupWizard() {
  localStorage.setItem("bmd_wizard_seen", "true");
  const modal = document.getElementById("setupWizardModal");
  if (modal) modal.style.display = "none";
}
function goToWizardStep(step) {
  if (step < 1 || step > 4) return;
  state.wizardStep = step;
  updateWizardModalUI();
}
function nextWizardStep() {
  if (state.wizardStep < 4) { state.wizardStep++; updateWizardModalUI(); }
}
function prevWizardStep() {
  if (state.wizardStep > 1) { state.wizardStep--; updateWizardModalUI(); }
}
function updateWizardModalUI() {
  const step = state.wizardStep;
  document.querySelectorAll(".wizard-step-dot").forEach((dot) => {
    const s = parseInt(dot.dataset.step, 10);
    dot.classList.toggle("active", s === step);
    dot.classList.toggle("completed", s < step);
  });
  for (let i = 1; i <= 4; i++) {
    const pane = document.getElementById(`wizard-step-${i}`);
    if (pane) pane.classList.toggle("active", i === step);
  }
  const prevBtn = document.getElementById("wizardPrevBtn");
  const nextBtn = document.getElementById("wizardNextBtn");
  const finishBtn = document.getElementById("wizardFinishBtn");
  if (prevBtn) prevBtn.style.visibility = step > 1 ? "visible" : "hidden";
  if (nextBtn) nextBtn.style.display = step < 4 ? "inline-flex" : "none";
  if (finishBtn) finishBtn.style.display = step === 4 ? "inline-flex" : "none";
}
function finishSetupWizard() {
  localStorage.setItem("bmd_wizard_seen", "true");
  saveSettingsToLocalStorage();
  closeSetupWizard();
  showToast("Einrichtung gespeichert! Du kannst sofort PDFs im Browser schwärzen.", "success");
}

// Loading Modal
function showLoadingOverlay(options = {}) {
  const overlay = document.getElementById("loadingOverlay");
  if (!overlay) return;
  clearLoadingPhaseTimeouts();

  const useAi = options.useAi !== undefined ? options.useAi : Boolean(state.settings.ollama.enabled);
  const titleEl = document.getElementById("loadingTitle");
  const subtitleEl = document.getElementById("loadingSubtitle");
  const providerTextEl = document.getElementById("loadingProviderText");
  const fileLabelEl = document.getElementById("loadingCurrentFileLabel");
  const timerEl = document.getElementById("loadingTimer");

  if (titleEl) titleEl.textContent = options.title || "PDF-Analyse & Schwärzung im Browser...";
  if (subtitleEl) subtitleEl.textContent = options.subtitle || "100% lokale Verarbeitung im Browser-Arbeitsspeicher";
  if (providerTextEl) {
    providerTextEl.textContent = useAi
      ? `KI aktiv (${state.settings.ollama.provider.toUpperCase()}) • 100% Lokal`
      : "100% Browser-Engine (PDF.js + Deutsche Kontexterkennung)";
  }
  if (fileLabelEl) fileLabelEl.textContent = options.fileLabel || "Verarbeite PDF...";
  if (timerEl) timerEl.textContent = "0.0s";

  loadingStartTime = performance.now();
  if (loadingTimerInterval) clearInterval(loadingTimerInterval);
  loadingTimerInterval = setInterval(() => {
    const elapsed = ((performance.now() - loadingStartTime) / 1000).toFixed(1);
    const el = document.getElementById("loadingTimer");
    if (el) el.textContent = `${elapsed}s`;
  }, 100);

  setLoadingPhase(options.initialPhase || 1, {
    progressPct: options.initialProgress || 15,
    subtitle: options.subtitle,
    fileLabel: options.fileLabel
  });
  overlay.style.display = "flex";
}

function setLoadingPhase(phaseNum, options = {}) {
  const defaultPct = { 1: 18, 2: 45, 3: 75, 4: 94 }[phaseNum] || 50;
  const pct = options.progressPct !== undefined ? options.progressPct : defaultPct;
  const barEl = document.getElementById("loadingProgressBar");
  const pctEl = document.getElementById("loadingProgressPercent");
  if (barEl) barEl.style.width = `${Math.min(100, Math.max(5, pct))}%`;
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
  if (options.subtitle) {
    const subtitleEl = document.getElementById("loadingSubtitle");
    if (subtitleEl) subtitleEl.textContent = options.subtitle;
  }
  for (let i = 1; i <= 4; i++) {
    const item = document.getElementById(`loadingPhase${i}`);
    if (!item) continue;
    item.classList.toggle("completed", i < phaseNum);
    item.classList.toggle("active", i === phaseNum);
  }
}

function clearLoadingPhaseTimeouts() {
  loadingPhaseTimeouts.forEach((t) => clearTimeout(t));
  loadingPhaseTimeouts = [];
}

function hideLoadingOverlay() {
  clearLoadingPhaseTimeouts();
  if (loadingTimerInterval) {
    clearInterval(loadingTimerInterval);
    loadingTimerInterval = null;
  }
  const barEl = document.getElementById("loadingProgressBar");
  const pctEl = document.getElementById("loadingProgressPercent");
  if (barEl) barEl.style.width = "100%";
  if (pctEl) pctEl.textContent = "100%";
  setTimeout(() => {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.style.display = "none";
  }, 180);
}

// About & Cleanup
function loadAboutAndPackages() {
  const tbody = document.getElementById("packagesTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  DEFAULT_OPEN_SOURCE_PACKAGES.forEach((pkg) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(pkg.name)}</strong></td>
      <td><code>${escapeHtml(pkg.version)}</code></td>
      <td><span class="license-pill">${escapeHtml(pkg.license)}</span></td>
      <td style="color: var(--text-secondary);">${escapeHtml(pkg.purpose)}</td>
    `;
    tbody.appendChild(tr);
  });

  const badge = document.getElementById("aboutVersionBadge");
  if (badge) {
    badge.textContent = `Version ${CURRENT_BUILD_VERSION} • Browser-Edition (100% Client-Side)`;
  }

  // Full license texts ship in licenses/ next to index.html (every package); loaded only when opened.
  const details = document.getElementById("licenseTextsDetails");
  const pre = document.getElementById("licenseTextsPre");
  if (details && pre && !details.dataset.bound) {
    details.dataset.bound = "1";
    details.addEventListener("toggle", async () => {
      if (!details.open || pre.dataset.loaded) return;
      try {
        const parts = await Promise.all(["licenses/LICENSE.txt", "licenses/THIRD_PARTY_NOTICES.txt", "licenses/Apache-2.0.txt"]
          .map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.text(); })));
        pre.textContent = parts.join("\n\n" + "=".repeat(78) + "\n\n");
        pre.dataset.loaded = "1";
      } catch (e) {
        pre.textContent = "Die Lizenztexte liegen im Programmordner unter web/licenses/ (LICENSE.txt, THIRD_PARTY_NOTICES.txt, Apache-2.0.txt).";
      }
    });
  }
}

function cleanupTemporaryData() {
  const count = state.files.length;
  state.files.forEach((f) => {
    if (f.redactedBlobUrl) URL.revokeObjectURL(f.redactedBlobUrl);
    // M7: pdf.js keeps the original bytes in its worker until the document is destroyed.
    try { if (f.pdfDoc && typeof f.pdfDoc.destroy === "function") f.pdfDoc.destroy(); } catch (e) { /* ignore */ }
    f.pdfDoc = null;
    f.arrayBuffer = null;
    f.pageContents = null;
    f.redactedBlob = null;
  });
  state.files = [];
  state.activeFileId = null;
  state.analysisData = null;
  state.manualRedactions = {};
  // OCR workers hold page images; the editor still shows the last page and its hits (also in title attributes).
  try { terminateOcrWorker(); } catch (e) { /* ignore */ }
  if (typeof pdfViewer !== "undefined" && pdfViewer) {
    pdfViewer.manualRedactions = {};
    pdfViewer.excludedEntityIds = new Set();
    pdfViewer.entities = [];
    if (pdfViewer.canvas) { pdfViewer.canvas.width = 0; pdfViewer.canvas.height = 0; }
    if (pdfViewer.overlayLayer) pdfViewer.overlayLayer.innerHTML = "";
  }
  const entityList = document.getElementById("entityListContainer");
  if (entityList) entityList.innerHTML = "";
  renderDocumentQueue();
  showToast(`Browser-Arbeitsspeicher bereinigt (${count} PDF-Dokument(e) aus dem RAM entfernt).`, "success");
}

function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Also quotes (B2): entity text from documents or AI answers lands in title="…" attributes.
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

