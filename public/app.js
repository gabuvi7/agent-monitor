const REFRESH_INTERVAL_MS = 2_500

const state = {
  project: null,
  kind: "timeline",
  content: "",
  projects: [],
  activeRuns: [],
  recentRuns: [],
  selectedRunKey: null,
}

const els = {
  projectList: document.querySelector("#project-list"),
  refreshProjects: document.querySelector("#refresh-projects"),
  refreshLogs: document.querySelector("#refresh-logs"),
  selectedProject: document.querySelector("#selected-project"),
  autoRefresh: document.querySelector("#auto-refresh"),
  filterInput: document.querySelector("#filter-input"),
  logOutput: document.querySelector("#log-output code"),
  status: document.querySelector("#status"),
  summaryActive: document.querySelector("#summary-active"),
  summaryRecent: document.querySelector("#summary-recent"),
  summaryUpdated: document.querySelector("#summary-updated"),
  activeRuns: document.querySelector("#active-runs"),
  recentRuns: document.querySelector("#recent-runs"),
  activeCount: document.querySelector("#active-count"),
  recentCount: document.querySelector("#recent-count"),
  runDetail: document.querySelector("#run-detail"),
  clearDetail: document.querySelector("#clear-detail"),
  tabs: [...document.querySelectorAll("[data-kind]")],
}

function setStatus(message) {
  els.status.textContent = message
}

function valueOrUnavailable(value) {
  return value === null || value === undefined || value === "" ? "No disponible" : String(value)
}

function compactText(value, max = 96) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
  if (!text) return "Sin acción registrada"
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

function modelLabel(run) {
  if (run?.modelAvailable === false || run?.modelUnavailableReason === "unavailable_from_hook_payload") {
    return "No disponible en payload del hook"
  }
  return valueOrUnavailable(run?.model)
}

function provenanceLabel(run) {
  return {
    direct: "Directo",
    inferred: "Inferido",
    unavailable: "No disponible",
  }[run?.modelProvenance] ?? "No disponible"
}

function modelReasonLabel(run) {
  if (run?.modelInferenceReason) return run.modelInferenceReason
  if (run?.modelUnavailableReason) return run.modelUnavailableReason
  return null
}

function confidenceLabel(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : null
}

