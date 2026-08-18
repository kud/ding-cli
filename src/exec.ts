// The command runs under `/bin/sh -c` rather than a login shell on purpose.
// A login shell re-sources the user's rc files, so the command would see an
// environment assembled at fire time that need not match the one the user was
// looking at when they typed `ding` — and it would differ again between a
// foreground run and a detached one. `sh -c` inherits ding's own environment
// untouched, which makes the contract sayable in one line: the command sees
// whatever the shell that launched ding had. A command that genuinely wants
// login semantics can ask for them: --exec 'zsh -lc "…"'.
import { spawn } from "node:child_process"
import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const MAX_LOG_BYTES = 1024 * 1024
const MAX_CAPTURED_BYTES = 1024 * 1024

export const DEFAULT_FAIL_SOUND = "siren"

export const execLogPath = (): string =>
  process.env.DING_EXEC_LOG ??
  join(homedir(), "Library", "Logs", "ding", "exec.log")

export type ExecOutcome = {
  command: string
  code: number
  signal: string | null
  durationMs: number
  output: string
  truncated: boolean
  logPath: string
}

const pad = (n: number): string => String(n).padStart(2, "0")

const localStamp = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

const formatDuration = (ms: number): string =>
  ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

const rotateIfLarge = (logPath: string): void => {
  try {
    if (statSync(logPath).size > MAX_LOG_BYTES)
      renameSync(logPath, `${logPath}.1`)
  } catch {}
}

const appendBlock = (logPath: string, block: string): void => {
  try {
    mkdirSync(dirname(logPath), { recursive: true })
    rotateIfLarge(logPath)
    appendFileSync(logPath, block)
  } catch (err) {
    process.stderr.write(
      `warning: could not write exec log at ${logPath}: ${err instanceof Error ? err.message : String(err)}\n`,
    )
  }
}

const buildBlock = (outcome: ExecOutcome, startedAt: Date): string => {
  const status =
    outcome.signal !== null
      ? `killed by ${outcome.signal}`
      : `exit ${outcome.code}`
  const body = outcome.output.endsWith("\n")
    ? outcome.output
    : `${outcome.output}\n`
  return [
    `─── ${localStamp(startedAt)} ───`,
    `$ ${outcome.command}`,
    outcome.output.length > 0 ? body : "(no output)\n",
    outcome.truncated ? "… output truncated ───\n" : "",
    `─── ${status} · ${formatDuration(outcome.durationMs)} ───`,
    "",
    "",
  ].join("\n")
}

export const tailLines = (output: string, count: number): string =>
  output.trimEnd().split("\n").slice(-count).join("\n")

export const formatOutcome = (outcome: ExecOutcome): string =>
  `${outcome.signal !== null ? `killed by ${outcome.signal}` : `exit ${outcome.code}`} · ${formatDuration(outcome.durationMs)}`

export const runExec = (command: string): Promise<ExecOutcome> =>
  new Promise((resolve) => {
    const logPath = execLogPath()
    const startedAt = new Date()
    const startedMs = Date.now()
    const chunks: string[] = []
    let capturedBytes = 0
    let truncated = false

    const capture = (chunk: Buffer): void => {
      if (capturedBytes >= MAX_CAPTURED_BYTES) {
        truncated = true
        return
      }
      capturedBytes += chunk.length
      chunks.push(chunk.toString("utf8"))
    }

    const child = spawn("/bin/sh", ["-c", command], {
      stdio: ["ignore", "pipe", "pipe"],
    })
    child.stdout.on("data", capture)
    child.stderr.on("data", capture)

    const finish = (code: number, signal: string | null): void => {
      const outcome: ExecOutcome = {
        command,
        code,
        signal,
        durationMs: Date.now() - startedMs,
        output: chunks.join(""),
        truncated,
        logPath,
      }
      appendBlock(logPath, buildBlock(outcome, startedAt))
      resolve(outcome)
    }

    child.on("error", (err) => {
      chunks.push(`ding: could not run command: ${err.message}\n`)
      finish(127, null)
    })
    child.on("close", (code, signal) => {
      if (signal !== null) finish(128, signal)
      else finish(code ?? 0, null)
    })
  })
