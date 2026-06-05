import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join, normalize, relative } from "node:path"

const ACTIVE_STATUSES = new Set(["running"])
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "timeout"])
const STALE_STATUSES = new Set(["stale"])
const KNOWN_STATUSES = new Set([...ACTIVE_STATUSES, ...TERMINAL_STATUSES, ...STALE_STATUSES, "unknown"])
const MODEL_INFERENCE_WINDOW_MS = 5 * 60 * 1_000
const RUN_RECONCILIATION_WINDOW_MS = 5_000
const STALE_AMBIGUOUS_DELEGATE_MS = 30 * 60 * 1_000

export function safeJoin(base, path) {
  const target = normalize(join(base, path))
  const inside = relative(base, target)
  if (inside.startsWith("..") || inside === "..") return null
  return target
}

export async function readProjectLog(logRoot, project, fileName) {
  const projectDir = safeJoin(logRoot, project)
  if (!projectDir) return null

  const file = safeJoin(projectDir, fileName)
  if (!file) return null

  try {
    return await readFile(file, "utf8")
  } catch {
    return ""
  }
}

export function parseRunRecords(content) {
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

export function parseEventRecords(content) {
  if (content === null) return null
  if (!content.trim()) return []

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const record = JSON.parse(line)
        return record && typeof record === "object" ? [record] : []
      } catch {
        return []
      }
    })
}

export async function readProjectRuns(logRoot, project) {
  return parseRunRecords(await readProjectLog(logRoot, project, "subagent-runs.ndjson"))
}

export async function readProjectEvents(logRoot, project) {
  return parseEventRecords(await readProjectLog(logRoot, project, "opencode-events.ndjson"))
}

function knownString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function displayLabel(value, fallback = "Unknown") {
  return knownString(value) ?? fallback
}

function firstKnownString(...values) {
  for (const value of values) {
    const text = knownString(value)
    if (text) return text
  }
  return null
}

function modelName(...values) {
  for (const value of values) {
    const model = firstKnownString(
      value?.providerID && value?.modelID ? `${value.providerID}/${value.modelID}` : null,
      value?.providerID && value?.id ? `${value.providerID}/${value.id}` : null,
      value?.model?.providerID && value?.model?.modelID ? `${value.model.providerID}/${value.model.modelID}` : null,
      value?.model?.providerID && value?.model?.id ? `${value.model.providerID}/${value.model.id}` : null,
      value?.metadata?.model?.providerID && value?.metadata?.model?.modelID ? `${value.metadata.model.providerID}/${value.metadata.model.modelID}` : null,
      value?.metadata?.model?.providerID && value?.metadata?.model?.id ? `${value.metadata.model.providerID}/${value.metadata.model.id}` : null,
      value?.state?.metadata?.model?.providerID && value?.state?.metadata?.model?.modelID ? `${value.state.metadata.model.providerID}/${value.state.metadata.model.modelID}` : null,
      value?.state?.metadata?.model?.providerID && value?.state?.metadata?.model?.id ? `${value.state.metadata.model.providerID}/${value.state.metadata.model.id}` : null,
      value?.providerID && value?.model ? `${value.providerID}/${value.model}` : null,
      value?.providerID && value?.modelId ? `${value.providerID}/${value.modelId}` : null,
      value?.providerID && value?.modelID ? `${value.providerID}/${value.modelID}` : null,
      value?.providerID && value?.id ? `${value.providerID}/${value.id}` : null,
      value?.providerID && value?.api?.id ? `${value.providerID}/${value.api.id}` : null,
      value?.modelID,
      value?.modelId,
      value?.model,
      value?.id,
      value?.params?.model,
    )
    if (model && model !== "[object Object]") return model
  }
  return null
}

function timestampMs(value) {
  const ms = Date.parse(value ?? "")
  return Number.isFinite(ms) ? ms : null
}

function timeValueMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
    return timestampMs(value)
  }
  return null
}

