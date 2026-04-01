# Restaurant Depot Invoice Automation — Complete Setup Guide

**What this system does:**
Automatically downloads all Restaurant Depot invoices daily, extracts every line item using AI, and organizes everything in Google Sheets with invoice totals, weekly totals, monthly totals, and key item tracking. Zero manual entry after setup.

**Time to set up: 45–60 minutes**
**Monthly cost: ~$1.50 (Apify free tier covers it)**

---

## What You Need Before Starting

- A Restaurant Depot account with online access
- A Google account (Gmail)
- An Apify account (free at apify.com)
- An n8n Cloud account (free at n8n.io)
- An OpenAI account with API access (platform.openai.com)
- A computer with a web browser

---

## Overview of the System

```
Apify Actor (daily)
  → Logs into Restaurant Depot
  → Downloads Excel receipts
  → Uploads to Google Drive folder
       ↓
n8n Workflow (triggered by Drive)
  → Downloads the Excel file
  → Extracts text content
  → AI (OpenAI) reads each line item
  → Validates the data
  → Appends to Google Sheets
       ↓
Google Sheets (always up to date)
  → RAW DATA (every line item)
  → Data View (sorted newest first)
  → Invoice Totals
  → Weekly Totals
  → Monthly Totals
  → Key Items
```

---

## PART 1 — Google Sheet Setup

### Step 1.1 — Copy the Template Sheet

1. Open this link: *(paste your Google Sheet URL here)*
2. Click **File → Make a copy**
3. Name it: `[Client Name] — Restaurant Depot Invoices`
4. Choose their Google Drive as the destination
5. Click **Make a copy**

### Step 1.2 — Note the Sheet ID

1. Open the copied sheet
2. Look at the URL: `https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit`
3. Copy the `SHEET_ID_HERE` part — you'll need it later
4. Save it somewhere: **Sheet ID:** `________________________`

### Step 1.3 — Verify Sheet Structure

The sheet must have these exact tabs:
- `RAW DATA` — where n8n appends data (do not rename)
- `Data View` — sorted view (automatic)
- `Invoice Totals` — automatic
- `Weekly Totals` — automatic
- `Monthly Totals` — automatic
- `Key Items` — automatic

The `RAW DATA` tab must have these exact column headers in Row 3:
```
invoice_number | date_time | vendor | category | item_name | Unit_Qty | Case_qty | Total
```

---

## PART 2 — Google Cloud Setup (OAuth Credentials)

This allows the system to upload files to Google Drive on behalf of the client's Google account.

### Step 2.1 — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project selector at the top → **New Project**
3. Name it: `restaurant-depot-[clientname]`
4. Click **Create**
5. Wait 30 seconds, then select the new project

### Step 2.2 — Enable Google Drive API

1. In the left sidebar, click **APIs & Services → Library**
2. Search for `Google Drive API`
3. Click it → Click **Enable**
4. Wait for it to enable (10–15 seconds)

### Step 2.3 — Create OAuth Credentials

1. In the left sidebar, click **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth client ID**
3. If prompted to configure consent screen:
   - Click **Configure Consent Screen**
   - Choose **External** → Click **Create**
   - App name: `Restaurant Depot Invoices`
   - User support email: your email
   - Developer contact email: your email
   - Click **Save and Continue** through all steps
   - On the last page, click **Back to Dashboard**
   - Click **Publish App** → Confirm
4. Back on Credentials page, click **+ Create Credentials → OAuth client ID** again
5. Application type: **Web application**
6. Name: `Restaurant Depot Invoices`
7. Under **Authorized redirect URIs**, click **+ Add URI**
8. Enter: `http://localhost:3000/callback`
9. Click **Create**
10. A popup appears with your credentials. **Copy both values:**
    - **Client ID:** `________________________`
    - **Client Secret:** `________________________`
11. Click **OK**

### Step 2.4 — Add Test User

1. In the left sidebar, click **APIs & Services → OAuth consent screen**
2. Scroll down to **Test users**
3. Click **+ Add Users**
4. Enter the client's Gmail address
5. Click **Save**

