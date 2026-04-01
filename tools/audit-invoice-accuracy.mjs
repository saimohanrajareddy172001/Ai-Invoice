/**
 * audit-invoice-accuracy.mjs
 *
 * Cross-checks Google Sheet RAW DATA against actual invoice files in Google Drive.
 * Flags missing items, extra items (hallucinations), and total mismatches.
 *
 * Usage: node tools/audit-invoice-accuracy.mjs
 */

import { google } from 'googleapis';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirnameTemp = path.dirname(fileURLToPath(import.meta.url));
const ROOTTemp = path.resolve(__dirnameTemp, '..');
const require = createRequire(import.meta.url);
const XLSX = require(path.join(ROOTTemp, 'node_modules/xlsx/xlsx.js'));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, '.tmp');

// ── Config ────────────────────────────────────────────────────────────────────

const INPUT = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'storage/key_value_stores/default/INPUT.json'), 'utf8')
);

const SHEET_ID = '1_3N-lpPZf9Wmpzm4JxKV36XBhK9AtaVgPCdF5kVuML0';
const FOLDER_ID = INPUT.googleDriveFolderId;
const MAX_INVOICES_TO_CHECK = 3;

// Rows to skip — these are footer/header rows, not products
const SKIP_KEYWORDS = ['PREVIOUS BALANCE', 'SUB-TOTAL', 'TAX', 'TOTAL', 'BALANCE', 'AMEX', 'MC/VISA', 'VISA', 'DISCOVER', 'CASH'];

// ── Auth ──────────────────────────────────────────────────────────────────────

const oauth2Client = new google.auth.OAuth2(
    INPUT.googleOAuthClientId,
    INPUT.googleOAuthClientSecret
);
oauth2Client.setCredentials({ refresh_token: INPUT.googleOAuthRefreshToken });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(str) {
    return (str ?? '').toString().trim().toUpperCase().replace(/\s+/g, ' ');
}

function roundTo2(n) {
    const v = parseFloat(String(n).replace(/[$,]/g, ''));
    return isNaN(v) ? null : Math.round(v * 100) / 100;
}

async function fetchSheetData() {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'RAW DATA!A4:H',
    });
    const rows = res.data.values ?? [];
    return rows
        .filter(r => r[0] && r[4])
        .map(r => ({
            invoice_number: normalize(r[0]),
            date: (r[1] ?? '').toString().substring(0, 10),
            vendor: r[2] ?? '',
            category: r[3] ?? '',
            item_name: normalize(r[4]),
            unit_qty: parseFloat(r[5]) || 0,
            case_qty: parseFloat(r[6]) || 0,
            total: roundTo2(r[7]),
        }));
}

async function listInvoiceFiles() {
    const res = await drive.files.list({
        q: `'${FOLDER_ID}' in parents and trashed=false and mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'`,
        fields: 'files(id, name, createdTime)',
        orderBy: 'createdTime desc',
        pageSize: MAX_INVOICES_TO_CHECK,
    });
    return res.data.files ?? [];
}

async function downloadFile(fileId, destPath) {
    const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
    );
    await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(destPath);
        res.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

/**
 * Parse a Restaurant Depot XLSX invoice.
 * Structure (confirmed from inspection):
 *   Row 5: ["Invoice: XXXX", "Terminal: YY", "YYYY/MM/DD HH:MM am", ...]
 *   Row 6: ["UPC", "Description", "Unit Qty", "Case Qty", "Price"]
 *   Row 7+: [upc_code, item_name, unit_qty, case_qty, price]
 *   Footer: Sub-Total, Tax, Total, payment rows, Balance
 */