function truncateText(value, max = 1_200) {
  const text = String(value ?? "")
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n… truncado ${text.length - max} caracteres`
}

function formatDate(value) {
  if (!value) return "sin fecha"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "fecha inválida"

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date)
}

function formatDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "duración desconocida"
  if (ms < 1_000) return `${Math.round(ms)} ms`

  const totalSeconds = Math.round(ms / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds} s`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return hours === 0 ? `${minutes} min ${seconds} s` : `${hours} h ${remainingMinutes} min`
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

function appendText(parent, tagName, text, className) {
  const element = document.createElement(tagName)
  if (className) element.className = className
  element.textContent = text
  parent.append(element)
  return element
}

function createStatusChip(run) {
  const chip = document.createElement("span")
  chip.className = `status-chip status-${run.status}`
  chip.textContent = statusLabel(run.status)
  return chip
}

function statusLabel(status) {
  return {
    running: "En ejecución",
    completed: "Completado",
    failed: "Falló",
    cancelled: "Cancelado",
    timeout: "Timeout",
    unknown: "Desconocido",
  }[status] ?? "Desconocido"
}

function renderProjects() {
  els.projectList.replaceChildren()

  if (state.projects.length === 0) {
    appendText(els.projectList, "li", "Todavía no hay logs. Abrí opencode en algún proyecto y delegá una tarea.", "hint")
    return
  }

  for (const project of state.projects) {
    const item = document.createElement("li")
    const button = document.createElement("button")

    button.type = "button"
    button.className = "project-button"
    button.dataset.project = project.name
    button.setAttribute("aria-current", project.name === state.project ? "page" : "false")
    button.textContent = project.name
    appendText(button, "span", `Última actividad: ${formatDate(project.updatedAt)}`, "project-meta")

    button.addEventListener("click", () => selectProject(project.name))
    item.append(button)
    els.projectList.append(item)
  }
}

function renderLog() {
  const query = els.filterInput.value.trim().toLowerCase()
  const blocks = formatDebugBlocks(state.kind, state.content)
  const filtered = query ? blocks.filter((block) => block.toLowerCase().includes(query)) : blocks

  els.logOutput.textContent = filtered.join("\n\n---\n\n") || "No hay contenido para mostrar."
}

function formatModelValue(model) {
  if (!model || typeof model !== "object") return null
  return model.providerID && (model.modelID || model.id)
    ? `${model.providerID}/${model.modelID ?? model.id}`
    : model.modelID ?? model.id ?? null
}

function summarizeEventEntry(entry, index) {
  const event = entry?.payload?.raw?.event ?? entry?.event ?? entry
  const props = event?.properties ?? {}
  const part = props.part ?? {}
  const state = part.state ?? {}
  const metadata = state.metadata ?? entry?.payload?.output?.metadata ?? {}
  const fields = [
    `#${index + 1}`,
    entry?.ts,
    entry?.kind,
    event?.type,
    event?.id,
    part.tool ? `tool=${part.tool}` : null,
    part.callID ? `call=${part.callID}` : null,
    state.status ? `status=${state.status}` : null,
    props.sessionID ? `session=${props.sessionID}` : null,
    metadata.sessionId ? `child=${metadata.sessionId}` : null,
    metadata.parentSessionId ? `parent=${metadata.parentSessionId}` : null,
    formatModelValue(metadata.model) ? `model=${formatModelValue(metadata.model)}` : null,
    state.title ? `title=${state.title}` : null,
  ].filter(Boolean)

  return `${fields.join(" | ")}\n${truncateText(JSON.stringify(entry, null, 2), 1_600)}`
}

function parseTimelineBlocks(content) {
  const blocks = []
  let current = []

  for (const line of String(content ?? "").split(/\r?\n/)) {
    if (/^- \d{4}-\d{2}-\d{2}T/.test(line) && current.length > 0) {
      blocks.push(current.join("\n").trimEnd())
      current = []
    }
    if (line || current.length > 0) current.push(line)
  }

  if (current.length > 0) blocks.push(current.join("\n").trimEnd())
  return blocks.filter((block) => block.trim())
}

function parseEventBlocks(content) {
  return String(content ?? "")
    .split(/\n(?=\{)/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line, index) => {
      try {
        return [summarizeEventEntry(JSON.parse(line), index)]
      } catch {
        return [`#${index + 1} | NDJSON inválido\n${truncateText(line, 1_600)}`]
      }
    })
}

function parseFallbackBlocks(content) {
  return String(content ?? "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
}

function formatDebugBlocks(kind, content) {
  const blocks = kind === "events"
    ? parseEventBlocks(content)
    : kind === "timeline"
      ? parseTimelineBlocks(content)
      : parseFallbackBlocks(content)

  return blocks.reverse()
}

function formatDebugContent(kind, content) {
  return formatDebugBlocks(kind, content).join("\n\n---\n\n")
}

function runTitle(run) {
  return valueOrUnavailable(run.agent)
}

function runSummary(run) {
  const summary = run.actionSummary && run.actionSummary !== "Unavailable" ? run.actionSummary : run.action
  return compactText(summary)
}

function sessionLabel(run) {
  if (run.childSessionId) return `Hija: ${run.childSessionId}`
  if (run.parentSessionId) return `Padre: ${run.parentSessionId}`
  if (run.delegationId) return `Delegación: ${run.delegationId}`
  return "Sesión: No disponible"
}

function createRunCard(run) {
  const item = document.createElement("li")
  const button = document.createElement("button")
  const header = document.createElement("span")
  const summary = document.createElement("span")
  const meta = document.createElement("span")

  button.type = "button"
  button.className = "run-card"
  button.dataset.key = run.key
  button.setAttribute("aria-current", run.key === state.selectedRunKey ? "true" : "false")

  header.className = "run-card-header"
  header.append(createStatusChip(run))
  appendText(header, "strong", runTitle(run), "run-title")

  summary.className = "run-summary"
  summary.textContent = runSummary(run)

  meta.className = "run-card-meta"
  appendText(meta, "span", `Modelo: ${modelLabel(run)}`)
  appendText(meta, "span", `Origen del modelo: ${provenanceLabel(run)}`)
  appendText(meta, "span", `Duración: ${formatDuration(run.durationMs)}`)
  appendText(meta, "span", sessionLabel(run))
  appendText(meta, "span", `Actualizado: ${formatDate(run.updatedAt)}`)

  button.append(header, summary, meta)
  button.addEventListener("click", () => selectRun(run.key))
  item.append(button)
  return item
}

function renderRunList(listElement, runs, emptyMessage) {
  listElement.replaceChildren()
  if (runs.length === 0) {
    appendText(listElement, "li", emptyMessage, "empty-state")
    return
  }

  for (const run of runs) {
    listElement.append(createRunCard(run))
  }
}

function renderRuns() {
  renderRunList(els.activeRuns, state.activeRuns, "No hay subagentes activos ahora.")
  renderRunList(els.recentRuns, state.recentRuns, "No hay ejecuciones recientes para mostrar.")

  els.activeCount.textContent = String(state.activeRuns.length)
  els.recentCount.textContent = String(state.recentRuns.length)
  els.summaryActive.textContent = String(state.activeRuns.length)
  els.summaryRecent.textContent = String(state.recentRuns.length)
  els.summaryUpdated.textContent = new Date().toLocaleTimeString("es-AR")
}

function createDetailRow(term, value) {
  const wrapper = document.createElement("div")
  appendText(wrapper, "dt", term)
  appendText(wrapper, "dd", valueOrUnavailable(value))
  return wrapper
}

function createCopyButton(label, value) {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "copy-button"
  button.textContent = label
  button.disabled = !value
  button.addEventListener("click", async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setStatus(`${label} copiado`)
    } catch {
      setStatus("No pude copiar al portapapeles")
    }
  })
  return button
}

