const STORAGE_DEFAULTS = {
  enabled: true,
  globalRulesText: "",
  globalRulesCount: 0,
  globalUrlPatterns: ["https://69shuba.tw/*"],
  localGlossaries: [],
  lastUpdated: 0,
  schemaVersion: 2
};

const enabledInput = document.getElementById("enabled");
const summaryStats = document.getElementById("summaryStats");
const status = document.getElementById("status");

const saveBtn = document.getElementById("saveBtn");
const loadDefaultBtn = document.getElementById("loadDefaultBtn");

const globalPatternsArea = document.getElementById("globalPatterns");
const patternStats = document.getElementById("patternStats");
const globalRulesArea = document.getElementById("globalRulesText");
const globalStats = document.getElementById("globalStats");
const importGlobalBtn = document.getElementById("importGlobalBtn");
const exportGlobalBtn = document.getElementById("exportGlobalBtn");
const globalFileInput = document.getElementById("globalFileInput");

const localSelect = document.getElementById("localSelect");
const addLocalBtn = document.getElementById("addLocalBtn");
const removeLocalBtn = document.getElementById("removeLocalBtn");
const localTitleInput = document.getElementById("localTitle");
const localPatternInput = document.getElementById("localPattern");
const localRulesArea = document.getElementById("localRulesText");
const localStats = document.getElementById("localStats");
const importLocalBtn = document.getElementById("importLocalBtn");
const exportLocalBtn = document.getElementById("exportLocalBtn");
const localFileInput = document.getElementById("localFileInput");

let localGlossariesState = [];
let selectedLocalId = null;
let localIdCounter = 1;

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function setStatus(message, kind) {
  status.textContent = message;
  status.className = kind || "";
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
      const isSeparator = parts.every((part) => part.replace(/[-:]/g, "").trim() === "");
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

function parsePatternLines(text) {
  const lines = String(text || "").split(/\r?\n/);
  const patterns = [];
  const seen = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("#") || trimmed.startsWith("//") || trimmed.startsWith(";")) {
      continue;
    }
    if (!seen.has(trimmed)) {
      patterns.push(trimmed);
      seen.add(trimmed);
    }
  }
  return patterns;
}

function formatPatternLines(patterns) {
  if (!Array.isArray(patterns)) {
    return "";
  }
  return patterns
    .filter((pattern) => typeof pattern === "string")
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .join("\n");
}

function getSelectedLocalIndex() {
  return localGlossariesState.findIndex((entry) => entry.id === selectedLocalId);
}

function getSelectedLocal() {
  const index = getSelectedLocalIndex();
  return index > -1 ? localGlossariesState[index] : null;
}

function makeLocalId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  localIdCounter += 1;
  return `local-${Date.now()}-${localIdCounter}`;
}

function updateSummaryStats() {
  const globalCount = countRules(globalRulesArea.value);
  const localCount = localGlossariesState.length;
  summaryStats.textContent = `Global rules: ${globalCount} | Local glossaries: ${localCount}`;
}

function updatePatternStats() {
  const patterns = parsePatternLines(globalPatternsArea.value);
  patternStats.textContent = `Allowed URL patterns: ${patterns.length}`;
}

function updateGlobalStats() {
  globalStats.textContent = `Global rules: ${countRules(globalRulesArea.value)}`;
  updateSummaryStats();
}

function updateLocalStats() {
  const local = getSelectedLocal();
  const count = local ? countRules(local.rulesText || "") : 0;
  localStats.textContent = `Local rules: ${count}`;
  updateSummaryStats();
}

function localEntryLabel(entry, index) {
  const label = (entry.title || "").trim();
  if (label) {
    return label;
  }
  const pattern = (entry.pattern || "").trim();
  if (pattern) {
    return pattern;
  }
  return `Local glossary ${index + 1}`;
}

function renderLocalSelect() {
  localSelect.innerHTML = "";
  if (localGlossariesState.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "(no local glossaries yet)";
    localSelect.appendChild(option);
    localSelect.disabled = true;
    selectedLocalId = null;
    renderLocalEditor();
    return;
  }

  localSelect.disabled = false;
  for (let i = 0; i < localGlossariesState.length; i += 1) {
    const entry = localGlossariesState[i];
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = localEntryLabel(entry, i);
    localSelect.appendChild(option);
  }

  if (!localGlossariesState.some((entry) => entry.id === selectedLocalId)) {
    selectedLocalId = localGlossariesState[0].id;
  }
  localSelect.value = selectedLocalId;
  renderLocalEditor();
}

