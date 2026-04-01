/**
 * push-to-overleaf.mjs
 * Prints the rewritten .tex file path and upload instructions for Overleaf.
 *
 * For free Overleaf accounts (no git push):
 *   After this script runs, manually upload the rewritten file:
 *   1. Open your Overleaf project
 *   2. In the file tree, click the rewritten .tex file → Delete (or rename old one)
 *   3. Click Upload → select the rewritten file from .tmp/overleaf-resume/
 *   4. Compile → download PDF
 *
 * Usage: node tools/push-to-overleaf.mjs "<job_title>"
 *
 * Required .env keys:
 *   OVERLEAF_TEX_FILE   — main .tex filename (default: main.tex)
 *   OVERLEAF_PROJECT_ID — optional, for a direct link (e.g. 64abc123def456)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Load .env ──────────────────────────────────────────────────────────────
const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const TEX_FILE   = process.env.OVERLEAF_TEX_FILE || 'main.tex';
const PROJECT_ID = process.env.OVERLEAF_PROJECT_ID || '';
const jobTitle   = process.argv[2] || 'target role';

const DEST    = path.join(ROOT, '.tmp');
const texPath = path.join(DEST, TEX_FILE);

if (!fs.existsSync(texPath)) {
  console.error(`❌ Rewritten resume not found at ${texPath}`);
  console.error('Run rewrite-resume.mjs first.');
  process.exit(1);
}

const stats = fs.statSync(texPath);
const backupPath = texPath + '.bak';

console.log('\n✅ Resume rewrite complete!');
console.log('─'.repeat(60));
console.log(`📄 Rewritten file : ${texPath}`);
console.log(`   Size           : ${(stats.size / 1024).toFixed(1)} KB`);
if (fs.existsSync(backupPath)) {
  console.log(`💾 Original backup: ${backupPath}`);
}
console.log('─'.repeat(60));

// Open the file in Finder so the user can easily drag it to Overleaf
try {
  execSync(`open "${DEST}"`);
  console.log('\n📂 Opened folder in Finder — drag the file to Overleaf.');
} catch {
  // Non-macOS or open failed — just print the path
}

console.log('\n📋 Upload to Overleaf (free account steps):');
console.log('  1. Open your Overleaf project');
if (PROJECT_ID) {
  console.log(`     → https://www.overleaf.com/project/${PROJECT_ID}`);
}
console.log('  2. In the file tree on the left, click your existing .tex file');
console.log('     → rename it to main.tex.old  (as a backup)');
console.log(`  3. Click the Upload icon → select: ${texPath}`);
console.log('  4. Click Recompile → download PDF');
console.log('  5. Paste PDF + job description into jobscan.co → verify score ≥ 90');
console.log('');
console.log(`🎯 Tailored for: ${jobTitle}`);
