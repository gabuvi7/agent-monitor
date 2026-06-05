#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { formatSummaryLine, generateProjectSummary, writeProjectSummary } from "../src/monitor-summary.js"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const LOCAL_ENV = readEnvFile(join(ROOT, ".env"))

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

function expandHome(path) {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path
}

function envValue(name, fallback) {
  return process.env[name] ?? LOCAL_ENV[name] ?? fallback
}

function parseArgs(argv) {
  const args = { json: false, write: true, project: null, logRoot: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--json") args.json = true
    else if (arg === "--write") args.write = true
    else if (arg === "--no-write") args.write = false
    else if (arg === "--project" || arg === "-p") args.project = argv[++index] ?? null
    else if (arg.startsWith("--project=")) args.project = arg.slice("--project=".length)
    else if (arg === "--log-root") args.logRoot = argv[++index] ?? null
    else if (arg.startsWith("--log-root=")) args.logRoot = arg.slice("--log-root=".length)
    else if (!arg.startsWith("-") && !args.project) args.project = arg
  }
  return args
}

async function latestProject(logRoot) {
  try {
    const entries = await readdir(logRoot, { withFileTypes: true })
    const projects = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const files = ["subagent-runs.ndjson", "opencode-events.ndjson", "subagent-timeline.md"]
          const mtimes = await Promise.allSettled(files.map((file) => stat(join(logRoot, entry.name, file))))
          const updatedAt = mtimes
            .filter((result) => result.status === "fulfilled")
            .map((result) => result.value.mtimeMs)
            .sort((a, b) => b - a)[0] ?? 0
          return { name: entry.name, updatedAt }
        }),
    )
    return projects.filter((project) => project.updatedAt > 0).sort((a, b) => b.updatedAt - a.updatedAt)[0]?.name ?? null
  } catch {
    return null
  }
}

const args = parseArgs(process.argv.slice(2))
const logRoot = resolve(ROOT, expandHome(args.logRoot ?? envValue("AGENT_MONITOR_LOG_ROOT", "./logs")))
const project = args.project ?? await latestProject(logRoot)

if (!project) {
  const empty = { schemaVersion: 1, project: null, updatedAt: new Date().toISOString(), counts: { active: 0, recent: 0, stale: 0, total: 0 }, latestRun: null }
  console.log(args.json ? JSON.stringify(empty) : formatSummaryLine(empty))
  process.exit(0)
}

const summary = await generateProjectSummary(logRoot, project)
if (!summary) {
  const empty = { schemaVersion: 1, project, updatedAt: new Date().toISOString(), counts: { active: 0, recent: 0, stale: 0, total: 0 }, latestRun: null }
  console.log(args.json ? JSON.stringify(empty) : formatSummaryLine(empty))
  process.exit(0)
}

if (args.write) await writeProjectSummary(logRoot, project, summary)
console.log(args.json ? JSON.stringify(summary) : formatSummaryLine(summary))
