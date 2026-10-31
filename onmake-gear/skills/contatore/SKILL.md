---
name: contatore
description: Show tokens used per model and per gear level (light/medium/high/max) from a Claude Code session transcript, to prove the saving. / Mostra i token usati per modello e per livello gear da una trascrizione di Claude Code, per dimostrare il risparmio.
---

Run / Lancia: `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/contatore.py [file.jsonl]`

EN: no argument = the most recent transcript of the current project (`~/.claude/projects/<project>/`). Sub-agents are read from their own files in `<session>/subagents/` and grouped by gear level (agentType in the `.meta.json`). Python 3 standard library only. Counts each message once (streamed copies are merged). Total = input + output + cache written + cache read.

IT: senza argomento usa la trascrizione più recente del progetto corrente. I sotto-agenti si leggono dai loro file in `<sessione>/subagents/` e si raggruppano per livello gear. Solo python3 standard. Ogni messaggio è contato una volta. Totale = input + output + cache scritta + cache letta.
