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
| `lib/render.ts` | Pinta resultados (compartido popup/panel); todo como texto, nunca HTML |
| `locales/messages.ts` | Textos de la interfaz (en, es); de ahí se generan los `_locales/*/messages.json` al compilar |

La build E2E (`E2E=1`, en `.output-e2e/`) añade `<all_urls>` porque Playwright no puede conceder `activeTab`. **No publicarla.**

## Privacidad

Mirilla no recoge, envía ni vende ningún dato. Las imágenes se decodifican en tu navegador y
el historial (opcional, desactivable) se guarda solo en tu equipo (`storage.local`).

## Licencia

[MIT](LICENSE) © 2026 Ramón Coroso
