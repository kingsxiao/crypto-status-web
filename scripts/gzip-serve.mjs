/**
 * 零依赖静态文件服务器：伺服 dist/ 下的预压缩产物（.br / .gz）。
 * 按 Accept-Encoding 优先下发 Brotli，其次 gzip，都没有则回退原始文件 ——
 * 与 nginx 的 brotli_static/gzip_static 行为对齐，用于本地验证压缩部署效果。
 *
 * 用法：node scripts/gzip-serve.mjs [port]   默认 4173
 */
import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, normalize, resolve } from "node:path"

const root = resolve(new URL("../dist", import.meta.url).pathname)
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173)

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
}

createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname)
  let filePath = normalize(join(root, urlPath))
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end("Forbidden")
    return
  }

  let file = filePath
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, "index.html")
  }
  if (!existsSync(file)) {
    res.writeHead(404).end("Not Found")
    return
  }

  // 命中预压缩文件：省去运行时压缩，Content-Length 精确、传输即压缩字节
  const accept = req.headers["accept-encoding"] ?? ""
  const pick = accept.includes("br")
    ? { path: `${file}.br`, encoding: "br" }
    : accept.includes("gzip")
      ? { path: `${file}.gz`, encoding: "gzip" }
      : null
  const hit = pick && existsSync(pick.path) ? pick : null

  res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream")
  // 带 hash 的资产可 immutable 长缓存；index.html 必须每次校验以拿到新 hash 引用
  res.setHeader("Cache-Control", urlPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache")
  if (hit) res.setHeader("Content-Encoding", hit.encoding)
  if (accept.includes("br") || accept.includes("gzip")) res.setHeader("Vary", "Accept-Encoding")
  res.writeHead(200)
  createReadStream(hit ? hit.path : file).pipe(res)
}).listen(port, () => {
  console.log(`gzip preview → http://localhost:${port}  (root: ${root})`)
})
