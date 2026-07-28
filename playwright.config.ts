import { defineConfig } from '@playwright/test';

/**
 * Tests de bout en bout sur l'application Electron packagée en `dist/`.
 * Lancez `npm run build` avant `npm run test:e2e`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',
});
