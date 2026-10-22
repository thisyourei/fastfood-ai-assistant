import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import worker from '../src/worker.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT || 8787);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const files = { '/': 'index.html', '/index.html': 'index.html', '/styles.css': 'styles.css', '/app.js': 'app.js' };
const env = { DEMO_MODE: 'true', DEMO_ENABLED: 'true', META_VERIFY_TOKEN: 'local-demo-token' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (files[url.pathname]) {
      const file = files[url.pathname];
      const data = await readFile(join(root, 'public', file));
      res.writeHead(200, { 'Content-Type': mime[file.slice(file.lastIndexOf('.'))] });
      res.end(data);
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const pending = [];
    const response = await worker.fetch(request, env, { waitUntil(promise) { pending.push(promise); } });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    await Promise.allSettled(pending);
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end('Error interno');
  }
}).listen(port, () => console.log(`Demo disponible en http://localhost:${port}`));
