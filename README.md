# ding

A tiny macOS alarm/timer CLI. Set a relative or absolute time, get a desktop notification and a sound when it fires.

Originally built to remember when Claude's usage quota resets — run `ding 5h "quota is back"` and forget about it.

---

## Install

```sh
npm install -g @kud/ding
```

Or link locally during development:

```sh
npm link
```

### Optional dependency

For richer notifications, install `terminal-notifier`:

```sh
brew install terminal-notifier
```

Without it, `ding` falls back to `osascript` — notifications still work, just without actions or sound attachment.

---

## Usage

```
ding <time> [message] [options]
```

### Time formats

**Relative duration** — fires after a delay from now:

```sh
ding 5h                  # 5 hours
ding 90m                 # 90 minutes
ding 30s                 # 30 seconds
ding 1h30m               # 1 hour 30 minutes
ding 2h15m30s            # compound
ding 45                  # bare number = minutes
```

**Absolute clock time** — fires at a specific time today (or tomorrow if already past):

```sh
ding 14:30               # 24-hour
ding 2:30pm              # 12-hour with am/pm
ding 9am                 # hour only
ding 14:30:00            # with seconds
```

### Examples

```sh
# Basic timer — live countdown in terminal
ding 5h "quota is back"

# Absolute time
ding 14:30 "stand-up"

# Silent notification only
ding 30m "check the oven" --no-sound

# Sound only, no notification
ding 1h --no-notify

# Custom sound file
ding 20m "meeting" --sound ~/Downloads/alarm.aiff

# Custom notification title
ding 10m "deploy done" --title "CI"

# Open a URL when the notification is clicked
ding 5h "quota is back" --open https://claude.ai --subtitle "Anthropic"

# Use the notification banner's built-in sound (separate from the afplay alarm)
ding 30m "stand-up" --notify-sound Glass

# Detach — return the prompt immediately, fires in background
ding 5h "quota is back" --detach
ding 9am "morning check" -d
```

### Options

| Flag                    | Alias | Description                                                                     |
| ----------------------- | ----- | ------------------------------------------------------------------------------- |
| `--detach`              | `-d`  | Background the process; prints fire time and PID, then exits                    |
| `--sound <path>`        | `-s`  | Custom audio file played via `afplay` when the alarm fires (default: Glass)     |
| `--no-sound`            |       | Disable alarm sound entirely                                                    |
| `--no-notify`           |       | Disable desktop notification                                                    |
| `--title <text>`        |       | Notification title (default: `ding`)                                            |
| `--subtitle <text>`     |       | Notification subtitle                                                           |
| `--icon <path>`         |       | Absolute path to a custom notification icon image                               |
| `--open <url>`          |       | URL opened when the notification is clicked (e.g. `https://claude.ai`)          |
| `--notify-sound <name>` |       | Notification banner sound name (e.g. `Glass`, `Ping`) — distinct from `--sound` |
| `--icons <mode>`        |       | Icon set: `nerd` (default), `emoji`, or `ascii`. Also via `DING_ICONS` env var  |
| `--help`                | `-h`  | Show help                                                                       |
| `--version`             | `-V`  | Show version                                                                    |

### Icon sets

The countdown and done line use icons from the active icon set. Three modes are available:

| Mode    | How to activate                       | Requires                          |
| ------- | ------------------------------------- | --------------------------------- |
| `nerd`  | default (no flag needed)              | a Nerd Font-patched terminal font |
| `emoji` | `--icons emoji` or `DING_ICONS=emoji` | any modern terminal               |
| `ascii` | `--icons ascii` or `DING_ICONS=ascii` | nothing                           |

`--icons` takes precedence over `DING_ICONS`. The default `nerd` mode uses Private Use Area glyphs from the Nerd Fonts patch set (nf-fa-hourglass `U+F254`, nf-fa-check `U+F00C`, nf-fa-chevron-right `U+F054`). If your terminal font is not Nerd Font-patched, use `--icons emoji` or set `DING_ICONS=emoji` in your shell profile.

```sh
ding 5m "test" --icons emoji
DING_ICONS=ascii ding 5m "test"
```

### Foreground mode (default)

Without `--detach`, the terminal shows a live re-rendering countdown:

```
ding fires at 19:45:00 — quota is back
04:59:58 ▸ quota is back
```

Press `Ctrl-C` to cancel cleanly.

### Detach mode

```sh
$ ding 5h "quota is back" --detach
ding fires at 19:45:00
detached — pid 12345, args: 5h quota is back
$
```

The detached process fires the notification and sound at the target time with no terminal required.

---

## Development

```sh
npm install
npm run dev -- 5s "test"   # run from source
npm run build              # compile to dist/
npm run typecheck          # TypeScript check
```

After `npm link`, use the `ding` binary directly.

---

## Licence

MIT — Erwann Mest
