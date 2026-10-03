# Mirilla — Privacy policy

**English** · [Español](PRIVACY.es.md)

_Last updated: 3 October 2026 (rev. 3)_

Mirilla is a browser extension that reads QR codes and barcodes. It is built so that
**no data ever leaves your device**.

## What Mirilla does not do

- It does not collect, store on any server, sell or share any personal or usage data.
- It does not send images, codes, URLs or browsing activity to anyone. Decoding happens
  entirely inside your browser, using WebAssembly code bundled with the extension.
- The only network request it makes on its own is re-downloading an image you right-click
  ("Read code from this image"), directly from the site that serves it and without cookies,
  so it can be decoded locally. Any other request (see "Checks that only happen when you ask")
  only happens when you click a button.
- The other automatic download is the **public phishing list** (see below): it is downloaded
  whole, the same for everyone, and carries nothing of what you scan.
- It has no analytics, no ads, no tracking and no accounts.
- It does not load remote code.

## What stays on your device

- **Reading history** (on by default, can be turned off): the last 50 codes you read, and the
  site they came from (only its origin, such as `https://example.com`, never the full address),
  are saved in the extension's local storage (`storage.local`) so you can see them again in
  the popup. Nothing is saved from private/incognito windows. You can turn history off or clear
  it at any time from the popup; turning it off also deletes it. Uninstalling the extension
  deletes it too.
- **Your history setting** (on/off), also in local storage.
- **Your trusted sites**: the domains you add in the settings (for example, your bank's), so Mirilla
  can tell you when a code leads to one of them or to an imitation.
- **Your tracker-removal setting** (on by default): known tracking parameters (`utm_*`, `fbclid`…)
  are removed from a link when you open or copy it.
- **A copy of IANA's official list of domain registries**, if you use "Investigate further" (see
  below), kept for a week so it is not downloaded on every check.
- To tell you that "Mirilla has never read a link to this domain before", Mirilla compares against
  its own history, on your device. It does not ask for access to your browser history.

## Permissions and why they are needed

| Permission | Why |
|---|---|
| `activeTab` | To read codes from the tab you are on, only when you invoke Mirilla (popup, context menu or shortcut). |
| `contextMenus` | To add "Read code from this image" and the other options to the right-click menu. |
| `scripting` | To show the area selector and the results panel on the current page when you ask for it. |
| `storage` | To keep the optional reading history, your settings and your trusted sites on your device. |
| `alarms` | To download the public phishing list every 6 hours. |

Mirilla does not request access to all websites. It only acts on the current tab, and only
after you ask it to.

## Camera and screen

If you choose "Scan with the camera" or "Scan the screen or another window", your browser asks for
permission at that moment (Mirilla has no camera or screen permissions in its manifest). The image is
read on your device, frame by frame: it is not recorded, no frame is saved and nothing is sent anywhere.
The camera or capture stops as soon as a code is read, when you press "Stop" or when you close the tab
(the camera, also when the tab is hidden).

## Public phishing list

If it is on (it is by default; it can be turned off in the settings), Mirilla downloads a list of
phishing sites every 6 hours from its own GitHub page
(`https://ramoncoroso.github.io/mirilla/blocklist/`). The list is built from Phishing.Database (MIT
license), it is signed (Mirilla discards a list whose signature does not match) and it contains
truncated fingerprints of domains and addresses, not the addresses in clear. Mirilla compares the
links you read with that list on your device: **neither GitHub nor anyone else learns what you
scan**, only that someone downloaded the list, like any other download (GitHub sees the IP address
it is requested from). The list is kept in the extension's local storage (IndexedDB) and deleted
when you turn it off or uninstall Mirilla.

## Checks that only happen when you ask

- **"Investigate further"** (domain age): Mirilla asks the public domain registry (RDAP) when the
  link's domain was registered. It first downloads IANA's official list of registries
  (`data.iana.org`) and then asks that domain's registry directly (for example, Verisign for `.com`).
  Only the domain name (`example.com`) is sent, never the full link, and without cookies. As with any
  connection, that registry sees the IP address the request comes from. The linked page is never
  visited.
- **"Report"**: copies the link to the clipboard and opens Google Safe Browsing's report form so you
  can paste it; in Spanish it also offers a ready-made email to INCIBE's incident mailbox. Nothing is
  sent until you send it.

## What Mirilla can and cannot know

Mirilla checks a link's **address**, not the page: it does not visit it, so it does not know its
content or reputation. No tool can guarantee that a site is safe, which is why Mirilla never says
"safe": at most "no risk signals", together with the real domain so you can check it is the one you
expected. If you open the link, your browser's own protection (such as Safe Browsing) is a second
safety net.

## Opening links

Mirilla never opens a link on its own. When you choose to open one, your browser visits it
as usual; from that point the visited site's own privacy policy applies.

## Contact

Questions or concerns: open an issue at https://github.com/ramoncoroso/mirilla/issues

## Changes

Any change to this policy will be published in this file, with its date, in the public repository.
