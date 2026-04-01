# Workflow: Resume Rewriter — ATS 90+

## Objective
Rewrite a LaTeX resume (from Overleaf) to target a specific job description, achieving an ATS score of 90 or above.

## Inputs
| Input | Description |
|-------|-------------|
| `job_description` | Full text of the job posting |
| `job_title` | Job title + company (e.g. "Software Engineer at Google") |

## Required .env Keys
```
ANTHROPIC_API_KEY=        # Claude API key (get from console.anthropic.com)
OVERLEAF_TEX_FILE=        # main .tex filename, e.g. main.tex (default: main.tex)
OVERLEAF_PROJECT_ID=      # optional — project ID from your Overleaf URL for a direct link
```

## First-Time Setup (one-time)
1. Open your Overleaf project
2. Click **Menu → Download → Source (.zip)**
3. Extract the zip and copy your `.tex` file to: `.tmp/overleaf-resume/main.tex`
4. Run `node tools/fetch-resume.mjs` to confirm it's ready

## Tool Sequence
```
1. node tools/fetch-resume.mjs
   └─ Verifies .tmp/overleaf-resume/<tex_file> exists and is ready

2. node tools/rewrite-resume.mjs "<job_description>" "<job_title>"
   └─ Calls Claude API (claude-sonnet-4-6)
   └─ Rewrites .tmp/overleaf-resume/<tex_file> in-place
   └─ Saves original as .tmp/overleaf-resume/<tex_file>.bak

3. node tools/push-to-overleaf.mjs "<job_title>"
   └─ Opens .tmp/overleaf-resume/ in Finder
   └─ Prints step-by-step upload instructions for Overleaf
```

## Upload to Overleaf (free account)
After step 3, manually upload the rewritten file:
1. Open your Overleaf project
2. In the file tree, rename the existing `.tex` to `.tex.old` (backup)
3. Click the **Upload** icon → select `.tmp/overleaf-resume/main.tex`
4. Click **Recompile** → download PDF

## n8n Workflow
Import `workflows/resume-rewriter.n8n.json` into n8n.
**Important:** Update the `cd /path/to/n8n` in each Execute Command node to your actual project path.

## ATS 90+ Strategy (baked into Claude prompt)
1. **Keyword mirroring** — every skill/tool in the JD appears verbatim in the resume
2. **Skills section** — explicitly lists all JD requirements 1:1
3. **Standard headers** — Experience, Education, Skills, Projects (ATS-recognizable)
4. **No multi-column layouts** — converted to single-column (multi-column breaks ATS parsers)
5. **Quantified bullets** — 70%+ of bullets have numbers, %, or $ figures
6. **Date format** — `Month YYYY – Month YYYY` (ATS-friendly)
7. **Action verbs** — every bullet starts with a past-tense action verb

## Verification
1. Upload to Overleaf → Recompile → Download PDF
2. Go to [jobscan.co](https://jobscan.co) → upload PDF + paste job description → verify score ≥ 90
3. If score is 85–89: look at "missing keywords" in Jobscan, re-run rewrite-resume.mjs with those keywords added to job_description

## Edge Cases & Known Issues
| Issue | Fix |
|-------|-----|
| `No resume found` | Download source from Overleaf and place `.tex` at `.tmp/overleaf-resume/main.tex` |
| `Claude output does not look like valid LaTeX` | Check `.tmp/claude-raw-output.txt`; original `.tex` was NOT overwritten |
| LaTeX compile error in Overleaf | Restore from `.bak` file |
| Score < 90 | Re-run with explicit missing keywords appended to job_description |
| Wrong `.tex` file detected | Set `OVERLEAF_TEX_FILE=yourfile.tex` in `.env` |
