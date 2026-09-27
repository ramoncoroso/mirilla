# Plan — Mirilla, extensión lectora de códigos QR (Chrome + Firefox)

> Hoja de ruta del proyecto. Las casillas marcan lo hecho.

**Fecha:** 2026-09-27
**Estado:** Fases 1, 1.5 y 2 hechas; Fase 3 preparada → falta subir a las tiendas (lo hace el usuario con sus cuentas)

## Posicionamiento

El mercado de lectores QR está saturado y varias extensiones populares se vendieron
y metieron adware. Nos diferenciamos por:

1. **Privacidad**: todo se procesa en local, sin servidores ni analítica, con permisos mínimos
2. **Seguridad**: análisis anti-quishing de las URLs antes de abrirlas
3. **Nicho**: códigos industriales y GS1 → gancho hacia Labelic (tráfico y SEO)

## Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| Framework | **WXT** 0.21 + TypeScript | Un solo código para Chrome y Firefox; resuelve las diferencias de MV3 |
| Decodificador | **zxing-wasm** 3 (zxing-cpp) | El más robusto y con todos los formatos. `jsQR` está abandonado; `BarcodeDetector` no existe en Firefox ni en Chrome de escritorio Win/Linux |
| Manifest | **MV3 en los dos**, Firefox ≥140 (Android ≥142) | Lo exige `data_collection_permissions` |
| Permisos | `activeTab`, `contextMenus`, `scripting`, `storage`, **sin permisos de host** | Confianza del usuario y revisión fácil en las tiendas |
| UI en página | Script "unlisted" inyectado con `executeScript` + shadow DOM cerrado | Los content scripts "runtime" de WXT añaden `host_permissions` |
| UI | DOM plano, sin framework | Popup instantáneo; renderizador compartido entre el popup y el panel |
| Nombre | **Mirilla** ("mira antes de abrir"). Descartados por estar ocupados: QR Peek, QRShield, QuishGuard; ScanSafe (Cisco) | En las tiendas: "Mirilla — Lector QR y códigos de barras" (Firefox limita el nombre a 45 caracteres) |
| Marca | Independiente de Labelic; repo público `ramoncoroso/mirilla`, licencia **MIT** | Un proyecto abierto con marca propia genera más confianza; Labelic como autor/enlace |
| Elixir/LiveView | **No para la extensión** (tiene que ser JS). Sí para un backend opcional o un lector web (Fase 4) | |

## Fases

### Fase 1 — MVP ✅ (2026-09-27)
- [x] Clic derecho en una imagen → leer (fetch; si falla, recorte de una captura)
- [x] Seleccionar área (popup, menú contextual, `Alt+Shift+Q`)
- [x] Buscar en lo visible (varios códigos)
- [x] Pegar, arrastrar o elegir un fichero en el popup
- [x] Resultado por tipo: URL, WiFi, vCard/MECARD, email, tel, SMS, geo, SEPA/EPC, texto
- [x] Anti-quishing: esquemas peligrosos, `usuario@dominio`, punycode, IP, http, acortadores, puertos, subdominios
- [x] Historial local (50), desactivable
- [x] Tests: 15 unitarios (vitest) + 2 E2E (Playwright + Chromium real)
- [x] Build Chrome y Firefox; `web-ext lint` sin errores ni avisos

### Fase 1.5 — Verificación ✅ (2026-09-27, automatizada)
- [x] Chromium (Playwright, 14 pruebas): menú «Leer imagen» por fetch y por recorte (SVG), imagen medio fuera de la vista, buscar en lo visible (QR + EAN-13 + Data Matrix), HiDPI ×2, zoom 150 %, `chrome://` protegida, imágenes difíciles (invertida, girada + borrosa + poco contraste, diminuta, varias en una), historial desactivado, abrir enlace y bloqueo de `javascript:`
- [x] Firefox 156 (Selenium + geckodriver, 7 pruebas): popup, selección de área, menú por fetch y SVG, buscar en lo visible, zoom 150 %, HiDPI ×2
- [x] **Fallo encontrado y corregido**: el panel «Leyendo…» se pintaba antes de capturar y tapaba los códigos de la esquina superior derecha (y el panel de una lectura anterior también). Ahora se oculta, se espera al repintado, se captura y luego se muestra. Con prueba de regresión.
- [ ] A mano (la automatización no llega): clic real en el menú contextual del navegador y el atajo `Alt+Shift+Q`

