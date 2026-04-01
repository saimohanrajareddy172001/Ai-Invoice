/**
 * seed-supabase-client.mjs
 *
 * Inserts the first client (Turmeric STL) into the Supabase restaurants table
 * and seeds the default Restaurant Depot vendor prompt.
 *
 * Prerequisites:
 *   1. Run tools/setup-supabase-schema.sql in Supabase SQL Editor
 *   2. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to .env
 *
 * Usage:
 *   node tools/seed-supabase-client.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Load .env manually (no dotenv dependency needed) ──────────────────────────
function loadEnv() {
    const envPath = path.join(ROOT, '.env');
    if (!fs.existsSync(envPath)) throw new Error('.env file not found');
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.substring(0, eq).trim();
        const val = trimmed.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
    }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
    console.error('   Add these two lines to your .env file:');
    console.error('   SUPABASE_URL=https://xxxx.supabase.co');
    console.error('   SUPABASE_SERVICE_KEY=eyJhbGciOi...');
    process.exit(1);
}

// ── Load existing INPUT.json credentials ─────────────────────────────────────
const INPUT = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'storage/key_value_stores/default/INPUT.json'), 'utf8')
);

// ── Supabase REST helper ──────────────────────────────────────────────────────
async function supabase(method, table, body = null, params = '') {
    const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
    const res = await fetch(url, {
        method,
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${method} ${table} → ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
}

// ── Default Restaurant Depot extraction prompt ────────────────────────────────
const DEFAULT_RD_PROMPT = `You are an invoice data extraction assistant. Extract every line item from this Restaurant Depot invoice.

Return a JSON object with this exact structure:
{
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "vendor": "Restaurant Depot",
  "subtotal": number,
  "tax": number,
  "total": number,
  "items": [
    {
      "item_name": "string",
      "category": "string",
      "unit_qty": number,
      "case_qty": number,
      "unit_price": number,
      "total": number
    }
  ]
}

Rules:
1. Extract ALL product line items — do not skip any
2. For returns/credits, preserve the negative sign (e.g. -29.75 not 29.75)
3. unit_qty = number of units/pieces; case_qty = number of cases
4. category: classify as one of: Meat, Seafood, Produce, Dairy, Frozen, Dry Goods, Beverages, Supplies, Other
5. Do not include Sub-Total, Tax, Total, or payment rows as items
6. Do not hallucinate items — only extract what is actually on the invoice
7. invoice_number: the numeric ID from the "Invoice:" field (e.g. "1984")`;

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🌱 Seeding Supabase with first client: Turmeric STL\n');

    // 1. Check if client already exists
    console.log('1. Checking if Turmeric STL already exists...');
    const existing = await supabase('GET', 'restaurants', null, '?name=eq.Turmeric STL&select=id,name');
    if (existing && existing.length > 0) {
        console.log(`   ⚠  Already exists (id: ${existing[0].id}) — skipping insert`);
        console.log('   Run this script again to add a different client.\n');
    } else {
        // 2. Insert restaurant row
        console.log('2. Inserting Turmeric STL...');
        // NOTE: drive_folder_id should be a subfolder in YOUR central Google Drive,
        // not the client's own Drive. Create a folder like "Invoice Automation/Turmeric STL"
        // in your Drive and paste its ID here (or update it after running this script).
        const [restaurant] = await supabase('POST', 'restaurants', {
            name:             'Turmeric STL',
            rd_email:         INPUT.email,
            rd_password:      INPUT.password,
            rd_store_number:  '79',
            drive_folder_id:  INPUT.googleDriveFolderId, // update to YOUR Drive subfolder ID
            vendor:           'Restaurant Depot',
            is_active:        true,
        });
        console.log(`   ✅ Created restaurant id: ${restaurant.id}\n`);
    }

    // 3. Seed default vendor prompt (if not already there)
    console.log('3. Checking default Restaurant Depot prompt...');
    const existingPrompt = await supabase('GET', 'vendor_prompts', null,
        '?vendor=eq.Restaurant Depot&is_default=eq.true&select=id');
    if (existingPrompt && existingPrompt.length > 0) {
        console.log(`   ⚠  Default prompt already exists (id: ${existingPrompt[0].id}) — skipping\n`);
    } else {
        const [prompt] = await supabase('POST', 'vendor_prompts', {
            vendor:       'Restaurant Depot',
            restaurant_id: null,       // null = default (applies to all clients)
            prompt_text:  DEFAULT_RD_PROMPT,
            is_default:   true,
        });
        console.log(`   ✅ Created default prompt id: ${prompt.id}\n`);
    }

    // 4. Verify
    console.log('4. Verification — current restaurants:');
    const allRestaurants = await supabase('GET', 'restaurants', null, '?select=id,name,rd_email,vendor,is_active&order=created_at');
    allRestaurants.forEach(r => {
        console.log(`   ${r.is_active ? '✅' : '⏸'} [${r.id.substring(0, 8)}...] ${r.name} (${r.rd_email}) — ${r.vendor}`);
    });

    console.log('\n   Current vendor prompts:');
    const allPrompts = await supabase('GET', 'vendor_prompts', null, '?select=id,vendor,is_default,restaurant_id&order=created_at');
    allPrompts.forEach(p => {
        const scope = p.restaurant_id ? `client-specific` : 'default (all clients)';
        console.log(`   📝 [${p.id.substring(0, 8)}...] ${p.vendor} — ${scope}${p.is_default ? ' ★' : ''}`);
    });

    console.log('\n✅ Done. You can now update src/main.js to run against Supabase.');
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
