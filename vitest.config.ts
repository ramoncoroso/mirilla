import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: { exclude: ['tests/e2e/**', 'tests/firefox/**', 'node_modules/**'] },
});