### Step 2.5 — Get the Refresh Token

This is the long-lived token that lets the system upload to Drive without the client logging in each time.

1. Open Terminal on your Mac
2. Navigate to the project folder:
   ```
   cd "/Users/mohan1/Desktop/New Folder With Items/n8n"
   ```
3. Open `get-refresh-token.mjs` in a text editor
4. Replace the CLIENT_ID and CLIENT_SECRET values with the ones from Step 2.3
5. Save the file
6. Run it:
   ```
   node get-refresh-token.mjs
   ```
7. A browser window will open automatically
8. Sign in with the **client's Google account**
9. Click **Allow** (or **Continue** if it shows a warning — click "Advanced" → "Go to app")
10. The terminal will print:
    ```
    ✅ Got tokens!
    REFRESH_TOKEN: 1//01-xxxxxxxxxxxxxxxxxx...
    ```
11. Copy the refresh token. **Save all three values:**
    - **Client ID:** (from Step 2.3)
    - **Client Secret:** (from Step 2.3)
    - **Refresh Token:** `________________________`

---

## PART 3 — Google Drive Folder Setup

### Step 3.1 — Create the Trigger Folder

1. Open [drive.google.com](https://drive.google.com) signed in as the **client's Google account**
2. Click **+ New → New folder**
3. Name it: `Restaurant Depot Invoices — Incoming`
4. Click **Create**

### Step 3.2 — Get the Folder ID

1. Open the folder you just created
2. Look at the URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
3. Copy the `FOLDER_ID_HERE` part
4. Save it: **Drive Folder ID:** `________________________`

---

## PART 4 — Apify Actor Setup

The Apify actor is the robot that logs into Restaurant Depot daily and downloads receipts.

### Step 4.1 — Create an Apify Account

1. Go to [apify.com](https://apify.com)
2. Sign up for a free account
3. Verify your email

### Step 4.2 — Add the Actor

1. Go to [console.apify.com/actors/y02W7F6wTWhnnEj0o](https://console.apify.com/actors/y02W7F6wTWhnnEj0o)
   *(This is the Restaurant Depot Receipt Downloader actor)*
2. Click **Try for free** or **Use this Actor**

### Step 4.3 — Configure Actor Input

1. Click the **Input** tab
2. Click **JSON** to switch to JSON mode
3. Paste this, replacing all values with the client's actual credentials:

```json
{
    "email": "CLIENT_RESTAURANT_DEPOT_EMAIL",
    "password": "CLIENT_RESTAURANT_DEPOT_PASSWORD",
    "googleDriveFolderId": "FOLDER_ID_FROM_STEP_3.2",
    "googleOAuthClientId": "CLIENT_ID_FROM_STEP_2.3",
    "googleOAuthClientSecret": "CLIENT_SECRET_FROM_STEP_2.3",
    "googleOAuthRefreshToken": "REFRESH_TOKEN_FROM_STEP_2.5",
    "dateRange": "Last 30 Days – On Demand"
}
```

4. Click **Save**

### Step 4.4 — Test the Actor

1. Click **Start** (the green button)
2. Click the **Log** tab and watch it run
3. It should say things like:
   - `✅ Google Drive credentials verified`
   - `Found 16 rows using: tr:has(a:has-text("Download Excel"))`
   - `✅ Uploaded: https://docs.google.com/...`
4. At the end, look for: `✅ Run complete: {"total":16,"uploaded":16,...}`
5. Check the client's Google Drive folder — Excel files should appear there

**If it says "duplicate" for all files:** That means the files already exist in Drive from a previous run. That's correct behavior — it won't upload duplicates.

### Step 4.5 — Schedule Daily Runs

1. In your actor, click the **Schedules** tab
2. Click **+ New schedule**
3. Set it to run at **6:00 AM daily** (or whatever time works)
4. Cron expression: `0 6 * * *`
5. Click **Save**

The actor will now run automatically every day at 6 AM.

---

## PART 5 — n8n Workflow Setup

n8n is the automation platform that receives the Excel files from Drive, runs AI extraction, and writes to Google Sheets.

### Step 5.1 — Create an n8n Account

1. Go to [n8n.io](https://n8n.io)
2. Sign up for a free Cloud account
3. Verify your email and log in

### Step 5.2 — Import the Workflow

1. In n8n, click **Workflows** in the left sidebar
2. Click **+ New workflow**
3. Click the **...** menu (top right) → **Import from file**
4. Upload the workflow JSON file *(provided separately)*
5. The workflow will open with all nodes pre-configured

### Step 5.3 — Connect Google Drive

1. Click the **Google Drive Trigger** node (first node, lightning bolt icon)
2. Click **Credential for Google Drive API → Create new**
3. Choose **OAuth2**
4. Sign in with the **client's Google account**
5. Grant all requested permissions
6. Name the credential: `[Client Name] Drive`
7. Click **Save**
8. Back in the node, set:
   - **Event:** File Created
   - **Drive:** My Drive
   - **Folder:** Select the folder created in Step 3.1
9. Click **Save**

### Step 5.4 — Connect Google Drive Download Node

1. Click the **Download File** node (second node)
2. Under **Credential**, select the same Drive credential you just created
3. Click **Save**

### Step 5.5 — Configure OpenAI

1. Click the **Information Extractor** node (the AI node)
2. Click **Credential for OpenAI → Create new**
3. Enter your OpenAI API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
4. Name it: `OpenAI`
5. Click **Save**
6. In the node settings, verify:
   - **Model:** `gpt-4o-mini` (cheaper) or `gpt-4o` (more accurate)
   - **Temperature:** `0`
   - **Response Format:** JSON Object
7. Click **Save**

### Step 5.6 — Set the AI Prompt

1. Still in the Information Extractor node, find the **System Message** field
2. Paste this prompt exactly:

```
You are a receipt line-item extractor. Your only job is to parse a Restaurant Depot invoice CSV and return a single JSON object.

═══ STEP 1 — FIND THE INVOICE NUMBER ═══
Scan the header lines (before the table) for a line containing "Invoice:" or "Invoice #" or "Invoice Number".
Extract ONLY the digits from that line. Example: "Invoice: 14995" → "14995".
NEVER use a UPC code as the invoice number. UPC codes are in the table rows under the UPC column.

═══ STEP 2 — FIND THE DATE ═══
Extract the receipt date from the header. Output as YYYY-MM-DD. If a time is present, output YYYY-MM-DD HH:MM.

═══ STEP 3 — IDENTIFY WHICH ROWS TO INCLUDE ═══
INCLUDE: all product/item lines, and any coupon or discount lines.
EXCLUDE these rows entirely — do not put them in the output:
  - Previous Balance
  - Sub-Total or Subtotal
  - Tax
  - Total or Balance Due
  - Any payment or tender line: AMEX, VISA, MASTERCARD, DISCOVER, CARD, CASH, CHECK, TENDER, EBT

═══ STEP 4 — COPY QUANTITIES AND PRICE EXACTLY ═══
The CSV columns are: UPC | Description | Unit Qty | Case Qty | Price

CRITICAL RULES — do not deviate:
• Unit_Qty = copy the "Unit Qty" value from that row exactly. Do not swap with Case Qty.
• Case_qty = copy the "Case Qty" value from that row exactly. Do not swap with Unit Qty.
• total = copy the "Price" value from that row exactly. The Price IS the line total (already extended). Do NOT multiply it by any quantity.
• If Unit Qty is 0 and Case Qty is greater than 0, that is valid. Keep both values as-is.
• If a row says "RETURN" in the description, copy the Price sign exactly as printed. Do NOT automatically negate it.
• Coupon and discount rows have a negative Price — keep them negative.

═══ STEP 5 — ASSIGN CATEGORY ═══
Assign exactly one of these categories (case-sensitive, exact spelling):
Produce | Meat | Seafood | Dairy | Beverage | Dry Goods | Spices | Sauce/Condiments | Frozen | Bakery | Packaging/Supplies | Cleaning | Other | Discount

Use "Discount" for coupon and discount rows. Use your best judgment for all others.

═══ STEP 6 — OUTPUT ═══
Output ONLY the JSON below. No markdown. No explanation. No text before or after.

{
  "items": [
    {
      "invoice_number": "<digits only from Invoice: header>",
      "date_time": "<YYYY-MM-DD or YYYY-MM-DD HH:MM>",
      "vendor": "Restaurant Depot",
      "category": "<one from the allowed list>",
      "item_name": "<Description from CSV>",
      "Unit_Qty": <number copied exactly from Unit Qty column>,
      "Case_qty": <number copied exactly from Case Qty column>,
      "total": <number copied exactly from Price column>
    }
  ]
}
```

3. In the **Human Message** field, enter: `{{ $json.text }}`
4. Click **Save**

### Step 5.7 — Configure the IF Validation Node

1. Click the **IF** node
2. Make sure it has exactly these 4 conditions (all AND):

| Field | Operator | Value |
|-------|----------|-------|
| `{{ $json.invoice_number }}` | exists | |
| `{{ $json.item_name }}` | is not empty | |
| `{{ Math.abs($json.Total) }}` | is less than or equal to | `2000` |
| `{{ ["Produce","Meat","Seafood","Dairy","Beverage","Dry Goods","Spices","Sauce/Condiments","Frozen","Bakery","Packaging/Supplies","Cleaning","Other","Discount"].includes($json.category) }}` | is true | |

3. Click **Save**

### Step 5.8 — Connect Google Sheets

1. Click the **Google Sheets** node (after the IF node's TRUE branch)
2. Click **Credential for Google Sheets → Create new**
3. Sign in with the **client's Google account**
4. Name it: `[Client Name] Sheets`
5. Click **Save**
6. Set:
   - **Operation:** Append
   - **Document:** Select the sheet created in Part 1
   - **Sheet:** `RAW DATA`
   - **Columns:** Map each field:

| Sheet Column | n8n Expression |
|---|---|
| invoice_number | `{{ $json.invoice_number }}` |
| date_time | `{{ $json.date_time }}` |
| vendor | `{{ $json.vendor }}` |
| category | `{{ $json.category }}` |
| item_name | `{{ $json.item_name }}` |
| Unit_Qty | `{{ $json.Unit_Qty }}` |
| Case_qty | `{{ $json.Case_qty }}` |
| Total | `{{ $json.Total }}` |

7. Click **Save**

### Step 5.9 — Set Workflow Settings

1. Click the **...** menu (top right of canvas) → **Settings**
2. Set **Max Concurrent Executions** to `1`
   *(This prevents 16 simultaneous AI calls when 16 files arrive at once)*
3. Click **Save**

### Step 5.10 — Activate the Workflow

1. Toggle the workflow from **Inactive** to **Active** (top right toggle)
2. The workflow is now live and will trigger automatically when files appear in Drive

---

## PART 6 — End-to-End Test

### Step 6.1 — Trigger a Test Run

1. Go to Apify → your actor → click **Start**
2. This will upload receipts to Google Drive
3. Watch n8n → **Executions** tab — you should see executions starting within 1–2 minutes
4. Each execution processes one Excel file

### Step 6.2 — Verify the Data

1. Open the Google Sheet → **Data View** tab
2. You should see rows appearing with:
   - invoice_number (5-digit number)
   - date_time (YYYY-MM-DD format)
   - vendor (Restaurant Depot)
   - category (Produce, Meat, etc.)
   - item_name (product description)
   - Unit_Qty (number)
   - Case_qty (number)
   - Total (dollar amount)
3. Check **Invoice Totals** — should show each invoice with its total
4. Check **Monthly Totals** — should show spending by month
5. Check **Key Items** — should list all purchased items with totals

### Step 6.3 — Check for Problems

**If n8n executions are not starting:**
- Check that the workflow is Active
- Check that the Google Drive trigger is watching the correct folder
- Manually upload any file to the Drive folder to test the trigger

**If data is wrong (wrong invoice number, swapped quantities):**
- The AI extraction needs the prompt from Step 5.6
- Make sure Temperature is set to 0
- Re-run the workflow manually on one file

**If Google Sheets is not being updated:**
- Check the IF node — all 175 items going to False Branch means a condition is too strict
- Remove the Unit_Qty = 0 and Case_qty = 0 conditions if present (those are wrong)

---

## PART 7 — Ongoing Maintenance

### What runs automatically (you do nothing):
- Apify downloads receipts daily at 6 AM
- n8n processes each file automatically
- Google Sheets updates automatically
- All summary sheets recalculate automatically

### What you check monthly (5 minutes):
1. Open Apify → Runs tab → confirm recent runs show "Succeeded"
2. Open n8n → Executions tab → confirm no red failed executions
3. Open the Google Sheet → confirm new data is appearing

### What to do if the actor breaks:
Restaurant Depot sometimes updates their website, which can break the login flow or receipt download.

1. Go to Apify → your actor → click the failed run
2. Read the Log tab for the error message
3. Common fixes:
   - If login fails: Restaurant Depot may have changed their login page
   - If no receipts found: The receipt table structure may have changed
   - If Drive upload fails: The OAuth token may need to be refreshed (see below)

### Refreshing the OAuth token (every 6 months):
If Drive uploads start failing with "invalid credentials":
1. Run `node get-refresh-token.mjs` in the project folder
2. Sign in again with the client's Google account
3. Copy the new refresh token
4. Update it in the Apify actor's Input tab
5. Save and test

---

## PART 8 — Client Credentials Tracker

Keep this filled out for each client. Store it securely (not in plain text).

```
CLIENT NAME: ________________________________
RESTAURANT DEPOT EMAIL: ________________________________
RESTAURANT DEPOT PASSWORD: ________________________________
GOOGLE ACCOUNT: ________________________________

GOOGLE CLOUD PROJECT ID: ________________________________
GOOGLE OAUTH CLIENT ID: ________________________________
GOOGLE OAUTH CLIENT SECRET: ________________________________
GOOGLE OAUTH REFRESH TOKEN: ________________________________

GOOGLE DRIVE FOLDER ID: ________________________________
GOOGLE SHEET ID: ________________________________

APIFY ACTOR URL: ________________________________
N8N WORKFLOW URL: ________________________________

SETUP DATE: ________________________________
TOKEN REFRESH DUE: ________________________________ (6 months after setup)
MONTHLY FEE: ________________________________
BILLING DATE: ________________________________
```

---

## PART 9 — New Client Onboarding Checklist

Use this every time you add a paying client. Takes 45 minutes total.

### Before You Start — Collect From Client
- [ ] Their Restaurant Depot email
- [ ] Their Restaurant Depot password
- [ ] Their Gmail address (to share the sheet with them)
- [ ] Payment set up on Stripe (send them the payment link first)

---

### Step 1 — Copy the Google Sheet (5 min)
1. Open YOUR master sheet
2. Click **File → Make a copy**
3. Name it: `[Client Name] — Restaurant Depot Invoices`
4. **Keep it in YOUR Google Drive** (not theirs)
5. Open the copy → copy the Sheet ID from the URL
6. Write it down: **Sheet ID:** `________________________`

---

### Step 2 — Create Their Drive Folder (2 min)
1. Open YOUR Google Drive
2. Create a new folder: `RD — [Client Name]`
3. Open it → copy the Folder ID from the URL
4. Write it down: **Drive Folder ID:** `________________________`

---

### Step 3 — Get Their OAuth Refresh Token (15 min)
1. Go to your existing Google Cloud project (console.cloud.google.com)
2. APIs & Services → OAuth consent screen → Test users → **+ Add Users**
3. Add the client's Gmail → Save
4. Open Terminal:
   ```
   cd "/Users/mohan1/Desktop/New Folder With Items/n8n"
   node get-refresh-token.mjs
   ```
5. Browser opens → sign in with **client's Google account** → Allow
6. Copy the refresh token from Terminal
7. Write it down: **Refresh Token:** `________________________`

> Note: CLIENT_ID and CLIENT_SECRET stay the same — only the refresh token changes per client.

---

### Step 4 — Create Apify Saved Task (5 min)
1. Go to console.apify.com → your actor
2. Click **Saved tasks** → **+ Create new task**
3. Name it: `[Client Name]`
4. Click **Input** tab → switch to JSON → paste:
```json
{
    "email": "CLIENT_RD_EMAIL",
    "password": "CLIENT_RD_PASSWORD",
    "googleDriveFolderId": "FOLDER_ID_FROM_STEP_2",
    "googleOAuthClientId": "YOUR_GOOGLE_CLIENT_ID",
    "googleOAuthClientSecret": "YOUR_GOOGLE_CLIENT_SECRET",
    "googleOAuthRefreshToken": "REFRESH_TOKEN_FROM_STEP_3",
    "dateRange": "Last 30 Days – On Demand"
}
```
5. Click **Save**
6. Click **Schedules** → **+ New schedule** → `0 6 * * *` (6 AM daily) → Save
7. Click **Start** once manually to do the first upload (uploads all their history)

---

### Step 5 — Duplicate n8n Workflow (10 min)
1. Open n8n → your existing workflow
2. Click **...** menu → **Duplicate**
3. Name it: `[Client Name] — RD Invoices`
4. Click the **Google Drive Trigger** node:
   - Change credential to their Google account (Create new → sign in as them)
   - Change folder to the one created in Step 2
   - Save
5. Click the **Download File** node:
   - Select same Drive credential → Save
6. Click the **Google Sheets** node:
   - Change credential to their Google account (Create new → sign in as them)
   - Change document to their sheet (from Step 1)
   - Save
7. Toggle workflow to **Active**

---

### Step 6 — Share the Sheet With Client (2 min)
1. Open their Google Sheet
2. Click **Share** → enter their Gmail → set to **Viewer** → Share
3. Send them this message:

> *"Hi [Name], your Restaurant Depot invoice tracker is live! Here's your link: [SHEET LINK]. Bookmarks this — it updates automatically every morning. Let me know if you have any questions."*

---

### Step 7 — Verify Everything Worked (5 min)
1. Check their Drive folder — Excel files should be there from the actor run
2. Check n8n Executions — should show runs for each file
3. Open their sheet → Data View — should have rows of invoice data
4. Check Invoice Totals, Monthly Totals — should show their data

---

### Client Record (fill out and store securely)
```
CLIENT NAME:           ________________________________
RD EMAIL:              ________________________________
RD PASSWORD:           ________________________________
GMAIL:                 ________________________________
SHEET ID:              ________________________________
DRIVE FOLDER ID:       ________________________________
REFRESH TOKEN:         ________________________________
APIFY TASK URL:        ________________________________
N8N WORKFLOW URL:      ________________________________
STRIPE LINK:           ________________________________
MONTHLY FEE:           ________________________________
SETUP DATE:            ________________________________
TOKEN REFRESH DUE:     ________________________________  ← 6 months from setup
BILLING DATE:          ________________________________
STATUS:                active / paused / cancelled
```

---

### If Client Stops Paying
1. n8n workflow → toggle **Inactive**
2. Apify task → **Disable schedule**
3. Google Sheet → Share → remove their Gmail
4. Update their record STATUS to `paused`

To reactivate: reverse all 4 steps above.

---

## Quick Reference — What Each Part Does

| Part | Tool | Purpose |
|------|------|---------|
| Google Sheet | Google Sheets | Stores all invoice data, calculates totals |
| Google Cloud | Google Cloud Console | Gives the system permission to use Drive |
| Google Drive | Google Drive | Receives Excel files, triggers n8n |
| Apify Actor | Apify | Logs into Restaurant Depot, downloads receipts |
| n8n Workflow | n8n | Processes files, runs AI, writes to Sheets |
| OpenAI | OpenAI API | Reads invoice text and extracts line items |

---

*Last updated: March 2026*
*System version: Apify Actor 0.0.19*
