import { createServer } from "node:http"
import { createReadStream } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import { extname, join, normalize, relative } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL(".", import.meta.url))
const PUBLIC_DIR = join(ROOT, "public")
const LOG_DIR = join(ROOT, "logs")
const PORT = Number(process.env.PORT ?? 4317)
const HOST = "127.0.0.1"

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
])

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  })
  res.end(JSON.stringify(payload))
}

function safeJoin(base, path) {
  const target = normalize(join(base, path))
  const inside = relative(base, target)
  if (inside.startsWith("..") || inside === "..") return null
  return target
}

async function listProjects() {
  try {
    const entries = await readdir(LOG_DIR, { withFileTypes: true })
    const projects = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const timeline = join(LOG_DIR, entry.name, "subagent-timeline.md")
          const events = join(LOG_DIR, entry.name, "opencode-events.ndjson")
          const [timelineStat, eventsStat] = await Promise.allSettled([stat(timeline), stat(events)])

          const updatedAt = [timelineStat, eventsStat]
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value.mtimeMs)
            .sort((a, b) => b - a)[0]

          return {
            name: entry.name,
            updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
          }
        }),
    )

    return projects.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  } catch {
    return []
  }
}

async function readProjectLog(project, fileName) {
  const projectDir = safeJoin(LOG_DIR, project)
  if (!projectDir) return null

  const file = safeJoin(projectDir, fileName)
  if (!file) return null

  try {
    return await readFile(file, "utf8")
  } catch {
    return ""
  }
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/projects") {
    sendJson(res, 200, { projects: await listProjects() })
    return true
  }

  const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/(timeline|events)$/)
  if (!match) return false

  const project = decodeURIComponent(match[1])
  const kind = match[2]
  const content = await readProjectLog(
    project,
    kind === "timeline" ? "subagent-timeline.md" : "opencode-events.ndjson",
  )

  if (content === null) {
    sendJson(res, 400, { error: "Invalid project path" })
    return true
  }

  sendJson(res, 200, { project, kind, content })
  return true
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1))
  const baseDir = requestedPath === "README.md" ? ROOT : PUBLIC_DIR
  const file = safeJoin(baseDir, requestedPath)

  if (!file) {
    res.writeHead(400)
    res.end("Invalid path")
    return
  }

  try {
    const info = await stat(file)
    if (!info.isFile()) throw new Error("Not a file")

    res.writeHead(200, {
      "content-type": contentTypes.get(extname(file)) ?? "application/octet-stream",
      "cache-control": "no-store",
    })
    createReadStream(file).pipe(res)
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    res.end("Not found")
  }
}

createServer(async (req, res) => {
  let url
  try {
    url = new URL(req.url ?? "/", `http://${req.headers.host}`)
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" })
    res.end("Invalid URL")
    return
  }

  if (url.pathname.startsWith("/api/") && (await handleApi(req, res, url))) return
  await serveStatic(req, res, url)
}).listen(PORT, HOST, () => {
  console.log(`opencode Subagent Lab UI: http://${HOST}:${PORT}`)
})
