// Genera store/amo-reviewer-notes.txt: instrucciones de build y procedencia de los .wasm con su SHA-256,
// comprobando que los del paquete son idénticos a los del paquete npm zxing-wasm.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// zxing-wasm no exporta package.json: se lee directamente.
const zxing = JSON.parse(readFileSync('node_modules/zxing-wasm/package.json', 'utf8'));
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const lines = [];
for (const name of ['reader', 'writer']) {
  const upstream = require.resolve(`zxing-wasm/${name}/zxing_${name}.wasm`);
  const shipped = `.output/firefox-mv3/zxing_${name}.wasm`;
  if (sha(upstream) !== sha(shipped)) throw new Error(`${shipped} no coincide con ${upstream}`);
  lines.push(`  zxing_${name}.wasm  ${sha(shipped)}  (= node_modules/zxing-wasm/dist/${name}/zxing_${name}.wasm)`);
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

Permissions: activeTab, contextMenus, scripting, storage. No host permissions and no remote code.
Network: only fetching an image the user right-clicks (to decode it), and opening a link only
when the user clicks "Open". No analytics, no data collection.

How to test: open any page with a QR code and right-click the image -> "Read code from this image",
or press Alt+Shift+Q and drag over the code. Sample codes:
https://github.com/ramoncoroso/mirilla/tree/main/tests/e2e/fixtures
`,
);
console.log('store/amo-reviewer-notes.txt');
