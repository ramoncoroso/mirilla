# Mirilla — Política de privacidad

[English](PRIVACY.md) · **Español**

_Última actualización: 27 de septiembre de 2026_

Mirilla es una extensión de navegador que lee códigos QR y de barras. Está hecha para que
**ningún dato salga de tu equipo**.

## Lo que Mirilla no hace

- No recoge, guarda en ningún servidor, vende ni comparte datos personales o de uso.
- No envía imágenes, códigos, URLs ni actividad de navegación a ningún sitio. La lectura se
  hace entera dentro de tu navegador, con código WebAssembly incluido en la extensión.
- No tiene analítica, ni anuncios, ni rastreo, ni cuentas.
- No carga código remoto.

## Lo que se queda en tu equipo

- **Historial de lecturas** (opcional): los últimos 50 códigos leídos, con la página de la que
  salieron, se guardan en el almacenamiento local de la extensión (`storage.local`) para que
  puedas volver a verlos en el popup. Puedes desactivarlo o borrarlo cuando quieras desde el
  popup; al desactivarlo también se borra. Desinstalar la extensión también lo borra.
- **Tu preferencia de historial** (activado/desactivado), también en almacenamiento local.

## Permisos y para qué se usan

| Permiso | Para qué |
|---|---|
| `activeTab` | Leer códigos de la pestaña en la que estás, solo cuando invocas Mirilla (popup, menú contextual o atajo). |
| `contextMenus` | Añadir «Leer código de esta imagen» y las demás opciones al menú del clic derecho. |
| `scripting` | Mostrar el selector de área y el panel de resultados en la página actual cuando lo pides. |
| `storage` | Guardar en tu equipo el historial opcional y su preferencia. |

Mirilla no pide acceso a todas las webs. Solo actúa sobre la pestaña actual y solo después
de que se lo pidas.

## Abrir enlaces

Mirilla nunca abre un enlace por su cuenta. Cuando eliges abrir uno, tu navegador lo visita
como siempre; a partir de ahí se aplica la política de privacidad de ese sitio.

## Contacto

Dudas o problemas: abre una incidencia en https://github.com/ramoncoroso/mirilla/issues

## Cambios

Cualquier cambio en esta política se publicará en este fichero, con su fecha, en el repositorio público.
