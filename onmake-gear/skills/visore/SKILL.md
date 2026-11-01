---
name: visore
description: Show the gear changing live: a self-refreshing HTML timeline (lanes LIGHT, MEDIUM, HIGH, OPUS, MAX, arrows for up/down shifts) built from the session's gear sub-agents. / Mostra la marcia che cambia: linea del tempo HTML che si ricarica da sola, con una corsia per livello e frecce di salita e discesa.
---

Run / Lancia: `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/visore.py [--sessione ID|file.jsonl] [--terminale] [file.html]`

EN: no session = the most recent transcript of the current project. Writes one self-contained HTML file (default `/Volumes/M2/Archivio-APP/APP-Max/Claude Code files/gear-visore.html`, reloads every 3 s, light/dark theme): current gear, number of climbs and descents, and per block model, effort, duration and tokens. `--terminale` prints one line per sub-agent instead, with ▲ ▼ ● and the level. Times come from the sub-agent transcripts; a missing time is shown as such. Python 3 standard library only.

IT: senza sessione usa la trascrizione più recente del progetto corrente. Scrive un solo file HTML autonomo (default `/Volumes/M2/Archivio-APP/APP-Max/Claude Code files/gear-visore.html`, si ricarica ogni 3 s, tema chiaro/scuro): marcia attuale, numero di salite e discese, e per ogni blocco modello, effort, durata e token. `--terminale` stampa invece una riga per sotto-agente con ▲ ▼ ● e il livello. Gli orari vengono dalle trascrizioni dei sotto-agenti; se manca, è indicato. Solo python3 standard.
