import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/playwright',
  timeout: 30_000,
  workers: 1,
});
