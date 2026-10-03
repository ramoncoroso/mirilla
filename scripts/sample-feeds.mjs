// Genera las muestras fijas de URLs maliciosas para medir la detección (tests/measure).
// Fuente: Phishing.Database (MIT; aviso en samples/LICENSE-phishing-database.txt). URLhaus no: sus condiciones
// actuales (abuse.ch/Spamhaus) no permiten redistribuir ni hacer obras derivadas sin permiso. Muestra aleatoria con semilla fija, para que
// regenerarla con la misma lista dé el mismo resultado. Uso: node scripts/sample-feeds.mjs [tamaño]
import { writeFile } from 'node:fs/promises';

const SIZE = Number(process.argv[2] ?? 1000);
const out = new URL('../tests/measure/samples/', import.meta.url);

/** Generador pseudoaleatorio con semilla (mulberry32). */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sample(items, n, seed) {
  const random = rng(seed);
  const copy = [...new Set(items)];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n).sort();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.text();
}

const today = new Date().toISOString().slice(0, 10);

const phishing = (await fetchText('https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-links-ACTIVE.txt'))
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));
await writeFile(
  new URL('phishing-database.txt', out),
  `# Phishing.Database (github.com/Phishing-Database), MIT. Muestra de ${SIZE} de phishing-links-ACTIVE, ${today}.\n${sample(phishing, SIZE, 42).join('\n')}\n`,
);
console.log(`muestra: ${phishing.length} → ${SIZE} (Phishing.Database)`);
