# Plan — Mirilla, extensión lectora de códigos QR (Chrome + Firefox)

> Hoja de ruta del proyecto. Las casillas marcan lo hecho.

**Fecha:** 2026-09-27
**Estado:** Fases 1, 1.5 y 2 hechas; revisión de seguridad hecha; Fase 3 preparada (paquetes 1.0.0; falta la
comprobación manual y subir a las tiendas, cosa del usuario). **Siguiente: Fase 4**, empezando por 4.0 (sistema de avisos)

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
funciones que los usuarios dan por supuestas. Se hacen todas, junto con mejoras de seguridad de gran valor añadido
(sistema de avisos, listas públicas en local, sitios de confianza, PDF, webmail, modo empresa). **No se copian** (van contra el posicionamiento):
detección automática en todas las páginas (exige acceso a todas las webs) y QR «dinámicos» (dependen de un servidor).

**Principios para todo lo nuevo**: todo local (lo único que se descarga son las listas públicas, sin enviar nada, y las
comprobaciones de «Investigar más», solo a petición); **ningún permiso nuevo que muestre aviso al instalar** (cámara y
pantalla se piden en el momento con el aviso del propio navegador; `alarms` no muestra aviso; el acceso a webmail es un
permiso opcional que solo se pide al activarlo); textos en `locales/messages.ts`; lógica pura con tests unitarios y cada
función con prueba en Chromium y, si aplica, en Firefox; y revisión de seguridad de lo nuevo al final.

**Orden** (cada hito se cierra con tests en verde, commit y push). Empieza por 4.0, el sistema de avisos:

#### 4.0 Sistema de avisos: detectar más y avisar mejor — tamaño L (**primero**: es el núcleo de Mirilla)
Decidido por el usuario (2026-09-27). Todo en local: nada se consulta a servicios externos.

**Detectar más engaños**
- [ ] **Suplantación de marcas**: lista local curada de las marcas más suplantadas con sus dominios oficiales (bancos,
  PayPal, Amazon, Apple, Microsoft, Google, Netflix, DHL, Correos, SEUR, AEAT/Hacienda, DGT, Seguridad Social…),
  elegidas a partir de los informes de marcas más suplantadas (Check Point, APWG) y de los avisos de INCIBE/OSI.
  Si la URL menciona la marca (subdominio, dominio o ruta) y su dominio no es el oficial → Peligro:
  «Parece PayPal, pero no es paypal.com».
- [ ] **Imitaciones de dominio** (typosquatting): distancia de edición con los dominios oficiales y sustituciones
  típicas (`rn`→`m`, `0`→`o`, `1`→`l`, `vv`→`w`).
- [ ] **Homógrafos**: «esqueleto» de Unicode (UTS #39) con `confusables.txt` (Unicode License v3; tabla reducida
  generada al compilar e incluida con su aviso de licencia), para detectar mezclas de alfabetos que imitan a otro dominio.
