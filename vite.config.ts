import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                popup: 'popup.html',
                problem: 'src/content/problem.ts',
            },
            output: {
                entryFileNames: (chunk) => (chunk.name === 'problem' ? 'problem.js' : 'assets/[name]-[hash].js'),
            },
        },
    },
});
