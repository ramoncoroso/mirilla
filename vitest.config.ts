import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  // Como en la build normal (wxt.config.ts): el código solo de pruebas E2E queda fuera.
  define: { __E2E__: 'false' },
  // Solo los unitarios: los de navegador (tests/e2e, tests/firefox) y el generador de capturas (store/) van aparte.
  test: { include: ['tests/*.test.ts'] },
});