function createFullTextSection(title, value, copyLabel) {
  const section = document.createElement("section")
  const header = document.createElement("div")
  const text = value && value !== "Unavailable" ? String(value) : "No disponible"

  section.className = "detail-text-section"
  header.className = "detail-subheading"
  appendText(header, "h4", title)
  header.append(createCopyButton(copyLabel, text === "No disponible" ? null : text))

  const content = document.createElement("pre")
  content.className = "detail-full-text"
  content.textContent = text

  section.append(header, content)
  return section
}

function formatUsage(usage) {
  if (!usage || typeof usage !== "object") return "No disponible"
  const parts = []
  if (usage.inputTokens !== undefined) parts.push(`input: ${usage.inputTokens}`)
  if (usage.outputTokens !== undefined) parts.push(`output: ${usage.outputTokens}`)
  if (usage.contextPercent !== undefined) parts.push(`contexto: ${usage.contextPercent}%`)
  return parts.length ? parts.join(" · ") : "No disponible"
}

function renderDetail(run) {
  els.runDetail.replaceChildren()
  els.runDetail.className = "detail-card"

  const heading = document.createElement("div")
  heading.className = "detail-heading"
  heading.append(createStatusChip(run))
  appendText(heading, "strong", runTitle(run), "detail-title")

  const definitionList = document.createElement("dl")
  definitionList.className = "detail-grid"
  definitionList.append(
    createDetailRow("Fuente", run.source),
    createDetailRow("Modelo", modelLabel(run)),
    createDetailRow("Origen del modelo", provenanceLabel(run)),
    createDetailRow("Motivo del modelo", modelReasonLabel(run)),
    createDetailRow("Confianza", confidenceLabel(run.modelConfidence)),
    createDetailRow("Duración", formatDuration(run.durationMs)),
    createDetailRow("Inicio", formatDate(run.startedAt)),
    createDetailRow("Última actualización", formatDate(run.updatedAt)),
    createDetailRow("Fin", run.completedAt ? formatDate(run.completedAt) : null),
    createDetailRow("Delegación", run.delegationId),
    createDetailRow("Sesión padre", run.parentSessionId),
    createDetailRow("Sesión hija", run.childSessionId),
    createDetailRow("Uso", formatUsage(run.usage)),
    createDetailRow("Resultado", run.outcome),
    createDetailRow("Error", run.error),
  )

  const actions = document.createElement("div")
  actions.className = "detail-actions"
  actions.append(
    createCopyButton("Copiar delegación", run.delegationId),
    createCopyButton("Copiar sesión padre", run.parentSessionId),
    createCopyButton("Copiar sesión hija", run.childSessionId),
    createCopyButton("Copiar acción", run.action && run.action !== "Unavailable" ? run.action : null),
  )

  const fullAction = createFullTextSection("Acción / prompt completo", run.action, "Copiar texto")

  const debugHint = document.createElement("p")
  debugHint.className = "hint"
  debugHint.textContent = "Usá el panel de debug crudo para revisar timeline o eventos relacionados; filtrá por sesión o delegación."

  els.runDetail.append(heading, definitionList, actions, fullAction, debugHint)
}

