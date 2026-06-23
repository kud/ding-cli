import React, { useState, useEffect } from "react"
import { render, Box, Text, useInput, useApp, useStdin } from "ink"
import chalk from "chalk"
import { formatRemaining } from "./parse-time.js"
import type { IconSet } from "./icons.js"
import { startRingLoop, stopRingLoop, ringTimes } from "./ringer.js"
import { ACCENT, FooterHints, type Hint } from "./ui/tui.js"

const BAR_WIDTH = 24
const TICK_MS = 100

const EIGHTH_BLOCKS = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"] as const

const DEFAULT_MESSAGE = "⏰ Time's up"

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
    partial: partialIndex > 0 ? (EIGHTH_BLOCKS[partialIndex - 1] ?? "") : "",
    empty: " ".repeat(BAR_WIDTH - emptyStart),
  }
}

const formatFireTime = (date: Date): string =>
  date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

type CountdownViewProps = {
  fireAt: Date
  totalMs: number
  label: string
  icons: IconSet
  sound: string | false
  onFire: () => void
}

const CountdownView: React.FC<CountdownViewProps> = ({
  fireAt,
  totalMs,
  label,
  icons,
  sound,
  onFire,
}) => {
  const { exit } = useApp()
  const { isRawModeSupported } = useStdin()
  const rawMode = isRawModeSupported === true
  const [remainingMs, setRemainingMs] = useState(fireAt.getTime() - Date.now())
  const [tickCount, setTickCount] = useState(0)
  const [phase, setPhase] = useState<"counting" | "ringing" | "done">(
    "counting",
  )

  useEffect(() => {
    if (phase !== "counting") return
    const interval = setInterval(() => {
      const remaining = fireAt.getTime() - Date.now()
      setRemainingMs(remaining)
      setTickCount((n) => n + 1)
      if (remaining <= 0) {
        clearInterval(interval)
        onFire()
        if (sound !== false && rawMode) {
          startRingLoop(sound)
          setPhase("ringing")
        } else {
          if (sound !== false) ringTimes(sound, 3)
          setPhase("done")
        }
      }
    }, TICK_MS)
    return () => clearInterval(interval)
  }, [fireAt, phase, sound, rawMode, onFire])

  useEffect(() => {
    if (phase === "done") exit()
  }, [phase, exit])

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        stopRingLoop()
        process.stdout.write(chalk.dim("\ncancelled\n"))
        process.exit(0)
      }
      if (phase === "ringing") {
        stopRingLoop()
        setPhase("done")
      }
    },
    { isActive: rawMode },
  )

  const showLabel = label !== DEFAULT_MESSAGE
  const title = showLabel ? label : "ding"

  if (phase === "ringing" || phase === "done") {
    const isRinging = phase === "ringing"
    return React.createElement(
      Box,
      { flexDirection: "column", marginTop: 1, gap: 1 },
      React.createElement(
        Box,
        { flexDirection: "row", gap: 1 },
        React.createElement(
          Text,
          { color: ACCENT, bold: true },
          `${isRinging ? icons.bell : icons.done} ${
            isRinging ? "ringing" : "Time's up"
          }`,
        ),
        showLabel
          ? React.createElement(Text, { dimColor: true }, `· ${label}`)
          : null,
      ),
      isRinging
        ? React.createElement(FooterHints, {
            hints: [["any key", "dismiss"]] as Hint[],
          })
        : null,
    )
  }

  const safeTotalMs = Math.max(1, totalMs)
  const elapsed = safeTotalMs - remainingMs
  const bar = buildSmoothBar(Math.max(0, elapsed), safeTotalMs)
  const percentage = Math.round((Math.max(0, elapsed) / safeTotalMs) * 100)
  const timeLabel = formatRemaining(Math.max(0, remainingMs))
  const frameIndex = tickCount % icons.timerFrames.length
  const spinnerFrame = icons.timerFrames[frameIndex] ?? icons.timer
  const fireTimeStr = formatFireTime(fireAt)

  return React.createElement(
    Box,
    { flexDirection: "column", marginTop: 1, gap: 1 },
    React.createElement(
      Box,
      { flexDirection: "row", gap: 1 },
      React.createElement(Text, { dimColor: true }, icons.timer),
      React.createElement(Text, { color: ACCENT, bold: true }, title),
    ),
    React.createElement(
      Box,
      { flexDirection: "row" },
      React.createElement(Text, null, `${spinnerFrame} `),
      React.createElement(Text, { dimColor: true }, "▕"),
      React.createElement(Text, { color: ACCENT }, bar.filled),
      React.createElement(Text, { color: ACCENT }, bar.partial),
      React.createElement(Text, { dimColor: true }, bar.empty),
      React.createElement(Text, { dimColor: true }, "▏"),
      React.createElement(Text, { dimColor: true }, ` ${percentage}%`),
    ),
    React.createElement(
      Box,
      { flexDirection: "row", gap: 2 },
      React.createElement(Text, { bold: true }, timeLabel),
      React.createElement(Text, { dimColor: true }, `fires ${fireTimeStr}`),
    ),
    React.createElement(FooterHints, { hints: [["ctrl-c", "cancel"]] }),
  )
}

export const runForegroundCountdown = (
  fireAt: Date,
  label: string,
  icons: IconSet,
  sound: string | false,
  onFire: () => void,
): Promise<void> => {
  const totalMs = fireAt.getTime() - Date.now()

  if (!process.stdin.isTTY) {
    process.on("SIGINT", () => {
      stopRingLoop()
      process.stdout.write(chalk.dim("\ncancelled\n"))
      process.exit(0)
    })
  }

  return new Promise<void>((resolve) => {
    const { waitUntilExit } = render(
      React.createElement(CountdownView, {
        fireAt,
        totalMs,
        label,
        icons,
        sound,
        onFire,
      }),
      { exitOnCtrlC: false },
    )
    waitUntilExit().then(() => resolve())
  })
}
