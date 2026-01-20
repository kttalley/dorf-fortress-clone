import { defineConfig } from 'vite';

export default defineConfig({
  base: '/projects/llm-fortress/',

  server: {
    origin: 'https://design.kristiantalley.com',
    allowedHosts: ['design.kristiantalley.com'],
  },
});