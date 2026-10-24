import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/preload.ts', 'src/kdf-worker.ts', 'src/browser-worker.ts'],
  outDir: 'dist',
  format: ['cjs'],
  outExtension: () => ({js: '.cjs'}),
  platform: 'node',
  target: 'node24',
  noExternal: ['@ecdys/shared'],
  external: ['electron', 'argon2', 'better-sqlite3-multiple-ciphers'],
  clean: true,
  sourcemap: true,
});
