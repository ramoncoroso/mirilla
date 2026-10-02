// Extensiones y esquemas que pueden instalar o ejecutar código en el dispositivo, para avisar
// cuando una URL leída de un código apunta a una descarga en vez de a una página.
//
// DANGEROUS_EXTENSIONS: selección a partir de la lista de Chromium "download_file_types.asciipb"
// (https://chromium.googlesource.com/chromium/src/+/main/components/safe_browsing/content/resources/download_file_types.asciipb),
// Copyright 2015 The Chromium Authors. Licencia BSD (https://chromium.googlesource.com/chromium/src/+/main/LICENSE).
// De sus extensiones DANGEROUS o ALLOW_ON_USER_GESTURE solo quedan las de programas, instaladores, scripts que el
// sistema ejecuta con doble clic y ficheros que cambian la configuración. Fuera, a propósito, las que también son
// páginas o recursos web normales y saldrían en rojo sin motivo (asp, action, pl, py, rb, js, xml, xsl, swf, mht,
// url, cer/crt, ini, cfg, manifest...): una URL que acaba en /login.action es una página, no una descarga.
// Se añaden los paquetes que Chromium no cubre: apk/apks/aab/xapk (Android), ipa (iOS), xpi (extensión de Firefox).
export const DANGEROUS_EXTENSIONS: ReadonlySet<string> = new Set([
  // Windows: programas, instaladores y scripts del sistema.
  'appref-ms', 'application', 'appx', 'appxbundle', 'bat', 'chm', 'cmd', 'com', 'cpl', 'diagcab', 'exe', 'gadget',
  'hta', 'inf', 'iqy', 'jse', 'library-ms', 'lnk', 'msc', 'msh', 'msh1', 'msh2', 'msi', 'msix', 'msixbundle', 'msp',
  'mst', 'pif', 'ps1', 'ps1xml', 'ps2', 'psc1', 'psc2', 'psm1', 'reg', 'scr', 'search-ms', 'settingcontent-ms',
  'slk', 'vb', 'vbe', 'vbs', 'vbscript', 'ws', 'wsc', 'wsf', 'wsh', 'xbap', 'xll',
  // macOS y Linux.
  'applescript', 'command', 'deb', 'dmg', 'mpkg', 'pkg', 'rpm', 'run', 'scpt', 'workflow',
  // Multiplataforma y navegadores.
  'crx', 'jar', 'jnlp', 'xpi',
  // Móviles: apps fuera de la tienda y perfiles de configuración.
  'aab', 'apk', 'apks', 'configprofile', 'ipa', 'mobileconfig', 'xapk',
]);

/** Esquemas que instalan aplicaciones o perfiles saltándose la tienda oficial. */
export const INSTALL_SCHEMES: ReadonlySet<string> = new Set([
  // iOS: distribución "ad-hoc"/empresarial de apps fuera de la App Store (OTA).
  'itms-services:',
  // Android: los "intent:" pueden abrir Play Store, pero también cualquier otra acción del
  // sistema (incluida la instalación desde un origen desconocido) sin pasar por un enlace http(s).
  'intent:',
  // Windows: instala paquetes MSIX/AppX con un manifiesto remoto; Microsoft lo deshabilitó por
  // defecto en 2021 tras usarse en campañas de phishing (aka.ms/msappinstaller).
  'ms-appinstaller:',
]);

/**
 * TLD actuales (según la lista oficial de IANA, https://data.iana.org/TLD/tlds-alpha-by-domain.txt)
 * que coinciden con una extensión de fichero habitual, de modo que un dominio como
 * "factura.zip" o "video.mov" se puede leer por error como un nombre de fichero.
 * Se descartan a propósito otros TLD que también son extensiones reales porque son demasiado
 * ambiguos o demasiado usados como dominio legítimo para avisar sin más contexto: .app (TLD muy
 * extendido para webs y apps, no solo paquetes Mac), .sh/.so/.py/.rs/.one/.pub/.mobi (dominios
 * normales de proyectos, acortadores o sitios personales), .docs (no es la extensión real, que es
 * ".doc"), .com (con diferencia el TLD más común: avisar aquí sería puro ruido).
 */
export const FILE_LIKE_TLDS: ReadonlySet<string> = new Set([
  'cab', // Cabinet de Windows: empaqueta instaladores/controladores ejecutables, igual que .zip.
  'mov', // Vídeo QuickTime.
  'zip', // Archivo comprimido, el caso clásico ("factura.zip").
]);
