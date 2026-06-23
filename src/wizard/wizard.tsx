import React, { useState, useEffect } from "react"
import { render, Box, Text, useInput, useApp } from "ink"
import TextInput from "ink-text-input"
import SelectInput from "ink-select-input"

type SelectItem<V> = { key?: string; label: string; value: V }
import { parseTime, formatRemaining } from "../parse-time.js"
import { resolveIcons, type IconSet } from "../icons.js"
import { readdir } from "node:fs/promises"

export type WizardConfig = {
  fireAt: Date
  message: string
  notify: boolean
  sound: string | false
  detach: boolean
}

type WhenStepProps = { onNext: (fireAt: Date) => void }

const WhenStep: React.FC<WhenStepProps> = ({ onNext }) => {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Date | null>(null)

  const handleChange = (next: string): void => {
    setValue(next)
    if (!next) {
      setError(null)
      setResolved(null)
      return
    }
    try {
      const result = parseTime(next)
      setResolved(result.fireAt)
      setError(null)
    } catch (err) {
      setResolved(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleSubmit = (submitted: string): void => {
    if (!submitted) return
    try {
      const result = parseTime(submitted)
      onNext(result.fireAt)
    } catch {}
  }

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(
      Text,
      null,
      "When should it fire? (e.g. 5m, 1h30m, 14:30)",
    ),
    React.createElement(TextInput, {
      value,
      onChange: handleChange,
      onSubmit: handleSubmit,
    }),
    error
      ? React.createElement(Text, { color: "red" }, error)
      : resolved
        ? React.createElement(
            Text,
            { dimColor: true },
            `fires at ${resolved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} — ${formatRemaining(resolved.getTime() - Date.now())} from now`,
          )
        : null,
  )
}

type MessageStepProps = { onNext: (message: string) => void }

const MessageStep: React.FC<MessageStepProps> = ({ onNext }) => {
  const [value, setValue] = useState("")

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(
      Text,
      null,
      "Message? (optional — leave empty for default)",
    ),
    React.createElement(TextInput, {
      value,
      onChange: setValue,
      onSubmit: onNext,
    }),
  )
}

type NotifyStepProps = { onNext: (notify: boolean) => void }

const NotifyStep: React.FC<NotifyStepProps> = ({ onNext }) => {
  const items = [
    { label: "Yes (desktop notification)", value: true },
    { label: "No", value: false },
  ]

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, null, "Send a desktop notification?"),
    React.createElement(SelectInput, {
      items,
      onSelect: (item: SelectItem<unknown>) => onNext(item.value as boolean),
    }),
  )
}

const SOUNDS_DIR = "/System/Library/Sounds"

type SoundStepProps = { onNext: (sound: string | false) => void }

const SoundStep: React.FC<SoundStepProps> = ({ onNext }) => {
  const [items, setItems] = useState<
    { label: string; value: string | false }[]
  >([
    { label: "Off", value: false },
    { label: "Default (Glass)", value: `${SOUNDS_DIR}/Glass.aiff` },
  ])

  useEffect(() => {
    readdir(SOUNDS_DIR)
      .then((files) => {
        const extras = files
          .filter((f) => f.endsWith(".aiff") && f !== "Glass.aiff")
          .map((f) => ({
            label: f.replace(/\.aiff$/, ""),
            value: `${SOUNDS_DIR}/${f}`,
          }))
        setItems([
          { label: "Off", value: false },
          { label: "Default (Glass)", value: `${SOUNDS_DIR}/Glass.aiff` },
          ...extras,
        ])
      })
      .catch(() => {})
  }, [])

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, null, "Play a sound?"),
    React.createElement(SelectInput, {
      items,
      onSelect: (item: SelectItem<unknown>) =>
        onNext(item.value as string | false),
    }),
  )
}

type ModeStepProps = { onNext: (detach: boolean) => void }

const ModeStep: React.FC<ModeStepProps> = ({ onNext }) => {
  const items = [
    { label: "Foreground (watch the countdown)", value: false },
    { label: "Detach (run in background)", value: true },
  ]

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, null, "How should it run?"),
    React.createElement(SelectInput, {
      items,
      onSelect: (item: SelectItem<unknown>) => onNext(item.value as boolean),
    }),
  )
}

