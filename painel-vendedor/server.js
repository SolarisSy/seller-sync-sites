// Painel do Vendedor — servidor com estado COMPARTILHADO (sem dependencias externas).
// Serve o index.html e expoe /api/status para todos os vendedores verem os mesmos
// status (mensagem enviada / reprovado), persistido em volume.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 80;
const DATA_DIR = process.env.DATA_DIR || '/data';
const STATUS_FILE = path.join(DATA_DIR, 'status.json');
const PUBLIC_DIR = __dirname;

// ── estado em memoria + persistencia ──────────────────────────────
let status = {};
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(STATUS_FILE)) status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8') || '{}');
} catch (e) { console.error('init status:', e.message); }

let writing = false, pending = false;
function persist() {
  if (writing) { pending = true; return; }
  writing = true;
  fs.writeFile(STATUS_FILE, JSON.stringify(status), (err) => {
    writing = false;
    if (err) console.error('persist:', err.message);
    if (pending) { pending = false; persist(); }
  });
}

const MIME = { '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.ico':'image/x-icon' };

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  // ── API ──
  if (url === '/api/status' && req.method === 'GET') {
    return sendJSON(res, 200, status);
  }
  if (url.startsWith('/api/status/') && req.method === 'POST') {
    const slug = url.slice('/api/status/'.length);
    if (!slug) return sendJSON(res, 400, { error: 'slug ausente' });
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let patch = {};
      try { patch = JSON.parse(body || '{}'); } catch { return sendJSON(res, 400, { error: 'json invalido' }); }
      const cur = status[slug] || {};
      // aceita apenas os campos conhecidos
      const next = Object.assign({}, cur);
      if ('msg' in patch) next.msg = !!patch.msg;
      if ('rej' in patch) next.rej = !!patch.rej;
      if ('reanalise' in patch) next.reanalise = !!patch.reanalise;
      if ('reason' in patch) next.reason = String(patch.reason == null ? '' : patch.reason).slice(0, 2000);
      next.updatedAt = Date.now();
      status[slug] = next;
      persist();
      return sendJSON(res, 200, next);
    });
    return;
  }
  if (url === '/api/status' && req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,POST,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type' });
    return res.end();
  }

  // ── estaticos ──
  let file = url === '/' ? '/index.html' : url;
  const safe = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, safe);
  if (!full.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, {'Content-Type':'text/plain'}); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Painel do vendedor on :${PORT} (status em ${STATUS_FILE})`));
