import {defineConfig} from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  base: './',
  build: {target: 'es2023', sourcemap: true},
  server: {host: '127.0.0.1'},
});