function eventTimestampMs(event) {
  return timestampMs(event?.ts)
    ?? timeValueMs(event?.payload?.raw?.event?.properties?.time)
    ?? timeValueMs(event?.payload?.raw?.event?.properties?.info?.time?.updated)
    ?? timeValueMs(event?.payload?.raw?.event?.properties?.info?.time?.created)
    ?? timeValueMs(event?.payload?.output?.message?.time?.created)
    ?? timeValueMs(event?.payload?.input?.time?.created)
}

function eventSessionId(event) {
  const payload = event?.payload
  const rawEvent = payload?.raw?.event
  return firstKnownString(
    rawEvent?.properties?.part?.state?.metadata?.sessionId,
    rawEvent?.properties?.part?.state?.metadata?.sessionID,
    rawEvent?.properties?.part?.state?.metadata?.childSessionId,
    rawEvent?.properties?.part?.state?.metadata?.childSessionID,
    rawEvent?.properties?.sessionID,
    rawEvent?.properties?.sessionId,
    rawEvent?.properties?.info?.sessionID,
    rawEvent?.properties?.info?.sessionId,
    rawEvent?.properties?.info?.id,
    rawEvent?.properties?.part?.sessionID,
    rawEvent?.properties?.part?.sessionId,
    payload?.input?.sessionID,
    payload?.input?.sessionId,
    payload?.output?.message?.sessionID,
    payload?.output?.message?.sessionId,
    payload?.output?.sessionID,
    payload?.output?.sessionId,
  )
}

function eventAgent(event) {
  const payload = event?.payload
  const rawEvent = payload?.raw?.event
  return firstKnownString(payload?.agent, payload?.input?.agent, payload?.output?.message?.agent, rawEvent?.properties?.info?.agent, rawEvent?.properties?.info?.mode)
}

function eventTitle(event) {
  const payload = event?.payload
  const rawEvent = payload?.raw?.event
  return firstKnownString(
    rawEvent?.properties?.part?.state?.title,
    rawEvent?.properties?.part?.state?.input?.description,
    rawEvent?.properties?.part?.state?.input?.prompt,
    rawEvent?.properties?.part?.state?.input?.message,
    rawEvent?.properties?.info?.title,
    rawEvent?.properties?.part?.text,
    payload?.output?.args?.description,
    payload?.input?.args?.description,
    payload?.input?.title,
    payload?.input?.description,
    payload?.input?.message,
    payload?.output?.message?.title,
    payload?.output?.message?.content,
  )
}

function eventModel(event) {
  const payload = event?.payload
  const rawEvent = payload?.raw?.event
  const info = rawEvent?.properties?.info
  return modelName(payload, payload?.model, payload?.input, payload?.input?.model, payload?.output, payload?.output?.model, payload?.output?.message, payload?.output?.message?.model, rawEvent?.properties, info, info?.model, rawEvent?.properties?.part, rawEvent?.properties?.part?.state?.metadata, rawEvent?.properties?.part?.state?.metadata?.model, rawEvent?.properties?.part?.model)
}

function modelEventCandidates(events) {
  return events
    .map((event) => ({
      sessionId: eventSessionId(event),
      model: eventModel(event),
      agent: eventAgent(event),
      title: eventTitle(event),
      timeMs: eventTimestampMs(event),
      kind: knownString(event?.kind),
      eventType: knownString(event?.payload?.raw?.event?.type ?? event?.payload?.summary?.type),
    }))
    .filter((candidate) => candidate.model)
}

function uniqueModels(candidates) {
  return [...new Set(candidates.map((candidate) => candidate.model).filter(Boolean))]
}

function chooseModel(candidates, reason, confidence) {
  if (candidates.length === 0) return null
  const models = uniqueModels(candidates)
  if (models.length !== 1) return { model: null, provenance: "unavailable", unavailableReason: `ambiguous_${reason}`, inferenceReason: null, confidence: null }
  return { model: models[0], provenance: "inferred", unavailableReason: null, inferenceReason: reason, confidence }
}

function chooseBestScoredModel(scoredCandidates, reason, confidence) {
  const eligible = scoredCandidates.filter((candidate) => candidate.score >= 0.35).sort((a, b) => b.score - a.score)
  if (eligible.length === 0) return null

  const topScore = eligible[0].score
  const topModels = uniqueModels(eligible.filter((candidate) => topScore - candidate.score <= 0.05))
  if (topModels.length !== 1) return { model: null, provenance: "unavailable", unavailableReason: `ambiguous_${reason}`, inferenceReason: null, confidence: null }
  return { model: topModels[0], provenance: "inferred", unavailableReason: null, inferenceReason: reason, confidence }
}

