import React, { useState, useEffect } from "react"
import { render, Box, Text, useInput, useApp, useStdin } from "ink"
import TextInput from "ink-text-input"
import chalk from "chalk"
import { parseTime, formatRemaining } from "../parse-time.js"
import { readdir } from "node:fs/promises"
import { previewSound } from "../preview-sound.js"

export type WizardConfig = {
  fireAt: Date
  message: string
  notify: boolean
  sound: string | false
  detach: boolean
}

const SOUNDS_DIR = "/System/Library/Sounds"

const STEP_NAMES = ["When", "Message", "Notify", "Sound", "Mode"] as const

const formatFireTime = (date: Date): string =>
  date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

const formatInTime = (date: Date): string => {
  const ms = date.getTime() - Date.now()
  return formatRemaining(Math.max(0, ms))
}

const getSoundLabel = (
  sound: string | false,
  soundOptions: Array<{ label: string; value: string | false }>,
): string => {
  if (sound === false) return "off"
  const opt = soundOptions.find((o) => o.value === sound)
  return opt ? opt.label : sound
}

const FOOTER_HINTS: Record<number, string> = {
  0: "esc back · ↵ next",
  1: "esc back · ↵ next  (optional — leave empty to skip)",
  2: "y yes · n no · ↑↓ choose · ↵ confirm · esc back",
  3: "↑↓ browse · space preview · ↵ confirm · esc back",
  4: "↑↓ choose · ↵ confirm · esc back",
  5: "↵ start · esc back",
}

