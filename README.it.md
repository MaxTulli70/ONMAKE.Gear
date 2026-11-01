# ONMAKE Gear (italiano)

Il modello giusto al momento giusto per il compito dato, con l'effort allineato al compito: un lavoro ottimo con token ottimizzati, verso il risparmio, con qualità di lavoro eccellente.

![ONMAKE Gear: livelli LIGHT, MEDIUM, HIGH, OPUS (progetti), MAX (un solo passo di picco); si parte da LIGHT, si sale se il controllo fallisce, si scende quando il lavoro si semplifica; REVERSE torna a STATO.md e corregge da LIGHT](docs/gear-schema.it.svg)


## Cosa fa (IT)

All'avvio di ogni sessione di Claude Code, ONMAKE Gear dà alla sessione una regola:

- sceglie la coppia modello + effort più bassa che garantisce qualità eccellente;
- sale se il controllo fallisce o il compito è più difficile, scende a passo difficile finito;
- per un passo molto complesso usa un picco di effort, solo per quel passo, poi torna alla coppia normale;
- tiene un file `STATO.md` breve per ogni lavoro (deciso, fatto, manca, file toccati), da leggere a inizio sessione al posto della conversazione intera;
- cambia modello solo tra un'operazione e l'altra, e avvisa in una riga.

| Livello | Modello | Effort | Agenti per tipo di lavoro |
|---|---|---|---|
| LIGHT | Haiku | basso | `gear-reader` (letture, ricerche, stato), `gear-tester` (test e controlli) |
| MEDIUM | Sonnet | basso, poi medio | `gear-editor` (file e righe noti), `gear-writer` (testi, documentazione) |
| HIGH | Sonnet | basso, poi alto | `gear-debugger` (bug da capire), `gear-reviewer` (revisione del codice) |
| OPUS | Opus | basso, poi alto | `gear-designer` (interfacce), `gear-architect` (progetti), `gear-standards` e `gear-security` (partono da medio) |
| MAX | Opus | massimo, un solo passo | `gear-max` |

Il tipo di lavoro sceglie il modello; l'effort parte basso quando il lavoro si può fare così e sale solo se il controllo fallisce. I progetti (progettazione, architettura, un'interfaccia nuova) partono direttamente da OPUS. REVERSE corregge gli errori partendo da LIGHT.

## Installazione

```
claude plugin marketplace add MaxTulli70/ONMAKE.Gear
claude plugin install onmake-gear@onmake
```

Versione 0.6.0, in prova.

**Barra e pannello.** In Claude Code una barra piccola sopra il campo di scrittura mostra la marcia (etichetta colorata), i token, gli agenti al lavoro ▶, fermi ⏸, completati ✓ e interrotti ✗, l'avanzamento dall'elenco dei passi (5 caselle da 20%) e il tempo attivo; `Dettagli` apre l'elenco degli agenti e un campo per mandare un comando, fermare o far ripartire un'altra sessione dell'app desktop; `Pannello` (o `/gear-pannello`) apre una pagina locale con i nodi del workflow, la linea del tempo, i token per modello e per marcia e il risparmio stimato rispetto a fare tutto in Opus. Tutto viene letto dalle trascrizioni locali; i prezzi della stima si cambiano in `~/.config/onmake-gear/prezzi.json`. Impostazioni: posizione (sopra, o una riga nella riga di stato sotto), discreta, colori.

**Riga di stato.** Mostra la marcia attuale, es. `⚙ LIGHT ▼` (freccia = ultimo salto su/giù, `⚙ –` = nessun sotto-agente gear). L'app desktop non la mostra; nel terminale si attiva così: in `~/.claude/settings.json` metti `statusLine` = `{"type":"command","command":"python3 /percorso/onmake-gear/scripts/statusline.py"}`.

## Contatore token
`python3 onmake-gear/scripts/contatore.py [trascrizione.jsonl]` mostra i token per modello e per livello gear (solo python3 standard). Claude Code salva l'uso dei sotto-agenti in file propri (`<sessione>/subagents/agent-*.jsonl`, tipo nel `.meta.json`): i sotto-agenti sono contati a parte e la chat principale è una riga sola. I duplicati dello streaming sono uniti per id messaggio.

## Altre AI
Per opencode, DeepSeek Harness (dsh), Codex, Gemini, Cursor: `sh portabile/installa-altre-ai.sh` aggiunge un blocco di regole compatto (`portabile/GEAR-corto.md`) ai loro file di istruzioni esistenti, con backup `*.prima-gear`, ripetibile senza effetti. Per toglierlo: `sh portabile/installa-altre-ai.sh --togli`.