function normalizedWords(value) {
  return new Set(String(value ?? "").toLowerCase().split(/[^a-z0-9._-]+/).filter((word) => word.length >= 4))
}

function textSimilarity(a, b) {
  const left = normalizedWords(a)
  const right = normalizedWords(b)
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / Math.max(left.size, right.size)
}

function actionSummary(value) {
  const text = displayLabel(value, "Unavailable").replace(/\s+/g, " ").trim()
  return text.length <= 160 ? text : `${text.slice(0, 157)}…`
}

function directModelMetadata(record) {
  const model = knownString(record.model)
  if (!model) return null
  return {
    model,
    provenance: knownString(record.modelProvenance) ?? "direct",
    unavailableReason: null,
    inferenceReason: knownString(record.modelInferenceReason),
    confidence: typeof record.modelConfidence === "number" && Number.isFinite(record.modelConfidence) ? record.modelConfidence : 1,
  }
}

function unavailableModelMetadata(reason = "unavailable_from_hook_payload") {
  return { model: null, provenance: "unavailable", unavailableReason: reason, inferenceReason: null, confidence: null }
}

function inferModelMetadata(record, candidates) {
  const direct = directModelMetadata(record)
  if (direct) return direct

  const childSessionId = knownString(record.childSessionId)
  const parentSessionId = knownString(record.parentSessionId)
  const source = knownString(record.source)

  if (childSessionId) {
    const match = chooseModel(candidates.filter((candidate) => candidate.sessionId === childSessionId), "exact_child_session", 0.95)
    if (match) return match
  }

  if (parentSessionId && source !== "background.delegate") {
    const match = chooseModel(candidates.filter((candidate) => candidate.sessionId === parentSessionId), "exact_parent_session", 0.8)
    if (match?.provenance === "inferred") return match
  }

  if (source === "background.delegate") return unavailableModelMetadata("background_delegate_without_explicit_session_linkage")

  const started = timestampMs(record.startedAt)
  const action = knownString(record.action)
  const agent = knownString(record.agent)
  if (started !== null && (action || agent)) {
    const nearby = candidates.flatMap((candidate) => {
      if (candidate.timeMs === null || Math.abs(candidate.timeMs - started) > MODEL_INFERENCE_WINDOW_MS) return []
      const similarity = action ? textSimilarity(action, candidate.title) : 0
      const agentBonus = agent && candidate.agent === agent ? 0.25 : 0
      const proximityBonus = 0.1 * (1 - (Math.abs(candidate.timeMs - started) / MODEL_INFERENCE_WINDOW_MS))
      const score = similarity + agentBonus + proximityBonus
      return score >= 0.35 ? [{ ...candidate, score }] : []
    })
    const match = chooseBestScoredModel(nearby, "nearby_agent_or_action_match", 0.55)
    if (match) return match
  }

  return unavailableModelMetadata()
}

function normalizeStatus(value) {
  const status = knownString(value)?.toLowerCase()
  if (status === "complete") return "completed"
  if (status && KNOWN_STATUSES.has(status)) return status
  return "unknown"
}

function isAmbiguousBackgroundDelegate(record) {
  return knownString(record.source) === "background.delegate" && !knownString(record.delegationId) && !knownString(record.childSessionId)
}

function staleAmbiguousDelegateReason(record, nowMs = Date.now()) {
  if (normalizeStatus(record.status) !== "running") return null
  if (!isAmbiguousBackgroundDelegate(record)) return null
  const updated = timestampMs(record.updatedAt) ?? timestampMs(record.startedAt)
  if (updated === null) return null
  return nowMs - updated >= STALE_AMBIGUOUS_DELEGATE_MS ? "stale_ambiguous_background_delegate_without_updates" : null
}