function parseInvoice(filePath) {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Extract invoice number from header rows
    let invoiceNumber = null;
    let invoiceDate = null;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
        for (const cell of rows[i]) {
            const s = String(cell).trim();
            // "Invoice: 1984"
            const invMatch = s.match(/Invoice:\s*(\d+)/i);
            if (invMatch) invoiceNumber = invMatch[1];
            // "2026/02/17 10:38 am"
            const dateMatch = s.match(/(\d{4})\/(\d{2})\/(\d{2})/);
            if (dateMatch) invoiceDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        }
    }

    // Find data rows (after header row with "UPC", "Description" etc.)
    let dataStartRow = -1;
    for (let i = 0; i < rows.length; i++) {
        const normalized = rows[i].map(c => normalize(String(c)));
        if (normalized.includes('UPC') || normalized.includes('DESCRIPTION')) {
            dataStartRow = i + 1;
            break;
        }
    }
    if (dataStartRow === -1) dataStartRow = 7; // fallback

    const items = [];
    for (let i = dataStartRow; i < rows.length; i++) {
        const row = rows[i];
        const itemName = normalize(String(row[1] ?? ''));
        if (!itemName || itemName.length < 2) continue;
        // Skip footer rows
        if (SKIP_KEYWORDS.some(k => itemName.includes(k))) continue;
        // Skip rows with UPC = -2 (Previous Balance indicator) or 0
        const upc = row[0];
        if (upc === -2 || upc === 0) continue;

        const unit_qty = parseFloat(row[2]) || 0;
        const case_qty = parseFloat(row[3]) || 0;
        const price = roundTo2(row[4]);

        items.push({ invoiceNumber, invoiceDate, itemName, unit_qty, case_qty, price });
    }

    return { invoiceNumber, invoiceDate, items };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

    console.log('🔍 Fetching RAW DATA from Google Sheet...');
    const sheetRows = await fetchSheetData();
    const sheetInvoiceNumbers = [...new Set(sheetRows.map(r => r.invoice_number))];
    console.log(`   Found ${sheetRows.length} rows across ${sheetInvoiceNumbers.length} invoices in sheet`);
    console.log(`   Invoice numbers in sheet: ${sheetInvoiceNumbers.slice(0, 10).join(', ')}${sheetInvoiceNumbers.length > 10 ? '...' : ''}\n`);

    console.log('📂 Listing invoice files in Google Drive...');
    const files = await listInvoiceFiles();
    console.log(`   Found ${files.length} file(s) to audit\n`);

    if (files.length === 0) {
        console.log('No invoice files found in Drive folder.');
        return;
    }

    const report = [];
    let totalIssues = 0;

    for (const file of files) {
        console.log(`\n━━━ Auditing: ${file.name} ━━━`);
        const localPath = path.join(TMP, file.name);

        if (!fs.existsSync(localPath)) {
            console.log('   Downloading...');
            await downloadFile(file.id, localPath);
        } else {
            console.log('   Using cached file...');
        }

        // Parse invoice
        const { invoiceNumber, invoiceDate, items: invoiceItems } = parseInvoice(localPath);
        console.log(`   Invoice #: ${invoiceNumber ?? 'not found'}  |  Date: ${invoiceDate ?? 'not found'}`);
        console.log(`   Items in invoice: ${invoiceItems.length}`);

        // Find matching sheet rows by invoice number
        let sheetItems = invoiceNumber
            ? sheetRows.filter(r => r.invoice_number === invoiceNumber)
            : [];

        // Fallback: match by date if invoice number not found
        if (sheetItems.length === 0 && invoiceDate) {
            sheetItems = sheetRows.filter(r => r.date === invoiceDate);
            if (sheetItems.length > 0) {
                console.log(`   (Matched by date ${invoiceDate} — invoice# not found in sheet)`);
            }
        }

        console.log(`   Rows in sheet for this invoice: ${sheetItems.length}`);

        if (sheetItems.length === 0) {
            console.log(`   ⚠ Invoice #${invoiceNumber} (${invoiceDate}) not found in sheet at all`);
            report.push({ file: file.name, invoiceNumber, invoiceDate, invoiceCount: invoiceItems.length, sheetCount: 0, issues: [`Invoice not found in sheet (invoice# ${invoiceNumber}, date ${invoiceDate})`] });
            totalIssues++;
            continue;
        }

        const issues = [];

        // Item count check
        if (invoiceItems.length !== sheetItems.length) {
            issues.push(`Item count: invoice=${invoiceItems.length}, sheet=${sheetItems.length}`);
        }

        // Check each invoice item is in the sheet
        for (const inv of invoiceItems) {
            const match = sheetItems.find(s =>
                s.item_name === inv.itemName ||
                s.item_name.startsWith(inv.itemName.substring(0, 10)) ||
                inv.itemName.startsWith(s.item_name.substring(0, 10))
            );
            if (!match) {
                issues.push(`MISSING from sheet: "${inv.itemName}" (qty: ${inv.unit_qty}, price: $${inv.price})`);
            } else if (inv.price !== null && match.total !== null && Math.abs(match.total - inv.price) > 0.05) {
                issues.push(`PRICE MISMATCH: "${inv.itemName}" — invoice: $${inv.price}, sheet: $${match.total}`);
            } else if (inv.unit_qty !== match.unit_qty) {
                issues.push(`QTY MISMATCH: "${inv.itemName}" — invoice unit_qty: ${inv.unit_qty}, sheet: ${match.unit_qty}`);
            } else if (inv.case_qty !== match.case_qty) {
                issues.push(`CASE MISMATCH: "${inv.itemName}" — invoice case_qty: ${inv.case_qty}, sheet: ${match.case_qty}`);
            }
        }

        // Check each sheet item is in the invoice
        for (const sh of sheetItems) {
            const match = invoiceItems.find(i =>
                i.itemName === sh.item_name ||
                i.itemName.startsWith(sh.item_name.substring(0, 10)) ||
                sh.item_name.startsWith(i.itemName.substring(0, 10))
            );
            if (!match) {
                issues.push(`EXTRA in sheet (not on invoice): "${sh.item_name}" ($${sh.total})`);
            }
        }

        totalIssues += issues.length;

        if (issues.length === 0) {
            console.log(`   ✅ All ${invoiceItems.length} items match perfectly!`);
        } else {
            console.log(`   ❌ ${issues.length} issue(s):`);
            issues.forEach(i => console.log(`      • ${i}`));
        }

        report.push({ file: file.name, invoiceNumber, invoiceDate, invoiceCount: invoiceItems.length, sheetCount: sheetItems.length, issues });
    }

    // Summary
    console.log('\n\n═══════════════════════════════════════');
    console.log('           AUDIT SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Files checked : ${files.length}`);
    console.log(`Total issues  : ${totalIssues}`);
    if (totalIssues === 0) console.log('\n✅ Everything looks correct!');
    console.log('');

    for (const r of report) {
        const status = r.issues.length === 0 ? '✅' : '❌';
        console.log(`${status} ${r.file}`);
        console.log(`   Invoice #${r.invoiceNumber}  |  ${r.invoiceDate}  |  invoice: ${r.invoiceCount} items, sheet: ${r.sheetCount} rows`);
        if (r.issues.length > 0) r.issues.forEach(i => console.log(`   • ${i}`));
    }

    // Save report
    const reportPath = path.join(TMP, 'audit-report.txt');
    const lines = [`Audit run: ${new Date().toISOString()}`, ''];
    for (const r of report) {
        lines.push(`[${r.issues.length === 0 ? 'OK' : 'ISSUES'}] ${r.file}`);
        lines.push(`  Invoice #${r.invoiceNumber}  |  ${r.invoiceDate}  |  invoice: ${r.invoiceCount}, sheet: ${r.sheetCount}`);
        r.issues.forEach(i => lines.push(`  • ${i}`));
        lines.push('');
    }
    fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
    console.log(`\nReport saved to .tmp/audit-report.txt`);
}

main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
});