- [ ] **Enlaces escondidos en cualquier contenido**: extraer y analizar las URLs de textos («Paga aquí: https://…»),
  cuerpos de SMS (smishing) y email, webs de contactos vCard, etc. Hoy solo se analiza si el código entero es una URL.
- [ ] **Por tipo de contenido**:
  - descargas de programas o instaladores (`.apk`, `.exe`, `.msi`, `.dmg`, `.scr`, `.bat`…; lista basada en la de
    tipos de fichero peligrosos de Chromium, BSD) y esquemas que instalan apps (`itms-services://`, `intent://`) → Peligro;
  - teléfonos con códigos USSD (`*`, `#`) → Peligro; números de tarificación especial (803, 806, 807, 905… en España;
    rangos equivalentes de otros países si hay fuente fiable) → Precaución;
  - WiFi abierta o con WEP → Precaución;
  - TLD que se confunden con ficheros (`.zip`, `.mov`) → Precaución.

- [ ] **Mis sitios de confianza**: el usuario marca sus dominios (su banco, su ayuntamiento, su empresa) en una página de
  ajustes nueva (`options.html`). Un QR que lleva a uno de ellos → ✅ «Es tu banco (sitio de confianza)»; uno que se le
  parece (imitación, homógrafo, marca en otro dominio) → ⛔ «Imita a tu banco». Más preciso que cualquier lista genérica.
- [ ] **Familiaridad**: con el historial de Mirilla (sin pedir el permiso de historial del navegador) y los sitios de
  confianza, señal «Nunca habías ido a este dominio desde Mirilla». Es informativa sola, pero suma en la puntuación
  combinada (el fraude casi siempre llega desde un dominio nuevo para la víctima). Si el historial está desactivado, se
  explica que esta señal no está disponible.

**Avisar mejor**
- [ ] **Veredicto único y honesto** arriba de cada resultado, con los detalles debajo (los informativos, plegados; evita
  la fatiga de avisos). Mirilla **analiza la dirección, no la página** (no la visita, no conoce su contenido, antigüedad
  ni reputación), así que nunca dice «Seguro»:
  - ⛔ **Peligro**: hay pruebas (aparece en una lista de phishing/malware o hay un truco evidente);
  - ⚠️ **Precaución**: hay señales de riesgo;
  - ℹ️ **Sin señales de riesgo**, siempre con el dominio real en grande y la pregunta «Vas a **dominio**. ¿Es el sitio
    que esperabas?» (la defensa más eficaz contra el QR fraudulento: quien escanea un parquímetro sabe qué web espera).
- [ ] **Puntuación combinada**: señales leves que coinciden (plataforma compartida + palabras de phishing + redirección)
  suben el veredicto. Umbrales ajustados con las mediciones de abajo.
- [ ] **Fricción proporcional**: sin riesgo → «Abrir»; Precaución → botón secundario; Peligro → «Abrir de todos modos»
  con segunda confirmación y «Copiar el enlace» como alternativa.
- [ ] **Accesibles y accionables**: icono + etiqueta de texto además del color; cada aviso dice qué puede pasar y qué hacer.
- [ ] **Icono de la extensión**: «!» rojo para Peligro (ya existe) y marca amarilla para Precaución.

**Actuar con un clic**
- [ ] **Denunciar**: en resultados en Peligro o Precaución, botón que abre ya rellenos los formularios de denuncia (Google
  Safe Browsing, URLhaus; INCIBE en español) con la URL. Solo si el usuario lo pulsa; nada se envía solo.
- [ ] **Limpiar rastreadores**: al abrir o copiar un enlace, quitar parámetros de seguimiento (`utm_*`, `fbclid`, `gclid`,
  `mc_eid`, `igshid`…); lista con tests y opción para desactivarlo. Nunca se tocan parámetros necesarios (se limita a una
  lista conocida).

**Listas públicas de phishing y malware, comparadas en local** (decidido 2026-09-27)
Ni consultar cada URL a un servicio (un tercero vería lo que escaneas) ni una lista fija en el paquete (caduca): Mirilla
descarga periódicamente una lista completa y compara en el equipo, como Safe Browsing o uBlock Origin.
- [ ] **Lista propia en GitHub**: una GitHub Action (cada pocas horas) descarga **URLhaus** (CC0) y **Phishing.Database**
  (MIT), la **filtra contra falsos positivos** (las listas incluyen URLs en servicios legítimos como `docs.google.com` o
  `github.io`: en plataformas compartidas y webs populares de Tranco solo se marca la URL exacta, nunca el dominio
  entero), la compacta (huellas SHA-256 recortadas, ordenadas; pocos MB) y la publica en GitHub Pages con su huella, su
  fecha y los avisos de licencia.
- [ ] **Firmada**: la lista se firma (Ed25519) y la clave pública va dentro de la extensión; si la firma no cuadra, se
  descarta (ni una cuenta de GitHub comprometida podría colar una lista falsa).
- [ ] **En la extensión**: descarga cada 6–12 h con `chrome.alarms` (permiso `alarms`, sin aviso al instalar; GitHub Pages
  permite la descarga directa, así que no hace falta ningún permiso de acceso a webs), verifica, guarda en local
  (IndexedDB) y busca por búsqueda binaria. Coincidencia → ⛔ «Aparece en una lista pública de phishing/malware
  (URLhaus, actualizada hace 3 h)».
- [ ] **Activada por defecto** (recomendación; **confirmar con el usuario al implementarlo**), desactivable en los ajustes
  y explicada en la primera ejecución: la descarga no revela nada de lo que se escanea.
- [ ] Complementa a las heurísticas: la lista detecta lo ya denunciado; las heurísticas, lo nuevo.
- [ ] Pruebas: formato, firma válida e inválida, lista caducada (se sigue usando la última buena con su fecha), filtrado de
  falsos positivos, rendimiento de la búsqueda.

**«Investigar más»: comprobaciones online solo a petición**
- [ ] Botón en el resultado, que explica antes qué servicio se contacta:
  - **antigüedad del dominio** por RDAP (registro público; ve el dominio, no la URL ni quién eres): un dominio de pocos
    días es una señal muy fuerte de fraude;
  - **destino de un acortador** (`bit.ly/…`), siguiendo solo la redirección sin abrir la página final (el acortador sabe
    que alguien lo consulta).
- [ ] Nunca se visita la página para analizarla (avisaría al atacante y le daría la IP del usuario).

**Honestidad sobre los límites**
- [ ] En las fichas, la ayuda y la política de privacidad: «Mirilla analiza la dirección, no la página. Ninguna herramienta
  puede garantizar que un sitio es seguro». Mencionar que el navegador (Safe Browsing) es una segunda red si se abre.
- [ ] Política de privacidad actualizada: descarga periódica de la lista (qué se descarga, de dónde, qué no se envía) y
  comprobaciones de «Investigar más».

**Medir para no equivocarse** (datos solo en los tests, nunca en la extensión)
- [ ] **Falsos positivos**: las ~10.000 primeras webs de **Tranco**, descargadas al ejecutar el test (sus fuentes incluyen
  licencias no comerciales: no se guardan en el repo ni en el paquete). Objetivo: ninguna en Peligro y muy pocas en
  Precaución; revisar una a una las que salgan.
- [ ] **Detección**: muestras fijas de **URLhaus** (CC0) y **Phishing.Database** (MIT) guardadas en el repo con su licencia;
  informe del porcentaje detectado por veredicto. Expectativa realista: las heurísticas no ven un dominio malicioso «limpio»
  sin señales; el objetivo es no dejar pasar ninguno con señales claras.
- [ ] Descartado: OpenPhish (sus condiciones prohíben usarlo para desarrollar productos o para detección).
- [ ] Sin listas negras fijas dentro del paquete (caducan en días y engordan el paquete): ver «Listas públicas» abajo.

#### 4.1 Página de escaneo: cámara, pantalla y PDF — tamaño L
- [ ] Nueva página de la extensión `scan.html`, abierta en **su propia pestaña** desde el popup («Escanear con la cámara»,
  «Escanear pantalla u otra ventana»). No en el popup: Firefox lo cierra al salir el aviso de permisos y Chrome al abrir
  el selector de pantalla.
- [ ] Cámara: `getUserMedia({ video })`, selector de cámara, vista previa, lectura continua (~8 fotogramas/s en un
  canvas → `decodeImageData`), se para al leer y al ocultar la pestaña (`visibilitychange`); nunca se graba ni se guarda
  un fotograma.
- [ ] Pantalla: `getDisplayMedia()`; el mismo bucle de lectura; se deja de compartir al leer o al cerrar.
- [ ] **PDF** (el vector número uno del quishing: un PDF adjunto con un QR dentro, que los filtros de correo no suelen
  leer y en cuyo visor no se puede inyectar): abrir o arrastrar un PDF en la página de escaneo (también desde el popup) y
  analizar todas sus páginas en local con **pdf.js** incluido en el paquete (Apache-2.0; sin código remoto; revisar que
  su build cumple la CSP de MV3). Resultados por página; los peligrosos arriba. Límites de páginas y de tamaño.
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
- [ ] **Añadidos EAN-2 y EAN-5** (los códigos pequeños junto al EAN de revistas y libros: número de edición o precio):
  hoy no se leen porque zxing los ignora por defecto (`eanAddOnSymbol: 'Ignore'`). Activar `'Read'` y mostrar el añadido
  en el resultado del producto (en libros ISBN, el EAN-5 que empieza por 5 es el precio en USD; por 0, en GBP).
- [ ] **Cobertura de todos los formatos**: generar con el codificador de zxing un código de prueba de cada formato que sepa
  crear (QR, Micro QR, rMQR, Data Matrix, Aztec, PDF417, EAN-13/8, UPC-A/E, Code 128/39/93, Codabar, ITF, DataBar...)
  y comprobar en Chromium que cada uno se lee y se muestra bien (nombre del formato, tipo de contenido). Los formatos que
  zxing lee pero no sabe crear (MaxiCode, Telepen, DX Film Edge, variantes de DataBar) se prueban con imágenes de muestra
  si se encuentran con licencia libre; si no, se deja anotado.
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

#### 4.6 Protección del webmail (opcional) — tamaño L
- [ ] Función que el usuario activa en los ajustes: analiza automáticamente los QR de los emails que abre en **Gmail** y
  **Outlook web** (donde llegan los ataques) y pone junto a cada QR una etiqueta con el veredicto (en el mismo shadow DOM
  blindado).
- [ ] **Permisos opcionales** (`optional_host_permissions`: `mail.google.com`, `*.googleusercontent.com`,
  `outlook.live.com`, `outlook.office.com`...), pedidos solo al activarla (`permissions.request`, con gesto del usuario);
  la instalación normal sigue sin permisos de acceso a webs. El content script se registra dinámicamente solo si se
  conceden (`scripting.registerContentScripts`) y se retira al desactivarla.
- [ ] Adjuntos PDF: enlace directo al escáner de PDF (4.1), sin descargarlos automáticamente.
- [ ] Todo en local; nada del correo sale del equipo. Política de privacidad y fichas actualizadas.
- [ ] Riesgo de mantenimiento: cada webmail cambia su DOM; detector aislado por proveedor, con pruebas sobre páginas
  guardadas (fixtures) y aviso claro si deja de funcionar.

#### 4.7 Modo empresa (políticas gestionadas) — tamaño M
- [ ] Ajustes que el departamento de IT puede imponer al desplegar Mirilla (Chrome: `storage.managed` con
  `managed_schema`; Firefox: `policies.json` → `3rdparty.Extensions`): listas públicas siempre activas, **bloquear abrir
  enlaces en Peligro**, dominios de la organización como sitios de confianza, marcas propias a vigilar, desactivar el
  historial o «Investigar más», y activar la protección del webmail.
- [ ] Sin telemetría ni envío de informes: el modo empresa no cambia la promesa de privacidad.
- [ ] Documentación para administradores (`docs/enterprise.md`, en/es) con ejemplos de política para Chrome (JSON / GPO) y
  Firefox (`policies.json`).
- [ ] Pruebas: lógica de ajustes gestionados con un almacenamiento falso en unitarios; prueba manual con políticas reales
  en Chrome y Firefox (necesitan privilegios de administrador), anotada en la comprobación manual antes de publicar.
- [ ] Posible vía de negocio en el futuro (soporte o funciones para empresas); por ahora, gratis y abierto.

#### 4.8 Idiomas: toda la Unión Europea y los más hablados del mundo — tamaño L, **al final** (cuando ya existan todos los textos nuevos)
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

#### 4.9 Cierre de la fase
- [ ] Revisión de seguridad y buenas prácticas de todo lo nuevo (mismo método que la anterior: dos revisores
  independientes y verificación de cada hallazgo). Puntos que vigilar: permisos de cámara y pantalla, PDF (pdf.js con
  ficheros hostiles), permisos opcionales y content script del webmail, políticas gestionadas, firma de las listas, CSV,
  logo subido por el usuario, exportación SVG, `.ics`, secreto de 2FA.
- [ ] Capturas de tienda y galería «en marcha» con las funciones nuevas; textos de las fichas y política de privacidad.
- [ ] Nueva versión y comprobación manual antes de publicar (ampliada con cámara y pantalla).

**Decisión abierta**: ¿publicar ya la 1.0.0 y sacar esto como 1.1+, o esperar y publicar todo junto? Recomendación:
publicar la 1.0.0 en cuanto el usuario tenga tiempo (está completa y revisada) y entregar la Fase 4 en versiones
sucesivas (1.1 con 4.0–4.3; 1.2 con 4.4–4.5; 1.3 con 4.6–4.7; los idiomas por tandas), para empezar a tener usuarios y
opiniones cuanto antes.

### Fase 5 — Opcional (Elixir/Phoenix)
- [ ] Lector web en labelic.com con LiveView + hook JS (zxing-wasm en el cliente) → SEO y móvil
- [ ] Backend Phoenix + Postgres solo si una función lo necesita: reputación de URLs, cuentas o sincronización del historial
