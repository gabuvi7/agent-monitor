const state = {
  project: null,
  kind: "timeline",
  content: "",
  projects: [],
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
  summaryModel: document.querySelector("#summary-model"),
  summaryAgent: document.querySelector("#summary-agent"),
  summaryAction: document.querySelector("#summary-action"),
  tabs: [...document.querySelectorAll("[data-kind]")],
}

function setStatus(message) {
  els.status.textContent = message
}

function formatDate(value) {
  if (!value) return "sin fecha"
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value))
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

function renderProjects() {
  els.projectList.replaceChildren()

  if (state.projects.length === 0) {
    const item = document.createElement("li")
    item.textContent = "Todavía no hay logs. Abrí opencode en algún proyecto y delegá una tarea."
    item.className = "hint"
    els.projectList.append(item)
    return
  }

  for (const project of state.projects) {
    const item = document.createElement("li")
    const button = document.createElement("button")
    const meta = document.createElement("span")

    button.type = "button"
    button.className = "project-button"
    button.dataset.project = project.name
    button.setAttribute("aria-current", project.name === state.project ? "page" : "false")
    button.textContent = project.name

    meta.className = "project-meta"
    meta.textContent = `Última actividad: ${formatDate(project.updatedAt)}`
    button.append(meta)

    button.addEventListener("click", () => selectProject(project.name))
    item.append(button)
    els.projectList.append(item)
  }
}

function renderLog() {
  const query = els.filterInput.value.trim().toLowerCase()
  const lines = state.content.split("\n")
  const filtered = query ? lines.filter((line) => line.toLowerCase().includes(query)) : lines

  els.logOutput.textContent = filtered.join("\n") || "No hay contenido para mostrar."
  renderSummary(lines)
}

function lastMatch(lines, pattern) {
  for (const line of [...lines].reverse()) {
    const match = line.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

function cleanValue(value) {
  return value?.replace(/\s*\|\s*$/, "").trim() || null
}

function renderSummary(lines) {
  const model = cleanValue(lastMatch(lines, /model:\s*([^|]+)/i))
  const agent = cleanValue(lastMatch(lines, /agent:\s*([^|]+)/i))
  const action = cleanValue(lastMatch(lines, /does:\s*(.+)$/i))
    ?? cleanValue(lastMatch(lines, /(?:before|after [a-z]+) \|\s*(.+)$/i))

  els.summaryModel.textContent = model ?? "Sin datos todavía"
  els.summaryAgent.textContent = agent ?? "Sin datos todavía"
  els.summaryAction.textContent = action ?? "Sin datos todavía"
}

async function loadProjects() {
  try {
    const data = await fetchJson("/api/projects")
    state.projects = data.projects
    renderProjects()
    setStatus(`Proyectos actualizados: ${state.projects.length}`)

    if (!state.project && state.projects[0]) {
      await selectProject(state.projects[0].name)
    }
  } catch (error) {
    setStatus(`No pude cargar proyectos: ${error.message}`)
  }
}

async function selectProject(project) {
  state.project = project
  els.selectedProject.textContent = `Proyecto seleccionado: ${project}`
  renderProjects()
  await loadLog()
}

async function loadLog() {
  if (!state.project) return

  try {
    const data = await fetchJson(`/api/projects/${encodeURIComponent(state.project)}/${state.kind}`)
    state.content = data.content
    renderLog()
    setStatus(`Actualizado: ${new Date().toLocaleTimeString("es-AR")}`)
  } catch (error) {
    setStatus(`No pude cargar logs: ${error.message}`)
  }
}

function selectTab(kind) {
  state.kind = kind
  for (const tab of els.tabs) {
    tab.setAttribute("aria-pressed", String(tab.dataset.kind === kind))
  }
  loadLog()
}

els.refreshProjects.addEventListener("click", loadProjects)
els.refreshLogs.addEventListener("click", loadLog)
els.filterInput.addEventListener("input", renderLog)

for (const tab of els.tabs) {
  tab.addEventListener("click", () => selectTab(tab.dataset.kind))
}

setInterval(() => {
  if (els.autoRefresh.checked) {
    loadProjects()
    loadLog()
  }
}, 2_500)

loadProjects()
