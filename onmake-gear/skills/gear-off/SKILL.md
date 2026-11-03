---
name: gear-off
description: Spegne ONMAKE Gear (regola, barra, agenti) finché non lo riaccendi con gear-on. / Turns ONMAKE Gear off until gear-on.
disable-model-invocation: true
---

Run / Lancia: `claude plugin disable onmake-gear@onmake`. Poi di' a Max in una riga: «Gear spento, vale dalla prossima chat o dopo il riavvio dell'app; per riaccenderlo /onmake-gear:gear-on». (Dopo lo spegnimento questi comandi non sono più disponibili: per riaccenderlo da terminale `claude plugin enable onmake-gear@onmake`.)