type ReviewScreenProps = {
  config: WizardConfig
  icons: IconSet
  onConfirm: () => void
  onCancel: () => void
}

const ReviewScreen: React.FC<ReviewScreenProps> = ({
  config,
  icons,
  onConfirm,
  onCancel,
}) => {
  useInput((_input, key) => {
    if (key.return) onConfirm()
    if (key.escape) onCancel()
  })

  const fireTime = config.fireAt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

  const soundLabel =
    config.sound === false
      ? "off"
      : config.sound === "/System/Library/Sounds/Glass.aiff"
        ? "Glass (default)"
        : config.sound

  return React.createElement(
    Box,
    { flexDirection: "column", gap: 1 },
    React.createElement(Text, { bold: true }, "Review"),
    React.createElement(
      Box,
      { flexDirection: "column" },
      React.createElement(Text, null, `  when     ${fireTime}`),
      React.createElement(
        Text,
        null,
        `  message  ${config.message || "(default)"}`,
      ),
      React.createElement(
        Text,
        null,
        `  notify   ${config.notify ? "yes" : "no"}`,
      ),
      React.createElement(Text, null, `  sound    ${soundLabel}`),
      React.createElement(
        Text,
        null,
        `  mode     ${config.detach ? "detach" : "foreground"}`,
      ),
    ),
    React.createElement(
      Text,
      { dimColor: true },
      `Press Enter to start ${icons.pointer} Esc to cancel`,
    ),
  )
}

type Step = 0 | 1 | 2 | 3 | 4 | 5

const Wizard: React.FC<{
  icons: IconSet
  onComplete: (config: WizardConfig) => void
}> = ({ icons, onComplete }) => {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>(0)
  const [fireAt, setFireAt] = useState<Date | null>(null)
  const [message, setMessage] = useState("")
  const [notify, setNotify] = useState(true)
  const [sound, setSound] = useState<string | false>(
    "/System/Library/Sounds/Glass.aiff",
  )
  const [detach, setDetach] = useState(false)

  const handleConfirm = (): void => {
    onComplete({ fireAt: fireAt!, message, notify, sound, detach })
    exit()
  }

  const handleCancel = (): void => {
    process.stdout.write("cancelled\n")
    process.exit(0)
  }

  const stepHeader =
    step < 5
      ? React.createElement(Text, { dimColor: true }, `step ${step + 1}/5`)
      : null

  const stepContent = (() => {
    if (step === 0)
      return React.createElement(WhenStep, {
        onNext: (date) => {
          setFireAt(date)
          setStep(1)
        },
      })
    if (step === 1)
      return React.createElement(MessageStep, {
        onNext: (msg) => {
          setMessage(msg)
          setStep(2)
        },
      })
    if (step === 2)
      return React.createElement(NotifyStep, {
        onNext: (n) => {
          setNotify(n)
          setStep(3)
        },
      })
    if (step === 3)
      return React.createElement(SoundStep, {
        onNext: (s) => {
          setSound(s)
          setStep(4)
        },
      })
    if (step === 4)
      return React.createElement(ModeStep, {
        onNext: (d) => {
          setDetach(d)
          setStep(5)
        },
      })
    return React.createElement(ReviewScreen, {
      config: { fireAt: fireAt!, message, notify, sound, detach },
      icons,
      onConfirm: handleConfirm,
      onCancel: handleCancel,
    })
  })()

  return React.createElement(
    Box,
    { flexDirection: "column", gap: 1 },
    stepHeader,
    stepContent,
  )
}

let resolveWizard: ((config: WizardConfig) => void) | null = null

export const runWizard = (icons: IconSet): Promise<WizardConfig> => {
  return new Promise((resolve) => {
    resolveWizard = resolve
    render(
      React.createElement(Wizard, {
        icons,
        onComplete: (config) => {
          resolveWizard?.(config)
        },
      }),
    )
  })
}
