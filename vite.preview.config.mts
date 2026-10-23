import {defineConfig} from 'vite';
import solid from 'vite-plugin-solid';
export default defineConfig({root:'packages/renderer',plugins:[solid()],server:{host:'127.0.0.1',port:5173,strictPort:true}});
