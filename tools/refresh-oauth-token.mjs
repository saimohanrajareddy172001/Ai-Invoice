/**
 * refresh-oauth-token.mjs
 * Gets a fresh Google OAuth refresh token.
 * Run once, copy the new refresh token to .env and INPUT.json
 *
 * Usage: node tools/refresh-oauth-token.mjs
 */
import { google } from 'googleapis';
import http from 'http';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load .env
const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.+)$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const CLIENT_ID     = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:3456/callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',  // force new refresh token
});

console.log('\n🔐 Opening browser for Google OAuth...\n');
console.log('If browser does not open, visit:\n', authUrl, '\n');

// Open browser
exec(`open "${authUrl}"`);

// Local callback server
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) return;

  const url = new URL(req.url, 'http://localhost:3456');
  const code = url.searchParams.get('code');

  if (!code) {
    res.end('No code received. Try again.');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.end(`
      <h2>✅ Success! New tokens generated.</h2>
      <p>Close this tab and check your terminal.</p>
    `);

    console.log('\n✅ New tokens received:\n');
    console.log('GOOGLE_OAUTH_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('\nAccess token (temporary):', tokens.access_token?.slice(0, 30) + '...');

    if (tokens.refresh_token) {
      // Update .env automatically
      let envContent = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
      envContent = envContent.replace(
        /GOOGLE_OAUTH_REFRESH_TOKEN=.*/,
        `GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`
      );
      fs.writeFileSync(path.join(ROOT, '.env'), envContent);
      console.log('\n✅ .env updated automatically');

      // Update INPUT.json
      const inputPath = path.join(ROOT, 'storage/key_value_stores/default/INPUT.json');
      const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
      input.googleOAuthRefreshToken = tokens.refresh_token;
      fs.writeFileSync(inputPath, JSON.stringify(input, null, 4));
      console.log('✅ INPUT.json updated automatically');

      console.log('\n🚀 Now run: node tools/process-invoices.mjs\n');
    } else {
      console.log('\n⚠️  No refresh token returned. Make sure you clicked "Allow" on a fresh consent screen.');
    }
  } catch (err) {
    res.end('Error: ' + err.message);
    console.error('❌ Token exchange failed:', err.message);
  }

  server.close();
});

server.listen(3456, () => {
  console.log('🌐 Waiting for OAuth callback on http://localhost:3456...\n');
});
