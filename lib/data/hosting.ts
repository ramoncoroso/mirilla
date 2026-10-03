// Servicios de DNS dinámico y túneles temporales: la dirección apunta al ordenador de alguien (o a un túnel que dura
// lo que tarde en cerrarlo), no a una web con dueño identificable. Muy usados para phishing (medido con
// Phishing.Database, 2026-10-03: duckdns.org era el tercer sufijo más frecuente entre lo que se escapaba).
// Solo cuenta un subdominio (x.duckdns.org), nunca la portada del propio servicio.
export const DYNAMIC_HOSTS: readonly string[] = [
  // DNS dinámico.
  'duckdns.org',
  'ddns.net',
  'no-ip.org',
  'no-ip.biz',
  'sytes.net',
  'hopto.org',
  'zapto.org',
  'myftp.org',
  'myftp.biz',
  'redirectme.net',
  'servebeer.com',
  'serveftp.com',
  'dynu.net',
  'freeddns.org',
  'dyndns.org',
  // Túneles a un equipo local.
  'ngrok.io',
  'ngrok.app',
  'ngrok-free.app',
  'trycloudflare.com',
  'loca.lt',
  'serveo.net',
];
