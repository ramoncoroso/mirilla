# Plan — Mirilla, extensión lectora de códigos QR (Chrome + Firefox)

> Hoja de ruta del proyecto. Las casillas marcan lo hecho.

**Fecha:** 2026-09-27
**Estado:** Fase 1 (MVP) hecha → falta verificación manual (Fase 1.5)

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

### Fase 1.5 — Verificación manual ⏳ (siguiente paso)
- [ ] Cargar `.output/chrome-mv3` en Chrome y probar los 4 modos de lectura
- [ ] Cargar `.output/firefox-mv3` en Firefox (`about:debugging`) y probar lo mismo
- [ ] Caminos sin cobertura E2E: **clic derecho en imagen** (fetch y recorte) y **Buscar en lo visible** desde el popup real
- [ ] Casos límite: pantalla HiDPI y zoom ≠ 100 % (escala del recorte), imagen SVG, imagen parcialmente fuera del viewport, páginas protegidas (`chrome://`, tiendas)
- [ ] Probar con QR reales: fotos inclinadas, códigos pequeños, invertidos (blanco sobre negro)

### Fase 2 — Diferenciación y nicho Labelic
- [ ] **GS1**: interpretar los AIs (01 GTIN, 10 lote, 17 caducidad, 21 serie, 310x peso…) con etiquetas legibles; zxing ya marca `gs1: true` y devuelve el texto HRI "(01)…"
- [ ] **GS1 Digital Link** (URLs `https://…/01/<GTIN>/10/<lote>`): mostrar los datos y además analizar la URL
- [ ] Validar el dígito de control de GTIN/EAN y avisar si es incorrecto
- [ ] Enlace discreto a labelic.com en los resultados GS1 ("Genera etiquetas GS1") — decidir el tono con el usuario
- [ ] Generar el QR de la URL actual (zxing-wasm/writer)

### Fase 3 — Publicación
- [x] Nombre: Mirilla; ID de Firefox `mirilla@ramoncoroso.github.io` (**no se puede cambiar tras publicar**)
- [x] Licencia MIT
- [x] Repo git propio en `plugin/` (rama `main`)
- [x] Publicado en GitHub: https://github.com/ramoncoroso/mirilla (público, 2026-09-27)
- [x] i18n: en (por defecto) + es, desde `locales/messages.ts` (nombre, descripción, menús e interfaz)
- [ ] Nombre comercial, icono definitivo, capturas 1280×800 y textos de ficha
- [ ] Política de privacidad (corta: "no recogemos nada") — p. ej. GitHub Pages del repo o la sección Privacidad del README
- [ ] Chrome Web Store (pago único de 5 $) — `npm run zip`
- [ ] Firefox AMO — `npm run zip:firefox` (+ zip de fuentes con instrucciones de build, AMO lo pide)
- [ ] Edge Add-ons (reutiliza el zip de Chrome)

### Fase 4 — Opcional (Elixir/Phoenix)
- [ ] Lector web en labelic.com con LiveView + hook JS (zxing-wasm en el cliente) → SEO y móvil
- [ ] Backend Phoenix + Postgres solo si una función lo necesita: reputación de URLs, cuentas o sincronización del historial
