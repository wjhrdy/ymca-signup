const fs = require('fs');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const inputPath = getArgValue(args, '--input') || getLatestNetworkLog();
const topCount = parseInt(getArgValue(args, '--top') || '20', 10);
const includeBodies = args.includes('--include-bodies');

function getArgValue(items, flag) {
  const index = items.indexOf(flag);
  if (index === -1) return null;
  return items[index + 1] || null;
}

function getLatestNetworkLog() {
  const dir = path.join(__dirname, '..', 'data', 'network');
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.startsWith('network-') && file.endsWith('.jsonl'))
    .map((file) => ({
      file,
      mtime: fs.statSync(path.join(dir, file)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) return null;
  return path.join(dir, files[0].file);
}

function countItem(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function safeHost(urlValue) {
  try {
    return new URL(urlValue).host;
  } catch (error) {
    return 'unknown';
  }
}

function safePath(urlValue) {
  try {
    const url = new URL(urlValue);
    return url.pathname || '/';
  } catch (error) {
    return 'unknown';
  }
}

function printTop(map, label, limit) {
  const items = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  console.log(`\n${label}`);
  items.forEach(([key, count]) => {
    console.log(`${count.toString().padStart(5, ' ')}  ${key}`);
  });
}

async function main() {
  if (!inputPath) {
    console.error('No network logs found. Pass --input <path>.');
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const byHost = new Map();
  const byPath = new Map();
  const byMethod = new Map();
  const byStatus = new Map();
  let total = 0;
  let withBody = 0;
  let errors = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    total += 1;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (error) {
      errors += 1;
      continue;
    }

    const urlValue = entry.request?.url || entry.response?.url || '';
    const method = entry.request?.method || 'UNKNOWN';
    const status = entry.response?.status ? entry.response.status.toString() : 'NO_STATUS';

    countItem(byHost, safeHost(urlValue));
    countItem(byPath, safePath(urlValue));
    countItem(byMethod, method);
    countItem(byStatus, status);

    if (includeBodies && entry.responseBody?.text) {
      withBody += 1;
    }
  }

  console.log(`Parsed: ${inputPath}`);
  console.log(`Entries: ${total}`);
  console.log(`JSON parse errors: ${errors}`);
  if (includeBodies) {
    console.log(`Entries with response bodies: ${withBody}`);
  }

  printTop(byHost, 'Top hosts', topCount);
  printTop(byPath, 'Top paths', topCount);
  printTop(byMethod, 'Top methods', topCount);
  printTop(byStatus, 'Top status codes', topCount);
}

main().catch((error) => {
  console.error('Failed to parse network log:', error);
  process.exit(1);
});
