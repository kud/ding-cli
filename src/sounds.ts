import {
  existsSync,
  mkdirSync,
  writeFileSync,
  statSync,
  readdirSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SAMPLE_RATE = 44100
const SYSTEM_SOUNDS_DIR = "/System/Library/Sounds"
const RINGTONES_DIR =
  "/System/Library/PrivateFrameworks/ToneLibrary.framework/Versions/A/Resources/Ringtones"
const RINGTONE_SUFFIX = "-EncoreInfinitum.m4r"
const CACHE_DIR = join(tmpdir(), "ding-sounds")

export const ALARM_PRESETS = [
  "beep",
  "digital",
  "radar",
  "bell",
  "siren",
  "chime",
] as const

export type AlarmPreset = (typeof ALARM_PRESETS)[number]

const isAlarmPreset = (value: string): value is AlarmPreset =>
  (ALARM_PRESETS as readonly string[]).includes(value)

type Sample = number

const encodeWav = (samples: Sample[]): Buffer => {
  const dataLength = samples.length * 2
  const buffer = Buffer.alloc(44 + dataLength)

  buffer.write("RIFF", 0, "ascii")
  buffer.writeUInt32LE(36 + dataLength, 4)
  buffer.write("WAVE", 8, "ascii")
  buffer.write("fmt ", 12, "ascii")
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write("data", 36, "ascii")
  buffer.writeUInt32LE(dataLength, 40)

  let offset = 44
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample))
    buffer.writeInt16LE(Math.round(clamped * 32767), offset)
    offset += 2
  }
  return buffer
}

type Tone = {
  frequency: number
  durationMs: number
  waveform?: "sine" | "square"
  attackMs?: number
  releaseMs?: number
  decay?: boolean
  amplitude?: number
}

const sampleCount = (durationMs: number): number =>
  Math.round((durationMs / 1000) * SAMPLE_RATE)

const oscillate = (waveform: "sine" | "square", phase: number): number => {
  const value = Math.sin(phase)
  return waveform === "square" ? (value >= 0 ? 1 : -1) : value
}

const renderTone = (tone: Tone): Sample[] => {
  const {
    frequency,
    durationMs,
    waveform = "sine",
    attackMs = 4,
    releaseMs = 12,
    decay = false,
    amplitude = 0.6,
  } = tone
  const count = sampleCount(durationMs)
  const attack = sampleCount(attackMs)
  const release = sampleCount(releaseMs)
  const samples: Sample[] = new Array(count)

  for (let i = 0; i < count; i++) {
    const phase = (2 * Math.PI * frequency * i) / SAMPLE_RATE
    const envelope = decay
      ? Math.exp((-5 * i) / count)
      : i < attack
        ? i / attack
        : i > count - release
          ? (count - i) / release
          : 1
    samples[i] = oscillate(waveform, phase) * envelope * amplitude
  }
  return samples
}

const renderSweep = (
  fromHz: number,
  toHz: number,
  durationMs: number,
  amplitude = 0.6,
): Sample[] => {
  const count = sampleCount(durationMs)
  const samples: Sample[] = new Array(count)
  let phase = 0
  for (let i = 0; i < count; i++) {
    const t = i / count
    const frequency = fromHz + (toHz - fromHz) * t
    phase += (2 * Math.PI * frequency) / SAMPLE_RATE
    const envelope =
      i < count * 0.05
        ? i / (count * 0.05)
        : i > count * 0.9
          ? (count - i) / (count * 0.1)
          : 1
    samples[i] = Math.sin(phase) * envelope * amplitude
  }
  return samples
}

const silence = (durationMs: number): Sample[] =>
  new Array(sampleCount(durationMs)).fill(0)

const concat = (...groups: Sample[][]): Sample[] =>
  ([] as Sample[]).concat(...groups)

