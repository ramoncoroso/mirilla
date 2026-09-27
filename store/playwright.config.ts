import { defineConfig } from '@playwright/test';

// Generación de imágenes para las tiendas (no son tests): npm run store:assets
export default defineConfig({
  testDir: '.',
  testMatch: 'assets.spec.ts',
  outputDir: '../test-results/store',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
});
