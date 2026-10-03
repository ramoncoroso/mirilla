// Medir para no equivocarse (Fase 4 · 4.0). Datos solo en los tests, nunca en la extensión.
// - Falsos positivos: las 10.000 webs más visitadas de Tranco, descargadas al ejecutar (sus fuentes incluyen licencias
//   no comerciales: no se guardan en el repo ni en el paquete; se cachean en test-results/, que está en .gitignore).
// - Detección: muestra fija de Phishing.Database (MIT), generada con scripts/sample-feeds.mjs.
// Informe en test-results/measure.json. Uso: npm run measure

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assessUrl, type Verdict } from '@/lib/verdict';

const CACHE = 'test-results/cache';
const TOP = 10_000;

/**
 * Dominios de Tranco en Peligro revisados uno a uno (2026-10-02): suplantan una marca en el nombre sin ser suyos.
 * sssinstagram.com y tiktokio.com (descargadores de terceros), xbox-dns.ru (DNS de terceros); tiktoklb.eu,
 * tiktok-minis.us y googledomains.com, sin confirmar que sean de la marca. Cualquier otro en Peligro es un fallo.
 */
const REVIEWED_DANGER = new Set(['sssinstagram.com', 'tiktokio.com', 'xbox-dns.ru', 'tiktoklb.eu', 'tiktok-minis.us', 'googledomains.com']);
/** Techo de Precaución en las webs más visitadas (hoy son casi todas acortadores). */
const MAX_CAUTION = 20;
/** Suelo de detección con señales (Peligro + Precaución) en la muestra de phishing; medido 2026-10-03. */
const MIN_DETECTED = 0.3;

async function trancoTop(n: number): Promise<string[]> {
  mkdirSync(CACHE, { recursive: true });
  const zip = `${CACHE}/tranco-top-1m.csv.zip`;
  if (!existsSync(zip)) {
    const res = await fetch('https://tranco-list.eu/top-1m.csv.zip');
    if (!res.ok) throw new Error(`Tranco: ${res.status}`);
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  const csv = execFileSync('unzip', ['-p', zip], { maxBuffer: 64 * 1024 * 1024 }).toString();
  return csv
    .split('\n')
    .slice(0, n)
    .map((l) => l.split(',')[1]?.trim())
    .filter((d): d is string => !!d);
}

function sample(name: string): string[] {
  return readFileSync(`tests/measure/samples/${name}`, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'));
}

function tally(urls: string[]) {
  const by: Record<Verdict, string[]> = { danger: [], caution: [], clear: [], trusted: [] };
  for (const url of urls) by[assessUrl(url).verdict].push(url);
  return by;
}

const report: Record<string, unknown> = {};

describe('mediciones', () => {
  it(`falsos positivos: Tranco top ${TOP}`, async () => {
    const domains = await trancoTop(TOP);
    expect(domains.length).toBe(TOP);
    const by = tally(domains.map((d) => `https://${d}/`));
    const danger = by.danger.map((u) => new URL(u).hostname);
    const caution = by.caution.map((u) => new URL(u).hostname);
    report.tranco = { total: domains.length, danger, caution };
    console.log(`Tranco: ${danger.length} en Peligro, ${caution.length} en Precaución\n  Peligro: ${danger.join(', ')}\n  Precaución: ${caution.join(', ')}`);
    expect(danger.filter((d) => !REVIEWED_DANGER.has(d))).toEqual([]);
    expect(caution.length).toBeLessThanOrEqual(MAX_CAUTION);
  });

  it('detección: muestra de Phishing.Database', () => {
    const urls = sample('phishing-database.txt');
    const by = tally(urls);
    const pct = (n: number) => Math.round((n / urls.length) * 1000) / 10;
    report.phishingDatabase = {
      total: urls.length,
      danger: pct(by.danger.length),
      caution: pct(by.caution.length),
      clear: pct(by.clear.length),
      missedExamples: by.clear.slice(0, 40),
    };
    console.log(`Phishing.Database (${urls.length}): ${pct(by.danger.length)} % Peligro, ${pct(by.caution.length)} % Precaución, ${pct(by.clear.length)} % sin señales`);
    expect((by.danger.length + by.caution.length) / urls.length).toBeGreaterThanOrEqual(MIN_DETECTED);
  });

  it('informe', () => {
    writeFileSync('test-results/measure.json', `${JSON.stringify(report, null, 2)}\n`);
  });
});
