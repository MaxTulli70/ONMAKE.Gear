# ONMAKE Gear

The right model at the right moment for the task at hand, with effort matched to the task: excellent work, optimised tokens, always leaning to saving, with excellent quality.

**What it does.** At the start of every Claude Code session, ONMAKE Gear gives the session a rule: pick the lowest model + effort pair that guarantees excellent quality; go up if a check fails, go down when the hard step is done; use a short peak of maximum effort only for the essential step; keep a short `STATO.md` per job; switch model only between operations and say so in one line; REVERSE gear fixes errors starting from the lowest level. The rule in `portabile/GEAR.md` is portable and works with any AI.

| Task | Model | Effort |
|---|---|---|
| Checks, reads, short answers | Haiku | low |
| Edits with known files and lines, tests | Sonnet | medium |
| Bugs to understand, integrations, graphics | Sonnet | high |
| Design, critical calculations, security | Opus | high, peak at maximum |
| REVERSE: fixing errors | Haiku | low (goes up only if the fix fails) |

**Install.**
```
claude plugin marketplace add MaxTulli70/ONMAKE.Gear
claude plugin install onmake-gear@onmake
```
License MIT. Version 0.1.0, in testing.

Italiano: see [README.it.md](README.it.md).
