# Mirilla

**English** · [Español](README.es.md)

**See where a code leads before you open it.**

A Chrome and Firefox extension that reads QR codes and barcodes from any web page and warns
you when a link is trying to trick you (*quishing*). Everything runs inside your browser with
[zxing-wasm](https://github.com/Sec-ant/zxing-wasm): no servers, no accounts, no analytics.

*Mirilla* is Spanish for the peephole in a door: you look before you open.

Permissions: `activeTab`, `contextMenus`, `scripting` and `storage`. **No host permissions**:
the extension only touches the tab you use it on, and only when you invoke it.

## Features

- Right-click an image → **Read code from this image** (if CORS blocks it, the image is cropped from a tab screenshot).
- **Select area** (popup, context menu or `Alt+Shift+Q`): drag over anything visible (canvas, video, CSS backgrounds...).
- **Scan visible area**: every code in the tab at once.
- Paste (Ctrl+V), drop or pick an image in the popup.
- Results by content type: link, Wi-Fi, contact (vCard/MECARD), email, phone, SMS, geo, SEPA payment (EPC).
- Anti-quishing URL checks: dangerous schemes, `user@domain` tricks, punycode lookalikes, raw IPs, plain http, URL shorteners.
- Reads QR, Micro QR, Data Matrix, Aztec, PDF417, EAN/UPC, Code 128/39/93, ITF and more.
- Local history (last 50 reads), can be turned off.

The extension UI is currently Spanish only; English is on the way.

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
| `lib/render.ts` | Renders results (shared by popup and panel); always as text, never as HTML |

The E2E build (`E2E=1`, in `.output-e2e/`) adds `<all_urls>` because Playwright cannot grant `activeTab`. **Never publish it.**

## Privacy

Mirilla does not collect, send or sell any data. Images are decoded in your browser and the
history (optional, can be turned off) is stored only on your device (`storage.local`).

## License

[MIT](LICENSE) © 2026 Ramón Coroso

QR Code is a registered trademark of DENSO WAVE INCORPORATED.
