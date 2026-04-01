# Ai-Invoice — Restaurant Depot Invoice Automation

Automatically scrapes Restaurant Depot invoices daily, extracts every line item using AI, and organizes everything into Google Sheets — zero manual entry after setup.

**Monthly cost: ~$1.50 (Apify free tier covers most of it)**

---

## How It Works

```
Apify Actor (runs daily)
  → Logs into Restaurant Depot
  → Downloads Excel receipts
  → Uploads to Google Drive
       ↓
n8n Workflow (triggered by Drive upload)
  → Downloads the Excel file
  → AI (OpenAI) reads each line item
  → Validates and appends to Google Sheets
       ↓
Google Sheets (always up to date)
  → RAW DATA tab (every line item)
  → Invoice Totals
  → Weekly Totals
  → Monthly Totals
  → Key Items tracking
```

---

## Screenshots

> Add your screenshots to the `screenshots/` folder and update these links.

| Invoice Scraper (Apify) | Google Sheets Output |
|---|---|
| ![Apify Actor](screenshots/apify-actor.png) | ![Google Sheets](screenshots/google-sheets.png) |

---

## Stack

| Layer | Tool |
|---|---|
| Scraper | [Apify](https://apify.com) + Playwright |
| Workflow | [n8n](https://n8n.io) |
| AI Extraction | OpenAI GPT-4 |
| Storage | Supabase (Postgres) |
| Output | Google Sheets via Drive |

---

## Project Structure

```
src/main.js                  # Apify actor — logs in, downloads, uploads to Drive
tools/
  process-invoices.mjs       # Processes raw Excel invoices
  audit-invoice-accuracy.mjs # Audits invoice line item accuracy
  export_invoice_lines.py    # Exports date-range invoice lines to Excel
  seed-supabase-client.mjs   # Seeds Supabase with invoice data
  setup-supabase-schema.sql  # Supabase DB schema
  rewrite-resume.mjs         # Resume rewriter (bonus tool)
workflows/
  SETUP_GUIDE.md             # Full step-by-step setup (45–60 min)
  rewrite-resume.md          # Resume rewriter workflow
  resume-rewriter.n8n.json   # n8n workflow export
screenshots/                 # Add your screenshots here
.env.example                 # Environment variable template
```

---

## Setup

Full instructions in [`workflows/SETUP_GUIDE.md`](workflows/SETUP_GUIDE.md).

**You'll need:**
- Restaurant Depot account
- Google account (Gmail + Drive + Sheets)
- [Apify](https://apify.com) account (free)
- [n8n Cloud](https://n8n.io) account (free)
- [OpenAI](https://platform.openai.com) API key

**Environment variables (`.env`):**
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REFRESH_TOKEN=
```

---

## WAT Framework

This project follows the **WAT (Workflows, Agents, Tools)** architecture:
- **Workflows** (`workflows/`) — plain-language SOPs defining what to do
- **Agents** — Claude/AI reads workflows and orchestrates execution
- **Tools** (`tools/`) — deterministic Python/JS scripts that do the actual work

This separation keeps AI focused on reasoning while deterministic code handles execution.

---

## License

MIT
