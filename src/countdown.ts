import React, { useState, useEffect } from "react"
import { render, Box, Text, useInput, useApp, useStdin } from "ink"
import { formatDuration } from "./parse-time.js"
import type { IconSet } from "./icons.js"

const BAR_WIDTH = 24

const buildProgressBar = (elapsed: number, total: number): string => {
  const filled = Math.round((elapsed / total) * BAR_WIDTH)
  const empty = BAR_WIDTH - filled
  return "█".repeat(filled) + "░".repeat(empty)
}

const CountdownView: React.FC<{
  fireAt: Date
  totalMs: number
  label: string
  icons: IconSet
}> = ({ fireAt, totalMs, label, icons }) => {
  const { exit } = useApp()
  const { isRawModeSupported } = useStdin()
  const [remainingMs, setRemainingMs] = useState(fireAt.getTime() - Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = fireAt.getTime() - Date.now()
      setRemainingMs(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        exit()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [fireAt, exit])

  useInput(
    (_input, key) => {
      if (key.ctrl && _input === "c") {
        process.stdout.write("\ncancelled\n")
        process.exit(0)
      }
    },
    { isActive: isRawModeSupported === true },
  )

  if (remainingMs <= 0) {
    return React.createElement(Text, { color: "green" }, `${icons.done} done`)
  }

  const elapsed = totalMs - remainingMs
  const bar = buildProgressBar(Math.max(0, elapsed), totalMs)
  const duration = formatDuration(Math.max(0, remainingMs))

  return React.createElement(
    Box,
    null,
    React.createElement(
      Text,
      null,
      `${icons.timer} ${bar}  ${duration} left ${icons.pointer} "${label}"`,
    ),
  )
}

export const runForegroundCountdown = (
  fireAt: Date,
  label: string,
  icons: IconSet,
  onFire: () => void,
): void => {
  const totalMs = fireAt.getTime() - Date.now()

  if (!process.stdin.isTTY) {
    process.on("SIGINT", () => {
      process.stdout.write("\ncancelled\n")
      process.exit(0)
    })
  }

  const { waitUntilExit } = render(
    React.createElement(CountdownView, { fireAt, totalMs, label, icons }),
    { exitOnCtrlC: false },
  )
  waitUntilExit().then(() => {
    process.stdout.write(`\n${icons.done} done\n`)
    onFire()
  })
}