const Wizard: React.FC<{
  onComplete: (config: WizardConfig) => void
}> = ({ onComplete }) => {
  const { exit } = useApp()
  const { isRawModeSupported } = useStdin()
  const rawMode = isRawModeSupported === true

  const [step, setStep] = useState(0)
  const [fireAt, setFireAt] = useState<Date | null>(null)
  const [fireAtInput, setFireAtInput] = useState("")
  const [whenError, setWhenError] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [notify, setNotify] = useState(true)
  const [notifyCursor, setNotifyCursor] = useState(0)
  const [sound, setSound] = useState<string | false>(
    "/System/Library/Sounds/Glass.aiff",
  )
  const [soundCursor, setSoundCursor] = useState(1)
  const [soundOptions, setSoundOptions] = useState<
    Array<{ label: string; value: string | false }>
  >([
    { label: "Off", value: false },
    { label: "Glass", value: "/System/Library/Sounds/Glass.aiff" },
  ])
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [detach, setDetach] = useState(false)
  const [modeCursor, setModeCursor] = useState(0)

  useEffect(() => {
    readdir(SOUNDS_DIR)
      .then((files) => {
        const aiffs = files
          .filter((f) => f.endsWith(".aiff"))
          .map((f) => f.replace(/\.aiff$/, ""))
          .sort()
        const opts: Array<{ label: string; value: string | false }> = [
          { label: "Off", value: false },
          ...aiffs.map((name) => ({
            label: name,
            value: `/System/Library/Sounds/${name}.aiff` as string | false,
          })),
        ]
        setSoundOptions(opts)
        const glassIdx = opts.findIndex((o) => o.label === "Glass")
        if (glassIdx > 0) setSoundCursor(glassIdx)
      })
      .catch(() => {})
  }, [])

  // Always-on: ctrl-c and escape
  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        process.stdout.write(chalk.dim("cancelled\n"))
        process.exit(0)
      }
      if (key.escape) {
        if (step === 0) {
          process.stdout.write(chalk.dim("cancelled\n"))
          process.exit(0)
        }
        setStep((s) => s - 1)
      }
    },
    { isActive: rawMode },
  )

  // Step-specific: only active for non-text-input steps
  useInput(
    (input, key) => {
      if (step === 2) {
        if (key.upArrow || key.downArrow) setNotifyCursor((c) => 1 - c)
        if (key.return) {
          setNotify(notifyCursor === 0)
          setStep(3)
        }
        if (input === "y" || input === "Y") {
          setNotify(true)
          setStep(3)
        }
        if (input === "n" || input === "N") {
          setNotify(false)
          setStep(3)
        }
      }

      if (step === 3) {
        if (key.upArrow) setSoundCursor((c) => Math.max(0, c - 1))
        if (key.downArrow)
          setSoundCursor((c) => Math.min(soundOptions.length - 1, c + 1))
        if (input === " " && soundCursor > 0) {
          const opt = soundOptions[soundCursor]
          if (opt && opt.value !== false) {
            previewSound(opt.label)
            setPreviewing(opt.label)
            setTimeout(() => setPreviewing(null), 3000)
          }
        }
        if (key.return) {
          const opt = soundOptions[soundCursor]
          if (opt) {
            setSound(opt.value)
            setStep(4)
          }
        }
      }

      if (step === 4) {
        if (key.upArrow || key.downArrow) setModeCursor((c) => 1 - c)
        if (key.return) {
          setDetach(modeCursor === 1)
          setStep(5)
        }
      }

      if (step === 5) {
        if (key.return) {
          onComplete({ fireAt: fireAt!, message, notify, sound, detach })
          exit()
        }
      }
    },
    { isActive: rawMode && step >= 2 },
  )

  const handleWhenChange = (val: string): void => {
    setFireAtInput(val)
    if (!val) {
      setWhenError(null)
      return
    }
    try {
      const result = parseTime(val)
      setFireAt(result.fireAt)
      setWhenError(null)
    } catch (err) {
      setFireAt(null)
      setWhenError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleWhenSubmit = (val: string): void => {
    if (!val) return
    try {
      const result = parseTime(val)
      setFireAt(result.fireAt)
      setWhenError(null)
      setStep(1)
    } catch (err) {
      setWhenError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleMessageSubmit = (val: string): void => {
    setMessage(val)
    setStep(2)
  }

  const renderStepSummary = (s: number): string => {
    if (s === 0 && fireAt)
      return `→ ${formatFireTime(fireAt)}  (in ${formatInTime(fireAt)})`
    if (s === 1) return message ? `→ "${message}"` : "→ (none)"
    if (s === 2) return `→ ${notify ? "yes" : "no"}`
    if (s === 3) return `→ ${getSoundLabel(sound, soundOptions)}`
    if (s === 4) return `→ ${detach ? "detach" : "foreground"}`
    return ""
  }

  const renderActiveContent = (): React.ReactNode => {
    if (step === 0) {
      return React.createElement(
        Box,
        { flexDirection: "column", paddingLeft: 2 },
        React.createElement(TextInput, {
          value: fireAtInput,
          onChange: handleWhenChange,
          onSubmit: handleWhenSubmit,
          placeholder: "e.g. 5m, 1h30m, 14:30",
        }),
        fireAt && !whenError
          ? React.createElement(
              Text,
              { color: "#a3e635" },
              `→ ${formatFireTime(fireAt)}  (in ${formatInTime(fireAt)})`,
            )
          : null,
        whenError
          ? React.createElement(Text, { color: "red" }, whenError)
          : null,
      )
    }

    if (step === 1) {
      return React.createElement(
        Box,
        { flexDirection: "column", paddingLeft: 2 },
        React.createElement(TextInput, {
          value: message,
          onChange: setMessage,
          onSubmit: handleMessageSubmit,
          placeholder: "(optional)",
        }),
      )
    }

    if (step === 2) {
      return React.createElement(
        Box,
        { flexDirection: "column", paddingLeft: 2 },
        React.createElement(
          Text,
          { color: notifyCursor === 0 ? "#a3e635" : undefined },
          `${notifyCursor === 0 ? "▶" : " "} Yes`,
        ),
        React.createElement(
          Text,
          { color: notifyCursor === 1 ? "#a3e635" : undefined },
          `${notifyCursor === 1 ? "▶" : " "} No`,
        ),
      )
    }

    if (step === 3) {
      const start = Math.max(0, soundCursor - 3)
      const end = Math.min(soundOptions.length, start + 8)
      const visible = soundOptions.slice(start, end)

      return React.createElement(
        Box,
        { flexDirection: "column", paddingLeft: 2 },
        ...visible.map((opt, i) => {
          const idx = start + i
          const isCursor = idx === soundCursor
          return React.createElement(
            Text,
            {
              key: opt.label,
              color: isCursor ? "#a3e635" : undefined,
              dimColor: !isCursor,
            },
            `${isCursor ? "▶" : " "} ${opt.label}`,
          )
        }),
        previewing
          ? React.createElement(
              Text,
              { color: "#a3e635", dimColor: true },
              `♪ previewing ${previewing}…`,
            )
          : null,
      )
    }

    if (step === 4) {
      const modeLabels = [
        "Foreground (watch the countdown)",
        "Detach (run in background)",
      ]
      return React.createElement(
        Box,
        { flexDirection: "column", paddingLeft: 2 },
        ...modeLabels.map((label, i) =>
          React.createElement(
            Text,
            {
              key: label,
              color: modeCursor === i ? "#a3e635" : undefined,
              dimColor: modeCursor !== i,
            },
            `${modeCursor === i ? "▶" : " "} ${label}`,
          ),
        ),
      )
    }

    if (step === 5) {
      const reviewRows = [
        [
          "When",
          fireAt
            ? `→ ${formatFireTime(fireAt)}  (in ${formatInTime(fireAt)})`
            : "",
        ],
        ["Message", message ? `→ "${message}"` : "→ (none)"],
        ["Notify", `→ ${notify ? "yes" : "no"}`],
        ["Sound", `→ ${getSoundLabel(sound, soundOptions)}`],
        ["Mode", `→ ${detach ? "detach" : "foreground"}`],
      ]
      return React.createElement(
        Box,
        { flexDirection: "column", paddingLeft: 2, gap: 1 },
        React.createElement(
          Box,
          { flexDirection: "column" },
          ...reviewRows.map(([k, v]) =>
            React.createElement(
              Box,
              { key: k, flexDirection: "row", gap: 1 },
              React.createElement(
                Text,
                { dimColor: true },
                (k ?? "").padEnd(9),
              ),
              React.createElement(Text, null, v),
            ),
          ),
        ),
      )
    }

    return null
  }

  const renderRail = (): React.ReactNode[] => {
    const rows: React.ReactNode[] = []

    for (let s = 0; s < 5; s++) {
      const name = STEP_NAMES[s] ?? ""
      if (s < step) {
        rows.push(
          React.createElement(
            Text,
            { key: `step-${s}`, dimColor: true },
            `  ✓ ${name}  ${renderStepSummary(s)}`,
          ),
        )
      } else if (s === step) {
        rows.push(
          React.createElement(
            Text,
            { key: `step-${s}`, color: "#a3e635", bold: true },
            `▶ ${name}`,
          ),
        )
        rows.push(
          React.createElement(
            Box,
            { key: `step-${s}-content` },
            renderActiveContent(),
          ),
        )
      } else {
        rows.push(
          React.createElement(
            Text,
            { key: `step-${s}`, dimColor: true },
            `  ○ ${name}`,
          ),
        )
      }
    }

    if (step === 5) {
      rows.push(
        React.createElement(
          Text,
          { key: "review-header", color: "#a3e635", bold: true },
          "▶ Review",
        ),
      )
      rows.push(
        React.createElement(
          Box,
          { key: "review-content" },
          renderActiveContent(),
        ),
      )
    }

    return rows
  }

  const hint = FOOTER_HINTS[step] ?? ""

  return React.createElement(
    Box,
    {
      borderStyle: "round",
      borderColor: "#a3e635",
      flexDirection: "column",
      paddingX: 1,
    },
    ...renderRail(),
    React.createElement(Text, { dimColor: true }, hint),
  )
}

let resolveWizard: ((config: WizardConfig) => void) | null = null

export const runWizard = (): Promise<WizardConfig> => {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "error: interactive wizard requires a TTY — pipe a time argument instead, e.g. ding 5m\n",
    )
    process.exit(1)
  }
  return new Promise((resolve) => {
    resolveWizard = resolve
    render(
      React.createElement(Wizard, {
        onComplete: (config) => {
          resolveWizard?.(config)
        },
      }),
    )
  })
}
