import chalk from "chalk"
import { defineCommand, runMain } from "citty"
import { runForegroundCountdown } from "./countdown.js"
import { spawnDetached } from "./detach.js"
import {
  DEFAULT_FAIL_SOUND,
  execLogPath,
  formatOutcome,
  runExec,
  tailLines,
  type ExecOutcome,
} from "./exec.js"
import { resolveIcons } from "./icons.js"
import {
  sendNotification,
  DEFAULT_SOUND,
  type NotifyOptions,
} from "./notify.js"
import { parseTime } from "./parse-time.js"
import { ringOnce } from "./ringer.js"
import { runWizard } from "./wizard/wizard.js"

const DEFAULT_TITLE = "ding"
const DEFAULT_MESSAGE = "⏰ Time's up"

const URL_PATTERN = /^https?:\/\/.+/

// citty parses `--no-x` as a negation of `x`, so it sets `notify: false` and
// leaves the declared `"no-notify"` arg at its default — the declared arg is
// never the one that carries the user's intent. Reading only the declared name
// is why `--no-notify` silently did nothing; `--no-sound` appeared to work
// solely because `sound: false` survived the `?? DEFAULT_SOUND` fallback.
// Both spellings are honoured here so the declared flags stay in --help.
const isDisabled = (args: Record<string, unknown>, flag: string): boolean =>
  args[`no-${flag}`] === true || args[flag] === false

const stringArg = (
  args: Record<string, unknown>,
  flag: string,
): string | undefined =>
  typeof args[flag] === "string" ? (args[flag] as string) : undefined

const formatFireTime = (fireAt: Date): string =>
  fireAt.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

const formatAsTimeString = (date: Date): string =>
  date.toTimeString().slice(0, 8)

const notifyOnFire = (opts: {
  title: string
  message: string
  notify: boolean
  subtitle?: string
  icon?: string
  open?: string
  notifySound?: string
}): void => {
  if (!opts.notify) return
  const notifyOpts: NotifyOptions = {
    title: opts.title,
    message: opts.message,
  }
  if (opts.subtitle !== undefined) notifyOpts.subtitle = opts.subtitle
  if (opts.icon !== undefined) notifyOpts.icon = opts.icon
  if (opts.open !== undefined) notifyOpts.open = opts.open
  if (opts.notifySound !== undefined) notifyOpts.notifySound = opts.notifySound
  sendNotification(notifyOpts)
}

type RunConfig = {
  rawTime: string
  fireAt: Date
  message: string
  title: string
  sound: string | false
  notify: boolean
  detach: boolean
  subtitle?: string
  icon?: string
  open?: string
  notifySound?: string
  iconsFlag?: string
  exec?: string
  execFailSound: string
}

const FAILURE_TAIL_LINES = 20

const reportExec = (
  outcome: ExecOutcome,
  opts: { notify: boolean; sound: string | false; failSound: string },
): void => {
  const label = formatOutcome(outcome)

  if (outcome.code === 0 && outcome.signal === null) {
    process.stdout.write(
      `${chalk.hex("#a3e635")("ding")} → ${chalk.bold("exec ok")}${chalk.dim(` · ${label} · ${outcome.logPath}`)}\n`,
    )
    return
  }

  process.exitCode = outcome.code

  // ringOnce rather than playSound: playSound is spawnSync, so it would hold
  // the siren's whole duration before the banner and the stderr line appear.
  // The non-zero exit is exactly the case where that delay is felt, which is
  // the same ordering trap the blocking ring had one layer up.
  if (opts.sound !== false) ringOnce(opts.failSound)
  if (opts.notify)
    sendNotification({
      title: "ding — command failed",
      message: `${label} · ${outcome.command}`,
      subtitle: outcome.logPath,
    })

  process.stderr.write(
    `${chalk.red("ding")} → ${chalk.bold("exec failed")}${chalk.dim(` · ${label} · ${outcome.logPath}`)}\n`,
  )
  const tail = tailLines(outcome.output, FAILURE_TAIL_LINES)
  if (tail.length > 0) process.stderr.write(`${chalk.dim(tail)}\n`)
}

