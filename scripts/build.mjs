import { build } from 'vite';

await build();
// Compile each content script independently, so no shared ESM import is emitted
// for Chrome's classic-script loader or across the ISOLATED/MAIN world boundary.
for (const name of ['submit', 'submit-bridge']) {
  await build({
    configFile: false,
    publicDir: false,
    plugins: [{
      name: 'strict-classic-output',
      generateBundle(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === 'chunk') chunk.code = `"use strict";\n${chunk.code}`;
        }
      }
    }],
    build: {
      outDir: 'dist', emptyOutDir: false, minify: 'oxc',
      lib: { entry: `src/content/${name}.ts`, formats: ['iife'], name: 'WelcomeBaek', fileName: () => `${name}.js` }
    }
  });
}
