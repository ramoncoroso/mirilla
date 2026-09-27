import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  // Solo los unitarios: los de navegador (tests/e2e, tests/firefox) y el generador de capturas (store/) van aparte.
  test: { include: ['tests/*.test.ts'] },
});
