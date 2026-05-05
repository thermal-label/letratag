import mbtech from '@mbtech-nl/eslint-config';

export default [
  ...mbtech,
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/*.d.ts",
      "packages/*/vitest.config.ts",
      "packages/debug/**",
    ],
  },
];
