# Mirilla — Política de privacidad

[English](PRIVACY.md) · **Español**

_Última actualización: 3 de octubre de 2026 (rev. 3)_

Mirilla es una extensión de navegador que lee códigos QR y de barras. Está hecha para que
**ningún dato salga de tu equipo**.

## Lo que Mirilla no hace

- No recoge, guarda en ningún servidor, vende ni comparte datos personales o de uso.
- No envía imágenes, códigos, URLs ni actividad de navegación a nadie. La lectura se hace
  entera dentro de tu navegador, con código WebAssembly incluido en la extensión.
- La única petición de red que hace por su cuenta es volver a descargar una imagen sobre la que
  haces clic derecho («Leer código de esta imagen»), directamente del sitio que la sirve y sin
  cookies, para leerla en local. Las demás (ver «Comprobaciones que solo se hacen si las pides»)
  solo ocurren cuando pulsas un botón.
- No tiene analítica, ni anuncios, ni rastreo, ni cuentas.
- No carga código remoto.

## Lo que se queda en tu equipo

- **Historial de lecturas** (activado por defecto, se puede desactivar): los últimos 50 códigos
  leídos y el sitio del que salieron (solo su origen, como `https://ejemplo.com`, nunca la
  dirección completa) se guardan en el almacenamiento local de la extensión (`storage.local`)
  para que puedas volver a verlos en el popup. De las ventanas privadas o de incógnito no se
  guarda nada. Puedes desactivarlo o borrarlo cuando quieras desde el popup; al desactivarlo
  también se borra. Desinstalar la extensión también lo borra.
- **Tu preferencia de historial** (activado/desactivado), también en almacenamiento local.
- **Tus sitios de confianza**: los dominios que añades en los ajustes (por ejemplo, el de tu banco),
  para avisarte si un código lleva a uno de ellos o a una imitación.
- **Tu preferencia de limpiar rastreadores** (activada por defecto): al abrir o copiar un enlace se
  le quitan los parámetros de seguimiento conocidos (`utm_*`, `fbclid`…).
- **Una copia de la lista oficial de registros de dominios de IANA**, si usas «Investigar más»
  (ver abajo), guardada una semana para no descargarla en cada consulta.
- Para avisarte de que «nunca habías leído un enlace a este dominio», Mirilla compara con su propio
  historial, en tu equipo. No pide acceso al historial del navegador.

## Permisos y para qué se usan

| Permiso | Para qué |
|---|---|
| `activeTab` | Leer códigos de la pestaña en la que estás, solo cuando invocas Mirilla (popup, menú contextual o atajo). |
| `contextMenus` | Añadir «Leer código de esta imagen» y las demás opciones al menú del clic derecho. |
| `scripting` | Mostrar el selector de área y el panel de resultados en la página actual cuando lo pides. |
| `storage` | Guardar en tu equipo el historial opcional y su preferencia. |

Mirilla no pide acceso a todas las webs. Solo actúa sobre la pestaña actual y solo después
de que se lo pidas.

## Comprobaciones que solo se hacen si las pides

- **«Investigar más»** (antigüedad del dominio): Mirilla pregunta al registro público de dominios
  (RDAP) cuándo se registró el dominio del enlace. Primero descarga de IANA
  (`data.iana.org`) la lista oficial de registros y después pregunta directamente al registro de ese
  dominio (por ejemplo, Verisign para los `.com`). Solo se envía el nombre del dominio
  (`ejemplo.com`), nunca el enlace completo, y sin cookies. Como en cualquier conexión, ese registro
  ve la dirección IP desde la que se pregunta. Nunca se visita la página del enlace.
- **«Denunciar»**: copia el enlace al portapapeles y abre el formulario de denuncia de Google Safe
  Browsing para que lo pegues; en castellano ofrece también un email ya redactado para el buzón de
  incidentes de INCIBE. Nada se envía hasta que tú lo envías.

## Lo que Mirilla puede y no puede saber

Mirilla analiza la **dirección** de un enlace, no la página: no la visita, así que no conoce su
contenido ni su reputación. Ninguna herramienta puede garantizar que un sitio es seguro, y por eso
Mirilla nunca dice «seguro»: como mucho, «sin señales de riesgo», junto con el dominio real para que
compruebes si es el que esperabas. Si abres el enlace, la protección de tu navegador (como Safe
Browsing) es una segunda red de seguridad.

## Abrir enlaces

Mirilla nunca abre un enlace por su cuenta. Cuando eliges abrir uno, tu navegador lo visita
como siempre; a partir de ahí se aplica la política de privacidad de ese sitio.

## Contacto

Dudas o problemas: abre una incidencia en https://github.com/ramoncoroso/mirilla/issues

## Cambios

Cualquier cambio en esta política se publicará en este fichero, con su fecha, en el repositorio público.
