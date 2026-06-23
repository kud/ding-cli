import chalk from "chalk"
import { formatDuration } from "./parse-time.js"

const clearLine = (): void => {
  process.stdout.write("\r\x1b[K")
}

const renderCountdown = (remainingMs: number, label: string): void => {
  const duration = formatDuration(remainingMs)
  process.stdout.write(
    `\r${chalk.cyan(duration)} ${chalk.dim("▸")} ${chalk.white(label)}`,
  )
}

export const runForegroundCountdown = (
  fireAt: Date,
  label: string,
  onFire: () => void,
): void => {
  const tick = (): void => {
    const remaining = fireAt.getTime() - Date.now()
    if (remaining <= 0) {
      clearLine()
      process.stdout.write(chalk.green("✓ done\n"))
      onFire()
      return
    }
    renderCountdown(remaining, label)
  }

  const handleSigint = (): void => {
    clearLine()
    process.stdout.write(chalk.yellow("cancelled\n"))
    process.exit(0)
  }

  process.on("SIGINT", handleSigint)

  tick()
  const interval = setInterval(() => {
    const remaining = fireAt.getTime() - Date.now()
    if (remaining <= 0) {
      clearInterval(interval)
      clearLine()
      process.stdout.write(chalk.green("✓ done\n"))
      onFire()
      return
    }
    renderCountdown(remaining, label)
  }, 1000)
}
