const RELATIVE_PATTERN = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/
const BARE_NUMBER_PATTERN = /^\d+$/
const ABSOLUTE_HM_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/
const ABSOLUTE_AMPM_PATTERN = /^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?(am|pm)$/i

const isAbsoluteForm = (raw: string): boolean =>
  raw.includes(":") || /am|pm/i.test(raw)

const parseRelativeMs = (raw: string): number | null => {
  if (BARE_NUMBER_PATTERN.test(raw)) return parseInt(raw, 10) * 60 * 1000

  const match = raw.match(RELATIVE_PATTERN)
  if (!match || (!match[1] && !match[2] && !match[3])) return null

  const hours = parseInt(match[1] ?? "0", 10)
  const minutes = parseInt(match[2] ?? "0", 10)
  const seconds = parseInt(match[3] ?? "0", 10)
  return (hours * 3600 + minutes * 60 + seconds) * 1000
}

const resolveAbsoluteDate = (h: number, m: number, s: number): Date => {
  const now = new Date()
  const target = new Date(now)
  target.setHours(h, m, s, 0)
  if (target <= now) target.setDate(target.getDate() + 1)
  return target
}

const parseAbsoluteDate = (raw: string): Date | null => {
  const ampmMatch = raw.match(ABSOLUTE_AMPM_PATTERN)
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10)
    const m = parseInt(ampmMatch[2] ?? "0", 10)
    const s = parseInt(ampmMatch[3] ?? "0", 10)
    const meridiem = ampmMatch[4].toLowerCase()
    if (meridiem === "am" && h === 12) h = 0
    if (meridiem === "pm" && h !== 12) h += 12
    if (h > 23 || m > 59 || s > 59) return null
    return resolveAbsoluteDate(h, m, s)
  }

  const hmMatch = raw.match(ABSOLUTE_HM_PATTERN)
  if (hmMatch) {
    const h = parseInt(hmMatch[1], 10)
    const m = parseInt(hmMatch[2], 10)
    const s = parseInt(hmMatch[3] ?? "0", 10)
    if (h > 23 || m > 59 || s > 59) return null
    return resolveAbsoluteDate(h, m, s)
  }

  return null
}

export type ParsedTime =
  | { kind: "relative"; ms: number; fireAt: Date }
  | { kind: "absolute"; fireAt: Date }

export const parseTime = (raw: string): ParsedTime => {
  if (isAbsoluteForm(raw)) {
    const fireAt = parseAbsoluteDate(raw)
    if (!fireAt) throw new Error(`Cannot parse time: "${raw}"`)
    return { kind: "absolute", fireAt }
  }

  const ms = parseRelativeMs(raw)
  if (ms === null || ms <= 0) throw new Error(`Cannot parse duration: "${raw}"`)

  const fireAt = new Date(Date.now() + ms)
  return { kind: "relative", ms, fireAt }
}

const formatSeconds = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const hh = String(h).padStart(2, "0")
  const mm = String(m).padStart(2, "0")
  const ss = String(s).padStart(2, "0")
  return h > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`
}

export const formatDuration = (elapsedMs: number): string =>
  formatSeconds(Math.max(0, Math.floor(elapsedMs / 1000)))

export const formatRemaining = (remainingMs: number): string =>
  formatSeconds(Math.max(0, Math.ceil(remainingMs / 1000)))
