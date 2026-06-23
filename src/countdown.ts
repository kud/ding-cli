import React, { useState, useEffect } from "react"
import { render, Box, Text, useInput, useApp, useStdin } from "ink"
import { formatRemaining } from "./parse-time.js"
import type { IconSet } from "./icons.js"

const BAR_WIDTH = 24
const TICK_MS = 100

const EIGHTH_BLOCKS = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"] as const

const buildSmoothBar = (
  elapsed: number,
  total: number,
): { filled: string; partial: string; empty: string } => {
  if (total <= 0) {
    return { filled: "█".repeat(BAR_WIDTH), partial: "", empty: "" }
  }
  const fraction = Math.min(1, Math.max(0, elapsed / total))
  const exactFill = fraction * BAR_WIDTH
  const fullCells = Math.floor(exactFill)
  const remainder = exactFill - fullCells
  const partialIndex = Math.floor(remainder * 8)
  const emptyStart = fullCells + (partialIndex > 0 ? 1 : 0)

  return {
    filled: "█".repeat(fullCells),
    partial: partialIndex > 0 ? EIGHTH_BLOCKS[partialIndex - 1] : "",
    empty: " ".repeat(BAR_WIDTH - emptyStart),
  }
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
  const [tickCount, setTickCount] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = fireAt.getTime() - Date.now()
      setRemainingMs(remaining)
      setTickCount((n) => n + 1)
      if (remaining <= 0) {
        clearInterval(interval)
        exit()
      }
    }, TICK_MS)
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

  const safeTotalMs = Math.max(1, totalMs)
  const elapsed = safeTotalMs - remainingMs
  const bar = buildSmoothBar(Math.max(0, elapsed), safeTotalMs)
  const percentage = Math.round((Math.max(0, elapsed) / safeTotalMs) * 100)
  const timeLabel = formatRemaining(Math.max(0, remainingMs))
  const frameIndex = tickCount % icons.timerFrames.length
  const spinnerFrame = icons.timerFrames[frameIndex]

  return React.createElement(
    Box,
    null,
    React.createElement(Text, null, `${spinnerFrame} `),
    React.createElement(Text, { dimColor: true }, "▕"),
    React.createElement(Text, { color: "green" }, bar.filled),
    React.createElement(Text, { color: "green" }, bar.partial),
    React.createElement(Text, { dimColor: true }, bar.empty),
    React.createElement(Text, { dimColor: true }, "▏"),
    React.createElement(Text, { dimColor: true }, ` ${percentage}%`),
    React.createElement(Text, null, "  ·  "),
    React.createElement(Text, { bold: true }, `${timeLabel} left`),
    React.createElement(Text, null, `  ·  "${label}"`),
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
