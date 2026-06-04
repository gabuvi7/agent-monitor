import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

type JsonValue = unknown

const MAX_FIELD_LENGTH = 8_000

function now() {
  return new Date().toISOString()
}

function truncate(value: string, max = MAX_FIELD_LENGTH) {
  if (value.length <= max) return value
  return `${value.slice(0, max)}\n… truncated ${value.length - max} chars`
}

function safeJson(value: JsonValue) {
  const seen = new WeakSet<object>()

  return JSON.stringify(
    value,
    (_key, current) => {
      if (typeof current === "bigint") return current.toString()
      if (typeof current === "function") return `[Function ${current.name || "anonymous"}]`
      if (typeof current === "string") return truncate(current)
      if (current && typeof current === "object") {
        if (seen.has(current)) return "[Circular]"
        seen.add(current)
      }
      return current
    },
    2,
  )
}

function compact(value: any) {
  return {
    type: value?.type,
    name: value?.name,
    id: value?.id,
    sessionID: value?.sessionID ?? value?.sessionId,
    messageID: value?.messageID ?? value?.messageId,
    agent: value?.agent,
    tool: value?.tool,
    status: value?.status,
    path: value?.path,
    title: value?.title,
  }
}

export default (async ({ project, directory, worktree }) => {
  const projectRoot = worktree ?? (project as any)?.root ?? directory
  const logDir = join(projectRoot, "logs")
  mkdirSync(logDir, { recursive: true })

  const ndjsonPath = join(logDir, "opencode-events.ndjson")
  const mdPath = join(logDir, "subagent-timeline.md")

  function write(kind: string, payload: JsonValue) {
    const entry = { ts: now(), kind, cwd: directory, payload }
    appendFileSync(ndjsonPath, `${safeJson(entry)}\n`, "utf8")
  }

  function timeline(line: string) {
    appendFileSync(mdPath, `- ${now()} ${line}\n`, "utf8")
  }

  timeline("observer started")
  write("observer.started", { projectRoot, directory, project, worktree })

  return {
    event: async (input) => {
      const event = (input as any)?.event ?? input
      const summary = compact(event)
      write("event", { summary, raw: input })

      const rawText = safeJson(input).toLowerCase()
      if (rawText.includes("subagent") || rawText.includes("task")) {
        timeline(`event: ${safeJson(summary)}`)
      }
    },

    "tool.execute.before": async (input, output) => {
      const toolName = input?.tool ?? input?.name ?? "unknown-tool"
      write("tool.before", { input, output })
      timeline(`tool before: ${toolName}`)
    },

    "tool.execute.after": async (input, output) => {
      const toolName = input?.tool ?? input?.name ?? "unknown-tool"
      const status = (input as any)?.error || (output as any)?.error ? "error" : "ok"
      write("tool.after", { input, output })
      timeline(`tool after: ${toolName} (${status})`)
    },
  }
}) satisfies Plugin