### Fase 2 — Diferenciación y nicho Labelic ✅ (2026-09-27)
- [x] **GS1**: ~80 AIs (GTIN, SSCC, lote, fechas con ventana de siglo y fin de mes, medidas con decimales, importes con moneda ISO, GLN, países...), interpretados desde el texto en bruto de zxing (modo `Plain`, con separadores GS)
- [x] **GS1 Digital Link**: AIs de la ruta y de la query, alias antiguos (`gtin`, `lot`...), GTIN-8/12/13 normalizado a 14; además, el análisis anti-quishing de la URL
- [x] Dígito de control de GTIN/GLN/SSCC (aviso con el dígito correcto) y aviso de producto caducado (AI 17)
- [x] Prefijo GS1 de EAN/UPC con nombre de país traducido (`Intl.DisplayNames`), ISBN/ISMN/ISSN, cupones y distribución restringida, con la aclaración de que no es el país de fabricación
- [x] Generar el QR de la página actual (zxing-wasm/writer bajo demanda), descargar PNG y copiar imagen
- [x] Pruebas: 20 unitarias nuevas, 8 en Chromium (en/es, ida y vuelta generar→leer) y 1 en Firefox
- [x] Relación con Labelic (decidido 2026-09-27): **solo una mención en el README** ("hecho por el autor de Labelic"); ningún enlace dentro de la extensión

### Fase 3 — Publicación ⏳ (preparada 2026-09-27; falta subir a las tiendas)
- [x] Nombre: Mirilla; ID de Firefox `mirilla@ramoncoroso.github.io` (**no se puede cambiar tras publicar**)
- [x] Licencia MIT
- [x] Repo git propio en `plugin/` (rama `main`)
- [x] Publicado en GitHub: https://github.com/ramoncoroso/mirilla (público, 2026-09-27)
- [x] i18n: en (por defecto) + es, desde `locales/messages.ts` (nombre, descripción, menús e interfaz)
- [x] Versión 1.0.0
- [x] Política de privacidad: `PRIVACY.md` / `PRIVACY.es.md` (URL: https://github.com/ramoncoroso/mirilla/blob/main/PRIVACY.md)
- [x] Textos de las fichas en/es, propósito único y justificación de permisos: `store/listing.md`
- [x] Capturas 1280×800 en/es, promo 440×280 y 1400×560, logo 300×300: `npm run store:assets` → `store/assets/`
- [x] Paquetes: `npm run zip` (Chrome/Edge) y `npm run zip:firefox` (+ zip de fuentes, sin ficheros privados, reproducible byte a byte)
- [x] Notas para revisores de Firefox con SHA-256 verificados de los WASM: `npm run store:notes`
- [ ] **Usuario**: cuenta de desarrollador de Chrome Web Store (pago único de 5 $) y subir `mirilla-1.0.0-chrome.zip`
- [ ] **Usuario**: cuenta en addons.mozilla.org y subir `mirilla-1.0.0-firefox.zip` + `mirilla-1.0.0-sources.zip`
- [ ] **Usuario**: cuenta en Microsoft Partner Center (Edge, gratis) y subir el zip de Chrome
- [ ] Tras publicar: enlazar las fichas desde el README; etiqueta `v1.0.0` y release en GitHub
- [x] Icono: se mantiene el actual (decidido 2026-09-27, tras comparar 4 propuestas)

### Fase 4 — Opcional (Elixir/Phoenix)
- [ ] Lector web en labelic.com con LiveView + hook JS (zxing-wasm en el cliente) → SEO y móvil
- [ ] Backend Phoenix + Postgres solo si una función lo necesita: reputación de URLs, cuentas o sincronización del historial
