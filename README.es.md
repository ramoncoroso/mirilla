# Mirilla

[English](README.md) · **Español**

**Mira adónde lleva un código antes de abrirlo.**

Extensión para Chrome y Firefox que lee códigos QR y de barras de cualquier web y te
avisa si el enlace intenta engañarte (*quishing*). Todo se procesa en tu navegador con
[zxing-wasm](https://github.com/Sec-ant/zxing-wasm): sin servidores, sin cuentas, sin analítica.

*Mirilla* es la lente de la puerta: miras quién hay antes de abrir.

Permisos: `activeTab`, `contextMenus`, `scripting` y `storage`. **Ningún permiso de acceso a
webs**: la extensión solo toca la pestaña en la que la usas, y solo cuando tú la invocas.

## Funciones

- Clic derecho en una imagen → **Leer código de esta imagen** (si CORS lo impide, recorta la imagen de una captura).
- **Seleccionar área** (popup, menú contextual o `Alt+Shift+Q`): arrastra sobre cualquier cosa visible (canvas, vídeo, CSS...).
- **Buscar en lo visible**: todos los códigos de la pestaña de una vez.
- Pegar (Ctrl+V), arrastrar o elegir una imagen en el popup.
- Resultados por tipo: enlace, WiFi, contacto (vCard/MECARD), email, teléfono, SMS, geo, pago SEPA (EPC).
- **GS1**: interpreta los identificadores de aplicación (GTIN, SSCC, lote, caducidad y otras fechas, pesos y medidas, precios, GLN...) en GS1 DataMatrix, GS1-128, GS1 QR y DataBar, y las URL GS1 Digital Link. Valida el dígito de control, avisa de productos caducados y muestra el prefijo GS1 de los EAN/UPC.
- **QR de la página actual**, para descargar en PNG o copiar como imagen.
- Análisis anti-quishing de URLs: esquemas peligrosos, `usuario@dominio`, punycode, IPs, http, acortadores.
- Historial local (50 lecturas), desactivable.

La interfaz de la extensión está en inglés y en castellano, según el idioma del navegador.

Requisitos: Chrome/Edge actual o Firefox ≥140 (Firefox para Android ≥142).

## Desarrollo

```sh
npm install
npm run dev            # Chrome con recarga en caliente
npm run dev:firefox
npm run build          # .output/chrome-mv3
npm run build:firefox  # .output/firefox-mv3
npm run zip / zip:firefox   # paquetes para las tiendas
npm test               # unitarios (parseo y análisis de URLs)
npm run test:e2e       # Playwright + Chromium con la extensión cargada
npm run test:firefox   # Selenium + geckodriver + Firefox con la extensión instalada
npm run store:assets   # capturas e imágenes promocionales de las tiendas → store/assets/
npm run store:notes    # notas para los revisores de Firefox → store/amo-reviewer-notes.txt
```

Cargar a mano: Chrome → `chrome://extensions` → modo desarrollador → *Cargar descomprimida* → `.output/chrome-mv3`.
Firefox → `about:debugging#/runtime/this-firefox` → *Cargar complemento temporal* → `.output/firefox-mv3/manifest.json`.

## Estructura

| Ruta | Qué hace |
|---|---|
| `entrypoints/background.ts` | Menús, atajo, captura de pestaña, recorte y decodificación |
| `entrypoints/overlay.ts` | Se inyecta bajo demanda: selector de área y panel de resultados (shadow DOM cerrado) |
| `entrypoints/popup/` | Popup: botones, pegar/arrastrar, historial |
| `lib/decode.ts` | zxing-wasm; el `.wasm` va en el paquete (MV3 prohíbe código remoto) |
| `lib/parse.ts` | Clasifica el contenido (WiFi, vCard, SEPA...) |
| `lib/url-safety.ts` | Heurísticas anti-phishing, sin red |
| `lib/gs1.ts` | GS1: identificadores de aplicación, Digital Link, dígitos de control, prefijos GS1 |
| `lib/generate.ts` | Generación de QR (codificador de zxing-wasm, cargado bajo demanda) |
| `lib/render.ts` | Pinta resultados (compartido popup/panel); todo como texto, nunca HTML |
| `locales/messages.ts` | Textos de la interfaz (en, es); de ahí se generan los `_locales/*/messages.json` al compilar |

La build E2E (`E2E=1`, en `.output-e2e/`) añade `<all_urls>` (la automatización no puede conceder `activeTab`) y un puente solo para pruebas (`lib/e2e-bridge.ts`, `__mirillaTest`). **No publicarla nunca.** La build normal no incluye nada de eso.

## Privacidad

Mirilla no recoge, envía ni vende ningún dato. Las imágenes se decodifican en tu navegador y
el historial (activado por defecto, desactivable; nunca de ventanas privadas; solo el origen del sitio) se guarda
solo en tu equipo (`storage.local`).
Política completa: [PRIVACY.es.md](PRIVACY.es.md).

## Licencia

[MIT](LICENSE) © 2026 Ramón Coroso

Hecho por el autor de [Labelic](https://labelic.com), herramienta de diseño de etiquetas y códigos de barras. Mirilla es un proyecto independiente: sin anuncios, sin rastreo y sin enlaces a Labelic dentro de la extensión.
