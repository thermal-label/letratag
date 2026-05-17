import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Resolve the workspace dep directly to its source so tests don't
  // depend on a fresh `dist/` build (CI runs test:coverage before build).
  resolve: {
    alias: {
      '@thermal-label/letratag-core': fileURLToPath(
        new URL('../core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    coverage: {
      include: ['src/**/*.ts'],
      exclude: [
        'dist/**',
        '**/*.d.ts',
        'src/index.ts',
        'src/**/*.test.ts',
        'src/__tests__/**',
        'vitest.config.ts',
      ],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
});
