import { build } from 'esbuild';

await build({
  entryPoints: ['.vercel-esm/serverless/handler.js'],
  outfile: 'api/index.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  banner: {
    js: "import { fileURLToPath as deploymentFileURLToPath } from 'node:url'; import { dirname as deploymentDirname } from 'node:path'; import { createRequire as deploymentCreateRequire } from 'node:module'; const __dirname = deploymentDirname(deploymentFileURLToPath(import.meta.url)); const require = deploymentCreateRequire(import.meta.url);",
  },
});
