/**
 * rewrite-resume.mjs
 * Uses OpenAI GPT-4o to rewrite the LaTeX resume for ATS 90+ score and job match.
 *
 * Usage:
 *   node tools/rewrite-resume.mjs "<job_description>" "<job_title>"
 *
 * Required .env keys:
 *   OPENAI_API_KEY     — OpenAI API key
 *   OVERLEAF_TEX_FILE  — main .tex filename (default: main.tex)
 *
 * Reads:  .tmp/<OVERLEAF_TEX_FILE>
 * Writes: .tmp/<OVERLEAF_TEX_FILE>  (in-place rewrite)
 *         .tmp/<OVERLEAF_TEX_FILE>.bak  (backup of original)
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TEX_FILE       = process.env.OVERLEAF_TEX_FILE || 'main.tex';

if (!OPENAI_API_KEY) {
  console.error('❌ Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

const jobDescription = process.argv[2];
const jobTitle       = process.argv[3] || 'the target role';

if (!jobDescription) {
  console.error('❌ Usage: node tools/rewrite-resume.mjs "<job_description>" "<job_title>"');
  process.exit(1);
}

const DEST    = path.join(ROOT, '.tmp');
const texPath = path.join(DEST, TEX_FILE);

if (!fs.existsSync(texPath)) {
  console.error(`❌ Resume not found at ${texPath}. Run fetch-resume.mjs first.`);
  process.exit(1);
}

const originalTex = fs.readFileSync(texPath, 'utf8');

// ── Backup original ────────────────────────────────────────────────────────
fs.writeFileSync(texPath + '.bak', originalTex);
console.log(`📋 Backup saved: ${texPath}.bak`);

// ── Build Claude prompt ────────────────────────────────────────────────────
const systemPrompt = `You are an expert resume writer and ATS optimization specialist.
Your task is to rewrite a LaTeX resume to achieve an ATS score of 90+ while perfectly targeting a specific job description.

## ATS Optimization Rules (non-negotiable)
1. **Keyword mirroring**: Every required skill, tool, and technology from the job description MUST appear verbatim in the resume body at least once.
2. **Skills section**: Include an explicit "Skills" or "Technical Skills" section that lists every key requirement from the JD, matched 1:1.
3. **Standard section headers**: Use exactly these header names: Summary (or Professional Summary), Experience, Education, Skills, Projects. Do NOT use creative/custom names.
4. **No multi-column layouts**: Convert any multi-column or side-by-side LaTeX layouts to single-column. ATS parsers cannot handle multi-column reliably.
5. **No tables for content**: Do not use LaTeX tabular environments for resume content (ok for spacing hacks only).
6. **Date format**: Use "Month YYYY -- Month YYYY" or "Month YYYY -- Present" for all date ranges.
7. **Action verbs**: Start every bullet point with a strong past-tense action verb (Developed, Engineered, Led, Increased, Reduced, etc.).
8. **Quantify achievements**: Add numbers, percentages, dollar amounts, or scale indicators to at least 70% of bullet points.
9. **No graphics or images**: Remove any \\includegraphics, TikZ drawings, or decorative elements.
10. **File integrity**: Preserve the LaTeX preamble, \\documentclass, and all \\usepackage declarations exactly. Output ONLY valid, compilable LaTeX.

## Output Instructions
- Return ONLY the complete, rewritten LaTeX source — no explanation, no markdown fences, no commentary.
- The output must begin with the LaTeX preamble (e.g., \\documentclass{...}) or \\begin{document} if no preamble change is needed.
- Preserve the author's real experience and education — do NOT invent facts, companies, or degrees.
- You MAY reword bullet points, add/remove bullets, reorder sections, and add keywords naturally into existing content.
- Tailor the Professional Summary specifically to the job title and company if mentioned.`;

const userPrompt = `## Job Title
${jobTitle}

## Job Description
${jobDescription}

## Current LaTeX Resume
\`\`\`latex
${originalTex}
\`\`\`

Rewrite this resume to target the job above, achieving ATS 90+ score. Return only valid LaTeX source.`;

// ── Call OpenAI API ────────────────────────────────────────────────────────
console.log('🤖 Calling GPT-4o to rewrite resume for ATS optimization...');

const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    max_tokens: 8192,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
  }),
});

if (!response.ok) {
  const err = await response.text();
  console.error('❌ OpenAI API error:', response.status, err);
  process.exit(1);
}

const data = await response.json();
let rewrittenTex = data.choices?.[0]?.message?.content?.trim();

if (!rewrittenTex) {
  console.error('❌ Empty response from OpenAI');
  process.exit(1);
}

// Strip any accidental markdown fences
if (rewrittenTex.startsWith('```')) {
  rewrittenTex = rewrittenTex
    .replace(/^```(?:latex)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}

// Sanity check — must look like LaTeX
if (!rewrittenTex.includes('\\begin{document}') && !rewrittenTex.includes('\\documentclass')) {
  console.error('❌ Output does not look like valid LaTeX. Aborting to protect your resume.');
  console.error('Raw output saved to .tmp/ai-raw-output.txt for inspection.');
  fs.writeFileSync(path.join(ROOT, '.tmp', 'ai-raw-output.txt'), rewrittenTex);
  process.exit(1);
}

// ── Write rewritten .tex ───────────────────────────────────────────────────
fs.writeFileSync(texPath, rewrittenTex);
console.log(`✅ Resume rewritten and saved: ${texPath}`);

// ── Summary stats ──────────────────────────────────────────────────────────
const inputTokens  = data.usage?.prompt_tokens     ?? '?';
const outputTokens = data.usage?.completion_tokens ?? '?';
console.log(`📊 Tokens used — input: ${inputTokens}, output: ${outputTokens}`);
console.log(`🎯 Next step: run push-to-overleaf.mjs "${jobTitle}"`);