function refreshLocalSelectLabels() {
  if (localSelect.disabled) {
    return;
  }
  for (let i = 0; i < localGlossariesState.length; i += 1) {
    if (localSelect.options[i]) {
      localSelect.options[i].textContent = localEntryLabel(localGlossariesState[i], i);
    }
  }
  if (selectedLocalId) {
    localSelect.value = selectedLocalId;
  }
}

function renderLocalEditor() {
  const local = getSelectedLocal();
  const hasLocal = Boolean(local);

  localTitleInput.disabled = !hasLocal;
  localPatternInput.disabled = !hasLocal;
  localRulesArea.disabled = !hasLocal;
  removeLocalBtn.disabled = !hasLocal;
  importLocalBtn.disabled = !hasLocal;
  exportLocalBtn.disabled = !hasLocal;

  if (!hasLocal) {
    localTitleInput.value = "";
    localPatternInput.value = "";
    localRulesArea.value = "";
    updateLocalStats();
    return;
  }

  localTitleInput.value = local.title || "";
  localPatternInput.value = local.pattern || "";
  localRulesArea.value = local.rulesText || "";
  updateLocalStats();
}

function syncLocalFromEditor() {
  const local = getSelectedLocal();
  if (!local) {
    return;
  }
  local.title = localTitleInput.value || "";
  local.pattern = localPatternInput.value || "";
  local.rulesText = localRulesArea.value || "";
  local.rulesCount = countRules(local.rulesText);
}

function createLocalGlossary() {
  syncLocalFromEditor();
  localGlossariesState.push({
    id: makeLocalId(),
    title: "",
    pattern: "",
    rulesText: "",
    rulesCount: 0
  });
  selectedLocalId = localGlossariesState[localGlossariesState.length - 1].id;
  renderLocalSelect();
  setStatus("Added local glossary.", "ok");
}

function removeSelectedLocalGlossary() {
  const index = getSelectedLocalIndex();
  if (index < 0) {
    return;
  }
  localGlossariesState.splice(index, 1);
  selectedLocalId = localGlossariesState[index]
    ? localGlossariesState[index].id
    : localGlossariesState[index - 1]
      ? localGlossariesState[index - 1].id
      : null;
  renderLocalSelect();
  setStatus("Removed local glossary.", "ok");
}

function readFileIntoTextArea(file, targetArea, doneMessage) {
  const reader = new FileReader();
  reader.onload = () => {
    targetArea.value = String(reader.result || "");
    if (targetArea === localRulesArea) {
      syncLocalFromEditor();
      updateLocalStats();
      renderLocalSelect();
    } else {
      updateGlobalStats();
    }
    setStatus(doneMessage, "ok");
  };
  reader.onerror = () => {
    setStatus("Could not read file.", "error");
  };
  reader.readAsText(file, "utf-8");
}

function exportTextFile(filename, text) {
  const blob = new Blob([text || ""], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function loadBundledGlossary() {
  setStatus("Loading bundled glossary...", "");
  const response = await chrome.runtime.sendMessage({
    type: "load-default-glossary"
  });

  if (!response || !response.ok) {
    const error = response && response.error ? response.error : "Unknown error";
    setStatus(`Failed to load bundled glossary: ${error}`, "error");
    return;
  }

  globalRulesArea.value = response.text || "";
  updateGlobalStats();
  setStatus(`Loaded bundled glossary (${response.count} rules).`, "ok");
}

function sanitizeLocalGlossaries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const title = typeof entry.title === "string" ? entry.title : "";
      const pattern = typeof entry.pattern === "string" ? entry.pattern.trim() : "";
      const rulesText = typeof entry.rulesText === "string" ? entry.rulesText : "";
      if (!pattern) {
        return null;
      }
      return {
        id: typeof entry.id === "string" && entry.id ? entry.id : makeLocalId(),
        title,
        pattern,
        rulesText,
        rulesCount: countRules(rulesText)
      };
    })
    .filter(Boolean);
}

