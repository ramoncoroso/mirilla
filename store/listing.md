# Store listings

Texts ready to paste into each store, in English (default) and Spanish.
Assets (screenshots, promo tiles, logo) are generated with `npm run store:assets` into `store/assets/`.

- Privacy policy URL: https://github.com/ramoncoroso/mirilla/blob/main/PRIVACY.md
- Homepage / support URL: https://github.com/ramoncoroso/mirilla
- Support (issues): https://github.com/ramoncoroso/mirilla/issues

---

## Common texts

### Name (≤ 45 characters; comes from the manifest)

- en: `Mirilla — QR & Barcode Reader`
- es: `Mirilla — Lector QR y códigos de barras`

### Short description / summary (≤ 132 characters; comes from the manifest)

- en: `See where a code leads before you open it. Reads QR codes and barcodes on any page, locally: no servers, no tracking.`
- es: `Mira adónde lleva un código antes de abrirlo. Lee QR y códigos de barras de cualquier web, en local: sin servidores ni rastreo.`

### Detailed description — English

```
See where a code leads before you open it.

Mirilla reads QR codes and barcodes on any web page and shows you what they contain before anything happens. If a link is trying to trick you, it tells you why.

READ CODES ANYWHERE
• Right-click an image → "Read code from this image"
• Select an area of the page (Alt+Shift+Q) — works on canvases, videos and backgrounds too
• Scan everything visible in the tab at once
• Paste a screenshot (Ctrl+V), drop an image or pick a file

STAY SAFE FROM QR PHISHING ("QUISHING")
• One clear verdict for every code: Danger, Caution, No risk signals or Trusted site, with the real domain highlighted
• Detects impersonated brands (banks, PayPal, couriers, tax agencies…), lookalike domains and letters, hidden links inside texts and SMS, app installers, USSD codes, premium-rate numbers and open Wi-Fi
• Compares links with a public phishing list, downloaded whole and checked on your device: nobody learns what you scan
• Add your trusted sites (your bank, your company): imitations of them are flagged as Danger
• Optional "Investigate further": the domain's registration date, asked only when you click
• Removes tracking parameters when you open or copy a link, and offers to report phishing
• Dangerous links (javascript:, data:…) are never opened. Nothing is ever opened automatically: you decide

Mirilla checks the address, not the page: no tool can guarantee that a site is safe, so Mirilla never says "safe". Your browser's own protection is a second safety net if you open a link.

UNDERSTANDS WHAT IT READS
• Links, Wi-Fi networks (copy the password), contacts, email, phone, SMS, locations and SEPA payment QR codes
• GS1 barcodes on labels and packaging: GTIN, SSCC, batch/lot, expiry and other dates, weights, prices… in GS1 DataMatrix, GS1-128, QR and DataBar, plus GS1 Digital Link URLs
• Validates check digits and flags expired products
• Shows the GS1 prefix of EAN/UPC product codes
• QR, Micro QR, Data Matrix, Aztec, PDF417, EAN/UPC, Code 128/39/93, ITF and more

AND ALSO
• QR code of the current page, to download or copy
• Local history of your last 50 reads (can be turned off; never from private windows)
• English and Spanish

PRIVATE BY DESIGN
Codes are read and checked inside your browser. No accounts, no analytics, no ads. Mirilla does not ask for access to all websites: it only acts on the current tab, and only when you ask.

Free and open source (MIT): https://github.com/ramoncoroso/mirilla
```

### Detailed description — Español

