import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    base: './projects/llm-dorf-fortress', // Set the base URL to projects/
    sourcemap: false,
  },
});
