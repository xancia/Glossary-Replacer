const enabledInput = document.getElementById("enabled");
const stats = document.getElementById("stats");
const openOptionsBtn = document.getElementById("openOptionsBtn");

const STORAGE_DEFAULTS = {
  enabled: true,
  globalRulesCount: 0,
  globalUrlPatterns: ["https://69shuba.tw/*"],
  localGlossaries: []
};

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

async function loadState() {
  const settings = await storageGet(STORAGE_DEFAULTS);
  enabledInput.checked = Boolean(settings.enabled);
  const globalRules = Number(settings.globalRulesCount || 0);
  const patterns = Array.isArray(settings.globalUrlPatterns)
    ? settings.globalUrlPatterns.length
    : 0;
  const localGlossaries = Array.isArray(settings.localGlossaries)
    ? settings.localGlossaries.length
    : 0;
  stats.textContent = `Global rules: ${globalRules} | Patterns: ${patterns} | Local: ${localGlossaries}`;
}

enabledInput.addEventListener("change", async () => {
  await storageSet({ enabled: enabledInput.checked });
});

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

loadState().catch((error) => {
  stats.textContent = `Error: ${String(error)}`;
});
