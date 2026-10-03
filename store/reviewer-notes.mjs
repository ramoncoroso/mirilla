// Genera store/amo-reviewer-notes.txt: instrucciones de build y procedencia de los .wasm con su SHA-256,
// comprobando que los del paquete son idénticos a los de los paquetes npm zxing-wasm y pdfjs-dist.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// zxing-wasm no exporta package.json: se lee directamente.
const zxing = JSON.parse(readFileSync('node_modules/zxing-wasm/package.json', 'utf8'));
const pdfjsDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
const pdfjs = JSON.parse(readFileSync(path.join(pdfjsDir, 'package.json'), 'utf8'));
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const lines = [];
for (const name of ['reader', 'writer']) {
  const upstream = require.resolve(`zxing-wasm/${name}/zxing_${name}.wasm`);
  const shipped = `.output/firefox-mv3/zxing_${name}.wasm`;
  if (sha(upstream) !== sha(shipped)) throw new Error(`${shipped} no coincide con ${upstream}`);
  lines.push(`  zxing_${name}.wasm  ${sha(shipped)}  (= node_modules/zxing-wasm/dist/${name}/zxing_${name}.wasm)`);
}

const pdfjsLines = [];
{
  const upstream = path.join(pdfjsDir, 'build/pdf.worker.min.mjs');
  const shipped = '.output/firefox-mv3/pdfjs/pdf.worker.min.mjs';
  if (sha(upstream) !== sha(shipped)) throw new Error(`${shipped} no coincide con ${upstream}`);
  pdfjsLines.push(`  pdf.worker.min.mjs  ${sha(shipped)}  (= node_modules/pdfjs-dist/build/pdf.worker.min.mjs)`);
}
for (const name of readdirSync('.output/firefox-mv3/pdfjs/wasm').filter((f) => f.endsWith('.wasm'))) {
  const upstream = path.join(pdfjsDir, 'wasm', name);
  const shipped = `.output/firefox-mv3/pdfjs/wasm/${name}`;
  if (sha(upstream) !== sha(shipped)) throw new Error(`${shipped} no coincide con ${upstream}`);
  pdfjsLines.push(`  wasm/${name}  ${sha(shipped)}  (= node_modules/pdfjs-dist/wasm/${name})`);
}

writeFileSync(
  'store/amo-reviewer-notes.txt',
  `Mirilla ${pkg.version} — notes for reviewers

Build instructions (Node.js 22, npm 10, Linux/macOS):
  npm ci
  npm run build:firefox
Output: .output/firefox-mv3/ — identical, file by file, to the submitted package.

Tooling: WXT (Vite) + TypeScript. The code is bundled and minified by Vite; the readable sources
are in the attached zip and at https://github.com/ramoncoroso/mirilla

WebAssembly: copied unmodified from the npm package zxing-wasm@${zxing.version}
(zxing-cpp compiled with Emscripten, Apache-2.0; https://github.com/Sec-ant/zxing-wasm).
SHA-256:
${lines.join('\n')}

The bundles contain the string "fastly.jsdelivr.net/npm/zxing-wasm@…": it is zxing-wasm's default
locator for its .wasm file. It is never used: the extension fetches the bundled .wasm itself and passes
it to zxing as bytes (overrides.wasmBinary in lib/decode.ts and lib/generate.ts), so zxing never
resolves a URL on its own. Nothing is loaded from any CDN.

PDF reading: pdf.js is used to read QR codes inside PDF files (email attachments are the most common
quishing vector) entirely on the user's device, in lib/pdf.ts. The files below are copied unmodified
from the npm package pdfjs-dist@${pdfjs.version} (Apache-2.0; https://github.com/mozilla/pdf.js).
quickjs-eval.wasm, the engine pdf.js uses to run JavaScript embedded in a PDF, is deliberately not
shipped: Mirilla never executes a PDF's JavaScript. The main pdf.js module is not copied as a separate
file: Vite bundles it into the extension's own code, as chunks/pdf-*.js.
SHA-256:
${pdfjsLines.join('\n')}

web-ext lint reports two UNSAFE_VAR_ASSIGNMENT warnings ("Unsafe call to import for argument 0"), both
coming from pdf.js's own code, not from Mirilla:
- chunks/pdf-*.js: pdf.js's fake-worker fallback runs \`import(this.workerSrc)\` when no Worker is
  available; lib/pdf.ts sets workerSrc to the packaged pdfjs/pdf.worker.min.mjs with runtime.getURL, so
  this can only ever import a file inside the extension package.
- pdfjs/pdf.worker.min.mjs: its WasmImage fallback runs \`import(wasmUrl + noWasmFilename)\` when a .wasm
  decoder fails to load; lib/pdf.ts sets wasmUrl to the packaged pdfjs/wasm/ directory with
  runtime.getURL. The *_nowasm_fallback.js files it would try to load are not part of the package (see
  above), so in practice this import can only fail and log a warning; it is not reached in normal use.
Neither dynamic import can ever load anything outside the extension package: both arguments are always
built from runtime.getURL() over files bundled in this zip, and the extension's own
content_security_policy (extension_pages: "script-src 'self' 'wasm-unsafe-eval'") forbids loading
remote script in any case.

Permissions: activeTab, contextMenus, scripting, storage. No host permissions and no remote code.
Network: only fetching an image the user right-clicks (to decode it), and opening a link only
when the user clicks "Open". No analytics, no data collection.

How to test: open any page with a QR code and right-click the image -> "Read code from this image",
or press Alt+Shift+Q and drag over the code. Sample codes:
https://github.com/ramoncoroso/mirilla/tree/main/tests/e2e/fixtures
`,
);
console.log('store/amo-reviewer-notes.txt');
