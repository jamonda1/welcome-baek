import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/problem/1000', ['../preview/index.html', 'text/html; charset=utf-8']],
  ['/layout.css', ['../dist/layout.css', 'text/css; charset=utf-8']],
  ['/problem.js', ['../dist/problem.js', 'text/javascript; charset=utf-8']]
]);
const port = Number(process.env.WELCOME_BAEK_PREVIEW_PORT ?? 4318);
createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.writeHead(302, { Location: '/problem/1000' }); response.end(); return; }
  const asset = files.get(pathname);
  if (!asset) { response.writeHead(404); response.end(); return; }
  try {
    const content = await readFile(new URL(asset[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store' });
    response.end(content);
  } catch {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('npm run build를 먼저 실행해 주세요.');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Welcome Baek UI preview: http://127.0.0.1:${port}/problem/1000`);
});
