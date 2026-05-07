# T-99.1 — Zellij swap (replace tmux in orchestrate.ts)

> Replace tmux with Zellij as the worker pane manager. Zellij has a session/window/pane model very close to tmux — most calls map 1:1.

## Why

- Better UX for monitoring 5+ parallel workers (named tabs visible at all times)
- Layout files declarative (KDL) — can pre-define a layout for the orchestrator session
- Modern, active community, single Rust binary
- Same session-persistence model as tmux (detach/reattach works)

## Scope

- Replace ALL `tmux` shell-outs in `scripts/orchestrate.ts` with `zellij` equivalents
- Keep the same external API (`spawn`, `attach`, `status` show panes the same way)
- Verify session persistence (Ctrl-q d to detach, re-attach works)
- Update help text in `cmdAttach`
- Update CLAUDE-equivalent docs if any reference tmux specifically

## Out of scope

- KDL layout file (nice-to-have, can add later)
- Plugin install
- Removing tmux from system (keep both available)

## Command mapping

| tmux | zellij |
|---|---|
| `tmux has-session -t wind-acc` | `zellij list-sessions \| grep -q '^wind-acc'` |
| `tmux new-session -d -s wind-acc -n orchestrator zsh -i` | `zellij --session wind-acc --layout default options --default-shell zsh` (or use `setsid zellij ...` for detached) |
| `tmux new-window -t wind-acc -n T-1.7 zsh -i` then `send-keys` | `zellij --session wind-acc action new-tab --name T-1.7` then `action write-chars` |
| `tmux list-windows -t wind-acc -F '#{window_name}'` | `zellij --session wind-acc action query-tab-names` (or parse output of `zellij action dump-screen`) |
| `tmux send-keys -t <pane> '<cmd>' Enter` | `zellij --session wind-acc action write-chars '<cmd>'` then `write 13` (Enter is keycode 13) |

## Pre-flight

Worker must verify zellij installed:
```bash
which zellij || brew install zellij
```

## Implementation steps

1. `brew install zellij` (if missing)
2. Add `zellijAvailable()` and `sessionExists()` helpers using zellij CLI
3. Add `ensureSession()` that creates a detached session
4. Replace `spawnInPane()` to use `zellij action new-tab` + `write-chars`
5. Replace `listWindows()` with zellij-based equivalent
6. Update `cmdAttach()` text to show `zellij attach wind-acc`
7. Test: spawn 1 task, attach, detach, verify worker still running, mark done, verify pane closes

## Files to edit

- `scripts/orchestrate.ts` (EDIT — only tmux-related sections)

## Files NOT to touch

- Workers' own behavior (template stays the same)
- Notify, healthcheck, file-conflict logic
- Phase markdown