function durationMs(record, nowMs = Date.now()) {
  if (typeof record.durationMs === "number" && Number.isFinite(record.durationMs)) return Math.max(0, Math.round(record.durationMs))
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
  return knownString(record.delegationId) ?? knownString(record.childSessionId) ?? [knownString(record.source) ?? "unknown-source", knownString(record.parentSessionId) ?? "unknown-parent", knownString(record.parentMessageId) ?? "unknown-message", knownString(record.action) ?? "unknown-action", knownString(record.startedAt) ?? "unknown-start"].join("|")
}

function normalizedMatchText(value) {
  return knownString(value)?.replace(/\s+/g, " ").trim().toLowerCase() ?? null
}

function timeDistanceMs(left, right) {
  const leftMs = timestampMs(left)
  const rightMs = timestampMs(right)
  if (leftMs === null || rightMs === null) return null
  return Math.abs(leftMs - rightMs)
}

function sameLogicalNativeTaskStart(runningRecord, terminalRecord) {
  if (normalizeStatus(runningRecord.status) !== "running") return false
  if (!TERMINAL_STATUSES.has(normalizeStatus(terminalRecord.status))) return false
  if (knownString(runningRecord.source) !== "native.task") return false
  if (knownString(terminalRecord.source) !== "native.task") return false
  const parentSessionId = knownString(runningRecord.parentSessionId)
  if (!parentSessionId || parentSessionId !== knownString(terminalRecord.parentSessionId)) return false
  const runningAgent = knownString(runningRecord.agent)
  if (!runningAgent || runningAgent !== knownString(terminalRecord.agent)) return false
  const runningAction = normalizedMatchText(runningRecord.action)
  if (!runningAction || runningAction !== normalizedMatchText(terminalRecord.action)) return false
  const startDistance = timeDistanceMs(runningRecord.startedAt, terminalRecord.startedAt)
  return startDistance !== null && startDistance <= RUN_RECONCILIATION_WINDOW_MS
}

function matchingTerminalRecords(runningRecord, terminalRecords) {
  return terminalRecords.filter((terminalRecord) => sameLogicalNativeTaskStart(runningRecord, terminalRecord))
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
    modelProvenance: mergeValue(newer.modelProvenance, older.modelProvenance),
    modelUnavailableReason: mergeValue(newer.modelUnavailableReason, older.modelUnavailableReason),
    modelInferenceReason: mergeValue(newer.modelInferenceReason, older.modelInferenceReason),
    modelConfidence: mergeValue(newer.modelConfidence, older.modelConfidence),
    action: mergeValue(newer.action, older.action),
    outcome: mergeValue(newer.outcome, older.outcome),
    error: mergeValue(newer.error, older.error),
    usage: mergeValue(newer.usage, older.usage),
    raw: mergeValue(newer.raw, older.raw),
  }
}

function newestRecordPerRun(records) {
  const runs = new Map()
  for (const record of records) runs.set(runMergeKey(record), mergeRunRecord(runs.get(runMergeKey(record)), record))
  const entries = [...runs.entries()].map(([key, record]) => ({ key, record }))
  const terminalRecords = entries.map(({ record }) => record).filter((record) => TERMINAL_STATUSES.has(normalizeStatus(record.status)))
  const runningRecords = entries.map(({ record }) => record).filter((record) => normalizeStatus(record.status) === "running")
  return entries.filter(({ record }) => {
    if (normalizeStatus(record.status) !== "running") return true
    const terminalMatches = matchingTerminalRecords(record, terminalRecords)
    if (terminalMatches.length !== 1) return true
    const runningMatches = runningRecords.filter((runningRecord) => sameLogicalNativeTaskStart(runningRecord, terminalMatches[0]))
    return runningMatches.length !== 1
  })
}

