// scripts/dev-server.js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT) || 8080;
const ROOT = process.cwd();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.includes('..')) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);

  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch (error) {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}/`);
});