async function loadSettings() {
  const settings = await storageGet(STORAGE_DEFAULTS);

  enabledInput.checked = Boolean(settings.enabled);
  globalRulesArea.value = settings.globalRulesText || "";
  globalPatternsArea.value = formatPatternLines(settings.globalUrlPatterns);

  localGlossariesState = sanitizeLocalGlossaries(settings.localGlossaries);
  selectedLocalId = localGlossariesState[0] ? localGlossariesState[0].id : null;

  updatePatternStats();
  updateGlobalStats();
  renderLocalSelect();
}

async function saveSettings() {
  syncLocalFromEditor();

  const globalRulesText = globalRulesArea.value || "";
  const globalUrlPatterns = parsePatternLines(globalPatternsArea.value);
  const localGlossaries = sanitizeLocalGlossaries(localGlossariesState);

  await storageSet({
    enabled: enabledInput.checked,
    globalRulesText,
    globalRulesCount: countRules(globalRulesText),
    globalUrlPatterns,
    localGlossaries,
    lastUpdated: Date.now(),
    schemaVersion: 2
  });

  localGlossariesState = localGlossaries;
  if (localGlossariesState.length > 0 && !getSelectedLocal()) {
    selectedLocalId = localGlossariesState[0].id;
  }
  renderLocalSelect();
  updatePatternStats();
  updateGlobalStats();
  setStatus("Saved settings.", "ok");
}

saveBtn.addEventListener("click", () => {
  saveSettings().catch((error) => {
    setStatus(`Save failed: ${String(error)}`, "error");
  });
});

loadDefaultBtn.addEventListener("click", () => {
  loadBundledGlossary().catch((error) => {
    setStatus(`Load failed: ${String(error)}`, "error");
  });
});

importGlobalBtn.addEventListener("click", () => {
  globalFileInput.value = "";
  globalFileInput.click();
});

globalFileInput.addEventListener("change", () => {
  const file = globalFileInput.files && globalFileInput.files[0];
  if (file) {
    readFileIntoTextArea(file, globalRulesArea, "Imported global glossary.");
  }
});

exportGlobalBtn.addEventListener("click", () => {
  exportTextFile("GlobalGlossary.MD", globalRulesArea.value || "");
});

addLocalBtn.addEventListener("click", createLocalGlossary);
removeLocalBtn.addEventListener("click", removeSelectedLocalGlossary);

localSelect.addEventListener("change", () => {
  syncLocalFromEditor();
  selectedLocalId = localSelect.value || null;
  renderLocalSelect();
});

localTitleInput.addEventListener("input", () => {
  syncLocalFromEditor();
  refreshLocalSelectLabels();
  updateLocalStats();
});

localPatternInput.addEventListener("input", () => {
  syncLocalFromEditor();
  refreshLocalSelectLabels();
  updateLocalStats();
});

localRulesArea.addEventListener("input", () => {
  syncLocalFromEditor();
  updateLocalStats();
});

importLocalBtn.addEventListener("click", () => {
  const local = getSelectedLocal();
  if (!local) {
    setStatus("Create/select a local glossary first.", "error");
    return;
  }
  localFileInput.value = "";
  localFileInput.click();
});

localFileInput.addEventListener("change", () => {
  const file = localFileInput.files && localFileInput.files[0];
  if (file) {
    readFileIntoTextArea(file, localRulesArea, "Imported local glossary.");
  }
});

exportLocalBtn.addEventListener("click", () => {
  const local = getSelectedLocal();
  if (!local) {
    setStatus("Create/select a local glossary first.", "error");
    return;
  }
  const safeName = (localEntryLabel(local, 0) || "LocalGlossary")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 60);
  exportTextFile(`${safeName || "LocalGlossary"}.MD`, local.rulesText || "");
});

globalPatternsArea.addEventListener("input", updatePatternStats);
globalRulesArea.addEventListener("input", updateGlobalStats);
enabledInput.addEventListener("change", updateSummaryStats);

loadSettings().catch((error) => {
  setStatus(`Load settings failed: ${String(error)}`, "error");
});
