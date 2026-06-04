import type { Plugin } from "@opencode-ai/plugin"
import { createHash } from "node:crypto"
import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join } from "node:path"

type JsonValue = unknown

type RunStatus = "running" | "completed" | "failed" | "cancelled" | "timeout" | "unknown"

type RunSource = "native.task" | "background.delegate"


type RunUsage = {
  inputTokens?: number
  outputTokens?: number
  contextPercent?: number
}

type SubagentRunRecord = {
  schemaVersion: 1
  recordKind: "subagent.run"
  source: RunSource
  projectName: string
  projectRoot: string
  delegationId: string | null
  parentSessionId: string | null
  parentMessageId?: string | null
  childSessionId: string | null
  agent: string | null
  model?: string | null
  status: RunStatus
  startedAt: string
  updatedAt: string
  completedAt?: string | null
  durationMs?: number | null
  action?: string | null
  outcome?: string | null
  error?: string | null
  usage?: RunUsage | null
  raw?: unknown
}

const MAX_FIELD_LENGTH = 8_000
const RUNTIME_ENV_FILE = process.env.AGENT_MONITOR_RUNTIME_ENV
  ?? process.env.AGENT_MONITOR_ENV_FILE
  ?? join(homedir(), ".config/agent-monitor/.env")
const RUNTIME_ENV = readEnvFile(RUNTIME_ENV_FILE)
const CENTRAL_LOG_ROOT = expandHome(envValue("AGENT_MONITOR_LOG_ROOT", join(homedir(), ".local/share/agent-monitor/logs")))

function readEnvFile(path: string) {
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
    ) as Record<string, string>
  } catch {
    return {}
  }
}

function envValue(name: string, fallback: string) {
  return process.env[name] ?? RUNTIME_ENV[name] ?? fallback
}

function expandHome(path: string) {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path
}

function now() {
  return new Date().toISOString()
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown-project"
}

function projectLogName(projectRoot: string) {
  const name = slug(basename(projectRoot))
  const hash = createHash("sha1").update(projectRoot).digest("hex").slice(0, 8)
  return `${name}-${hash}`
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
  ) ?? "null"
}

function compactJson(value: JsonValue) {
  try {
    return JSON.stringify(JSON.parse(safeJson(value))) ?? "null"
  } catch {
    return JSON.stringify({ error: "Could not serialize value" })
  }
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

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value)
    }
  }
  return undefined
}

