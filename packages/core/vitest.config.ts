import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      exclude: ['dist/**', '**/*.d.ts', 'src/types.ts', 'src/index.ts', 'vitest.config.ts'],
    },
  },
});
