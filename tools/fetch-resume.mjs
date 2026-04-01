/**
 * fetch-resume.mjs
 * Verifies the local resume .tex file is in place.
 *
 * For free Overleaf accounts (no git access):
 *   1. In Overleaf: Menu → Download → Source (.zip)
 *   2. Extract the .tex file and place it at: .tmp/overleaf-resume/<OVERLEAF_TEX_FILE>
 *   3. Run this script to confirm it's ready.
 *
 * Usage: node tools/fetch-resume.mjs
 *
 * Required .env keys:
 *   OVERLEAF_TEX_FILE  — .tex filename (default: main.tex)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Load .env ──────────────────────────────────────────────────────────────
const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const TEX_FILE = process.env.OVERLEAF_TEX_FILE || 'main.tex';
const DEST     = path.join(ROOT, '.tmp');
const texPath  = path.join(DEST, TEX_FILE);

// ── Check if file exists ───────────────────────────────────────────────────
if (fs.existsSync(texPath)) {
  const stats = fs.statSync(texPath);
  console.log(`✅ Resume found: ${texPath}`);
  console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB | Last modified: ${stats.mtime.toLocaleDateString()}`);
  console.log(`TEX_PATH=${texPath}`);
} else {
  // Try to auto-detect any .tex file in the folder
  fs.mkdirSync(DEST, { recursive: true });
  const existing = fs.existsSync(DEST)
    ? fs.readdirSync(DEST).filter(f => f.endsWith('.tex'))
    : [];

  if (existing.length > 0) {
    console.warn(`⚠️  ${TEX_FILE} not found — but found: ${existing.join(', ')}`);
    console.warn(`   Set OVERLEAF_TEX_FILE=${existing[0]} in .env, or rename the file to ${TEX_FILE}`);
    console.log(`TEX_PATH=${path.join(DEST, existing[0])}`);
  } else {
    console.error(`❌ No resume found at ${texPath}`);
    console.error('');
    console.error('To set up (free Overleaf account):');
    console.error('  1. Open your Overleaf project');
    console.error('  2. Click Menu → Download → Source (.zip)');
    console.error('  3. Extract the zip and copy your .tex file to:');
    console.error(`     ${texPath}`);
    console.error('  4. Re-run this script to confirm.');
    process.exit(1);
  }
}