const run = async (config: RunConfig): Promise<void> => {
  const {
    rawTime,
    fireAt,
    message,
    title,
    sound,
    notify,
    detach,
    subtitle,
    icon,
    open,
    notifySound,
    iconsFlag,
    exec,
    execFailSound,
  } = config
  const icons = resolveIcons(iconsFlag)

  if (detach) {
    const forwardArgs = [rawTime]
    if (message !== DEFAULT_MESSAGE) forwardArgs.push(message)
    if (title !== DEFAULT_TITLE) forwardArgs.push("--title", title)
    if (sound === false) forwardArgs.push("--no-sound")
    if (!notify) forwardArgs.push("--no-notify")
    if (sound && sound !== DEFAULT_SOUND) forwardArgs.push("--sound", sound)
    if (subtitle !== undefined) forwardArgs.push("--subtitle", subtitle)
    if (icon !== undefined) forwardArgs.push("--icon", icon)
    if (open !== undefined) forwardArgs.push("--open", open)
    if (notifySound !== undefined)
      forwardArgs.push("--notify-sound", notifySound)
    if (iconsFlag !== undefined) forwardArgs.push("--icons", iconsFlag)
    if (exec !== undefined) forwardArgs.push("--exec", exec)
    if (execFailSound !== DEFAULT_FAIL_SOUND)
      forwardArgs.push("--exec-fail-sound", execFailSound)
    process.stdout.write(
      `${chalk.hex("#a3e635")("ding")} → ${chalk.bold(formatFireTime(fireAt))}${chalk.dim(" (detached)\n")}`,
    )
    if (exec !== undefined)
      process.stdout.write(chalk.dim(`exec output → ${execLogPath()}\n`))
    spawnDetached(forwardArgs)
    return
  }

  process.stdout.write(
    `${chalk.hex("#a3e635")("ding")} → ${chalk.bold(formatFireTime(fireAt))}${message !== DEFAULT_MESSAGE ? chalk.dim(` · ${message}`) : ""}\n`,
  )

  // The command starts inside onFire and is awaited only once the countdown
  // view has exited. Awaiting it there instead would stall the render loop —
  // and in a TTY the alarm keeps ringing until a key is pressed, so the
  // command would not start until a human turned up, which is the one thing
  // --exec exists to avoid.
  const pending: { exec?: Promise<ExecOutcome> } = {}

  await runForegroundCountdown(
    fireAt,
    message,
    icons,
    sound,
    () => {
      notifyOnFire({
        title,
        message,
        notify,
        subtitle,
        icon,
        open,
        notifySound,
      })
      if (exec !== undefined) pending.exec = runExec(exec)
    },
    exec !== undefined,
  )

  if (pending.exec !== undefined)
    reportExec(await pending.exec, {
      notify,
      sound,
      failSound: execFailSound,
    })
}

