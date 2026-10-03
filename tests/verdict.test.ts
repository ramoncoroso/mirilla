import { describe, expect, it } from 'vitest';
import type { Code } from '@/lib/decode';
import { references } from '@/lib/lookalike';
import { assess, assessUrl, DEFAULT_CONTEXT, worst, type AssessContext } from '@/lib/verdict';

const qr = (text: string): Code => ({ text, format: 'QRCode' }) as Code;
const verdict = (text: string, ctx?: AssessContext) => assess(qr(text), ctx).verdict;
const messages = (text: string, ctx?: AssessContext) => {
  const a = assess(qr(text), ctx);
  return [...a.findings, ...(a.link?.findings ?? []), ...a.embedded.flatMap((l) => l.findings)].map((f) => f.message);
};

describe('veredicto de un enlace', () => {
  it('sin señales: no dice «seguro», solo «sin señales de riesgo»', () => {
    expect(verdict('https://www.labelic.com/precios')).toBe('clear');
  });

  it('un truco evidente es Peligro', () => {
    expect(verdict('https://paypal-secure.example/login')).toBe('danger');
    expect(verdict('https://example.com/factura.exe')).toBe('danger');
    expect(verdict('itms-services://?action=download-manifest&url=https://x.example/app.plist')).toBe('danger');
  });

  it('una señal de riesgo es Precaución', () => {
    expect(verdict('http://example.com/')).toBe('caution');
    expect(verdict('https://bit.ly/abc')).toBe('caution');
    expect(verdict('https://factura.zip/')).toBe('caution');
  });

  it('las señales leves suman', () => {
    // Una nota sola no basta.
    expect(verdict('https://example.pages.dev/')).toBe('clear');
    // Plataforma compartida + palabras de phishing → Precaución.
    expect(verdict('https://secure-login.pages.dev/')).toBe('caution');
    // http + acortador + palabras de phishing... → Peligro por combinación, explicado.
    const a = assess(qr('http://secure-login.example:8080/?next=https://otro.example/'));
    expect(a.verdict).toBe('danger');
    expect(a.link?.findings[0]?.message).toBe('urlCombined');
  });

  it('sitios de confianza y familiaridad', () => {
    const ctx: AssessContext = { refs: references(['mibancolocal.es']), trusted: ['mibancolocal.es'], known: new Set(['labelic.com']) };
    expect(verdict('https://www.mibancolocal.es/', ctx)).toBe('trusted');
    expect(verdict('https://mibancolocal-acceso.example/', ctx)).toBe('danger');
    expect(messages('https://otro.example/', ctx)).toContain('urlFirstVisit');
    expect(messages('https://www.labelic.com/', ctx)).not.toContain('urlFirstVisit');
    // Las marcas conocidas no son «dominio nuevo».
    expect(messages('https://www.paypal.com/', ctx)).not.toContain('urlFirstVisit');
    // Sin historial no hay señal de familiaridad.
    expect(messages('https://otro.example/', DEFAULT_CONTEXT)).not.toContain('urlFirstVisit');
  });

  it('un sitio de confianza con señales de riesgo no se da por bueno', () => {
    const ctx: AssessContext = { refs: references(['mibancolocal.es']), trusted: ['mibancolocal.es'], known: null };
    expect(assessUrl('http://mibancolocal.es/', ctx).verdict).toBe('caution');
  });
});

