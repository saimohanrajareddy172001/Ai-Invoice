/**
 * process-invoices.mjs
 * Polls Supabase for pending invoice files, downloads each from Google Drive,
 * parses the XLSX, extracts line items with OpenAI, and writes results to Supabase.
 *
 * Usage: node tools/process-invoices.mjs
 */

import { createRequire } from 'module';
import { google } from 'googleapis';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── Load xlsx (CJS) ──────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
const XLSX = require(path.join(ROOT, 'node_modules/xlsx/xlsx.js'));

// ── Config ───────────────────────────────────────────────────────────────────
// Load .env manually (no dotenv dependency)
try {
  const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
} catch {}

const SUPABASE_URL    = process.env.SUPABASE_URL    || 'https://tzscbakslxdwgioksmya.supabase.co';
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY  = process.env.OPENAI_API_KEY;
const OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const OAUTH_SECRET    = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const OAUTH_REFRESH   = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

if (!SUPABASE_KEY)   { console.error('❌ SUPABASE_SERVICE_KEY missing in .env'); process.exit(1); }
if (!OPENAI_API_KEY) { console.error('❌ OPENAI_API_KEY missing in .env'); process.exit(1); }
if (!OAUTH_CLIENT_ID || !OAUTH_SECRET || !OAUTH_REFRESH) {
  console.error('❌ Google OAuth credentials missing in .env'); process.exit(1);
}

// ── Supabase helpers ─────────────────────────────────────────────────────────
const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB_HEADERS });
  if (!r.ok) throw new Error(`Supabase GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function sbPatch(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function sbPost(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST', headers: SB_HEADERS, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase POST ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Google Drive setup ───────────────────────────────────────────────────────
const oauth2Client = new google.auth.OAuth2(OAUTH_CLIENT_ID, OAUTH_SECRET);
oauth2Client.setCredentials({ refresh_token: OAUTH_REFRESH });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function downloadFromDrive(fileId) {
  const tmpPath = path.join(ROOT, '.tmp', `invoice_${fileId}.xlsx`);
  fs.mkdirSync(path.join(ROOT, '.tmp'), { recursive: true });
  const dest = fs.createWriteStream(tmpPath);
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
  await new Promise((resolve, reject) => {
    res.data.pipe(dest);
    dest.on('finish', resolve);
    dest.on('error', reject);
  });
  return tmpPath;
}

// ── XLSX parser ──────────────────────────────────────────────────────────────
function parseInvoiceXLSX(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Find invoice number from row 5 (index 4): "Invoice: 1984"
  let invoiceNumber = null;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const rowStr = rows[i].join(' ');
    const m = rowStr.match(/Invoice[:\s#]+(\d+)/i);
    if (m) { invoiceNumber = m[1]; break; }
  }

  // Date comes from file_date (stored in Supabase from filename) — no XLSX parsing needed

  // Data rows start at row 7 (index 6)
  // Columns: UPC(0), Description(1), Unit Qty(2), Case Qty(3), Price(4)
  const SKIP_DESCRIPTIONS = [
    'previous balance', 'sub-total', 'subtotal', 'tax', 'total',
    'payment', 'balance due', 'amount due', 'description',
  ];

  const lineItems = [];
  for (let i = 6; i < rows.length; i++) {
    const row = rows[i];
    const desc = String(row[1] || '').trim();
    if (!desc) continue;
    if (SKIP_DESCRIPTIONS.some(s => desc.toLowerCase().includes(s))) continue;
    // Skip rows that look like totals (no UPC)
    const upc = String(row[0] || '').trim();
    if (!upc || upc.toLowerCase() === 'upc') continue;

    const unitQty  = parseFloat(String(row[2]).replace(/[^0-9.\-]/g, '')) || 0;
    const caseQty  = parseFloat(String(row[3]).replace(/[^0-9.\-]/g, '')) || 0;
    const price    = parseFloat(String(row[4]).replace(/[^0-9.\-]/g, '')) || 0;

    lineItems.push({ description: desc, unit_qty: unitQty, case_qty: caseQty, total: price });
  }

  return { invoiceNumber, lineItems };
}

// ── OpenAI extraction ────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function extractWithAI(lineItems, prompt) {
  const itemsText = lineItems.map((it, i) =>
    `${i + 1}. ${it.description} | unit_qty: ${it.unit_qty} | case_qty: ${it.case_qty} | total: ${it.total}`
  ).join('\n');

  const userMessage = `Here are the raw line items from a Restaurant Depot invoice XLSX:\n\n${itemsText}\n\nReturn a JSON array of objects with fields: item_name, category, unit_qty, case_qty, total. Classify each item into a category (Meat, Poultry, Seafood, Produce, Dairy, Dry Goods, Beverages, Supplies, Other). For meat/poultry items sold by weight, keep unit_qty as the weight shown. Return ONLY valid JSON array, no markdown.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user',   content: userMessage },
    ],
  });

  const raw = response.choices[0].message.content.trim();
  const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(jsonStr);
  // Handle both plain array and {items: [...]} response shapes
  return Array.isArray(parsed) ? parsed : (parsed.items || parsed.line_items || Object.values(parsed)[0] || []);
}