```
Mira adónde lleva un código antes de abrirlo.

Mirilla lee códigos QR y de barras de cualquier web y te enseña lo que contienen antes de que pase nada. Si un enlace intenta engañarte, te dice por qué.

LEE CÓDIGOS EN CUALQUIER SITIO
• Clic derecho en una imagen → «Leer código de esta imagen»
• Selecciona un área de la página (Alt+Mayús+Q): también en canvas, vídeos y fondos
• Busca todos los códigos visibles de la pestaña de una vez
• Pega una captura (Ctrl+V), arrastra una imagen o elige un fichero

A SALVO DEL PHISHING CON QR («QUISHING»)
• Un veredicto claro para cada código: Peligro, Precaución, Sin señales de riesgo o Sitio de confianza, con el dominio real resaltado
• Detecta marcas suplantadas (bancos, PayPal, mensajerías, Hacienda…), dominios y letras que imitan a otros, enlaces escondidos en textos y SMS, instaladores de apps, códigos USSD, números de tarificación especial y WiFi abiertas
• Compara los enlaces con una lista pública de phishing, descargada entera y comprobada en tu equipo: nadie sabe qué escaneas
• Añade tus sitios de confianza (tu banco, tu empresa): sus imitaciones salen como Peligro
• «Investigar más», opcional: la fecha de registro del dominio, solo si lo pulsas
• Quita los parámetros de rastreo al abrir o copiar un enlace, y te ayuda a denunciar el phishing
• Los enlaces peligrosos (javascript:, data:…) nunca se abren. Nada se abre solo: decides tú

Mirilla analiza la dirección, no la página: ninguna herramienta puede garantizar que un sitio es seguro, por eso Mirilla nunca dice «seguro». Si abres un enlace, la protección de tu navegador es una segunda red de seguridad.

ENTIENDE LO QUE LEE
• Enlaces, redes WiFi (copia la contraseña), contactos, email, teléfono, SMS, ubicaciones y QR de pago SEPA
• Códigos GS1 de etiquetas y envases: GTIN, SSCC, lote, caducidad y otras fechas, pesos, precios… en GS1 DataMatrix, GS1-128, QR y DataBar, y URL GS1 Digital Link
• Valida el dígito de control y avisa de productos caducados
• Muestra el prefijo GS1 de los códigos de producto EAN/UPC
• QR, Micro QR, Data Matrix, Aztec, PDF417, EAN/UPC, Code 128/39/93, ITF y más

Y ADEMÁS
• QR de la página actual, para descargar o copiar
• Historial local de las últimas 50 lecturas (desactivable; nunca de ventanas privadas)
• En castellano e inglés

PRIVADA DESDE EL DISEÑO
Los códigos se leen y se analizan dentro de tu navegador. Sin cuentas, sin analítica, sin anuncios. Mirilla no pide acceso a todas las webs: solo actúa sobre la pestaña actual y solo cuando se lo pides.

Libre y de código abierto (MIT): https://github.com/ramoncoroso/mirilla
```

---

## Chrome Web Store

- **Category**: Tools
- **Language**: English (default) + Spanish
- **Assets**: icon 128×128 (in the package), screenshots 1280×800 (`store/assets/<lang>/screenshot-*.png`), small promo tile 440×280 (`promo-small-440x280.png`), marquee 1400×560 (`promo-marquee-1400x560.png`, optional)

### Privacy practices tab

**Single purpose**

> Read QR codes and barcodes shown in web pages or images and display their content, with safety warnings for links, without sending what is scanned off the device.

**Permission justifications**

| Permission | Justification |
|---|---|
| `activeTab` | Used only after the user invokes the extension (toolbar popup, context menu or keyboard shortcut) to capture the visible area of the current tab and read the codes in it. No access to other tabs or sites. |
| `contextMenus` | Adds "Read code from this image", "Select area to read a code" and "Scan visible area for codes" to the right-click menu. |
| `scripting` | Injects, on demand, the area selector and the results panel into the current tab (the one granted by activeTab). |
| `storage` | Stores the local history of reads (on by default, can be turned off; only the page origin; never from incognito windows), the user's settings and trusted sites in storage.local. Nothing is synced or sent. |
| `alarms` | Downloads the public phishing list every 6 hours from the extension's own GitHub Pages site, to compare links on the device. Nothing about the user is sent. |

**Remote code**: No. All code, including the WebAssembly decoder, is inside the package.

**Data usage**: the extension does not collect any of the listed data types. Tick the three certifications (no selling, no unrelated use, no creditworthiness use).

---

## Firefox Add-ons (AMO)

- **Summary** (≤ 250): same as the short description above.
- **Categories**: Privacy & Security; Other
- **Tags**: qr code, barcode, qr reader, phishing, privacy, gs1
- **License**: MIT
- **Privacy policy**: paste the text of PRIVACY.md (AMO asks for the text, not a URL)
- **Source code**: upload `mirilla-<version>-sources.zip` (generated by `npm run zip:firefox`); see the reviewer notes below.

### Notes for reviewers

Paste the contents of `store/amo-reviewer-notes.txt`, regenerated for each release with
`npm run store:notes` (build instructions, WASM provenance with verified SHA-256, permissions, how to test).
The sources zip excludes private and generated files (see `zip.excludeSources` in `wxt.config.ts`) and
rebuilds to a package identical to the submitted one.

---

## Microsoft Edge Add-ons

- Same package as Chrome (`mirilla-<version>-chrome.zip`).
- **Category**: Productivity
- **Store logo**: 300×300 (`store/assets/logo-300.png`)
- **Screenshots**: same 1280×800 as Chrome
- **Small promo tile** (optional): 440×280
- Descriptions, privacy policy URL and permission explanations: same as Chrome.
