// Marcas más suplantadas en phishing y sus dominios oficiales (dominio registrable según la Public Suffix List).
// Fuentes: Check Point Brand Phishing Reports, APWG Phishing Activity Trends Reports, avisos de INCIBE/OSI, dominios oficiales publicados por cada empresa.
// Un dominio oficial que falte provoca un falso aviso rojo: añadir aquí antes que relajar la comprobación.
// Dominios excluidos a propósito (alojamiento compartido: cualquiera puede publicar ahí, no sirven para verificar):
// sharepoint.com, *.blob.core.windows.net, azurewebsites.net, github.io, herokuapp.com, amazonaws.com, cloudfront.net,
// appspot.com, firebaseapp.com, web.app, blogspot.com, gstatic.com, withgoogle.com.
// googleapis.com y googlecode.com SÍ son de Google, pero se excluyen por ser sufijo privado de la PSL (tldts los trata
// como dominio compartido, igual que appspot.com): añadirlos haría fallar el test «no es un dominio privado (PSL)».
// googledomains.com: el negocio de registro de dominios se vendió a Squarespace (migración terminada en 2024); aunque
// el certificado TLS y el registrador (MarkMonitor) seguían siendo de Google a fecha de 2026-10-02, no está claro que
// el dominio siga siendo de Google: se deja fuera por precaución.
// tiktokio.com y sssinstagram.com son descargadores de vídeo de terceros (no son de ByteDance ni de Meta); xbox-dns.ru
// es un servicio de DNS de terceros (alojado en Selectel, Rusia) que promete desbloquear Xbox Live; googll.store es una
// imitación tipográfica de google.com. Ninguno se añade aunque aparezcan entre los dominios más visitados.

export interface Brand {
  /** Nombre que se muestra: «Parece PayPal, pero no es paypal.com». */
  name: string;
  /** Dominio que se muestra como el oficial en el aviso. */
  primary: string;
  /** Todos los dominios registrables oficiales (incluido primary), en minúsculas. */
  domains: string[];
  /**
   * Palabras distintivas (minúsculas, ASCII, ≥ 5 letras) que se buscan DENTRO de las palabras del host
   * («paypal» en «paypal-secure» o en «mypaypalaccount»). Solo si no son palabras comunes de ningún idioma.
   */
  keywords: string[];
  /**
   * Palabras que solo cuentan si forman una etiqueta o palabra completa del host o la ruta, separada por . - _ /
   * (cortas o comunes: «dgt», «seur», «ing», «apple», «orange»...).
   */
  tokens: string[];
}

