import { defineConfig } from 'vite';

// CekAman — Vite config.
// No special settings needed: the app is a static SPA. Chrome's Prompt API
// (on-device Gemini Nano) works on localhost for development, per the
// Firebase AI Logic docs.
export default defineConfig({
  server: {
    port: 5173,
  },
});
