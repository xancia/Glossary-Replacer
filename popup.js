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

async function loadPageDiagnostics() {
  const pageStats = document.getElementById("pageStats");

  const [tab] = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, resolve)
  );
  if (!tab || !tab.id) {
    pageStats.textContent = "This page: unavailable";
    return;
  }

  const response = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { type: "glossary-diagnostics" }, (result) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(result);
    });
  });

  if (!response || !response.ok || !response.diagnostics) {
    pageStats.textContent = "This page: not running (reload the tab?)";
    return;
  }

  const d = response.diagnostics;
  if (!d.enabled) {
    pageStats.textContent = "This page: replacement disabled";
    return;
  }

  const globalPart = d.globalMatched
    ? `global ✓ ${d.globalRuleCount}`
    : "global ✗ URL not in patterns";
  const localPart = d.localMatchCount > 0
    ? `local ✓ ${d.localRuleCount}`
    : "local ✗";
  const matchPart = `matched: ${Number(d.matchedTermCount || 0)}`;
  const protectedPart = `protected: ${Number(d.protectedTermCount || 0)}`;
  pageStats.textContent = `This page: ${globalPart} | ${localPart} | active: ${d.activeRuleCount} | ${matchPart} | ${protectedPart}`;
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

loadPageDiagnostics().catch(() => {
  document.getElementById("pageStats").textContent = "This page: unavailable";
});
