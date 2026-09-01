/** Compiles src/ui (with the library it consumes) and copies the page into testbed/. */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'testbed');
const pageAssets = ['index.html', 'styles.css'];

rmSync(outDir, { recursive: true, force: true });

const tsc = spawnSync(
  process.execPath,
  [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.testbed.json'],
  { cwd: root, stdio: 'inherit' },
);
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

mkdirSync(outDir, { recursive: true });
for (const file of pageAssets) copyFileSync(join(root, 'src', 'ui', file), join(outDir, file));

console.log(`testbed built in ${outDir}`);
