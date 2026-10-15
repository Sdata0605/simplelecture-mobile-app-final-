#!/usr/bin/env node
const { spawn, exec } = require('child_process');
const http = require('http');
const os = require('os');

const PORT = process.argv[2] || 8081;

function getLanIP() {
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!name.toLowerCase().includes('wi-fi')) continue;
    for (const a of addrs) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (/^(vEthernet|vmnet|docker|br-|virbr|wsl|hyper-v)/i.test(name)) continue;
    for (const a of addrs) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return '127.0.0.1';
}

function killPort(port) {
  return new Promise(resolve => {
    exec(`netstat -ano | findstr :${port}`, (err, stdout) => {
      if (err || !stdout.trim()) { resolve(); return; }
      const pids = new Set();
      for (const line of stdout.split('\n')) {
        const m = line.trim().match(/LISTENING\s+(\d+)/);
        if (m) pids.add(m[1]);
      }
      if (pids.size === 0) { resolve(); return; }
      console.log(`  Killing old process(es) on port ${port}: ${[...pids].join(', ')}`);
      for (const pid of pids) exec(`taskkill /F /PID ${pid}`, () => {});
      setTimeout(resolve, 1500);
    });
  });
}

function fetchManifest(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/`, res => {
      let data = '';
      res.on('data', d => (data += d));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(); } });
    }).on('error', reject);
  });
}

async function printQR(text) {
  let QRCode;
  try { QRCode = require('qrcode-terminal'); } catch { console.log(`\n  Scan: exp://${text}\n`); return; }
  console.log('');
  QRCode.generate(text, { small: true }, qr => console.log(qr));
}

async function main() {
  const ip = getLanIP();
  const url = `exp://${ip}:${PORT}`;

  await killPort(PORT);
  console.log(`\n  Starting Expo on port ${PORT}...\n`);

  const child = spawn('npx', ['expo', 'start', '--lan', '--clear', '--port', String(PORT)], {
    cwd: process.cwd(), stdio: 'inherit', shell: true,
  });
  child.on('error', err => { console.error('Failed:', err.message); process.exit(1); });

  let manifest;
  for (let i = 0; i < 20; i++) {
    try { manifest = await fetchManifest(PORT); break; } catch {}
    await new Promise(r => setTimeout(r, 3000));
  }

  if (!manifest) { console.log('\n  Expo did not start.\n'); process.exit(1); }

  console.log(`\n  Project: ${manifest.extra?.expoClient?.name || 'Unknown'}`);
  console.log(`  URL:     ${url}`);
  await printQR(url);
  console.log('');
}

main().catch(err => { console.error(err); process.exit(1); });
