# Agent Monitor

Este proyecto centraliza los logs del plugin global de opencode que permite ver qué pasa cuando opencode delega trabajo a subagentes.

El plugin está instalado globalmente en:

```text
~/.config/opencode/plugins/subagent-tracer.ts
```

La fuente versionada vive en este repo:

```text
src/opencode/plugins/subagent-tracer.ts
```

Para instalar o sincronizar el plugin global:

```bash
npm run install-plugin
```

El instalador también escribe la configuración runtime en:

```text
~/.config/agent-monitor/.env
```

Después de instalarlo, cerrá y volvé a abrir opencode. Los plugins se cargan al inicio.

### Configuración opcional

Podés crear un `.env` local a partir del ejemplo:

```bash
cp .env.example .env
```

Variables disponibles:

| Variable | Para qué sirve | Default |
|----------|----------------|---------|
| `AGENT_MONITOR_LOG_ROOT` | Carpeta donde el plugin escribe logs y la UI los lee. | `./logs` |
| `AGENT_MONITOR_PLUGIN_TARGET` | Destino donde se instala la copia global del plugin. | `~/.config/opencode/plugins/subagent-tracer.ts` |
| `AGENT_MONITOR_RUNTIME_ENV` | `.env` runtime que lee el plugin global. | `~/.config/agent-monitor/.env` |

## Uso rápido

### Abrir la UI

Desde este proyecto:

```bash
cd /path/to/agent-monitor
npm start
```

Después abrí:

```text
http://localhost:4317
```

La UI lista los proyectos con logs, muestra subagentes activos, ejecuciones recientes y un panel de detalle por ejecución. También mantiene timeline y eventos crudos como vistas de debug.

El estado canónico del monitor sale de `subagent-runs.ndjson` a través de las APIs `/runs`; el timeline legible no se parsea para inferir estado, duración ni sesiones.

Por seguridad, el servidor escucha solo en `127.0.0.1`, no en toda la red local.

### Generar logs desde cualquier proyecto

1. Abrí opencode desde cualquier proyecto:

   ```bash
   cd /ruta/a/tu/proyecto
   opencode
   ```

2. Dentro de opencode, pedí una tarea que delegue trabajo, por ejemplo:

   ```text
   Use a subagent to inspect playground/example-task.md and summarize the task.
   ```

3. Mientras el subagente trabaja, mirá los logs desde otra terminal. Los logs se guardan por proyecto:

   ```bash
   tail -f logs/<nombre-del-proyecto>-<hash>/subagent-timeline.md
   tail -f logs/<nombre-del-proyecto>-<hash>/opencode-events.ndjson
   ```

## Qué se registra

| Archivo | Para qué sirve |
|---------|----------------|
| `logs/<proyecto>-<hash>/subagent-runs.ndjson` | Contrato estructurado del monitor. Cada línea representa un registro `subagent.run` con estado, sesiones, agente, modelo cuando exista, tiempos, resultado y uso opcional. |
| `logs/<proyecto>-<hash>/subagent-timeline.md` | Línea de tiempo legible: inicio del observer, llamadas a herramientas y eventos relacionados con tareas/subagentes. |
| `logs/<proyecto>-<hash>/opencode-events.ndjson` | Registro estructurado crudo para depurar con más detalle. Cada línea es un objeto JSON. |

El timeline intenta registrar líneas más explicativas, por ejemplo:

```text
before | delegation/tool: task | agent: sdd-verify-smart-profiles | model: openai/gpt-5.5 | does: Verify implementation against specs
```

Si opencode no expone modelo, uso de tokens o contexto para una ejecución, el registro sigue siendo válido y la UI muestra `No disponible` en vez de inventar datos.

## APIs locales

El servidor expone endpoints sin caché para que la UI y futuros consumidores lean el mismo contrato normalizado:

| Endpoint | Uso |
|----------|-----|
| `GET /api/projects` | Lista proyectos con logs y su última actividad. |
| `GET /api/projects/:project/runs?status=active&limit=50` | Devuelve ejecuciones activas desde `subagent-runs.ndjson`. |
| `GET /api/projects/:project/runs?status=recent&limit=50` | Devuelve ejecuciones terminales recientes: completadas, fallidas, canceladas, timeout o desconocidas. |
| `GET /api/projects/:project/runs?status=all&limit=50` | Devuelve todas las ejecuciones normalizadas. |
| `GET /api/projects/:project/runs/:key` | Busca un detalle por clave normalizada, delegation ID, sesión padre o sesión hija. |
| `GET /api/projects/:project/timeline` | Fallback/debug del timeline legible. No es fuente canónica del monitor. |
| `GET /api/projects/:project/events` | Fallback/debug de eventos crudos. No es fuente canónica del monitor. |

### Metadata opcional

Los campos como `model`, `usage.inputTokens`, `usage.outputTokens` y `usage.contextPercent` dependen de lo que opencode exponga en sus hooks. Cuando no están disponibles:

- el plugin puede omitirlos o dejarlos como `null`;
- la API normaliza valores faltantes como desconocidos/no disponibles;
- la UI conserva la ejecución visible y muestra etiquetas explícitas.

### Fallback crudo

Si todavía no existe `subagent-runs.ndjson` para un proyecto, las APIs de runs devuelven listas vacías. En ese caso, el panel de debug crudo sigue permitiendo inspeccionar `subagent-timeline.md` y `opencode-events.ndjson` manualmente.

## Archivos principales

| Archivo | Rol |
|---------|-----|
| `src/opencode/plugins/subagent-tracer.ts` | Fuente versionada del plugin que captura eventos de opencode. |
| `scripts/install-opencode-plugin.js` | Script que instala/sincroniza el plugin en `~/.config/opencode/plugins`. |
| `~/.config/opencode/plugins/subagent-tracer.ts` | Copia global que opencode carga al iniciar. No editar a mano. |
| `.env.example` | Variables configurables sin hardcodear rutas locales. |
| `server.js` | Servidor local que expone los logs a la UI. |
| `public/index.html` | Estructura de la pantalla. |
| `public/app.js` | Lógica de carga de runs, detalle, copiado de sesiones, debug crudo y auto-refresh. |
| `public/styles.css` | Estilos del monitor, chips de estado, layout responsive y foco visible. |

## Por qué esto ayuda

Cuando opencode muestra algo como `view subagents`, el subagente puede estar haciendo trabajo real pero el chat principal queda esperando. Este laboratorio te da una vista externa para saber si el subagente está leyendo archivos, ejecutando comandos, fallando o simplemente tardando.

## Notas importantes

- opencode carga plugins y configuración solo al iniciar. Si corrés `npm run install-plugin`, cerrá y volvé a abrir opencode.
- Los logs pueden contener rutas de archivos, prompts, argumentos de comandos y fragmentos de salidas. No los subas a un repo si incluyen información privada.
- El plugin recorta strings largos para que los logs sigan siendo manejables.

## Desactivar temporalmente

Si necesitás arrancar opencode sin plugins externos para descartar problemas:

```bash
OPENCODE_PURE=1 opencode
```
