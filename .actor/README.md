# Restaurant Depot Receipt Downloader

Automatically logs into Restaurant Depot, downloads invoice receipts for a given date range, and uploads them as Excel files to a Google Drive folder.

## What it does

1. Logs into your Restaurant Depot account using Playwright (headless browser)
2. Navigates to the order history page
3. Downloads Excel receipts for the configured date range
4. Uploads each file to your specified Google Drive folder

## Input

| Field | Type | Description |
|---|---|---|
| `dateRange` | String | Date range to scrape (e.g. `Last 30 Days – On Demand`) |
| `googleOAuthClientId` | String | Google OAuth client ID |
| `googleOAuthClientSecret` | String | Google OAuth client secret |
| `googleOAuthRefreshToken` | String | Google OAuth refresh token |
| `supabaseUrl` | String | Supabase project URL |
| `supabaseKey` | String | Supabase service role key |

## Output

- Excel (.xlsx) receipt files uploaded to Google Drive
- Invoice data written to Supabase for downstream processing

## Usage

1. Set up Google OAuth credentials (see [setup guide](https://github.com/saimohanrajareddy172001/Ai-Invoice))
2. Configure the Input fields above
3. Run manually or schedule daily at 6 AM

## Schedule

Recommended cron: `0 6 * * *` (runs every day at 6 AM)

## Part of Ai-Invoice

This actor is one piece of a larger invoice automation system.
Full setup guide: [github.com/saimohanrajareddy172001/Ai-Invoice](https://github.com/saimohanrajareddy172001/Ai-Invoice)
