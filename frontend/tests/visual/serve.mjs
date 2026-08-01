/**
 * Мини-сервер для собранного фронта.
 *
 * `vite preview` не годится: проект многостраничный (index.html + admin.html),
 * и SPA-фолбэк для клиентских маршрутов вроде /orders там не гарантирован.
 * Здесь фолбэк явный: реальный файл отдаём как есть, /admin* — admin.html,
 * всё остальное — index.html, чтобы react-router получил свой путь.
 *
 *   node serve.mjs <dist-dir> <port>
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve(process.argv[2] || "dist");
const port = Number(process.argv[3] || 4173);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".ico": "image/x-icon", ".woff": "font/woff",
  ".woff2": "font/woff2", ".ttf": "font/ttf", ".map": "application/json",
};

const send = (res, code, body, type) => {
  res.writeHead(code, { "Content-Type": type || "text/plain; charset=utf-8" });
  res.end(body);
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  // Не выпускаем за пределы dist.
  const candidate = path.normalize(path.join(dist, urlPath));
  if (!candidate.startsWith(dist)) return send(res, 403, "forbidden");

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return send(res, 200, fs.readFileSync(candidate), MIME[path.extname(candidate)]);
  }
  const fallback = urlPath.startsWith("/admin")
    ? path.join(dist, "admin.html")
    : path.join(dist, "index.html");
  if (fs.existsSync(fallback)) {
    return send(res, 200, fs.readFileSync(fallback), "text/html; charset=utf-8");
  }
  send(res, 404, "not found");
}).listen(port, () => console.log(`serve: ${dist} -> http://127.0.0.1:${port}`));