function clearDetail() {
  state.selectedRunKey = null
  els.runDetail.className = "detail-card empty-state"
  els.runDetail.textContent = "Seleccioná una ejecución para ver el detalle."
  renderRuns()
}

async function loadProjects({ announce = true } = {}) {
  try {
    const data = await fetchJson("/api/projects")
    state.projects = data.projects
    renderProjects()

    if (!state.project && state.projects[0]) {
      await selectProject(state.projects[0].name)
      return
    }

    if (announce) setStatus(`Proyectos actualizados: ${state.projects.length}`)
  } catch (error) {
    setStatus(`No pude cargar proyectos: ${error.message}`)
  }
}

async function selectProject(project) {
  state.project = project
  state.selectedRunKey = null
  els.selectedProject.textContent = `Proyecto seleccionado: ${project}`
  clearDetail()
  renderProjects()
  await loadMonitor()
}

async function loadMonitor({ announce = true } = {}) {
  if (!state.project) return

  try {
    const encodedProject = encodeURIComponent(state.project)
    const [active, recent, debug] = await Promise.all([
      fetchJson(`/api/projects/${encodedProject}/runs?status=active&limit=50`),
      fetchJson(`/api/projects/${encodedProject}/runs?status=recent&limit=50`),
      fetchJson(`/api/projects/${encodedProject}/${state.kind}`),
    ])

    state.activeRuns = active.runs
    state.recentRuns = recent.runs
    state.content = debug.content
    renderRuns()
    renderLog()

    if (state.selectedRunKey) await loadRunDetail(state.selectedRunKey, { announce: false })
    if (announce) setStatus(`Actualizado: ${new Date().toLocaleTimeString("es-AR")}`)
  } catch (error) {
    setStatus(`No pude cargar el monitor: ${error.message}`)
  }
}

async function selectRun(key) {
  state.selectedRunKey = key
  renderRuns()
  await loadRunDetail(key, { announce: true })
}

async function loadRunDetail(key, { announce }) {
  if (!state.project) return

  try {
    const data = await fetchJson(`/api/projects/${encodeURIComponent(state.project)}/runs/${encodeURIComponent(key)}`)
    renderDetail(data.run)
    if (announce) setStatus("Detalle actualizado")
  } catch (error) {
    els.runDetail.className = "detail-card empty-state"
    els.runDetail.textContent = `No pude cargar el detalle: ${error.message}`
  }
}

function selectTab(kind) {
  state.kind = kind
  for (const tab of els.tabs) {
    tab.setAttribute("aria-pressed", String(tab.dataset.kind === kind))
  }
  loadMonitor()
}

els.refreshProjects.addEventListener("click", () => loadProjects())
els.refreshLogs.addEventListener("click", () => loadMonitor())
els.filterInput.addEventListener("input", renderLog)
els.clearDetail.addEventListener("click", clearDetail)

for (const tab of els.tabs) {
  tab.addEventListener("click", () => selectTab(tab.dataset.kind))
}

setInterval(() => {
  if (els.autoRefresh.checked) {
    loadProjects({ announce: false })
    loadMonitor({ announce: false })
  }
}, REFRESH_INTERVAL_MS)

loadProjects()
