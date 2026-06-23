import { spawn } from "node:child_process"
import chalk from "chalk"

export const spawnDetached = (args: string[]): void => {
  const child = spawn(process.execPath, [process.argv[1], ...args], {
    detached: true,
    stdio: "ignore",
  })
  child.unref()
  process.stdout.write(
    chalk.dim(`detached — pid ${child.pid}, args: ${args.join(" ")}\n`),
  )
}
