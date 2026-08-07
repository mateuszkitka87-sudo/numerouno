import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { buildLocalPreview } from './build-local-preview.mjs';

const OUT_DIR = 'dist/local-preview';
const ZIP_PATH = 'dist/sgs-e-customs-map-local.zip';

function createZip(sourceDir, zipPath) {
  ensureDir(path.dirname(zipPath));
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  execSync(`cd "${sourceDir}" && zip -r "../${path.basename(zipPath)}" .`, {
    stdio: 'inherit',
  });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function packageLocalPreview() {
  const result = buildLocalPreview({ outDir: OUT_DIR });
  createZip(OUT_DIR, ZIP_PATH);

  const stats = fs.statSync(ZIP_PATH);
  return {
    ...result,
    zipPath: ZIP_PATH,
    zipBytes: stats.size,
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const result = packageLocalPreview();
  console.log('Created ZIP:', result.zipPath, `(${result.zipBytes} bytes)`);
}
