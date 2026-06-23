export type IconMode = "nerd" | "emoji" | "ascii"

export type IconSet = {
  timer: string
  timerFrames: readonly string[]
  done: string
  pointer: string
  bell: string
}

const NERD: IconSet = {
  timer: "\uf017",
  timerFrames: ["\uf017", "\uf251", "\uf252"],
  done: "\uf00c",
  pointer: "\uf054",
  bell: "\uf0f3",
}

const EMOJI: IconSet = {
  timer: "⏳",
  timerFrames: ["⏳", "⌛"],
  done: "✓",
  pointer: "▸",
  bell: "🔔",
}

const ASCII: IconSet = {
  timer: "[*]",
  timerFrames: ["|", "/", "-", "\\"],
  done: "[x]",
  pointer: ">",
  bell: "(!)",
}

const ICON_SETS: Record<IconMode, IconSet> = {
  nerd: NERD,
  emoji: EMOJI,
  ascii: ASCII,
}

const VALID_MODES = new Set<string>(["nerd", "emoji", "ascii"])

const resolveMode = (flagValue: string | undefined): IconMode => {
  if (flagValue !== undefined) {
    if (!VALID_MODES.has(flagValue)) {
      process.stderr.write(
        `error: invalid --icons value "${flagValue}" — must be one of: nerd, emoji, ascii\n`,
      )
      process.exit(1)
    }
    return flagValue as IconMode
  }

  const envValue = process.env.DING_ICONS
  if (envValue !== undefined) {
    if (!VALID_MODES.has(envValue)) {
      process.stderr.write(
        `error: invalid DING_ICONS value "${envValue}" — must be one of: nerd, emoji, ascii\n`,
      )
      process.exit(1)
    }
    return envValue as IconMode
  }

  return "nerd"
}

export const resolveIcons = (flagValue?: string): IconSet =>
  ICON_SETS[resolveMode(flagValue)]
