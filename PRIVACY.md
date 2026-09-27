# Mirilla — Privacy policy

**English** · [Español](PRIVACY.es.md)

_Last updated: 27 September 2026_

Mirilla is a browser extension that reads QR codes and barcodes. It is built so that
**no data ever leaves your device**.

## What Mirilla does not do

- It does not collect, store on any server, sell or share any personal or usage data.
- It does not send images, codes, URLs or browsing activity anywhere. Decoding happens
  entirely inside your browser, using WebAssembly code bundled with the extension.
- It has no analytics, no ads, no tracking and no accounts.
- It does not load remote code.

## What stays on your device

- **Reading history** (optional): the last 50 codes you read, with the page they came from,
  are saved in the extension's local storage (`storage.local`) so you can see them again in
  the popup. You can turn history off or clear it at any time from the popup; turning it off
  also deletes it. Uninstalling the extension deletes it too.
- **Your history setting** (on/off), also in local storage.

## Permissions and why they are needed

| Permission | Why |
|---|---|
| `activeTab` | To read codes from the tab you are on, only when you invoke Mirilla (popup, context menu or shortcut). |
| `contextMenus` | To add "Read code from this image" and the other options to the right-click menu. |
| `scripting` | To show the area selector and the results panel on the current page when you ask for it. |
| `storage` | To keep the optional reading history and its setting on your device. |

Mirilla does not request access to all websites. It only acts on the current tab, and only
after you ask it to.

## Opening links

Mirilla never opens a link on its own. When you choose to open one, your browser visits it
as usual; from that point the visited site's own privacy policy applies.

## Contact

Questions or concerns: open an issue at https://github.com/ramoncoroso/mirilla/issues

## Changes

Any change to this policy will be published in this file, with its date, in the public repository.
