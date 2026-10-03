# Mirilla

**English** · [Español](README.es.md)

**See where a code leads before you open it.**

A Chrome and Firefox extension that reads QR codes and barcodes from any web page and warns
you when a link is trying to trick you (*quishing*). Everything runs inside your browser with
[zxing-wasm](https://github.com/Sec-ant/zxing-wasm): no servers, no accounts, no analytics.

*Mirilla* is Spanish for the peephole in a door: you look before you open.

Permissions: `activeTab`, `alarms`, `contextMenus`, `scripting` and `storage`. **No host permissions**:
the extension only touches the tab you use it on, and only when you invoke it.

## Features

- Right-click an image → **Read code from this image** (if CORS blocks it, the image is cropped from a tab screenshot).
- **Select area** (popup, context menu or `Alt+Shift+Q`): drag over anything visible (canvas, video, CSS backgrounds...).
- **Scan visible area**: every code in the tab at once.
- Paste (Ctrl+V), drop or pick an image in the popup.
- Results by content type: link, Wi-Fi, contact (vCard/MECARD), email, phone, SMS, geo, SEPA payment (EPC).
- Anti-quishing: one verdict per code (Danger, Caution, No risk signals, Trusted site) from offline checks (impersonated brands, lookalike domains and homographs, `user@domain` tricks, hidden links, installers, USSD and premium numbers, open Wi-Fi…), your trusted sites and a signed public phishing list (Phishing.Database) downloaded every 6 h and compared locally. On demand: domain age via RDAP. Tracker removal and reporting.
- Mirilla checks the address, not the page: it never says "safe".
- Reads QR, Micro QR, Data Matrix, Aztec, PDF417, EAN/UPC, Code 128/39/93, ITF and more.
- **GS1 aware**: interprets Application Identifiers (GTIN, SSCC, batch/lot, expiry and other dates, weights and measures, prices, GLNs...) in GS1 DataMatrix, GS1-128, GS1 QR and DataBar, and GS1 Digital Link URLs. Validates check digits, flags expired products and shows the GS1 prefix of EAN/UPC codes.
- **QR code of the current page**, to download as PNG or copy as an image.
- Local history (last 50 reads), can be turned off.

The extension UI is available in English and Spanish, following your browser's language.

Requirements: current Chrome/Edge, or Firefox ≥140 (Firefox for Android ≥142).

## Development

```sh
npm install
npm run dev            # Chrome with hot reload
npm run dev:firefox
npm run build          # .output/chrome-mv3
npm run build:firefox  # .output/firefox-mv3
npm run zip / zip:firefox   # store packages
npm test               # unit tests (content parsing and URL analysis)
npm run test:e2e       # Playwright + Chromium with the extension loaded
npm run test:firefox   # Selenium + geckodriver + Firefox with the extension installed
npm run store:assets   # store screenshots and promo images → store/assets/
npm run store:notes    # notes for Firefox reviewers → store/amo-reviewer-notes.txt
```

Load it manually: Chrome → `chrome://extensions` → Developer mode → *Load unpacked* → `.output/chrome-mv3`.
Firefox → `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → `.output/firefox-mv3/manifest.json`.

## Project layout

| Path | What it does |
|---|---|
| `entrypoints/background.ts` | Context menus, shortcut, tab capture, cropping and decoding |
| `entrypoints/overlay.ts` | Injected on demand: area selector and results panel (closed shadow DOM) |
| `entrypoints/popup/` | Popup: actions, paste/drop, history |
| `lib/decode.ts` | zxing-wasm; the `.wasm` ships inside the package (MV3 forbids remote code) |
| `lib/parse.ts` | Classifies the content (Wi-Fi, vCard, SEPA...) |
| `lib/url-safety.ts` | Anti-phishing heuristics, fully offline |
| `lib/gs1.ts` | GS1: Application Identifiers, Digital Link, check digits, GS1 prefixes |
| `lib/generate.ts` | QR generation (zxing-wasm writer, loaded on demand) |
| `lib/render.ts` | Renders results (shared by popup and panel); always as text, never as HTML |
| `locales/messages.ts` | UI strings (en, es); `_locales/*/messages.json` is generated from it at build time |

The E2E build (`E2E=1`, in `.output-e2e/`) adds `<all_urls>` (automation cannot grant `activeTab`) and a test-only bridge (`lib/e2e-bridge.ts`, `__mirillaTest`). **Never publish it.** The regular build strips all of it.

## Privacy

Mirilla does not collect, send or sell any data. Images are decoded in your browser and the
history (on by default, can be turned off; never from private windows; only the site's origin) is stored only
on your device (`storage.local`).
Full policy: [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE) © 2026 Ramón Coroso

Made by the author of [Labelic](https://labelic.com), a label and barcode design tool. Mirilla is an independent project: it has no ads, no tracking and no links to Labelic inside the extension.
