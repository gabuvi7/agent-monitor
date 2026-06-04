# Laboratorio global de subagentes de opencode

Este proyecto centraliza los logs del plugin global de opencode que permite ver qué pasa cuando opencode delega trabajo a subagentes.

El plugin está instalado globalmente en:

```text
/Users/guviedo/.config/opencode/plugins/subagent-tracer.ts
```

Eso significa que se carga cuando abrís opencode desde cualquier proyecto.

## Uso rápido

### Abrir la UI

Desde este proyecto:

```bash
cd /Users/guviedo/things/opencode-subagent-lab
npm start
```

Después abrí:

```text
http://localhost:4317
```

La UI lista los proyectos con logs, permite alternar entre timeline y eventos crudos, filtrar texto y refrescar automáticamente.

También muestra un resumen de actividad con:

- modelo detectado;
- agente o subagente detectado;
- última acción u objetivo registrado.

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
   tail -f /Users/guviedo/things/opencode-subagent-lab/logs/<nombre-del-proyecto>-<hash>/subagent-timeline.md
   tail -f /Users/guviedo/things/opencode-subagent-lab/logs/<nombre-del-proyecto>-<hash>/opencode-events.ndjson
   ```

## Qué se registra

| Archivo | Para qué sirve |
|---------|----------------|
| `logs/<proyecto>-<hash>/subagent-timeline.md` | Línea de tiempo legible: inicio del observer, llamadas a herramientas y eventos relacionados con tareas/subagentes. |
| `logs/<proyecto>-<hash>/opencode-events.ndjson` | Registro estructurado crudo para depurar con más detalle. Cada línea es un objeto JSON. |

El timeline intenta registrar líneas más explicativas, por ejemplo:

```text
before | delegation/tool: task | agent: sdd-verify-smart-profiles | model: openai/gpt-5.5 | does: Verify implementation against specs
```

Si opencode no expone el modelo o el agente en ese evento específico, la UI muestra `Sin datos todavía` hasta encontrar una línea que sí lo incluya.

## Archivos principales

| Archivo | Rol |
|---------|-----|
| `/Users/guviedo/.config/opencode/plugins/subagent-tracer.ts` | Plugin global que captura eventos de opencode. |
| `server.js` | Servidor local que expone los logs a la UI. |
| `public/index.html` | Estructura de la pantalla. |
| `public/app.js` | Lógica de carga, filtrado y auto-refresh. |
| `public/styles.css` | Estilos de la UI. |

## Por qué esto ayuda

Cuando opencode muestra algo como `view subagents`, el subagente puede estar haciendo trabajo real pero el chat principal queda esperando. Este laboratorio te da una vista externa para saber si el subagente está leyendo archivos, ejecutando comandos, fallando o simplemente tardando.

## Notas importantes

- opencode carga plugins y configuración solo al iniciar. Si editás el plugin global, cerrá y volvé a abrir opencode.
- Los logs pueden contener rutas de archivos, prompts, argumentos de comandos y fragmentos de salidas. No los subas a un repo si incluyen información privada.
- El plugin recorta strings largos para que los logs sigan siendo manejables.

## Desactivar temporalmente

Si necesitás arrancar opencode sin plugins externos para descartar problemas:

```bash
OPENCODE_PURE=1 opencode
```
