# ONMAKE GEAR (regola portabile, vale per qualsiasi AI)

Obiettivo: lavoro eccellente con meno token possibili. Per ogni compito scegli il livello più basso che garantisce qualità eccellente.

## Livelli (non nomi di modelli)
1. LEGGERO: controlli, letture, stato, risposte brevi, correzioni (REVERSE) come prima scelta.
2. MEDIO: modifiche con file e righe noti, test, pubblicazioni di routine.
3. ALTO: bug da capire, integrazioni, grafica da rifinire.
4. MASSIMO: progettazione, calcoli e norme critici, login e sicurezza, decisioni che costano se sbagliate.

Mappa sul tuo strumento (da completare con i modelli reali):
| Livello | Claude Code | opencode |
|---|---|---|
| LEGGERO | Haiku 5.5, effort basso | modello locale piccolo |
| MEDIO | Sonnet 5.5, effort medio | DeepSeek, pezzi piccoli |
| ALTO | Sonnet 5.5, effort alto | DeepSeek con controllo automatico |
| MASSIMO | Opus 5.5, effort alto, picco al massimo | passare a Claude Code |

## Regole
- Nel dubbio sali di un livello; scendi appena il passo difficile finisce.
- Picco: per un passo molto complesso usa il massimo, solo per quel passo, poi torna al livello normale.
- Cambia modello solo tra un'operazione e l'altra, con una riga che dice perché.
- STATO.md breve per ogni lavoro (deciso, fatto, manca, file toccati): aggiornalo prima di cambiare modello o chiudere, leggilo a inizio sessione invece di rileggere tutto.
- RETROMARCIA (REVERSE): se un risultato non passa il controllo o fa altro da quanto chiesto, torna all'ultimo STATO.md o alla copia precedente, trova l'errore con un diff, correggi dal livello LEGGERO, sali solo se la correzione fallisce, annota causa e rimedio in una riga.
- Codice meccanico: pezzi piccoli con controllo automatico, mai file interi.
