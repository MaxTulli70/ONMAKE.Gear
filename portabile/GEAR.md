# ONMAKE Gear (portable rule, valid for any AI) / regola portabile, vale per qualsiasi AI

**EN.** Goal: excellent work with as few tokens as possible. Always START at LIGHT and go up only when it fails (check failed, result differs from the request) or when failure is presumed (bug cause unknown after one try, many files to understand together, design/architecture, xTdC calculations and standards, login and security, costly decisions): then start directly at the level needed, without failing first. When going up, pass a short brief of what was tried.
**IT.** Obiettivo: lavoro eccellente con meno token possibili. Parti SEMPRE da LEGGERO e sali solo quando non riesce (controllo fallito, risultato diverso dalla richiesta) o si presume che non riesca (causa del bug ignota dopo una prova, molti file da capire insieme, progetto/architettura, calcoli e norme xTdC, login e sicurezza, decisioni costose): allora parti direttamente dal livello che serve, senza prima fallire. Al salire passa un brief breve con cosa è stato provato.

## Levels / Livelli (not model names / non nomi di modelli)
1. LIGHT / LEGGERO: checks, reads, status, short answers; corrections (REVERSE) start here. / controlli, letture, stato, risposte brevi; le correzioni (REVERSE) partono da qui.
2. MEDIUM / MEDIO: edits with known files and lines, tests, routine publishing. / modifiche con file e righe noti, test, pubblicazioni di routine.
3. HIGH / ALTO: bugs to understand, integrations, graphics to polish. / bug da capire, integrazioni, grafica da rifinire.
4. MAX / MASSIMO: design, critical calculations and standards, login and security, decisions that are costly if wrong. / progettazione, calcoli e norme critici, login e sicurezza, decisioni che costano se sbagliate.

## Map to your tool / Mappa sullo strumento
| Level / Livello | Claude Code | opencode (ONMAKE setup) | Web chats / Chat web |
|---|---|---|---|
| LIGHT | Haiku 5.5, effort low | local small model (Spark-X2.5-4B, Granite) for checked small jobs | smallest model |
| MEDIUM | Sonnet 5.5, effort medium | DeepSeek-V4-Pro, small pieces | mid model |
| HIGH | Sonnet 5.5, effort high | DeepSeek-V4-Pro with automatic check | strongest model, normal mode |
| MAX | Opus 5.5, effort high, peak at maximum | hand over to Claude Code (Opus) | strongest model, extended thinking |

Web chats cannot read local files: paste this file and your STATO.md at the start. / Le chat web non leggono file locali: incolla questo file e lo STATO.md all'inizio.

## Rules / Regole
- Quality is never sacrificed; shift down at once, even several levels, as soon as the work gets simpler (cause found, only mechanical work left, hard step closed). / La qualità non si sacrifica; scendi subito, anche di più livelli, appena il lavoro si semplifica (causa trovata, resta lavoro meccanico, passo difficile chiuso).
- Peak: for a very complex step use the maximum, only for that step, then return to the normal level. / Picco: per un passo molto complesso usa il massimo, solo per quel passo, poi torna al livello normale.
- Switch model only between operations, with one line saying why. / Cambia modello solo tra un'operazione e l'altra, con una riga che dice perché.
- Keep a short STATO.md per job (decided, done, missing, files touched): update it before switching model or closing, read it at session start instead of rereading everything. / STATO.md breve per ogni lavoro (deciso, fatto, manca, file toccati): aggiornalo prima di cambiare modello o chiudere, leggilo a inizio sessione.
- REVERSE: if a result fails its check or does something other than asked, go back to the last STATO.md or the previous copy, find the error with a diff, fix starting from LIGHT, go up only if the fix fails, note cause and remedy in one line. / RETROMARCIA: se un risultato non passa il controllo o fa altro da quanto chiesto, torna all'ultimo STATO.md o alla copia precedente, trova l'errore con un diff, correggi dal livello LEGGERO, sali solo se la correzione fallisce, annota causa e rimedio in una riga.
- Mechanical code: small pieces with an automatic check, never whole files. / Codice meccanico: pezzi piccoli con controllo automatico, mai file interi.
- Sub-agents: if a task splits into independent parts, run 2 or 3 sub-agents in parallel, each on the right level for its part, with a short complete brief; only results come back. The main chat stays on its normal level and coordinates; do not open new chats for tasks, everything works in the same chat and sub-agents start only when the task needs them. / Sotto-agenti: se il compito si divide in parti indipendenti, 2 o 3 sotto-agenti in parallelo, ognuno al livello giusto; la chat principale coordina.
- Claude Code: the plugin ships four sub-agents (gear-light, gear-medium, gear-high, gear-max) whose model and effort are set in their frontmatter. / Claude Code: il plugin porta quattro sotto-agenti con modello ed effort già impostati.
- Claude Code note: a session cannot change its own model or effort with the session tools (they refuse the current session); use the gear sub-agents for the right level, and opusplan for the main chat. / Nota Claude Code: una sessione non può cambiare da sola modello ed effort con gli strumenti di sessione; usa i sotto-agenti gear e opusplan per la chat principale.
- DeepSeek / cheap models: they often do something other than asked, so only small mechanical tasks, send only the diff never whole files, run an automatic check afterwards (test or expected diff); if the check fails go up to Sonnet 5.5 medium, not Opus; never DeepSeek for xTdC calculations, login, security. / DeepSeek / modelli economici: spesso fanno altro da quanto chiesto, quindi solo compiti piccoli e meccanici, solo il diff mai file interi, controllo automatico dopo (test o diff atteso); se il controllo fallisce sali a Sonnet 5.5 medio, non a Opus; mai DeepSeek per calcoli xTdC, login, sicurezza.
- COUNTER / CONTATORE: `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/contatore.py` shows tokens per model and per gear level (sub-agents are counted from their own transcript files). / mostra i token per modello e livello.
- VISORE: `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/visore.py` mostra la marcia che cambia (timeline HTML, `--terminale` per righe con ▲ ▼ ●).
