import { readFileSync } from "node:fs"
import { copyFile, mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const localEnv = readEnvFile(join(root, ".env"))
const source = join(root, "src/opencode/plugins/subagent-tracer.ts")
const target = expandHome(envValue("AGENT_MONITOR_PLUGIN_TARGET", "~/.config/opencode/plugins/subagent-tracer.ts"))
const runtimeEnv = expandHome(envValue("AGENT_MONITOR_RUNTIME_ENV", "~/.config/agent-monitor/.env"))
const logRoot = resolve(root, expandHome(envValue("AGENT_MONITOR_LOG_ROOT", "./logs")))

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
  return process.env[name] ?? localEnv[name] ?? fallback
}

function expandHome(path) {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path
}

await mkdir(dirname(target), { recursive: true })
await copyFile(source, target)
await mkdir(dirname(runtimeEnv), { recursive: true })
await writeFile(runtimeEnv, `AGENT_MONITOR_LOG_ROOT=${logRoot}\n`, "utf8")

console.log(`Installed opencode plugin:\n${source}\n→ ${target}`)
console.log(`Wrote runtime config:\n${runtimeEnv}`)
console.log(`Log root:\n${logRoot}`)
console.log("Restart opencode for the updated plugin to take effect.")
