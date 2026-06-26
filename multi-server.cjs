// Servidor multi-tenant: serve TODOS os sites de leads a partir de UM container.
// Mapeia o Host (<slug>.tiectu.easypanel.host) -> pasta <dir>/ via routes.json.
// Um build, um clone — em vez de 108 servicos clonando o monorepo inteiro.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 80;
const ROOT = __dirname;
let routes = {};
try { routes = JSON.parse(fs.readFileSync(path.join(ROOT, 'routes.json'), 'utf8')); } catch (e) { console.error('routes:', e.message); }

const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'application/javascript', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon', '.json':'application/json', '.woff2':'font/woff2', '.woff':'font/woff' };

const server = http.createServer((req, res) => {
  const host = String(req.headers.host || '').split(':')[0];
  const sub = host.split('.')[0];                 // <slug>
  const dir = routes[sub];
  if (!dir) { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); return res.end('site nao encontrado: ' + sub); }

  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const base = path.join(ROOT, dir);
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(base, safe);
  if (!full.startsWith(base)) { res.writeHead(403); return res.end('forbidden'); }

  fs.readFile(full, (err, data) => {
    if (err) {
      // fallback SPA-ish: serve index.html
      if (safe !== '/index.html') {
        return fs.readFile(path.join(base, 'index.html'), (e2, d2) => {
          if (e2) { res.writeHead(404, {'Content-Type':'text/plain'}); return res.end('not found'); }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d2);
        });
      }
      res.writeHead(404, {'Content-Type':'text/plain'}); return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control':'public, max-age=3600' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`leads-sites multi-tenant on :${PORT} (${Object.keys(routes).length} sites)`));
