import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  workers: 1,
  timeout: 120_000,
  expect: {timeout: 15_000},
  reporter: 'list',
  outputDir: 'test-results',
});
