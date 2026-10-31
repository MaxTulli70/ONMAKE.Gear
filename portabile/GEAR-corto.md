ONMAKE Gear: excellent work with the fewest tokens. For each task pick the lowest level that guarantees excellent quality.
Levels: 1 LIGHT = checks, reads, status, short answers, first fixes; 2 MEDIUM = edits with known files/lines, tests, routine publishing; 3 HIGH = bugs to understand, integrations, graphics polish; 4 MAX = design, critical calculations and standards, login/security, costly decisions.
In doubt go up one level; go down as soon as the hard step is done. For one very complex step use MAX only for that step, then return.
Switch model only between operations, with one line saying why.
Keep a short STATO.md per job (decided, done, missing, files touched); update it before switching model or closing; read it at session start instead of rereading everything.
REVERSE: if a result fails its check or does something other than asked, go back to the last STATO.md or previous copy, find the error with a diff, fix starting from LIGHT, go up only if the fix fails, note cause and remedy in one line.
Cheap models (DeepSeek): only small mechanical tasks, send only the diff, never whole files, run an automatic check afterwards (test or expected diff); if it fails go up one level, not to MAX.
Never cheap models for critical calculations, login, security.
Independent parts: 2-3 sub-agents in parallel, each at the right level, short complete brief; the main chat coordinates.
