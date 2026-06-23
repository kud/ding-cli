import React, { useState, useEffect, useCallback } from "react"
import { render, Box, Text, useInput, useStdin } from "ink"
import { TextInput } from "@inkjs/ui"
import chalk from "chalk"
import { readdir } from "node:fs/promises"
import { parseTime, formatRemaining } from "../parse-time.js"
import { previewSound, stopPreview } from "../preview-sound.js"
import { ALARM_PRESETS, listSystemSounds, listRingtones } from "../sounds.js"
import {
  ACCENT,
  FooterHints,
  Tabs,
  type Hint,
  type TabItem,
} from "../ui/tui.js"

export type WizardConfig = {
  fireAt: Date
  message: string
  notify: boolean
  sound: string | false
  detach: boolean
}

const SOUNDS_DIR = "/System/Library/Sounds"

type StepId = "when" | "message" | "sound" | "notify" | "mode" | "review"

const STEP_ORDER: StepId[] = [
  "when",
  "message",
  "sound",
  "notify",
  "mode",
  "review",
]

const STEP_LABELS: Record<StepId, string> = {
  when: "When",
  message: "Message",
  sound: "Sound",
  notify: "Notify",
  mode: "Mode",
  review: "Review",
}

type SoundOption = { label: string; value: string | false; group: string }

const formatFireTime = (date: Date): string =>
  date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

const formatInTime = (date: Date): string =>
  formatRemaining(Math.max(0, date.getTime() - Date.now()))

const soundLabel = (sound: string | false, options: SoundOption[]): string => {
  if (sound === false) return "off"
  return options.find((o) => o.value === sound)?.label ?? sound
}