describe('veredicto por tipo de contenido', () => {
  it('enlaces escondidos en textos, SMS y emails', () => {
    expect(verdict('Su paquete está retenido. Pague aquí: https://correos-envios.example/pago')).toBe('danger');
    expect(verdict('SMSTO:+34600123456:Tu cuenta se ha bloqueado, entra en http://bbva-seguro.example')).toBe('danger');
    expect(verdict('mailto:a@b.es?subject=Factura&body=Desc%C3%A1rguela%20en%20https%3A%2F%2Fx.example%2Ff.exe')).toBe('danger');
    expect(verdict('Hola, nos vemos a las 5')).toBe('clear');
  });

  it('teléfonos: USSD es Peligro y tarificación especial, Precaución', () => {
    expect(verdict('tel:*%2306%23')).toBe('danger');
    expect(verdict('tel:**21*600123456%23')).toBe('danger');
    expect(verdict('tel:+34806123456')).toBe('caution');
    expect(verdict('tel:+34600123456')).toBe('clear');
  });

  it('WiFi abierta o con WEP', () => {
    expect(verdict('WIFI:S:Bar;T:nopass;;')).toBe('caution');
    expect(verdict('WIFI:S:Bar;T:WEP;P:1234567890;;')).toBe('caution');
    expect(verdict('WIFI:S:Bar;T:WPA;P:clave-larga;;')).toBe('clear');
  });

  it('la web de un contacto también se analiza', () => {
    expect(verdict('BEGIN:VCARD\nVERSION:3.0\nFN:Soporte\nURL:paypal-help.example\nEND:VCARD')).toBe('danger');
  });

  it('caracteres invisibles y pagos SEPA', () => {
    expect(verdict('Hola‮dlrow')).toBe('danger');
    expect(verdict('BCD\n002\n1\nSCT\n\nAcme\nES0000000000000000000000\nEUR1')).toBe('danger');
  });

  it('worst ordena los veredictos', () => {
    expect(worst('clear', 'trusted')).toBe('trusted');
    expect(worst('trusted', 'caution')).toBe('caution');
    expect(worst('caution', 'danger', 'clear')).toBe('danger');
  });
});

describe('señales medidas con Phishing.Database', () => {
  it('palabras de phishing en la ruta: solas no bastan, con otra señal sí', () => {
    expect(verdict('https://github.com/login')).toBe('clear');
    expect(messages('https://github.com/login')).toContain('urlPhishingPath');
    expect(verdict('https://mi-tienda.example/cuenta/account')).toBe('clear');
    // Plataforma compartida + palabras en la ruta → Precaución.
    expect(verdict('https://business-ticket-bdb65.firebaseapp.com/verify/login.php')).toBe('caution');
    // «loginator», «accounts-payable» no son la palabra «login» o «account».
    expect(messages('https://example.com/loginator')).not.toContain('urlPhishingPath');
  });

  it('una página dentro de las carpetas internas de WordPress o .well-known es Precaución', () => {
    expect(verdict('https://benirpierre.com/.well-known/acme-challenge/epostn/smstwo.php')).toBe('caution');
    expect(verdict('https://amiralisiassi.com/wp-admin/x/../wp-content/schwab/index.html')).toBe('caution');
    // Imágenes, estilos y la propia carpeta: normales.
    expect(verdict('https://example.com/wp-content/uploads/2024/05/foto.jpg')).toBe('clear');
    expect(verdict('https://example.com/.well-known/security.txt')).toBe('clear');
  });

  it('DNS dinámico y túneles: Precaución en un subdominio, nunca en la portada del servicio', () => {
    expect(verdict('https://12132103.duckdns.org/confirm2-2fa.php')).not.toBe('clear');
    expect(messages('https://abc123.ngrok-free.app/')).toContain('urlDynamicHost');
    expect(verdict('https://abc123.ngrok-free.app/')).toBe('caution');
    expect(verdict('https://www.duckdns.org/')).toBe('clear');
    expect(verdict('https://duckdns.org/')).toBe('clear');
  });
});

describe('lista pública de phishing', () => {
  it('un enlace de la lista es Peligro, con la fuente y las horas desde que se generó', () => {
    const generated = new Date(Date.now() - 5 * 3_600_000).toISOString();
    const ctx: AssessContext = { ...DEFAULT_CONTEXT, listed: new Set(['https://www.labelic.com/precios']), listGenerated: generated };
    const link = assessUrl('https://www.labelic.com/precios', ctx);
    expect(link.verdict).toBe('danger');
    expect(link.findings[0]).toEqual({ level: 'danger', message: 'urlListed', args: ['Phishing.Database', '5'] });
    // No se suma el «urlCombined»: ya hay una prueba.
    expect(link.findings.some((f) => f.message === 'urlCombined')).toBe(false);
    expect(assessUrl('https://www.labelic.com/otra', ctx).verdict).toBe('clear');
  });
});