function normalizeRun(key, record, modelCandidates = [], nowMs = Date.now()) {
  const staleReason = staleAmbiguousDelegateReason(record, nowMs)
  const status = staleReason ? "stale" : normalizeStatus(record.status)
  const duration = durationMs({ ...record, status }, nowMs)
  const modelMetadata = inferModelMetadata(record, modelCandidates)
  const action = displayLabel(record.action, "Unavailable")
  return {
    key,
    source: displayLabel(record.source),
    status,
    isActive: ACTIVE_STATUSES.has(status),
    isTerminal: TERMINAL_STATUSES.has(status),
    isStale: STALE_STATUSES.has(status),
    staleReason,
    projectName: displayLabel(record.projectName),
    projectRoot: knownString(record.projectRoot),
    delegationId: knownString(record.delegationId),
    parentSessionId: knownString(record.parentSessionId),
    parentMessageId: knownString(record.parentMessageId),
    childSessionId: knownString(record.childSessionId),
    agent: displayLabel(record.agent),
    model: modelMetadata.model,
    modelAvailable: Boolean(modelMetadata.model),
    modelProvenance: modelMetadata.provenance,
    modelUnavailableReason: modelMetadata.unavailableReason,
    modelInferenceReason: modelMetadata.inferenceReason,
    modelConfidence: modelMetadata.confidence,
    startedAt: knownString(record.startedAt),
    updatedAt: knownString(record.updatedAt),
    completedAt: knownString(record.completedAt),
    durationMs: duration,
    action,
    actionSummary: actionSummary(action),
    outcome: knownString(record.outcome),
    error: knownString(record.error),
    usage: record.usage && typeof record.usage === "object" ? record.usage : null,
    raw: record.raw ?? null,
  }
}

export function normalizeRuns(records, events = []) {
  const nowMs = Date.now()
  const modelCandidates = modelEventCandidates(events)
  return newestRecordPerRun(records)
    .map(({ key, record }) => normalizeRun(key, record, modelCandidates, nowMs))
    .sort((a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt))
}

export function limitValue(value) {
  const limit = Number(value ?? 50)
  if (!Number.isFinite(limit)) return 50
  return Math.min(250, Math.max(1, Math.trunc(limit)))
}

export function filterRuns(runs, status) {
  if (status === "active") return runs.filter((run) => run.isActive)
  if (status === "all") return runs
  return runs.filter((run) => run.isTerminal || run.isStale || run.status === "unknown")
}

export function matchesRunKey(run, key) {
  return [run.key, run.delegationId, run.parentSessionId, run.childSessionId].some((value) => value === key)
}

export function buildProjectSummary(project, records = [], events = []) {
  const runs = normalizeRuns(records, events)
  const activeRuns = filterRuns(runs, "active")
  const staleRuns = runs.filter((run) => run.isStale)
  const recentRuns = filterRuns(runs, "recent").filter((run) => !run.isStale)
  const latestRun = runs[0] ?? null
  const updatedAt = new Date().toISOString()

  return {
    schemaVersion: 1,
    project,
    updatedAt,
    counts: {
      active: activeRuns.length,
      recent: recentRuns.length,
      stale: staleRuns.length,
      total: runs.length,
    },
    latestRun: latestRun ? {
      key: latestRun.key,
      agent: latestRun.agent,
      status: latestRun.status,
      action: latestRun.actionSummary,
      startedAt: latestRun.startedAt,
      updatedAt: latestRun.updatedAt,
      completedAt: latestRun.completedAt,
      durationMs: latestRun.durationMs,
      delegationId: latestRun.delegationId,
      childSessionId: latestRun.childSessionId,
      model: latestRun.model,
    } : null,
  }
}

export async function generateProjectSummary(logRoot, project) {
  const [records, events] = await Promise.all([readProjectRuns(logRoot, project), readProjectEvents(logRoot, project)])
  if (records === null || events === null) return null
  return buildProjectSummary(project, records, events)
}

export async function writeProjectSummary(logRoot, project, summary) {
  const projectDir = safeJoin(logRoot, project)
  if (!projectDir) return null
  await mkdir(projectDir, { recursive: true })
  const file = join(projectDir, "agent-monitor-summary.json")
  await writeFile(file, `${JSON.stringify(summary, null, 2)}\n`, "utf8")
  return file
}

export function formatSummaryLine(summary) {
  const counts = summary?.counts ?? { active: 0, recent: 0, stale: 0 }
  const latest = summary?.latestRun
  const latestText = latest ? `${latest.agent} ${latest.status}` : "none"
  return `🤖 active:${counts.active} recent:${counts.recent} stale:${counts.stale} · last: ${latestText}`
}
