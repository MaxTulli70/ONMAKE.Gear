# ONMAKE Gear

Il modello giusto al momento giusto per il compito dato, con l'effort allineato al compito: un lavoro ottimo con token ottimizzati, verso il risparmio, con qualità di lavoro eccellente.

## Cosa fa

All'avvio di ogni sessione di Claude Code, ONMAKE Gear dà alla sessione una regola:

- sceglie la coppia modello + effort più bassa che garantisce qualità eccellente;
- sale se il controllo fallisce o il compito è più difficile, scende a passo difficile finito;
- per un passo molto complesso usa un picco di effort, solo per quel passo, poi torna alla coppia normale;
- tiene un file `STATO.md` breve per ogni lavoro (deciso, fatto, manca, file toccati), da leggere a inizio sessione al posto della conversazione intera;
- cambia modello solo tra un'operazione e l'altra, e avvisa in una riga.

| Compito | Modello | Effort |
|---|---|---|
| Controlli, letture, risposte brevi | Haiku | basso |
| Modifiche con file e righe noti, test | Sonnet | medio |
| Bug da capire, integrazioni, grafica | Sonnet | alto |
| Progettazione, calcoli critici, sicurezza | Opus | alto |
| REVERSE: correggere gli errori | Haiku | basso (sale solo se la correzione fallisce) |

## Installazione

```
claude plugin marketplace add MaxTulli70/O.Gear
claude plugin install onmake-gear@onmake
```

Versione 0.1.0, in prova.