const main = defineCommand({
  meta: {
    name: "ding",
    version: "0.1.0",
    description:
      "A tiny macOS alarm/timer CLI — set a relative or absolute time, get a notification and a sound when it fires",
  },
  args: {
    time: {
      type: "positional",
      description:
        "Duration (5h, 90m, 30s, 1h30m, 45) or clock time (14:30, 2:30pm, 9am)",
      required: false,
    },
    message: {
      type: "positional",
      description: "Notification body text",
      required: false,
    },
    interactive: {
      type: "boolean",
      alias: "i",
      description: "Launch interactive wizard",
      default: false,
    },
    detach: {
      type: "boolean",
      alias: "d",
      description: "Background the process and return the prompt immediately",
      default: false,
    },
    sound: {
      type: "string",
      alias: "s",
      description:
        'Alarm sound on fire: a preset (beep, digital, radar, bell, siren, chime), a macOS Clock ringtone name (e.g. Daybreak, Radial, "Milky Way"), a macOS system sound name (e.g. Glass), or a path to an audio file (default: bell)',
    },
    "no-sound": {
      type: "boolean",
      description: "Disable alarm sound entirely",
      default: false,
    },
    "no-notify": {
      type: "boolean",
      description: "Disable desktop notification",
      default: false,
    },
    title: {
      type: "string",
      description: `Notification title (default: "${DEFAULT_TITLE}")`,
    },
    subtitle: {
      type: "string",
      description: "Notification subtitle",
    },
    icon: {
      type: "string",
      description: "Absolute path to a custom notification icon image",
    },
    open: {
      type: "string",
      description:
        "URL to open when the notification is clicked (e.g. https://claude.ai)",
    },
    "notify-sound": {
      type: "string",
      description:
        'Built-in macOS notification banner sound name (e.g. "Glass", "Ping") — separate from --sound which plays via afplay',
    },
    icons: {
      type: "string",
      description:
        'Icon set: "nerd" (default, requires Nerd Font), "emoji", or "ascii". Overrides DING_ICONS env var.',
    },
    exec: {
      type: "string",
      description:
        "Shell command to run when the timer fires, via /bin/sh -c, inheriting ding's environment. Output is appended to ~/Library/Logs/ding/exec.log (override with DING_EXEC_LOG); a non-zero exit plays --exec-fail-sound, sends a failure notification, and makes ding exit with the same status. Does not imply --detach.",
    },
    "exec-fail-sound": {
      type: "string",
      description: `Sound played when --exec exits non-zero (default: ${DEFAULT_FAIL_SOUND}). Takes the same values as --sound; silenced by --no-sound.`,
    },
  },
  run: async ({ args }) => {
    const rawTime = args.time as string | undefined
    const isInteractive = (args.interactive as boolean) || !rawTime
    const iconsFlag = stringArg(args, "icons")
    const openUrl = stringArg(args, "open")
    const exec = stringArg(args, "exec")
    const execFailSound =
      stringArg(args, "exec-fail-sound") ?? DEFAULT_FAIL_SOUND

    if (openUrl !== undefined && !URL_PATTERN.test(openUrl)) {
      process.stderr.write(
        `error: --open value "${openUrl}" does not look like a URL (must start with http:// or https://)\n`,
      )
      process.exit(1)
    }

    if (isInteractive) {
      const wizardConfig = await runWizard()
      await run({
        rawTime: formatAsTimeString(wizardConfig.fireAt),
        fireAt: wizardConfig.fireAt,
        message: wizardConfig.message || DEFAULT_MESSAGE,
        title: DEFAULT_TITLE,
        sound: wizardConfig.sound,
        notify: wizardConfig.notify,
        detach: wizardConfig.detach,
        iconsFlag,
        exec,
        execFailSound,
      })
      return
    }

    const message = stringArg(args, "message") ?? DEFAULT_MESSAGE
    const title = stringArg(args, "title") ?? DEFAULT_TITLE
    const detach = args.detach as boolean
    const noSound = isDisabled(args, "sound")
    const noNotify = isDisabled(args, "notify")
    const customSound = stringArg(args, "sound")
    const subtitle = stringArg(args, "subtitle")
    const icon = stringArg(args, "icon")
    const notifySound = stringArg(args, "notify-sound")

    const soundPath: string | false = noSound
      ? false
      : (customSound ?? DEFAULT_SOUND)

    const parseResult = (() => {
      try {
        return parseTime(rawTime!)
      } catch (err) {
        process.stderr.write(
          `${chalk.red("error:")} ${err instanceof Error ? err.message : String(err)}\n`,
        )
        process.exit(1)
      }
    })()

    const { fireAt } = parseResult

    await run({
      rawTime: rawTime!,
      fireAt,
      message,
      title,
      sound: soundPath,
      notify: !noNotify,
      detach,
      subtitle,
      icon,
      open: openUrl,
      notifySound,
      iconsFlag,
      exec,
      execFailSound,
    })
  },
})

runMain(main)
