// Shared helpers: serve the game over a tiny static HTTP server and open it in headless Chrome.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png' };

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  const found = candidates.find(p => fs.existsSync(p));
  if (!found) throw new Error('Chrome/Chromium not found. Set CHROME_PATH to your browser executable.');
  return found;
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function openGame() {
  const server = await startServer();
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 768, height: 432 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.GAME);
  // Install in-page helpers used by tests: deterministic stepping of the game loop.
  await page.evaluate(() => {
    window.T = {
      step(n, fn) { for (let i = 0; i < n; i++) { if (fn) fn(i); GAME.update(); Input.endFrame(); } },
      play(level, cp) { GAME.startLevel(level, cp); GAME.state = 'play'; GAME.dialog = null; },
      bot(n, opts = {}) { // run right, jump and shoot; optionally invulnerable
        T.step(n, i => {
          GAME.dialog = null; GAME.riddle = null;
          if (opts.god && GAME.world) { GAME.world.player.inv = 2; GAME.world.player.hp = 3; }
          Input.down.add('right');
          if (i % 40 === 0) { Input.pressed.add('jump'); Input.down.add('jump'); }
          if (i % 40 === 20) Input.down.delete('jump');
          if (i % 15 === 0) Input.pressed.add('shoot');
        });
        Input.down.clear();
      },
    };
  });
  const close = async () => { await browser.close(); server.close(); };
  return { page, errors, close };
}

module.exports = { openGame, ROOT };
