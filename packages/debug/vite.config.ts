import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// `base` matches the GitHub Pages project path. The repo is
// expected to live at github.com/thermal-label/letratag, so Pages
// serves at https://thermal-label.github.io/letratag/. If the repo
// name changes, update both this `base` and the README.
export default defineConfig({
  base: '/letratag/',
  plugins: [vue()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