// ── Main processing loop ─────────────────────────────────────────────────────
async function main() {
  console.log('🔄 Invoice Processor starting...\n');

  // Get vendor prompt
  const prompts = await sbGet(`vendor_prompts?vendor=eq.Restaurant Depot&order=created_at.asc&limit=1`);
  const systemPrompt = prompts[0]?.prompt_text || 'You are an invoice data extraction assistant. Extract line items accurately.';
  console.log(`📝 Loaded prompt: "${prompts[0]?.name || 'default'}"\n`);

  let processed = 0, failed = 0;

  while (true) {
    // Get one pending file
    const pending = await sbGet(`invoice_files?status=eq.pending&order=uploaded_at.asc&limit=1&select=*`);
    if (!pending.length) {
      console.log(`\n✅ No more pending files. Done.`);
      break;
    }

    const file = pending[0];
    console.log(`\n📄 Processing: ${file.filename}`);
    console.log(`   file_id: ${file.id}`);
    console.log(`   drive_file_id: ${file.drive_file_id}`);

    // Claim the file
    await sbPatch(`invoice_files?id=eq.${file.id}`, {
      status: 'processing',
      processing_started_at: new Date().toISOString(),
    });

    let tmpPath = null;
    try {
      // Download from Drive
      console.log(`   ⬇️  Downloading from Drive...`);
      tmpPath = await downloadFromDrive(file.drive_file_id);
      const size = fs.statSync(tmpPath).size;
      console.log(`   ✅ Downloaded (${size} bytes)`);

      // Parse XLSX
      console.log(`   📊 Parsing XLSX...`);
      const { invoiceNumber, lineItems } = parseInvoiceXLSX(tmpPath);
      console.log(`   Invoice #${invoiceNumber || 'unknown'} | ${lineItems.length} line items`);

      if (!lineItems.length) {
        throw new Error('No line items found in XLSX');
      }

      // Extract with AI
      console.log(`   🤖 Extracting with OpenAI...`);
      const extracted = await extractWithAI(lineItems, systemPrompt);
      console.log(`   ✅ Extracted ${extracted.length} items`);

      // Check for existing invoice header (dedup)
      const existingHeaders = invoiceNumber
        ? await sbGet(`invoice_headers?restaurant_id=eq.${file.restaurant_id}&invoice_number=eq.${invoiceNumber}`)
        : [];

      let headerId;
      if (existingHeaders.length) {
        headerId = existingHeaders[0].id;
        console.log(`   ⚠️  Invoice #${invoiceNumber} already exists, updating lines...`);
        // Delete old lines
        await fetch(`${SUPABASE_URL}/rest/v1/invoice_lines?header_id=eq.${headerId}`, {
          method: 'DELETE', headers: SB_HEADERS,
        });
      } else {
        // Insert invoice header
        const headers = await sbPost('invoice_headers', {
          restaurant_id:  file.restaurant_id,
          file_id:        file.id,
          invoice_number: invoiceNumber || `FILE-${file.id.slice(0,8)}`,
          invoice_date:   file.file_date,
          vendor:         'Restaurant Depot',
          total:          file.file_total,
        });
        headerId = headers[0].id;
        console.log(`   📋 Created invoice_header: ${headerId}`);
      }

      // Insert line items
      const lines = extracted.map(item => ({
        header_id:     headerId,
        restaurant_id: file.restaurant_id,
        item_name:     item.item_name,
        category:      item.category,
        unit_qty:      item.unit_qty,
        case_qty:      item.case_qty,
        total:         item.total,
      }));

      await sbPost('invoice_lines', lines);
      console.log(`   ✅ Inserted ${lines.length} invoice_lines`);

      // Mark done
      await sbPatch(`invoice_files?id=eq.${file.id}`, {
        status:       'done',
        processed_at: new Date().toISOString(),
      });

      // Log to processing_logs
      await sbPost('processing_logs', {
        file_id:       file.id,
        restaurant_id: file.restaurant_id,
        stage:         'extraction',
        status:        'success',
        message:       `Extracted ${lines.length} items from invoice #${invoiceNumber}`,
      });

      processed++;
      console.log(`   ✅ DONE`);

    } catch (err) {
      console.error(`   ❌ FAILED: ${err.message}`);

      // Get current retry count
      const current = await sbGet(`invoice_files?id=eq.${file.id}&select=retry_count`);
      const retries = (current[0]?.retry_count || 0) + 1;
      const newStatus = retries >= 3 ? 'failed' : 'pending';

      await sbPatch(`invoice_files?id=eq.${file.id}`, {
        status:        newStatus,
        retry_count:   retries,
        error_message: err.message.slice(0, 500),
      });

      await sbPost('processing_logs', {
        file_id:       file.id,
        restaurant_id: file.restaurant_id,
        stage:         'extraction',
        status:        'error',
        message:       err.message.slice(0, 500),
      });

      failed++;

      // If permanently failed, continue to next. Otherwise back off.
      if (newStatus === 'pending') {
        console.log(`   🔁 Will retry (attempt ${retries}/3)`);
        await new Promise(r => setTimeout(r, 2000));
      }
    } finally {
      if (tmpPath) {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
    }
  }

  console.log(`\n════════════════════════════════`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`════════════════════════════════`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