export const BRANDS: Brand[] = [
  // ---- Global: pagos, tecnología, banca ----
  {
    name: 'PayPal',
    primary: 'paypal.com',
    domains: [
      'paypal.com', 'paypal.me',
      // Dominio técnico de objetos/imágenes de PayPal: certificado TLS con O=«PayPal, Inc.» y SAN que incluye
      // paypal.com, comprobado el 2026-10-02.
      'paypalobjects.com',
    ],
    keywords: ['paypal'],
    tokens: [],
  },
  {
    name: 'Microsoft',
    primary: 'microsoft.com',
    // sharepoint.com y *.blob.core.windows.net se excluyen: son plataformas donde cualquiera publica contenido.
    domains: [
      'microsoft.com', 'live.com', 'microsoftonline.com', 'office.com', 'office365.com',
      'outlook.com', 'azure.com', 'bing.com', 'xbox.com', 'skype.com', 'msn.com', 'windows.com', 'aka.ms',
      // Dominios técnicos propios de Microsoft (OneDrive, Azure AD, Office, Xbox...), comprobados por RDAP/NS/TLS
      // el 2026-10-02: microsoft365.com y microsoftcasualgames.com tienen certificado TLS con O=«Microsoft Corporation»;
      // onmicrosoft.com delega en servidores propios (ns*.bdm.microsoftonline.com); microsoftpersonalcontent.com,
      // microsoftazuread-sso.com, s-microsoft.com y microsoftapp.net están en Azure DNS, registrados por
      // MarkMonitor/Com Laude y documentados como dominios de Microsoft (Microsoft Learn, WHOIS).
      'microsoftpersonalcontent.com', 'onmicrosoft.com', 'microsoftazuread-sso.com', 's-microsoft.com',
      'microsoftcasualgames.com', 'microsoft365.com', 'microsoftapp.net',
    ],
    keywords: ['microsoft', 'microsoftonline'],
    // «office», «live» y «azure»/«windows»/«bing» son palabras demasiado comunes para buscarlas como subcadena.
    // «outlook», «windows», «azure» y «bing» tampoco: outlook.empresa.com (webmail propio) es habitual y legítimo.
    tokens: ['office365', 'xbox', 'skype', 'msn'],
  },
  {
    name: 'Google',
    primary: 'google.com',
    // appspot.com, firebaseapp.com, web.app, blogspot.com, gstatic.com, googleapis.com y googlecode.com quedan fuera
    // (alojan contenido de terceros / son sufijo privado de la PSL); ver nota al principio del archivo.
    domains: [
      'google.com', 'gmail.com', 'youtube.com',
      'google.es', 'google.co.uk', 'google.de', 'google.fr', 'google.it', 'google.pt', 'google.nl', 'google.be',
      'google.ch', 'google.at', 'google.ie', 'google.pl', 'google.se', 'google.no', 'google.dk', 'google.fi',
      'google.gr', 'google.cz', 'google.hu', 'google.ro', 'google.com.tr', 'google.ru',
      'google.co.jp', 'google.co.kr', 'google.com.au', 'google.co.nz', 'google.ca', 'google.com.mx',
      'google.com.br', 'google.com.ar', 'google.cl', 'google.co.il', 'google.ae', 'google.co.za',
      'google.co.in', 'google.com.sg', 'google.com.hk', 'google.com.tw', 'google.co.th', 'google.com.vn',
      'google.co.id', 'google.com.ph', 'google.com.my',
      // Otros dominios de Google que contienen «google», «gmail» o «youtube» (si faltan, saldrían como imitación).
      'youtu.be', 'youtube-nocookie.com', 'youtubekids.com', 'googlemail.com', 'googleblog.com', 'googlesource.com',
      'google.dev', 'googlevideo.com', 'googlemerchandisestore.com', 'googleadservices.com',
      'googlesyndication.com', 'googletagmanager.com', 'google-analytics.com',
      // Dominios técnicos propios de Google (DNS/NS delegados en ns1-4.google.com, comprobado el 2026-10-02), salvo
      // googleusercontent.com (delega en servidores de terceros pero el certificado TLS es de Google Trust Services
      // y el registrador es MarkMonitor): googletagservices.com, googlezip.net, googleapis.cn, googlehosted.com,
      // googlepages.com. thinkwithgoogle.com comparte certificado TLS con *.appspot.com cuyo SAN lo incluye.
      // googleapis.com y googlecode.com quedan fuera a propósito: ver nota al principio del archivo (sufijo privado PSL).
      'googleusercontent.com', 'googletagservices.com', 'googlezip.net', 'googleapis.cn', 'googlehosted.com',
      'googlepages.com', 'thinkwithgoogle.com',
    ],
    keywords: ['google', 'gmail', 'youtube'],
    tokens: [],
  },
  {
    name: 'Apple',
    primary: 'apple.com',
    domains: [
      'apple.com', 'icloud.com', 'itunes.com', 'apple.co',
      // Dominios técnicos propios de Apple (DNS/NS delegados en a-d.ns.apple.com, comprobado el 2026-10-02):
      // cdn-apple.com, icloud-content.com, apple-cloudkit.com, apple-mapkit.com. apple-dns.net está documentado por
      // Apple como dominio de iCloud Private Relay (support.apple.com/101555) y registrado por Com Laude (registrador
      // habitual de Apple); apple-dns.cn es su equivalente para iCloud en China continental (misma documentación/listas
      // independientes de dominios de Apple).
      'cdn-apple.com', 'icloud-content.com', 'apple-cloudkit.com', 'apple-mapkit.com', 'apple-dns.net', 'apple-dns.cn',
    ],
    // «apple» está dentro de palabras corrientes («pineapple») e «icloud» dentro de otras nubes («huaweicloud»,
    // «forticloud»): solo cuentan como palabra completa.
    keywords: [],
    tokens: ['apple', 'itunes', 'icloud'],
  },
  {
    name: 'Amazon',
    primary: 'amazon.com',
    // amazonaws.com se excluye: es la nube de Amazon, no una web de Amazon.
    domains: [
      'amazon.com', 'amazon.es', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.co.uk', 'amazon.ca',
      'amazon.com.mx', 'amazon.com.br', 'amazon.co.jp', 'amazon.in', 'amazon.com.au', 'amazon.nl',
      'amazon.se', 'amazon.pl', 'amazon.com.tr', 'amazon.ae', 'amazon.sa', 'amazon.sg', 'amazon.eg',
      // Dominios técnicos propios de Amazon, comprobados el 2026-10-02: amazon-adsystem.com tiene certificado TLS
      // con O=Amazon; ssl-images-amazon.com delega en servidores propios (ns*.amzndns.*); media-amazon.com y
      // amazon-dss.com están registrados por MarkMonitor (registrador de Amazon) y documentados como CDN de imágenes
      // de producto / AWS.
      'amazon-adsystem.com', 'media-amazon.com', 'ssl-images-amazon.com', 'amazon-dss.com',
    ],
    keywords: [],
    // «amazon» está dentro de «amazonas» (río, estado): solo como etiqueta completa.
    tokens: ['amazon'],
  },
  { name: 'Netflix', primary: 'netflix.com', domains: ['netflix.com'], keywords: ['netflix'], tokens: [] },
  {
    name: 'Facebook',
    primary: 'facebook.com',
    domains: [
      'facebook.com', 'fb.com', 'messenger.com',
      // Dominio de hardware/dispositivos de Meta: certificado TLS con O=«Meta Platforms, Inc.», comprobado el 2026-10-02.
      'facebook-hardware.com',
    ],
    keywords: ['facebook'],
    // «fb» es demasiado genérico (dos letras) para usarlo como palabra de detección.
    tokens: [],
  },
  {
    name: 'Instagram',
    primary: 'instagram.com',
    // cdninstagram.com delega en servidores propios de Instagram (a-d.ns.instagram.com), comprobado el 2026-10-02.
    // sssinstagram.com es un descargador de vídeo de terceros, NO es de Meta: se deja fuera a propósito.
    domains: ['instagram.com', 'cdninstagram.com'],
    keywords: ['instagram'],
    tokens: [],
  },
  { name: 'WhatsApp', primary: 'whatsapp.com', domains: ['whatsapp.com', 'whatsapp.net'], keywords: ['whatsapp'], tokens: [] },
  { name: 'LinkedIn', primary: 'linkedin.com', domains: ['linkedin.com', 'lnkd.in'], keywords: ['linkedin'], tokens: [] },
  {
    name: 'DHL',
    primary: 'dhl.com',
    // Solo los ccTLD que se han podido confirmar; el resto se deja fuera antes que arriesgar un dato falso.
    domains: ['dhl.com', 'dhl.de', 'dhl.co.uk', 'dhl.fr', 'dhl.it', 'dhl.es'],
    keywords: [],
    tokens: ['dhl'],
  },
  { name: 'FedEx', primary: 'fedex.com', domains: ['fedex.com'], keywords: ['fedex'], tokens: [] },
  { name: 'UPS', primary: 'ups.com', domains: ['ups.com'], keywords: [], tokens: ['ups'] },
  { name: 'USPS', primary: 'usps.com', domains: ['usps.com'], keywords: [], tokens: ['usps'] },
  {
    name: 'Adobe',
    primary: 'adobe.com',
    domains: ['adobe.com'],
    keywords: [],
    // «adobe» es una palabra común (adobe de barro): solo como etiqueta completa.
    tokens: ['adobe'],
  },
  {
    name: 'Dropbox',
    primary: 'dropbox.com',
    // Dominios técnicos propios de Dropbox, listados en su página oficial de dominios verificados
    // (help.dropbox.com/security/official-domains) y/o con certificado TLS con O=«Dropbox, Inc», comprobado el 2026-10-02.
    domains: ['dropbox.com', 'dropbox-dns.com', 'dropboxapi.com', 'dropboxusercontent.com', 'dropboxstatic.com', 'getdropbox.com'],
    keywords: ['dropbox'],
    tokens: [],
  },
  { name: 'DocuSign', primary: 'docusign.com', domains: ['docusign.com', 'docusign.net'], keywords: ['docusign'], tokens: [] },
  {
    name: 'Spotify',
    primary: 'spotify.com',
    // Dominios de CDN/marketing propios de Spotify (spotifycdn.com, tospotify.com, byspotify.com), documentados como
    // de Spotify por fuentes independientes de inteligencia de dominios, comprobado el 2026-10-02.
    domains: ['spotify.com', 'spotifycdn.com', 'tospotify.com', 'byspotify.com'],
    keywords: ['spotify'],
    tokens: [],
  },
  {
    name: 'Steam',
    primary: 'steampowered.com',
    domains: ['steampowered.com', 'steamcommunity.com'],
    // «steam» a secas es una palabra común (vapor); se usan las formas compuestas del dominio real.
    keywords: ['steampowered', 'steamcommunity'],
    tokens: [],
  },
  {
    name: 'Binance',
    primary: 'binance.com',
    // poolbinance.com es el dominio usado por los servidores stratum de Binance Pool (stratum+tcp://*.poolbinance.com),
    // documentado por Binance y por varios sitios de minería independientes, comprobado el 2026-10-02.
    domains: ['binance.com', 'binance.us', 'poolbinance.com'],
    keywords: ['binance'],
    tokens: [],
  },
  { name: 'Coinbase', primary: 'coinbase.com', domains: ['coinbase.com'], keywords: ['coinbase'], tokens: [] },
  {
    name: 'Booking.com',
    primary: 'booking.com',
    domains: ['booking.com'],
    keywords: [],
    // «booking» (reservar) es palabra común y subdominio propio de muchos hoteles (booking.mihotel.es): no se busca.
    // Las imitaciones del dominio (b0oking.com...) se siguen detectando por erratas.
    tokens: [],
  },
  { name: 'Airbnb', primary: 'airbnb.com', domains: ['airbnb.com'], keywords: ['airbnb'], tokens: [] },
  {
    name: 'Walmart',
    primary: 'walmart.com',
    // walmartimages.com (CDN de imágenes de producto) y wal-mart.com (registrado a nombre de Wal-Mart Stores, Inc.,
    // registrador CSC Corporate Domains) son de Walmart, comprobado el 2026-10-02.
    domains: ['walmart.com', 'walmartimages.com', 'wal-mart.com'],
    keywords: ['walmart'],
    tokens: [],
  },
  {
    name: 'eBay',
    primary: 'ebay.com',
    domains: [
      'ebay.com', 'ebay.de', 'ebay.co.uk', 'ebay.fr', 'ebay.it', 'ebay.es', 'ebay.ca',
      'ebay.com.au', 'ebay.at', 'ebay.ie', 'ebay.nl', 'ebay.be', 'ebay.ch', 'ebay.pl',
    ],
    keywords: [],
    tokens: ['ebay'],
  },
  {
    name: 'AliExpress',
    primary: 'aliexpress.com',
    // aliexpress-media.com delega en servidores propios de Alibaba (ns1/2.alibabadns.com), comprobado el 2026-10-02.
    domains: ['aliexpress.com', 'aliexpress-media.com'],
    keywords: ['aliexpress'],
    tokens: [],
  },
  { name: 'Wells Fargo', primary: 'wellsfargo.com', domains: ['wellsfargo.com'], keywords: ['wellsfargo'], tokens: [] },
  {
    name: 'Chase',
    primary: 'chase.com',
    domains: ['chase.com'],
    keywords: [],
    // «chase» es una palabra inglesa corriente (perseguir): solo como etiqueta completa.
    tokens: ['chase'],
  },
  { name: 'Bank of America', primary: 'bankofamerica.com', domains: ['bankofamerica.com'], keywords: ['bankofamerica'], tokens: [] },
  {
    name: 'HSBC',
    primary: 'hsbc.com',
    // Solo los dominios confirmados con seguridad; otros ccTLD del grupo se dejan fuera.
    domains: ['hsbc.com', 'hsbc.co.uk', 'hsbc.com.hk'],
    keywords: [],
    tokens: ['hsbc'],
  },
  { name: 'Mastercard', primary: 'mastercard.com', domains: ['mastercard.com'], keywords: ['mastercard'], tokens: [] },
  {
    name: 'Visa',
    primary: 'visa.com',
    domains: ['visa.com'],
    keywords: [],
    // «visa» está dentro de «visado» y otras palabras: solo como etiqueta completa.
    tokens: ['visa'],
  },
  {
    name: 'American Express',
    primary: 'americanexpress.com',
    domains: ['americanexpress.com', 'amex.com'],
    keywords: ['americanexpress'],
    tokens: ['amex'],
  },
  { name: 'Citibank', primary: 'citibank.com', domains: ['citibank.com', 'citi.com'], keywords: ['citibank'], tokens: ['citi'] },
  { name: 'Disney+', primary: 'disneyplus.com', domains: ['disneyplus.com', 'disney.com'], keywords: ['disneyplus'], tokens: ['disney'] },
  {
    name: 'Telegram',
    primary: 'telegram.org',
    domains: ['telegram.org', 'telegram.me', 't.me'],
    // «telegram» es una palabra corriente y aparece dentro de otras («letelegramme.fr»): solo como palabra completa.
    keywords: [],
    tokens: ['telegram'],
  },
  {
    name: 'X (Twitter)',
    primary: 'x.com',
    // ads-twitter.com delega en servidores propios (a-d.r07/u07.twtrdns.net), comprobado el 2026-10-02.
    domains: ['x.com', 'twitter.com', 'ads-twitter.com'],
    keywords: [],
    // «x» es demasiado genérico para usarlo nunca; «twitter» es palabra inglesa corriente (gorjeo): solo como etiqueta completa.
    tokens: ['twitter'],
  },
  {
    name: 'TikTok',
    primary: 'tiktok.com',
    // Dominios de CDN/API propios de TikTok-ByteDance (incluye Pangle, su red de anuncios), confirmados de forma
    // independiente por Netify el 2026-10-02 como pertenecientes a TikTok/Pangle.
    // tiktokio.com es un descargador de vídeo de terceros, NO es de ByteDance: se deja fuera a propósito.
    // tiktokw.eu, tiktoklb.eu y tiktok-minis.us comparten el mismo clúster de servidores NS de Akamai que estos
    // dominios, pero no se ha podido confirmar su propiedad de forma independiente: se dejan fuera por precaución.
    domains: [
      'tiktok.com', 'tiktokcdn.com', 'tiktokv.com', 'tiktokcdn-us.com', 'tiktokv.us', 'tiktokv.eu',
      'tiktokcdn-eu.com', 'tiktokpangle.us', 'tiktokw.us', 'tiktokrow-cdn.com', 'tiktokglobalshopv.com',
      'tiktokpangle-cdn-us.com', 'tiktok-row.net',
    ],
    keywords: ['tiktok'],
    tokens: [],
  },
  {
    name: 'Yahoo',
    primary: 'yahoo.com',
    domains: ['yahoo.com', 'yahoo.es', 'yahoo.co.uk', 'yahoo.de', 'yahoo.fr', 'yahoo.it', 'ymail.com'],
    keywords: [],
    // «yahoo» es una palabra inglesa corriente (interjección): solo como etiqueta completa.
    tokens: ['yahoo', 'ymail'],
  },
  { name: 'AOL', primary: 'aol.com', domains: ['aol.com'], keywords: [], tokens: ['aol'] },
  { name: 'Norton', primary: 'norton.com', domains: ['norton.com'], keywords: ['norton'], tokens: [] },
  { name: 'McAfee', primary: 'mcafee.com', domains: ['mcafee.com'], keywords: ['mcafee'], tokens: [] },

  // ---- Bancos de España y Europa ----
  {
    name: 'Santander',
    primary: 'santander.com',
    domains: ['santander.com', 'santander.es', 'bancosantander.es', 'santanderbank.com'],
    keywords: [],
    // «Santander» también es nombre de ciudad: solo como etiqueta completa, no como subcadena.
    tokens: ['santander'],
  },
  {
    name: 'BBVA',
    primary: 'bbva.es',
    domains: ['bbva.com', 'bbva.es', 'bbva.mx', 'bbva.pe', 'bbva.com.ar', 'bbva.com.co'],
    keywords: [],
    tokens: ['bbva'],
  },
  {
    name: 'ING',
    primary: 'ing.es',
    domains: ['ing.com', 'ing.nl', 'ing.es', 'ing.be', 'ing.fr', 'ing.de'],
    keywords: [],
    // «ing» es muy genérico (sufijo inglés); solo cuenta si es una etiqueta completa del host.
    tokens: ['ing'],
  },
  { name: 'Revolut', primary: 'revolut.com', domains: ['revolut.com'], keywords: ['revolut'], tokens: [] },
  { name: 'N26', primary: 'n26.com', domains: ['n26.com'], keywords: [], tokens: ['n26'] },
  {
    name: 'CaixaBank',
    primary: 'caixabank.es',
    domains: ['caixabank.es'],
    keywords: ['caixabank'],
    tokens: [],
  },
  { name: 'Bankinter', primary: 'bankinter.com', domains: ['bankinter.com'], keywords: ['bankinter'], tokens: [] },
  {
    name: 'Banco Sabadell',
    primary: 'bancosabadell.com',
    domains: ['bancosabadell.com', 'bancsabadell.com'],
    // Se usa la forma compuesta «bancosabadell»: «Sabadell» solo es nombre de ciudad y daría falsos positivos.
    keywords: ['bancosabadell'],
    tokens: [],
  },
  {
    name: 'Unicaja',
    primary: 'unicajabanco.es',
    domains: ['unicajabanco.es', 'unicaja.es'],
    keywords: ['unicaja', 'unicajabanco'],
    tokens: [],
  },
  { name: 'Kutxabank', primary: 'kutxabank.es', domains: ['kutxabank.es'], keywords: ['kutxabank'], tokens: [] },
  { name: 'Abanca', primary: 'abanca.com', domains: ['abanca.com'], keywords: ['abanca'], tokens: [] },
  { name: 'Ibercaja', primary: 'ibercaja.es', domains: ['ibercaja.es'], keywords: ['ibercaja'], tokens: [] },
  {
    name: 'Cajamar',
    primary: 'cajamar.es',
    domains: ['cajamar.es', 'grupocooperativocajamar.es'],
    // «cajamar» como palabra completa es distintivo, aunque empiece por «caja» (muy común).
    keywords: ['cajamar'],
    tokens: [],
  },
  {
    name: 'Openbank',
    primary: 'openbank.es',
    // Openbank también opera en Alemania/Países Bajos/Portugal, pero esos dominios no se han podido confirmar: se dejan fuera.
    domains: ['openbank.es'],
    keywords: ['openbank'],
    tokens: [],
  },
  { name: 'Bizum', primary: 'bizum.es', domains: ['bizum.es'], keywords: ['bizum'], tokens: [] },

  // ---- Administración pública española ----
  {
    name: 'Agencia Tributaria',
    primary: 'agenciatributaria.es',
    domains: ['agenciatributaria.es', 'agenciatributaria.gob.es', 'aeat.es'],
    keywords: ['agenciatributaria'],
    tokens: ['aeat'],
  },
  { name: 'DGT', primary: 'dgt.es', domains: ['dgt.es'], keywords: [], tokens: ['dgt'] },
  {
    name: 'Seguridad Social',
    primary: 'seg-social.es',
    domains: ['seg-social.es', 'seg-social.gob.es'],
    // Se usa la forma sin espacios «seguridadsocial»: por separado, «seguridad» y «social» son palabras demasiado comunes.
    keywords: ['seguridadsocial'],
    tokens: ['segsocial'],
  },
  { name: 'SEPE', primary: 'sepe.es', domains: ['sepe.es', 'sepe.gob.es'], keywords: [], tokens: ['sepe'] },
  {
    name: 'Cl@ve',
    primary: 'clave.gob.es',
    domains: ['clave.gob.es'],
    keywords: [],
    // «clave» es una palabra española muy común: solo cuenta como etiqueta completa, y aun así puede dar falsos positivos.
    tokens: ['clave'],
  },

  // ---- Paquetería y correos en España ----
  {
    name: 'Correos',
    primary: 'correos.es',
    domains: ['correos.es', 'correoexpress.com'],
    keywords: [],
    // «correos» es la palabra española para «mails»: solo como etiqueta completa.
    tokens: ['correos'],
  },
  { name: 'SEUR', primary: 'seur.com', domains: ['seur.com'], keywords: [], tokens: ['seur'] },
  { name: 'MRW', primary: 'mrw.es', domains: ['mrw.es'], keywords: [], tokens: ['mrw'] },
  {
    name: 'GLS',
    primary: 'gls-spain.es',
    domains: ['gls-group.eu', 'gls-group.com', 'gls-spain.es'],
    keywords: [],
    // «gls» es una sigla muy corta y genérica: solo como etiqueta completa.
    tokens: ['gls'],
  },

  // ---- Telecomunicaciones y energía en España ----
  {
    name: 'Movistar',
    primary: 'movistar.es',
    domains: ['movistar.es', 'telefonica.com', 'telefonica.es', 'telefonica.de'],
    keywords: ['movistar'],
    // «telefónica» es además un adjetivo corriente en español: solo como etiqueta completa.
    tokens: ['telefonica'],
  },
  {
    name: 'Vodafone',
    primary: 'vodafone.es',
    // vodafone-ip.de delega en servidores propios (ns1-3.vodafone-ip.de), comprobado el 2026-10-02.
    domains: ['vodafone.es', 'vodafone.com', 'vodafone-ip.de'],
    keywords: ['vodafone'],
    tokens: [],
  },
  {
    name: 'Orange',
    primary: 'orange.es',
    domains: ['orange.es', 'orange.com', 'orange.fr'],
    keywords: [],
    // «orange» es un color/palabra corriente en varios idiomas: solo como etiqueta completa.
    tokens: ['orange'],
  },
  { name: 'Iberdrola', primary: 'iberdrola.es', domains: ['iberdrola.es', 'iberdrola.com'], keywords: ['iberdrola'], tokens: [] },
  { name: 'Endesa', primary: 'endesa.es', domains: ['endesa.es', 'endesa.com'], keywords: ['endesa'], tokens: [] },
  { name: 'Naturgy', primary: 'naturgy.es', domains: ['naturgy.es', 'naturgy.com'], keywords: ['naturgy'], tokens: [] },

  // ---- Transporte, comercio y empleo en España ----
  { name: 'Renfe', primary: 'renfe.com', domains: ['renfe.com', 'renfe.es'], keywords: ['renfe'], tokens: [] },
  { name: 'Mercadona', primary: 'mercadona.es', domains: ['mercadona.es'], keywords: ['mercadona'], tokens: [] },
  { name: 'El Corte Inglés', primary: 'elcorteingles.es', domains: ['elcorteingles.es'], keywords: ['elcorteingles'], tokens: [] },
  { name: 'Wallapop', primary: 'wallapop.com', domains: ['wallapop.com'], keywords: ['wallapop'], tokens: [] },

  // ---- LATAM, Europa y EE. UU. ----
  {
    name: 'Mercado Libre / Mercado Pago',
    primary: 'mercadolibre.com',
    domains: [
      'mercadolibre.com', 'mercadolibre.com.mx', 'mercadolibre.com.ar', 'mercadolibre.cl',
      'mercadolibre.com.co', 'mercadolibre.com.pe', 'mercadolibre.com.uy',
      'mercadopago.com', 'mercadopago.com.ar', 'mercadopago.com.mx',
      'mercadolivre.com.br', 'mercadopago.com.br',
    ],
    keywords: ['mercadolibre', 'mercadopago', 'mercadolivre'],
    tokens: [],
  },
  { name: 'La Poste', primary: 'laposte.fr', domains: ['laposte.fr'], keywords: ['laposte'], tokens: [] },
  { name: 'Deutsche Post', primary: 'deutschepost.de', domains: ['deutschepost.de'], keywords: ['deutschepost'], tokens: [] },
  { name: 'IRS', primary: 'irs.gov', domains: ['irs.gov'], keywords: [], tokens: ['irs'] },
];
