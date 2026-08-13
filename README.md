# Glossary Pre-Translate Replacer (Chrome Extension)

This extension replaces terms on web pages before translation.

## Core features

1. Master on/off toggle.
2. Global domain allowlist (rules only run on matching URLs).
3. Global glossary + Local glossary per URL pattern.
4. Local glossary overrides global glossary on conflicts.

## Why this helps

For Chinese novels, this order is usually better:

1. Chinese page
2. Name/term replacement
3. Browser translation

This keeps names consistent before translation runs.

## Rule format

One rule per line:

```text
宇智波佐助=Uchiha Sasuke
漩涡鸣人=Uzumaki Naruto
```

Supported separators:

- `=`
- `->`
- `=>`
- `→`

Markdown table rows are also supported:

```text
| 宇智波佐助 | Uchiha Sasuke |
```

## URL pattern format

Use wildcard `*`:

- Domain-wide global pattern: `https://69shuba.tw/*`
- Per-book local pattern: `https://69shuba.tw/read/382455/*`

## Local override behavior

If both glossaries contain the same source term:

- Global: `李长生=Li Changsheng`
- Local: `李长生=Li Zhangsheng`

On matching local URLs, the local value is used.

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this folder: `chrome-glossary-replacer`.

## Use

1. Click extension icon and keep Enable replacement on.
2. Open settings.
3. Add global URL patterns.
4. Add/edit global glossary.
5. Add local glossary entries for specific books/pages (pattern + rules).
6. Click Save all settings.
7. Refresh the page, then run translation.

## Notes

- Includes `default-glossary.md` loaded on first install.
- Replacements apply to initial and dynamic page content.
- Replacements run immediately once the stored rules are ready, with no post-replacement settling delay.
- Adjacent replacement boundaries are passed to Novel Reader & Formatter with an invisible marker; the formatter adds the visible space after translation.
- A readiness latch covers asynchronous rule loading and parsing, then releases immediately after one complete DOMContentLoaded replacement walk. It has no post-load settling delay and advertisements cannot extend it.
- The replacement engine runs in the top-level page rather than repeating the full glossary inside advertising frames.
- If the same source appears multiple times in one glossary, last one wins.