const Wizard: React.FC<{
  onComplete: (config: WizardConfig) => void
  onCancel: () => void
}> = ({ onComplete, onCancel }) => {
  const { isRawModeSupported } = useStdin()
  const rawMode = isRawModeSupported === true

  const [step, setStep] = useState<StepId>("when")
  const [fireAt, setFireAt] = useState<Date | null>(null)
  const [whenInput, setWhenInput] = useState("")
  const [whenError, setWhenError] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [notify, setNotify] = useState(true)
  const [notifyCursor, setNotifyCursor] = useState(notify ? 0 : 1)
  const [detach, setDetach] = useState(false)
  const [modeCursor, setModeCursor] = useState(detach ? 1 : 0)
  const [sound, setSound] = useState<string | false>(ALARM_PRESETS[0])
  const [soundCursor, setSoundCursor] = useState(1)
  const [soundOptions, setSoundOptions] = useState<SoundOption[]>([
    { label: "Off", value: false, group: "" },
    ...ALARM_PRESETS.map((name) => ({
      label: name,
      value: name as string | false,
      group: "Alarm",
    })),
  ])

  useEffect(() => {
    const ringtones = listRingtones()
    readdir(SOUNDS_DIR)
      .then((files) => {
        const systemNames = listSystemSounds(files)
        setSoundOptions([
          { label: "Off", value: false, group: "" },
          ...ALARM_PRESETS.map((name) => ({
            label: name,
            value: name as string | false,
            group: "Alarm",
          })),
          ...ringtones.map((ringtone) => ({
            label: ringtone.name,
            value: ringtone.name as string | false,
            group: "Ringtones",
          })),
          ...systemNames.map((name) => ({
            label: name,
            value: `${SOUNDS_DIR}/${name}.aiff` as string | false,
            group: "System",
          })),
        ])
      })
      .catch(() => {})
  }, [])

  const whenReady = fireAt !== null && whenError === null

  const cancel = useCallback((): void => {
    stopPreview()
    onCancel()
  }, [onCancel])

  const shiftStep = useCallback((delta: number): void => {
    setStep((prev) => {
      const index = STEP_ORDER.indexOf(prev)
      const next = STEP_ORDER[index + delta]
      return next ?? prev
    })
  }, [])

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") cancel()
      if (key.escape) {
        if (step === "when") cancel()
        else shiftStep(-1)
        return
      }
      if (key.leftArrow || (key.tab && key.shift)) shiftStep(-1)
      else if (key.rightArrow || (key.tab && !key.shift)) shiftStep(1)
    },
    { isActive: rawMode },
  )

  useInput(
    (input, key) => {
      if (key.upArrow) setSoundCursor((c) => Math.max(0, c - 1))
      if (key.downArrow)
        setSoundCursor((c) => Math.min(soundOptions.length - 1, c + 1))
      if (input === " ") {
        const opt = soundOptions[soundCursor]
        if (opt && opt.value !== false) previewSound(opt.label)
      }
      if (key.return) {
        const opt = soundOptions[soundCursor]
        if (opt) {
          setSound(opt.value)
          shiftStep(1)
        }
      }
    },
    { isActive: rawMode && step === "sound" },
  )

  useInput(
    (_input, key) => {
      if (key.upArrow) setNotifyCursor((c) => Math.max(0, c - 1))
      if (key.downArrow) setNotifyCursor((c) => Math.min(1, c + 1))
      if (key.return) {
        setNotify(notifyCursor === 0)
        shiftStep(1)
      }
    },
    { isActive: rawMode && step === "notify" },
  )

  useInput(
    (_input, key) => {
      if (key.upArrow) setModeCursor((c) => Math.max(0, c - 1))
      if (key.downArrow) setModeCursor((c) => Math.min(1, c + 1))
      if (key.return) {
        setDetach(modeCursor === 1)
        shiftStep(1)
      }
    },
    { isActive: rawMode && step === "mode" },
  )

  useInput(
    (_input, key) => {
      if (key.return) {
        if (!whenReady) {
          setStep("when")
          return
        }
        stopPreview()
        onComplete({ fireAt: fireAt!, message, notify, sound, detach })
      }
    },
    { isActive: rawMode && step === "review" },
  )

  const handleWhenChange = useCallback((value: string): void => {
    setWhenInput(value)
    if (!value) {
      setFireAt(null)
      setWhenError(null)
      return
    }
    try {
      setFireAt(parseTime(value).fireAt)
      setWhenError(null)
    } catch (err) {
      setFireAt(null)
      setWhenError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const tabs: TabItem<StepId>[] = STEP_ORDER.map((id) => ({
    value: id,
    label: STEP_LABELS[id],
    ready: id === "review" ? whenReady : undefined,
  }))

  const renderBody = (): React.ReactNode => {
    if (step === "when")
      return (
        <Box flexDirection="column">
          <TextInput
            defaultValue={whenInput}
            placeholder="e.g. 5m, 1h30m, 14:30"
            onChange={handleWhenChange}
            onSubmit={() => whenReady && shiftStep(1)}
          />
          {whenReady && fireAt ? (
            <Text color={ACCENT}>
              {`→ ${formatFireTime(fireAt)}  (in ${formatInTime(fireAt)})`}
            </Text>
          ) : null}
          {whenError ? <Text color="red">{whenError}</Text> : null}
        </Box>
      )

    if (step === "message")
      return (
        <TextInput
          defaultValue={message}
          placeholder="(optional)"
          onChange={setMessage}
          onSubmit={() => shiftStep(1)}
        />
      )

    if (step === "sound") {
      const start = Math.max(
        0,
        Math.min(soundCursor - 3, soundOptions.length - 8),
      )
      const visible = soundOptions.slice(
        Math.max(0, start),
        Math.max(0, start) + 8,
      )
      return (
        <Box flexDirection="column">
          {visible.map((opt, i) => {
            const idx = Math.max(0, start) + i
            const isCursor = idx === soundCursor
            const prev = soundOptions[idx - 1]
            const showGroup = opt.group && opt.group !== prev?.group
            return (
              <Box key={opt.label} flexDirection="column">
                {showGroup ? (
                  <Text dimColor bold>
                    {opt.group}
                  </Text>
                ) : null}
                <Text
                  color={isCursor ? ACCENT : undefined}
                  dimColor={!isCursor}
                >
                  {`${isCursor ? "▶" : " "} ${opt.label}`}
                </Text>
              </Box>
            )
          })}
        </Box>
      )
    }

    if (step === "notify")
      return (
        <Box flexDirection="column">
          {["Yes", "No"].map((label, idx) => {
            const isCursor = idx === notifyCursor
            return (
              <Text
                key={label}
                color={isCursor ? ACCENT : undefined}
                dimColor={!isCursor}
              >
                {`${isCursor ? "▶" : " "} ${label}`}
              </Text>
            )
          })}
        </Box>
      )

    if (step === "mode")
      return (
        <Box flexDirection="column">
          {[
            "Foreground — watch the countdown",
            "Detach — run in background",
          ].map((label, idx) => {
            const isCursor = idx === modeCursor
            return (
              <Text
                key={label}
                color={isCursor ? ACCENT : undefined}
                dimColor={!isCursor}
              >
                {`${isCursor ? "▶" : " "} ${label}`}
              </Text>
            )
          })}
        </Box>
      )

    const rows: [string, string][] = [
      [
        "When",
        whenReady && fireAt
          ? `${formatFireTime(fireAt)}  (in ${formatInTime(fireAt)})`
          : "not set",
      ],
      ["Message", message || "(none)"],
      ["Notify", notify ? "yes" : "no"],
      ["Sound", soundLabel(sound, soundOptions)],
      ["Mode", detach ? "detach" : "foreground"],
    ]
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {rows.map(([k, v]) => (
            <Box key={k} flexDirection="row" gap={1}>
              <Text dimColor>{k.padEnd(8)}</Text>
              <Text color={k === "When" && !whenReady ? "red" : undefined}>
                {v}
              </Text>
            </Box>
          ))}
        </Box>
        {whenReady ? null : (
          <Text color="red">set a valid time first (↵ jumps to When)</Text>
        )}
      </Box>
    )
  }

  const hints: Hint[] = (() => {
    if (step === "when")
      return [
        ["↵", "next"],
        ["←→", "step"],
        ["esc", "cancel"],
      ]
    if (step === "message")
      return [
        ["↵", "next"],
        ["←→", "step"],
        ["esc", "back"],
      ]
    if (step === "sound")
      return [
        ["↑↓", "choose"],
        ["space", "preview"],
        ["↵", "select"],
        ["←→", "step"],
        ["esc", "back"],
      ]
    if (step === "notify" || step === "mode")
      return [
        ["↑↓", "choose"],
        ["↵", "confirm"],
        ["←→", "step"],
        ["esc", "back"],
      ]
    return [
      ["↵", "start"],
      ["←→", "step"],
      ["esc", "back"],
    ]
  })()

  return (
    <Box flexDirection="column" marginTop={1} gap={1}>
      <Box flexDirection="row" gap={1}>
        <Text color={ACCENT} bold>
          ding
        </Text>
        <Text dimColor>{"\uf017"}</Text>
      </Box>
      <Tabs active={step} items={tabs} />
      <Box paddingLeft={1}>{renderBody()}</Box>
      <FooterHints hints={hints} />
    </Box>
  )
}

export const runWizard = (): Promise<WizardConfig> => {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "error: interactive wizard requires a TTY — pipe a time argument instead, e.g. ding 5m\n",
    )
    process.exit(1)
  }
  return new Promise((resolve) => {
    const instance = render(
      React.createElement(Wizard, {
        onComplete: (config) => {
          instance.clear()
          instance.unmount()
          resolve(config)
        },
        onCancel: () => {
          instance.clear()
          instance.unmount()
          process.stdout.write(chalk.dim("cancelled\n"))
          process.exit(0)
        },
      }),
    )
  })
}