const PRESET_BUILDERS: Record<AlarmPreset, () => Sample[]> = {
  beep: () =>
    concat(
      ...Array.from({ length: 4 }, () =>
        concat(
          renderTone({
            frequency: 880,
            durationMs: 140,
            waveform: "square",
            amplitude: 0.4,
          }),
          silence(120),
        ),
      ),
    ),
  digital: () =>
    concat(
      ...Array.from({ length: 3 }, () =>
        concat(
          renderTone({ frequency: 1318, durationMs: 90 }),
          silence(60),
          renderTone({ frequency: 1318, durationMs: 90 }),
          silence(60),
          renderTone({ frequency: 1318, durationMs: 90 }),
          silence(300),
        ),
      ),
    ),
  radar: () =>
    concat(
      ...Array.from({ length: 3 }, () =>
        concat(renderSweep(440, 1240, 520, 0.55), silence(180)),
      ),
    ),
  bell: () =>
    concat(
      ...Array.from({ length: 3 }, () =>
        concat(
          renderTone({
            frequency: 660,
            durationMs: 900,
            decay: true,
            amplitude: 0.7,
          }),
          silence(120),
        ),
      ),
    ),
  siren: () =>
    concat(
      ...Array.from({ length: 4 }, () =>
        concat(
          renderTone({ frequency: 700, durationMs: 320, amplitude: 0.5 }),
          renderTone({ frequency: 550, durationMs: 320, amplitude: 0.5 }),
        ),
      ),
    ),
  chime: () =>
    concat(
      renderTone({
        frequency: 523,
        durationMs: 240,
        decay: true,
        amplitude: 0.6,
      }),
      renderTone({
        frequency: 659,
        durationMs: 240,
        decay: true,
        amplitude: 0.6,
      }),
      renderTone({
        frequency: 784,
        durationMs: 240,
        decay: true,
        amplitude: 0.6,
      }),
      renderTone({
        frequency: 1046,
        durationMs: 700,
        decay: true,
        amplitude: 0.7,
      }),
    ),
}

const ensureCacheDir = (): void => {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
}

const isUsableFile = (path: string): boolean => {
  try {
    return statSync(path).size > 44
  } catch {
    return false
  }
}

export const generatePreset = (preset: AlarmPreset): string => {
  ensureCacheDir()
  const path = join(CACHE_DIR, `${preset}.wav`)
  if (isUsableFile(path)) return path
  writeFileSync(path, encodeWav(PRESET_BUILDERS[preset]()))
  return path
}

const isSystemSoundName = (value: string): boolean =>
  existsSync(join(SYSTEM_SOUNDS_DIR, `${value}.aiff`))

export const listSystemSounds = (names: string[]): string[] =>
  names
    .filter((name) => name.endsWith(".aiff"))
    .map((name) => name.replace(/\.aiff$/, ""))
    .sort()

export type Ringtone = { name: string; path: string }

export const listRingtones = (): Ringtone[] => {
  try {
    return readdirSync(RINGTONES_DIR)
      .filter((name) => name.endsWith(RINGTONE_SUFFIX))
      .map((name) => ({
        name: name.slice(0, -RINGTONE_SUFFIX.length),
        path: join(RINGTONES_DIR, name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

const ringtonePath = (value: string): string | null => {
  const path = join(RINGTONES_DIR, `${value}${RINGTONE_SUFFIX}`)
  return existsSync(path) ? path : null
}

export const resolveSound = (choice: string): string => {
  if (choice.startsWith("/")) return choice
  if (
    choice.endsWith(".aiff") ||
    choice.endsWith(".wav") ||
    choice.endsWith(".m4r")
  )
    return choice
  if (isAlarmPreset(choice)) return generatePreset(choice)
  const ringtone = ringtonePath(choice)
  if (ringtone !== null) return ringtone
  if (isSystemSoundName(choice))
    return join(SYSTEM_SOUNDS_DIR, `${choice}.aiff`)
  return choice
}
