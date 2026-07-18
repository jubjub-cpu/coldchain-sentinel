import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const portIndex = process.argv.indexOf("--port");
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 4193);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".png": "image/png", ".wav": "audio/wav" };

createServer((request, response) => {
  const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = normalize(requested).replace(/^([/\\])+/, "");
  let path = join(root, relative || "index.html");
  if (!path.startsWith(root)) { response.writeHead(403); response.end("Forbidden"); return; }
  try { if (statSync(path).isDirectory()) path = join(path, "index.html"); } catch { response.writeHead(404); response.end("Not found"); return; }
  response.writeHead(200, { "Content-Type": types[extname(path).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store", "Accept-Ranges": "bytes" });
  createReadStream(path).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`VoiceGauge server ready at http://127.0.0.1:${port}/`));
