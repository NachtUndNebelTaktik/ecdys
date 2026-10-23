import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import solid from 'vite-plugin-solid';
import { resolve } from 'node:path';
export default defineConfig({
  main:{plugins:[externalizeDepsPlugin()],build:{outDir:'dist/main',rollupOptions:{input:{main:resolve('packages/desktop/src/main.ts'),'state-worker':resolve('packages/desktop/src/state-worker.ts')},output:{format:'es'}}}},
  preload:{plugins:[externalizeDepsPlugin()],build:{outDir:'dist/preload',rollupOptions:{input:{preload:resolve('packages/desktop/src/preload.ts')},output:{format:'cjs',entryFileNames:'[name].cjs'}}}},
  renderer:{root:'packages/renderer',plugins:[solid()],build:{outDir:resolve('dist/renderer'),rollupOptions:{input:resolve('packages/renderer/index.html')}}},
});
