import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    base: './projects/llm-dorf-fortress', // Set the base URL to projects/
    outDir: 'dist',
    sourcemap: false,
  },
});
