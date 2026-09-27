# Plan — Mirilla, extensión lectora de códigos QR (Chrome + Firefox)

> Hoja de ruta del proyecto. Las casillas marcan lo hecho.

**Fecha:** 2026-09-27
**Estado:** Fases 1, 1.5 y 2 hechas; revisión de seguridad hecha; Fase 3 preparada (paquetes 1.0.0; falta la
comprobación manual y subir a las tiendas, cosa del usuario). **Siguiente: Fase 4** (paridad con el mercado), empezando por 4.1

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
- [x] Versión 1.0.0 (confirmada por el usuario 2026-09-27)
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

### Revisión de seguridad y buenas prácticas ✅ (2026-09-27)
Dos revisiones independientes (seguridad y calidad). Sin hallazgos críticos ni altos. Corregido:
- [x] **Panel dentro de la página endurecido** frente a una web maliciosa: estilos del host con `!important` desde el
  shadow DOM y colores en elementos internos (la página ya no puede ocultar ni recolorear los avisos), solo teclas
  reales (`isTrusted`), el panel se vuelve a colgar si la página lo quita, y copiar nunca usa `execCommand` en la página
  (la página podía cambiar lo copiado). «!» rojo en el icono de la extensión cuando hay peligro.
- [x] Análisis de URLs: Public Suffix List (`tldts`) para el dominio real (también en `github.io`, `pages.dev`...),
  plataformas compartidas, redirecciones en parámetros, punto final del host, palabras de phishing aunque vayan solas,
  URL normalizada en pantalla
- [x] Caracteres invisibles y controles bidi: aviso y se muestran como ⟨U+…⟩; IBAN limpio y validado (módulo 97)
- [x] Privacidad: historial sin ventanas privadas y solo con el origen de la página; política actualizada
- [x] Mensajes: se comprueba el remitente; la captura verifica que la pestaña sigue activa; descarga de imágenes con
  límite de tiempo y tamaño; límites de memoria al decodificar; WASM cargado en bytes (nunca desde el CDN)
- [x] Firefox para Android ya no rompe el background; `npm test` en verde; GS1 Digital Link sin falsos positivos;
  longitudes y decimales GS1 validados; más dígitos de control; UPC-E expandido; accesibilidad (foco, `aria-live`,
  contraste AA); historial serializado en una cola
- [x] Un enlace con caracteres invisibles (bidi) también se trata como peligroso («Open anyway»), encontrado al revisar
  capturas del plugin en marcha
- [x] Pruebas: 60 unitarias, 28 en Chromium (6 de seguridad nuevas, que fallaban antes de corregir), 9 en Firefox

**Comprobación manual antes de publicar cada versión** (con la build publicable `.output/`, no la E2E: las pruebas
automáticas usan `<all_urls>` y no pueden pulsar menús ni atajos):
- [ ] Clic derecho en una imagen de **otro dominio sin CORS** → «Leer código de esta imagen» (camino de recorte con solo `activeTab`)
- [ ] `Alt+Shift+Q` y «Seleccionar área» desde el popup, en Chrome y en Firefox
- [ ] «Buscar en lo visible» desde el popup real, en Chrome y en Firefox
- [ ] Un enlace peligroso muestra el «!» rojo en el icono

### Fase 4 — Paridad con los líderes del mercado ⏳ (planificada 2026-09-27)

Comparativa (2026-09-27) con QR Code Reader (el más valorado en Chrome), Qroole, QR Code Reader de Firefox y los
generadores tipo Zovo: Mirilla va por delante en anti-phishing, GS1, SEPA, permisos y blindaje, pero le faltan siete
funciones que los usuarios dan por supuestas. Se hacen todas. **No se copian** (van contra el posicionamiento):
detección automática en todas las páginas (exige acceso a todas las webs) y QR «dinámicos» (dependen de un servidor).

**Principios para todo lo nuevo**: todo local; **ningún permiso nuevo en el manifest** (cámara y pantalla se piden en
el momento con el aviso del propio navegador); textos en `locales/messages.ts`; lógica pura con tests unitarios y cada
función con prueba en Chromium y, si aplica, en Firefox; y revisión de seguridad de lo nuevo al final.

**Orden** (cada hito se cierra con tests en verde, commit y push):

#### 4.1 Página de escaneo: cámara y pantalla — tamaño L
- [ ] Nueva página de la extensión `scan.html`, abierta en **su propia pestaña** desde el popup («Escanear con la cámara»,
  «Escanear pantalla u otra ventana»). No en el popup: Firefox lo cierra al salir el aviso de permisos y Chrome al abrir
  el selector de pantalla.
- [ ] Cámara: `getUserMedia({ video })`, selector de cámara, vista previa, lectura continua (~8 fotogramas/s en un
  canvas → `decodeImageData`), se para al leer y al ocultar la pestaña (`visibilitychange`); nunca se graba ni se guarda
  un fotograma.
