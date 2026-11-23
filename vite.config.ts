import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [{
    name: 'strict-classic-content-script',
    generateBundle(_options, bundle) {
      const script = bundle['problem.js'];
      if (script?.type === 'chunk') {
        // Run after minification: the ESM minifier removes strict directives as
        // redundant, but Chrome executes this file as a classic content script.
        script.code = `(function () { "use strict";\n${script.code}\n})();\n`;
      }
    }
  }],
  build: {
    outDir: 'dist',
    rolldownOptions: {
      input: {
        popup: 'popup.html',
        problem: 'src/content/problem.ts'
      },
      output: {
        charset: 'ascii',
        entryFileNames: (chunk) =>
          chunk.name === 'problem'
            ? 'problem.js'
            : 'assets/[name]-[hash].js'
      }
    }
  }
});
