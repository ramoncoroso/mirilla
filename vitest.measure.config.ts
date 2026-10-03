import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// Mediciones (npm run measure): descargan datos de la red, así que no van con los unitarios.
export default defineConfig({
  plugins: [WxtVitest()],
  test: { include: ['tests/measure/*.test.ts'], testTimeout: 300_000 },
});
