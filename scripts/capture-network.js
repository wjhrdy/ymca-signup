const fs = require('fs');
const path = require('path');
const readline = require('readline');
const puppeteer = require('puppeteer');

const DEFAULT_URL = 'https://ymca-triangle.fisikal.com/';
const args = process.argv.slice(2);
const url = args[0] || DEFAULT_URL;
const flagArgs = args.slice(1);
const filterArgs = flagArgs;
const filterOptions = {
  apiOnly: filterArgs.includes('--api-only'),
  apiWebOnly: filterArgs.includes('--api-web-only'),
  method: getArgValue(flagArgs, '--method'),
  host: getArgValue(flagArgs, '--host')
};
const outputDir = path.join(__dirname, '..', 'data', 'network');
const profileDir = path.join(__dirname, '..', 'data', 'chrome-profile');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function formatTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function getArgValue(items, flag) {
  const index = items.indexOf(flag);
  if (index === -1) return null;
  return items[index + 1] || null;
}

function normalizeMethod(method) {
  return typeof method === 'string' ? method.toUpperCase() : null;
}

function shouldCaptureBody(entry) {
  if (!entry || !entry.response) return false;
  const urlValue = entry.request?.url || entry.response?.url || '';
  const mimeType = entry.response?.mimeType || '';
  if (urlValue.includes('/api/') || urlValue.includes('/api/web')) return true;
  return mimeType.includes('application/json') || mimeType.includes('text/json');
}

function matchesFilters(entry) {
  const requestUrl = entry.request?.url || entry.response?.url || '';
  const requestMethod = normalizeMethod(entry.request?.method);

  if (filterOptions.apiWebOnly && !requestUrl.includes('/api/web')) return false;
  if (filterOptions.apiOnly && !requestUrl.includes('/api/')) return false;
  if (filterOptions.method && requestMethod !== normalizeMethod(filterOptions.method)) return false;
  if (filterOptions.host) {
    try {
      const host = new URL(requestUrl).host;
      if (host !== filterOptions.host) return false;
    } catch (error) {
      return false;
    }
  }

  return true;
}

async function main() {
  ensureDir(outputDir);
  ensureDir(profileDir);

  const outputPath = path.join(outputDir, `network-${formatTimestamp(new Date())}.jsonl`);
  const outputStream = fs.createWriteStream(outputPath, { flags: 'a' });

  const localChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = fs.existsSync(localChromePath) ? localChromePath : undefined;

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    userDataDir: profileDir,
    executablePath,
    args: [
      '--start-maximized',
      '--auto-open-devtools-for-tabs'
    ]
  });

  const [page] = await browser.pages();
  const client = await page.target().createCDPSession();
  await client.send('Network.enable');

  const entries = new Map();

  client.on('Network.requestWillBeSent', (params) => {
    const entry = {
      requestId: params.requestId,
      request: {
        url: params.request?.url,
        method: params.request?.method,
        headers: params.request?.headers,
        postData: params.request?.postData,
        hasPostData: params.request?.hasPostData
      },
      type: params.type,
      initiator: params.initiator,
      timestamp: params.timestamp
    };
    entries.set(params.requestId, entry);
  });

  client.on('Network.responseReceived', (params) => {
    const entry = entries.get(params.requestId) || { requestId: params.requestId };
    entry.response = {
      url: params.response?.url,
      status: params.response?.status,
      statusText: params.response?.statusText,
      headers: params.response?.headers,
      mimeType: params.response?.mimeType,
      protocol: params.response?.protocol,
      remoteIPAddress: params.response?.remoteIPAddress,
      remotePort: params.response?.remotePort
    };
    entry.responseTimestamp = params.timestamp;
    entry.responseType = params.type;
    entries.set(params.requestId, entry);
  });

  client.on('Network.loadingFinished', async (params) => {
    const entry = entries.get(params.requestId);
    if (!entry) return;

    entry.encodedDataLength = params.encodedDataLength;
    entry.finishTimestamp = params.timestamp;

    if (shouldCaptureBody(entry)) {
      try {
        const body = await client.send('Network.getResponseBody', { requestId: params.requestId });
        entry.responseBody = {
          base64Encoded: body.base64Encoded,
          text: body.body
        };
      } catch (error) {
        entry.responseBodyError = error.message;
      }
    }

    if (matchesFilters(entry)) {
      outputStream.write(`${JSON.stringify(entry)}\n`);
    }
    entries.delete(params.requestId);
  });

  client.on('Network.loadingFailed', (params) => {
    const entry = entries.get(params.requestId) || { requestId: params.requestId };
    entry.loadingFailed = {
      errorText: params.errorText,
      blockedReason: params.blockedReason,
      canceled: params.canceled,
      timestamp: params.timestamp
    };
    if (matchesFilters(entry)) {
      outputStream.write(`${JSON.stringify(entry)}\n`);
    }
    entries.delete(params.requestId);
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('Chrome session started. Log in and sign up for a class.');
  console.log(`Network logs: ${outputPath}`);
  if (filterArgs.length > 0) {
    console.log(`Filters: ${filterArgs.join(' ')}`);
  }
  console.log('Press Enter to stop capture and close the browser.');

  await new Promise((resolve) => rl.question('', resolve));
  rl.close();

  await browser.close();
  outputStream.end();
}

main().catch((error) => {
  console.error('Failed to start capture:', error);
  process.exit(1);
});
