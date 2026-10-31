import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@aether/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
      '@aether/cdp': path.resolve(__dirname, './packages/cdp/src/index.ts'),
      '@aether/perceiver': path.resolve(__dirname, './packages/perceiver/src/index.ts'),
      '@aether/fixtures': path.resolve(__dirname, './fixtures/src/index.ts'),
    },
  },
});
