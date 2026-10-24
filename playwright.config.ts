import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'tests',testMatch:['ui.spec.ts','settings.spec.ts'],workers:1,
  use:{baseURL:'http://127.0.0.1:5173',launchOptions:{executablePath:process.env.STYG_TEST_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']}},
  webServer:{command:'pnpm preview',url:'http://127.0.0.1:5173',reuseExistingServer:false},
});