- [ ] Pantalla: `getDisplayMedia()`; el mismo bucle de lectura; se deja de compartir al leer o al cerrar.
- [ ] Resultados con el mismo `renderCodes` (anti-phishing, GS1...), historial vía background.
- [ ] **Primero, una prueba de concepto** de ambas APIs en páginas de extensión de Chrome y Firefox, para confirmar que no
  hace falta ningún permiso en el manifest. Si hiciera falta alguno, se para y se consulta.
- [ ] Pruebas: Chromium con cámara falsa que emite un QR (`--use-fake-device-for-media-stream` +
  `--use-file-for-fake-video-capture` con un vídeo generado con ffmpeg desde los fixtures) y pantalla falsa
  (`--auto-select-desktop-capture-source`); Firefox con `media.navigator.streams.fake` (comprobar interfaz y permisos).
- [ ] Política de privacidad: cámara y pantalla se procesan en local, fotograma a fotograma, sin guardar nada.

#### 4.2 Marcar en la página dónde está cada código — tamaño M
- [ ] `Code` gana la posición de zxing (cuatro esquinas), convertida de píxeles de captura a píxeles CSS (misma escala que
  el recorte; desplazada por el origen del recorte en «Seleccionar área»). La posición no se guarda en el historial.
- [ ] El panel numera cada resultado y dibuja en la página un recuadro con ese número sobre cada código (dentro del mismo
  shadow DOM blindado); pasar el ratón o el foco por una tarjeta resalta su recuadro y viceversa.
- [ ] Los recuadros se quitan al cerrar el panel, al hacer scroll o al redimensionar (las posiciones son de la captura).
- [ ] Recuadro rojo para los códigos peligrosos (`lib/risk.ts`).
- [ ] Pruebas: posiciones correctas con HiDPI y zoom en Chromium y Firefox (varios códigos, comprobando que cada
  recuadro cae sobre su imagen).

#### 4.3 Nuevos tipos de contenido — tamaño M
- [ ] **Eventos de calendario** (`BEGIN:VEVENT`, también dentro de `VCALENDAR`): título, inicio/fin con zona horaria,
  lugar y descripción, con fechas en el idioma de la interfaz; botón «Añadir al calendario» que descarga un `.ics` generado
  en local.
- [ ] **2FA** (`otpauth://totp|hotp`): emisor y cuenta; el secreto **oculto** por defecto (botón para mostrarlo); aviso de
  que solo se escanean desde la página de ajustes del propio servicio (un QR de 2FA ajeno puede vincular tu cuenta a un
  atacante). Deja de tratarse como «esquema no web».
- [ ] **Pagos cripto** (`bitcoin:`, `ethereum:`, `lightning:`; BIP 21 / EIP 681): dirección, importe y etiqueta; validación
  de la dirección de Bitcoin (checksum Base58Check / Bech32) y aviso de que los pagos son irreversibles.
- [ ] Todos pasan por `lib/risk.ts` (el «!» del icono) y por el detector de caracteres ocultos.
- [ ] Pruebas unitarias con ejemplos de las especificaciones y E2E en popup en/es.

#### 4.4 Generador completo — tamaño L
- [ ] Página `create.html` (en pestaña; el popup es pequeño), accesible desde el popup; el botón actual «QR de esta
  página» abre el generador ya relleno con la URL.
- [ ] Tipos: URL, texto, WiFi, contacto (vCard), email, teléfono, SMS, ubicación, evento y pago SEPA (EPC). Los
  constructores (`lib/build.ts`) escapan cada formato (`\;` `\:` en WiFi, vCard...) y tienen tests de ida y vuelta con
  `parseContent`.
- [ ] Opciones: nivel de corrección L/M/Q/H, colores de primer plano y fondo (avisa si el contraste impide leerlo), margen,
  tamaño y **logo** centrado (fuerza corrección H y limita el tamaño). El dibujo sale de la matriz del símbolo de zxing
  (`symbol`), no de su PNG, para poder aplicar colores y logo.
- [ ] Exportar PNG y SVG (el SVG se construye con elementos y atributos, sin concatenar texto del usuario) y copiar imagen.
- [ ] **«Comprobado: se lee bien ✓»**: cada código generado se vuelve a leer con el lector de Mirilla y se compara con lo
  esperado; si no coincide (logo demasiado grande, poco contraste...), se avisa y no se ofrece descargarlo como válido.
- [ ] Pruebas: ida y vuelta de todos los tipos y opciones (incluidos colores y logo), en Chromium y Firefox.

