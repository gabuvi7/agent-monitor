import { createServer } from "node:http"
import { createReadStream, readFileSync } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { extname, join, normalize, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  buildProjectSummary,
  filterRuns,
  limitValue,
  matchesRunKey,
  normalizeRuns,
  parseEventRecords,
  parseRunRecords,
  writeProjectSummary,
} from "./src/monitor-summary.js"

const ROOT = fileURLToPath(new URL(".", import.meta.url))
const LOCAL_ENV = readEnvFile(join(ROOT, ".env"))
const PUBLIC_DIR = join(ROOT, "public")
const LOG_DIR = resolve(ROOT, expandHome(envValue("AGENT_MONITOR_LOG_ROOT", "./logs")))
const PORT = Number(process.env.PORT ?? 4317)
const HOST = "127.0.0.1"

function readEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=")
          const key = line.slice(0, index).trim()
          const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")
          return [key, value]
        }),
    )
  } catch {
    return {}
  }
}

function envValue(name, fallback) {
  return process.env[name] ?? LOCAL_ENV[name] ?? fallback
}

function expandHome(path) {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path
}

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
          const runs = join(LOG_DIR, entry.name, "subagent-runs.ndjson")
          const [timelineStat, eventsStat, runsStat] = await Promise.allSettled([stat(timeline), stat(events), stat(runs)])

          const updatedAt = [timelineStat, eventsStat, runsStat]
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

async function readProjectRuns(project) {
  const content = await readProjectLog(project, "subagent-runs.ndjson")
  return parseRunRecords(content)
}

async function readProjectEvents(project) {
  const content = await readProjectLog(project, "opencode-events.ndjson")
  return parseEventRecords(content)
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/projects") {
    sendJson(res, 200, { projects: await listProjects() })
    return true
  }

  const summaryMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/summary$/)
  if (summaryMatch) {
    const project = decodeURIComponent(summaryMatch[1])
    const [records, events] = await Promise.all([
      readProjectRuns(project),
      readProjectEvents(project),
    ])

    if (records === null || events === null) {
      sendJson(res, 400, { error: "Invalid project path" })
      return true
    }

    const summary = buildProjectSummary(project, records, events)
    if (url.searchParams.get("write") === "1") {
      const file = await writeProjectSummary(LOG_DIR, project, summary)
      sendJson(res, 200, { project, summary, file })
      return true
    }

    sendJson(res, 200, { project, summary })
    return true
  }

  const runsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/runs(?:\/([^/]+))?$/)
  if (runsMatch) {
    const project = decodeURIComponent(runsMatch[1])
    const lookupKey = runsMatch[2] ? decodeURIComponent(runsMatch[2]) : null
    const [records, events] = await Promise.all([
      readProjectRuns(project),
      readProjectEvents(project),
    ])

    if (records === null || events === null) {
      sendJson(res, 400, { error: "Invalid project path" })
      return true
    }

    const runs = normalizeRuns(records, events)
    if (lookupKey) {
      const run = runs.find((candidate) => matchesRunKey(candidate, lookupKey))
      sendJson(res, run ? 200 : 404, run ? { project, run } : { project, error: "Run not found" })
      return true
    }

    const status = url.searchParams.get("status") ?? "recent"
    if (!["active", "recent", "all"].includes(status)) {
      sendJson(res, 400, { error: "Invalid status filter" })
      return true
    }

    sendJson(res, 200, {
      project,
      status,
      runs: filterRuns(runs, status).slice(0, limitValue(url.searchParams.get("limit"))),
    })
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
  console.log(`Agent Monitor UI: http://${HOST}:${PORT}`)
})