function timestampMs(value: string | null) {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function modelName(input: any, output?: any) {
  return firstString(
    input?.providerID && input?.modelID ? `${input.providerID}/${input.modelID}` : null,
    output?.providerID && output?.modelID ? `${output.providerID}/${output.modelID}` : null,
    output?.model,
    output?.params?.model,
    output?.modelID,
    output?.modelId,
    input?.model,
    input?.params?.model,
    input?.modelID,
    input?.modelId,
  )
}

function agentName(value: any) {
  return firstString(
    value?.agent,
    value?.agentName,
    value?.subagent_type,
    value?.subagentType,
    value?.type,
  )
}

function taskGoal(value: any) {
  return firstString(
    value?.description,
    value?.title,
    value?.command,
    value?.prompt,
    value?.message,
  )
}

function toolArgs(input: any, output: any) {
  return output?.args ?? input?.args ?? input?.parameters ?? input
}

function toolName(input: any, output?: any) {
  return firstString(input?.tool, input?.name, output?.tool, output?.name)?.toLowerCase() ?? null
}

function runSource(input: any, output?: any): RunSource | null {
  const tool = toolName(input, output)
  if (tool === "task") return "native.task"
  if (tool === "delegate") return "background.delegate"
  return null
}

function isDelegationRun(input: any, output?: any) {
  const args = toolArgs(input, output)
  return Boolean(runSource(input, output) || args?.subagent_type || args?.subagentType)
}

function extractDelegationId(input: any, output: any) {
  const text = typeof output === "string" ? output : null
  const startedMatch = text?.match(/Delegation started:\s*([a-z0-9._-]+)/i)

  return firstString(
    output?.delegationId,
    output?.delegationID,
    output?.id,
    output?.data?.delegationId,
    output?.data?.id,
    input?.delegationId,
    input?.delegationID,
    toolArgs(input, output)?.delegationId,
    toolArgs(input, output)?.id,
    startedMatch?.[1],
  )
}

function extractParentSessionId(input: any, output: any) {
  return firstString(
    input?.sessionID,
    input?.sessionId,
    input?.parentSessionID,
    input?.parentSessionId,
    output?.parentSessionID,
    output?.parentSessionId,
    toolArgs(input, output)?.parentSessionID,
    toolArgs(input, output)?.parentSessionId,
  )
}

function extractParentMessageId(input: any, output: any) {
  return firstString(
    input?.messageID,
    input?.messageId,
    input?.parentMessageID,
    input?.parentMessageId,
    output?.parentMessageID,
    output?.parentMessageId,
    toolArgs(input, output)?.parentMessageID,
    toolArgs(input, output)?.parentMessageId,
  )
}

function extractChildSessionId(input: any, output: any) {
  return firstString(
    output?.sessionID,
    output?.sessionId,
    output?.data?.sessionID,
    output?.data?.sessionId,
    toolArgs(input, output)?.childSessionID,
    toolArgs(input, output)?.childSessionId,
  )
}

function extractUsage(input: any, output: any): RunUsage | null {
  const usage = output?.usage ?? output?.data?.usage ?? input?.usage
  const context = output?.context ?? output?.data?.context ?? input?.context
  const inputTokens = numberValue(
    usage?.inputTokens,
    usage?.input_tokens,
    usage?.promptTokens,
    usage?.prompt_tokens,
  )
  const outputTokens = numberValue(
    usage?.outputTokens,
    usage?.output_tokens,
    usage?.completionTokens,
    usage?.completion_tokens,
  )
  const contextPercent = numberValue(
    usage?.contextPercent,
    usage?.context_percent,
    context?.percent,
    context?.percentage,
  )
  const record: RunUsage = {}

  if (inputTokens !== undefined) record.inputTokens = inputTokens
  if (outputTokens !== undefined) record.outputTokens = outputTokens
  if (contextPercent !== undefined) record.contextPercent = contextPercent

  return Object.keys(record).length > 0 ? record : null
}

function extractError(input: any, output: any) {
  const error = input?.error ?? output?.error
  if (!error) return null
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  return truncate(safeJson(error), 1_000)
}

function outcomeSummary(output: any) {
  if (typeof output === "string") return truncate(output.replace(/\s+/g, " ").trim(), 1_000)
  return firstString(output?.title, output?.summary, output?.message, output?.status)
}

function runAction(input: any, output: any) {
  const args = toolArgs(input, output)
  return taskGoal(args) ?? taskGoal(input) ?? taskGoal(output)
}

function createRunRecord(params: {
  input: any
  output?: any
  projectName: string
  projectRoot: string
  status: RunStatus
  startedAt: string
  updatedAt: string
  completedAt?: string | null
  raw?: unknown
}): SubagentRunRecord | null {
  const source = runSource(params.input, params.output)
  if (!source || !isDelegationRun(params.input, params.output)) return null

  const durationMs = params.completedAt
    ? (() => {
        const start = timestampMs(params.startedAt)
        const end = timestampMs(params.completedAt)
        return start !== null && end !== null ? Math.max(0, end - start) : null
      })()
    : null

  return {
    schemaVersion: 1,
    recordKind: "subagent.run",
    source,
    projectName: params.projectName,
    projectRoot: params.projectRoot,
    delegationId: extractDelegationId(params.input, params.output),
    parentSessionId: extractParentSessionId(params.input, params.output),
    parentMessageId: extractParentMessageId(params.input, params.output),
    childSessionId: extractChildSessionId(params.input, params.output),
    agent: agentName(toolArgs(params.input, params.output)) ?? agentName(params.input) ?? agentName(params.output),
    model: modelName(params.input, params.output),
    status: params.status,
    startedAt: params.startedAt,
    updatedAt: params.updatedAt,
    completedAt: params.completedAt ?? null,
    durationMs,
    action: runAction(params.input, params.output),
    outcome: params.status === "running" ? null : outcomeSummary(params.output),
    error: extractError(params.input, params.output),
    usage: extractUsage(params.input, params.output),
    raw: params.raw,
  }
}

function describeTool(input: any, output: any) {
  const tool = firstString(input?.tool, input?.name, output?.tool, output?.name) ?? "unknown-tool"
  const args = toolArgs(input, output)
  const model = modelName(input, output)
  const agent = agentName(args) ?? agentName(input) ?? agentName(output)
  const goal = taskGoal(args)
  const isDelegation = ["task", "delegate"].includes(tool) || Boolean(args?.subagent_type || args?.subagentType)

  if (isDelegation) {
    return [
      `delegation/tool: ${tool}`,
      agent ? `agent: ${agent}` : null,
      model ? `model: ${model}` : null,
      goal ? `does: ${truncate(goal, 500).replace(/\s+/g, " ")}` : null,
    ].filter(Boolean).join(" | ")
  }

  return [
    `tool: ${tool}`,
    model ? `model: ${model}` : null,
    goal ? `does: ${truncate(goal, 220).replace(/\s+/g, " ")}` : null,
  ].filter(Boolean).join(" | ")
}

export default (async ({ project, directory, worktree }) => {
  const projectRoot = worktree ?? (project as any)?.root ?? directory
  const projectName = projectLogName(projectRoot)
  const logDir = join(CENTRAL_LOG_ROOT, projectName)

  let loggingEnabled = true

  try {
    mkdirSync(logDir, { recursive: true })
  } catch {
    loggingEnabled = false
  }

  const ndjsonPath = join(logDir, "opencode-events.ndjson")
  const mdPath = join(logDir, "subagent-timeline.md")
  const runPath = join(logDir, "subagent-runs.ndjson")
  const runStarts = new Map<string, string>()

  function write(kind: string, payload: JsonValue) {
    if (!loggingEnabled) return
    const entry = { ts: now(), kind, projectName, projectRoot, cwd: directory, payload }
    try {
      appendFileSync(ndjsonPath, `${compactJson(entry)}\n`, "utf8")
    } catch {
      loggingEnabled = false
    }
  }

  function timeline(line: string) {
    if (!loggingEnabled) return
    try {
      appendFileSync(mdPath, `- ${now()} ${line}\n`, "utf8")
    } catch {
      loggingEnabled = false
    }
  }

  function runKey(input: any, output?: any) {
    return [
      toolName(input, output) ?? "unknown-tool",
      extractParentSessionId(input, output) ?? "unknown-session",
      extractParentMessageId(input, output) ?? "unknown-message",
      runAction(input, output) ?? "unknown-action",
    ].join("|")
  }

  function writeRun(record: SubagentRunRecord | null) {
    if (!loggingEnabled || !record) return
    try {
      appendFileSync(runPath, `${compactJson(record)}\n`, "utf8")
    } catch {
      loggingEnabled = false
    }
  }

  function recordModel(input: any, output: any, source: string) {
    const model = modelName(input, output)
    const agent = agentName(input) ?? agentName(output)
    if (!model && !agent) return

    timeline([
      `model context (${source})`,
      agent ? `agent: ${agent}` : null,
      model ? `model: ${model}` : null,
    ].filter(Boolean).join(" | "))
    write("model.context", { source, model, agent, input, output })
  }

  timeline(`observer started for ${projectName}`)
  write("observer.started", { projectName, projectRoot, directory, project, worktree })

  return {
    "chat.params": async (input, output) => {
      try {
        recordModel(input, output, "chat.params")
      } catch {
        // Observability must never break opencode.
      }
    },

    "chat.message": async (input, output) => {
      try {
        recordModel(input, output, "chat.message")
      } catch {
        // Observability must never break opencode.
      }
    },

    event: async (input) => {
      try {
        const event = (input as any)?.event ?? input
        const summary = compact(event)

        write("event", { summary, raw: input })

        const rawText = safeJson(input).toLowerCase()
        if (rawText.includes("subagent") || rawText.includes("task")) {
          timeline(`event: ${safeJson(summary)}`)
        }
      } catch {
        // Observability must never break opencode.
      }
    },

    "tool.execute.before": async (input, output) => {
      try {
        write("tool.before", { input, output })
        timeline(`before | ${describeTool(input, output)}`)

        if (isDelegationRun(input, output)) {
          const startedAt = now()
          runStarts.set(runKey(input, output), startedAt)
          writeRun(createRunRecord({
            input,
            output,
            projectName,
            projectRoot,
            status: "running",
            startedAt,
            updatedAt: startedAt,
            raw: { input, output },
          }))
        }
      } catch {
        // Observability must never break opencode.
      }
    },

    "tool.execute.after": async (input, output) => {
      try {
        const status = (input as any)?.error || (output as any)?.error ? "error" : "ok"
        write("tool.after", { input, output })
        timeline(`after ${status} | ${describeTool(input, output)}`)

        if (isDelegationRun(input, output)) {
          const completedAt = now()
          const key = runKey(input, output)
          const startedAt = runStarts.get(key) ?? completedAt
          const source = runSource(input, output)
          const error = extractError(input, output)
          const runStatus: RunStatus = error
            ? "failed"
            : source === "background.delegate"
              ? "running"
              : "completed"

          writeRun(createRunRecord({
            input,
            output,
            projectName,
            projectRoot,
            status: runStatus,
            startedAt,
            updatedAt: completedAt,
            completedAt: runStatus === "running" ? null : completedAt,
            raw: { input, output },
          }))

          if (runStatus !== "running") runStarts.delete(key)
        }
      } catch {
        // Observability must never break opencode.
      }
    },
  }
}) satisfies Plugin