#### 4.5 Historial completo — tamaño M
- [ ] Hasta 100 lecturas por defecto (ajustable), búsqueda, filtro por tipo, borrar lecturas sueltas y fijar favoritas.
- [ ] Exportar a CSV y JSON **protegido contra inyección de fórmulas** (celdas que empiezan por `=`, `+`, `-`, `@`,
  tabulador o retorno de carro se prefijan con `'`).
- [ ] Probablemente en una página propia (`history.html`) con un acceso desde el popup.
- [ ] Pruebas unitarias (búsqueda, CSV) y E2E.

#### 4.6 Idiomas: toda la Unión Europea y los más hablados del mundo — tamaño L, **al final** (cuando ya existan todos los textos nuevos)
Decidido por el usuario (2026-09-27): las lenguas oficiales de la UE y las más habladas del mundo, **solo las que admite
Chrome** en `_locales` (lista oficial de developer.chrome.com, comprobada el 2026-09-27). Hoy: en, es.

- [ ] **Unión Europea** (20 nuevas): alemán `de`, francés `fr`, italiano `it`, portugués `pt_PT`, neerlandés `nl`,
  polaco `pl`, rumano `ro`, griego `el`, checo `cs`, eslovaco `sk`, húngaro `hu`, sueco `sv`, danés `da`, finés `fi`,
  estonio `et`, letón `lv`, lituano `lt`, esloveno `sl`, croata `hr` y búlgaro `bg`. Quedan fuera irlandés y maltés
  porque Chrome no los admite.
- [ ] **Más hablados del mundo** (fuera de las anteriores): chino simplificado `zh_CN` y tradicional `zh_TW`, hindi `hi`,
  árabe `ar`, bengalí `bn`, portugués de Brasil `pt_BR`, ruso `ru`, indonesio `id`, japonés `ja`,
  maratí `mr`, telugu `te`, turco `tr`, tamil `ta`, vietnamita `vi`, coreano `ko`, persa `fa`, filipino `fil`,
  suajili `sw` y tailandés `th`. Queda fuera el urdu porque Chrome no lo admite.
- [ ] **Por tandas**, publicando cada una cuando esté revisada: (1) de, fr, it, pt_PT, pt_BR, nl, pl, zh_CN, zh_TW, ja, ko,
  ru, ar, hi, id, tr, vi; (2) el resto de la UE; (3) el resto de los más hablados.
- [ ] Un test que falle si se añade un idioma que no esté en la lista de Chrome.
- [ ] **Derecha a izquierda (ar, fa)**: la interfaz se invierte (`dir` a partir del mensaje predefinido
  `@@bidi_dir`), pero URLs, códigos, IBAN y datos GS1 se muestran siempre aislados de izquierda a derecha (`dir="ltr"` +
  `unicode-bidi: isolate`), para no romper la protección contra el truco del texto invertido. Pruebas en árabe.
- [ ] **Textos largos** (alemán, finés...) y escrituras no latinas (CJK, devanagari, bengalí, tamil, telugu, tailandés):
  capturas del popup y del panel en varios idiomas para detectar desbordes.
- [ ] **Traducciones**: borrador hecho aquí para todos; **revisión nativa obligatoria antes de publicar cada idioma**
  (lista de revisados en `store/listing.md`). Los tests ya comprueban claves, sustituciones `$1` y los límites de la tienda
  (nombre ≤ 45, descripción ≤ 132) y se amplían a todos los idiomas.
- [ ] Fichas de las tiendas traducidas en cada idioma; capturas localizadas al menos para la tanda 1.

#### 4.7 Cierre de la fase
- [ ] Revisión de seguridad y buenas prácticas de todo lo nuevo (mismo método que la anterior: dos revisores
  independientes y verificación de cada hallazgo). Puntos que vigilar: permisos de cámara y pantalla, CSV, logo subido
  por el usuario, exportación SVG, `.ics`, secreto de 2FA.
- [ ] Capturas de tienda y galería «en marcha» con las funciones nuevas; textos de las fichas y política de privacidad.
- [ ] Nueva versión y comprobación manual antes de publicar (ampliada con cámara y pantalla).

**Decisión abierta**: ¿publicar ya la 1.0.0 y sacar esto como 1.1+, o esperar y publicar todo junto? Recomendación:
publicar la 1.0.0 en cuanto el usuario tenga tiempo (está completa y revisada) y entregar la Fase 4 en versiones
sucesivas (1.1 con 4.1–4.3; 1.2 con 4.4–4.6), para empezar a tener usuarios y opiniones cuanto antes.

### Fase 5 — Opcional (Elixir/Phoenix)
- [ ] Lector web en labelic.com con LiveView + hook JS (zxing-wasm en el cliente) → SEO y móvil
- [ ] Backend Phoenix + Postgres solo si una función lo necesita: reputación de URLs, cuentas o sincronización del historial
