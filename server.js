import { createServer } from "node:http"
import { createReadStream, readFileSync } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { extname, join, normalize, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL(".", import.meta.url))
const LOCAL_ENV = readEnvFile(join(ROOT, ".env"))
const PUBLIC_DIR = join(ROOT, "public")
const LOG_DIR = resolve(ROOT, expandHome(envValue("AGENT_MONITOR_LOG_ROOT", "./logs")))
const PORT = Number(process.env.PORT ?? 4317)
const HOST = "127.0.0.1"
const ACTIVE_STATUSES = new Set(["running"])
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "timeout"])
const KNOWN_STATUSES = new Set([...ACTIVE_STATUSES, ...TERMINAL_STATUSES, "unknown"])

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
  if (content === null) return null
  if (!content.trim()) return []

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const record = JSON.parse(line)
        return record?.recordKind === "subagent.run" ? [record] : []
      } catch {
        return []
      }
    })
}

function knownString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function displayLabel(value, fallback = "Unknown") {
  return knownString(value) ?? fallback
}

function timestampMs(value) {
  const ms = Date.parse(value ?? "")
  return Number.isFinite(ms) ? ms : null
}

function normalizeStatus(value) {
  const status = knownString(value)?.toLowerCase()
  if (status === "complete") return "completed"
  if (status && KNOWN_STATUSES.has(status)) return status
  return "unknown"
}

function durationMs(record, nowMs = Date.now()) {
  if (typeof record.durationMs === "number" && Number.isFinite(record.durationMs)) {
    return Math.max(0, Math.round(record.durationMs))
  }

  const started = timestampMs(record.startedAt)
  if (started === null) return null

  const completed = timestampMs(record.completedAt)
  const status = normalizeStatus(record.status)
  const ended = completed ?? (ACTIVE_STATUSES.has(status) ? nowMs : timestampMs(record.updatedAt))

  return ended === null ? null : Math.max(0, Math.round(ended - started))
}

function updatedTime(record) {
  return timestampMs(record.updatedAt) ?? timestampMs(record.completedAt) ?? timestampMs(record.startedAt) ?? 0
}

function runMergeKey(record) {
  return knownString(record.delegationId)
    ?? knownString(record.childSessionId)
    ?? [
      knownString(record.source) ?? "unknown-source",
      knownString(record.parentSessionId) ?? "unknown-parent",
      knownString(record.parentMessageId) ?? "unknown-message",
      knownString(record.action) ?? "unknown-action",
      knownString(record.startedAt) ?? "unknown-start",
    ].join("|")
}

function mergeValue(previous, next) {
  if (next !== undefined && next !== null && next !== "") return next
  return previous ?? null
}

function mergeRunRecord(previous, next) {
  if (!previous) return { ...next }

  const newer = updatedTime(next) >= updatedTime(previous) ? next : previous
  const older = newer === next ? previous : next

  return {
    ...older,
    ...newer,
    source: mergeValue(newer.source, older.source),
    projectName: mergeValue(newer.projectName, older.projectName),
    projectRoot: mergeValue(newer.projectRoot, older.projectRoot),
    delegationId: mergeValue(newer.delegationId, older.delegationId),
    parentSessionId: mergeValue(newer.parentSessionId, older.parentSessionId),
    parentMessageId: mergeValue(newer.parentMessageId, older.parentMessageId),
    childSessionId: mergeValue(newer.childSessionId, older.childSessionId),
    agent: mergeValue(newer.agent, older.agent),
    model: mergeValue(newer.model, older.model),
    action: mergeValue(newer.action, older.action),
    outcome: mergeValue(newer.outcome, older.outcome),
    error: mergeValue(newer.error, older.error),
    usage: mergeValue(newer.usage, older.usage),
    raw: mergeValue(newer.raw, older.raw),
  }
}

function newestRecordPerRun(records) {
  const runs = new Map()
  for (const record of records) {
    const key = runMergeKey(record)
    runs.set(key, mergeRunRecord(runs.get(key), record))
  }
  return [...runs.entries()].map(([key, record]) => ({ key, record }))
}

function normalizeRun(key, record, nowMs = Date.now()) {
  const status = normalizeStatus(record.status)
  const duration = durationMs({ ...record, status }, nowMs)

  return {
    key,
    source: displayLabel(record.source),
    status,
    isActive: ACTIVE_STATUSES.has(status),
    isTerminal: TERMINAL_STATUSES.has(status),
    projectName: displayLabel(record.projectName),
    projectRoot: knownString(record.projectRoot),
    delegationId: knownString(record.delegationId),
    parentSessionId: knownString(record.parentSessionId),
    parentMessageId: knownString(record.parentMessageId),
    childSessionId: knownString(record.childSessionId),
    agent: displayLabel(record.agent),
    model: displayLabel(record.model),
    startedAt: knownString(record.startedAt),
    updatedAt: knownString(record.updatedAt),
    completedAt: knownString(record.completedAt),
    durationMs: duration,
    action: displayLabel(record.action, "Unavailable"),
    outcome: knownString(record.outcome),
    error: knownString(record.error),
    usage: record.usage && typeof record.usage === "object" ? record.usage : null,
    raw: record.raw ?? null,
  }
}

function normalizeRuns(records) {
  const nowMs = Date.now()
  return newestRecordPerRun(records)
    .map(({ key, record }) => normalizeRun(key, record, nowMs))
    .sort((a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt))
}

function limitValue(value) {
  const limit = Number(value ?? 50)
  if (!Number.isFinite(limit)) return 50
  return Math.min(250, Math.max(1, Math.trunc(limit)))
}

function filterRuns(runs, status) {
  if (status === "active") return runs.filter((run) => run.isActive)
  if (status === "all") return runs
  return runs.filter((run) => run.isTerminal || run.status === "unknown")
}

function matchesRunKey(run, key) {
  return [run.key, run.delegationId, run.parentSessionId, run.childSessionId].some((value) => value === key)
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/projects") {
    sendJson(res, 200, { projects: await listProjects() })
    return true
  }

  const runsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/runs(?:\/([^/]+))?$/)
  if (runsMatch) {
    const project = decodeURIComponent(runsMatch[1])
    const lookupKey = runsMatch[2] ? decodeURIComponent(runsMatch[2]) : null
    const records = await readProjectRuns(project)

    if (records === null) {
      sendJson(res, 400, { error: "Invalid project path" })
      return true
    }

    const runs = normalizeRuns(records)
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
