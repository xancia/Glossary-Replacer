const STORAGE_DEFAULTS = {
  enabled: true,
  globalRulesText: "",
  globalRulesCount: 0,
  globalUrlPatterns: ["https://69shuba.tw/*"],
  localGlossaries: [],
  lastUpdated: 0,
  schemaVersion: 2
};

const LEGACY_DEFAULTS = {
  rulesText: "",
  rulesCount: 0
};

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

async function loadBundledGlossaryText() {
  const response = await fetch(chrome.runtime.getURL("default-glossary.md"));
  if (!response.ok) {
    throw new Error(`Failed to load default glossary (${response.status})`);
  }
  return response.text();
}

function parsePairFromLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return null;
  }
  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith(";") ||
    trimmed.startsWith("```")
  ) {
    return null;
  }

  const text = trimmed.replace(/^[-*]\s+/, "");
  if (!text) {
    return null;
  }

  if (text.startsWith("|") && text.endsWith("|")) {
    const parts = text
      .slice(1, -1)
      .split("|")
      .map((part) => part.trim());
    if (parts.length >= 2) {
      const left = parts[0];
      const right = parts[1];
      const isSeparator = parts.every((part) =>
        part.replace(/[-:]/g, "").trim() === ""
      );
      if (!isSeparator && left && right) {
        return [left, right];
      }
    }
    return null;
  }

  const separators = ["=", "->", "=>", "\u2192"];
  for (const separator of separators) {
    const index = text.indexOf(separator);
    if (index > -1) {
      const left = text.slice(0, index).trim();
      const right = text.slice(index + separator.length).trim();
      if (left && right) {
        return [left, right];
      }
      return null;
    }
  }

  return null;
}

function countRules(text) {
  let count = 0;
  for (const line of String(text || "").split(/\r?\n/)) {
    if (parsePairFromLine(line)) {
      count += 1;
    }
  }
  return count;
}

async function ensureInitialRules() {
  const current = await storageGet({ ...STORAGE_DEFAULTS, ...LEGACY_DEFAULTS });

  let globalRulesText = String(current.globalRulesText || "");
  let globalRulesCount = Number(current.globalRulesCount || 0);
  let globalUrlPatterns = Array.isArray(current.globalUrlPatterns)
    ? current.globalUrlPatterns.filter((item) => typeof item === "string" && item.trim())
    : [];
  let localGlossaries = Array.isArray(current.localGlossaries) ? current.localGlossaries : [];

  if (!globalRulesText.trim() && String(current.rulesText || "").trim()) {
    globalRulesText = String(current.rulesText || "");
    globalRulesCount = Number(current.rulesCount || countRules(globalRulesText));
  }

  if (!globalRulesText.trim()) {
    globalRulesText = await loadBundledGlossaryText();
    globalRulesCount = countRules(globalRulesText);
  }

  if (globalUrlPatterns.length === 0) {
    globalUrlPatterns = STORAGE_DEFAULTS.globalUrlPatterns.slice();
  }

  localGlossaries = localGlossaries
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const pattern = typeof entry.pattern === "string" ? entry.pattern.trim() : "";
      const rulesText = typeof entry.rulesText === "string" ? entry.rulesText : "";
      if (!pattern) {
        return null;
      }
      return {
        id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
        pattern,
        rulesText,
        rulesCount: Number(entry.rulesCount || countRules(rulesText)),
        title: typeof entry.title === "string" ? entry.title : ""
      };
    })
    .filter(Boolean);

  await storageSet({
    enabled: Boolean(current.enabled),
    globalRulesText,
    globalRulesCount,
    globalUrlPatterns,
    localGlossaries,
    lastUpdated: Number(current.lastUpdated || Date.now()),
    schemaVersion: 2
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureInitialRules().catch((error) => {
    console.error("Glossary initialization failed", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  ensureInitialRules().catch((error) => {
    console.error("Glossary startup initialization failed", error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "load-default-glossary") {
    loadBundledGlossaryText()
      .then((text) => {
        sendResponse({
          ok: true,
          text,
          count: countRules(text)
        });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: String(error)
        });
      });
    return true;
  }
});

