(function () {
  "use strict";

  const STORAGE_DEFAULTS = {
    enabled: true,
    globalRulesText: "",
    globalUrlPatterns: ["https://69shuba.tw/*"],
    localGlossaries: []
  };

  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "OPTION"
  ]);

  let engine = null;
  let observer = null;
  const patternRegexCache = new Map();

  function storageGet(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
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

  function parseGlossary(text) {
    const map = new Map();
    for (const line of String(text || "").split(/\r?\n/)) {
      const pair = parsePairFromLine(line);
      if (!pair) {
        continue;
      }
      const [source, target] = pair;
      map.set(source, target);
    }
    return [...map.entries()];
  }

  function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function wildcardPatternToRegex(pattern) {
    const key = String(pattern || "").trim();
    if (!key) {
      return [];
    }
    if (patternRegexCache.has(key)) {
      return patternRegexCache.get(key);
    }

    const expandedPatterns = key.includes("://")
      ? [key]
      : [`https://${key}`, `http://${key}`];

    const regexList = [];
    for (const candidate of expandedPatterns) {
      const escaped = escapeRegex(candidate).replace(/\\\*/g, ".*");
      try {
        regexList.push(new RegExp(`^${escaped}$`));
      } catch (_error) {
        // Ignore malformed patterns.
      }
    }

    patternRegexCache.set(key, regexList);
    return regexList;
  }

  function urlMatchesPattern(url, pattern) {
    const regexList = wildcardPatternToRegex(pattern);
    for (const regex of regexList) {
      if (regex.test(url)) {
        return true;
      }
    }
    return false;
  }

  function urlMatchesAnyPattern(url, patterns) {
    if (!Array.isArray(patterns) || patterns.length === 0) {
      return false;
    }
    for (const pattern of patterns) {
      if (typeof pattern !== "string") {
        continue;
      }
      if (urlMatchesPattern(url, pattern.trim())) {
        return true;
      }
    }
    return false;
  }

  function getMatchingLocalGlossaries(url, localGlossaries) {
    if (!Array.isArray(localGlossaries)) {
      return [];
    }
    return localGlossaries.filter((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const pattern = typeof entry.pattern === "string" ? entry.pattern.trim() : "";
      if (!pattern) {
        return false;
      }
      return urlMatchesPattern(url, pattern);
    });
  }

  function buildEffectiveEntries(settings, currentUrl) {
    const globalPatterns = Array.isArray(settings.globalUrlPatterns)
      ? settings.globalUrlPatterns
      : [];
    const globalMatched = urlMatchesAnyPattern(currentUrl, globalPatterns);
    const matchingLocal = getMatchingLocalGlossaries(currentUrl, settings.localGlossaries);

    if (!globalMatched && matchingLocal.length === 0) {
      return [];
    }

    const merged = new Map();

    if (globalMatched) {
      for (const [source, target] of parseGlossary(settings.globalRulesText || "")) {
        merged.set(source, target);
      }
    }

    for (const localEntry of matchingLocal) {
      for (const [source, target] of parseGlossary(localEntry.rulesText || "")) {
        merged.set(source, target);
      }
    }

    return [...merged.entries()];
  }

  function buildTrie(entries) {
    const root = {
      next: Object.create(null),
      replacement: null
    };
    const startChars = new Set();

    for (const [source, target] of entries) {
      if (!source) {
        continue;
      }
      startChars.add(source[0]);
      let node = root;
      for (let i = 0; i < source.length; i += 1) {
        const ch = source[i];
        if (!node.next[ch]) {
          node.next[ch] = {
            next: Object.create(null),
            replacement: null
          };
        }
        node = node.next[ch];
      }
      node.replacement = target;
    }

    return {
      root,
      startChars,
      count: entries.length
    };
  }

  const WORD_CHAR_RE = /[\p{L}\p{N}]/u;

  function isWordLikeChar(ch) {
    return Boolean(ch) && WORD_CHAR_RE.test(ch);
  }

  function shouldInsertSpaceBetweenReplacements(previousReplacement, nextReplacement) {
    if (!previousReplacement || !nextReplacement) {
      return false;
    }
    const prevLastChar = previousReplacement[previousReplacement.length - 1];
    const nextFirstChar = nextReplacement[0];
    return isWordLikeChar(prevLastChar) && isWordLikeChar(nextFirstChar);
  }

  function replaceString(input, trie) {
    if (!input || !trie || trie.count === 0) {
      return { text: input, changed: false };
    }

    let output = "";
    let changed = false;
    let i = 0;
    let lastSegmentWasReplacement = false;
    let lastReplacementText = "";

    while (i < input.length) {
      const first = input[i];
      if (!trie.startChars.has(first)) {
        output += first;
        i += 1;
        lastSegmentWasReplacement = false;
        lastReplacementText = "";
        continue;
      }

      let node = trie.root.next[first];
      if (!node) {
        output += first;
        i += 1;
        lastSegmentWasReplacement = false;
        lastReplacementText = "";
        continue;
      }

      let bestReplacement = node.replacement;
      let bestLength = bestReplacement != null ? 1 : 0;
      let j = i + 1;

      while (j < input.length) {
        const ch = input[j];
        node = node.next[ch];
        if (!node) {
          break;
        }
        if (node.replacement != null) {
          bestReplacement = node.replacement;
          bestLength = j - i + 1;
        }
        j += 1;
      }

      if (bestLength > 0) {
        if (
          lastSegmentWasReplacement &&
          shouldInsertSpaceBetweenReplacements(lastReplacementText, bestReplacement)
        ) {
          output += " ";
        }
        output += bestReplacement;
        i += bestLength;
        changed = true;
        lastSegmentWasReplacement = true;
        lastReplacementText = bestReplacement;
      } else {
        output += first;
        i += 1;
        lastSegmentWasReplacement = false;
        lastReplacementText = "";
      }
    }

    return { text: output, changed };
  }

  function shouldSkipTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      return true;
    }
    if (!node.nodeValue) {
      return true;
    }
    const parent = node.parentElement;
    if (!parent) {
      return true;
    }
    if (SKIP_TAGS.has(parent.tagName)) {
      return true;
    }
    if (parent.isContentEditable) {
      return true;
    }
    if (parent.closest("[data-glossary-replacer-skip='1']")) {
      return true;
    }
    return false;
  }

  function replaceTextNode(node) {
    if (!engine || shouldSkipTextNode(node)) {
      return;
    }
    const current = node.nodeValue;
    const result = replaceString(current, engine);
    if (result.changed) {
      node.nodeValue = result.text;
    }
  }

  function walkAndReplace(rootNode) {
    if (!engine || !rootNode) {
      return;
    }

    if (rootNode.nodeType === Node.TEXT_NODE) {
      replaceTextNode(rootNode);
      return;
    }

    if (
      rootNode.nodeType !== Node.ELEMENT_NODE &&
      rootNode.nodeType !== Node.DOCUMENT_NODE &&
      rootNode.nodeType !== Node.DOCUMENT_FRAGMENT_NODE
    ) {
      return;
    }

    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return shouldSkipTextNode(node)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });

    let current = walker.nextNode();
    while (current) {
      replaceTextNode(current);
      current = walker.nextNode();
    }
  }

  function startObserver() {
    if (observer || !document.documentElement) {
      return;
    }

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          replaceTextNode(mutation.target);
          continue;
        }
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            walkAndReplace(node);
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function stopObserver() {
    if (!observer) {
      return;
    }
    observer.disconnect();
    observer = null;
  }

  async function reloadFromStorage() {
    const settings = await storageGet(STORAGE_DEFAULTS);
    if (!settings.enabled) {
      engine = null;
      stopObserver();
      return;
    }

    const entries = buildEffectiveEntries(settings, window.location.href);
    engine = buildTrie(entries);
    if (engine.count === 0) {
      engine = null;
      stopObserver();
      return;
    }

    walkAndReplace(document.documentElement);
    startObserver();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") {
      return;
    }
    if (
      "enabled" in changes ||
      "globalRulesText" in changes ||
      "globalUrlPatterns" in changes ||
      "localGlossaries" in changes
    ) {
      reloadFromStorage().catch((error) => {
        console.error("Glossary reload failed", error);
      });
    }
  });

  reloadFromStorage().catch((error) => {
    console.error("Glossary init failed", error);
  });

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      if (engine && engine.count > 0) {
        walkAndReplace(document.documentElement);
      }
      startObserver();
    },
    { once: true }
  );
})();

