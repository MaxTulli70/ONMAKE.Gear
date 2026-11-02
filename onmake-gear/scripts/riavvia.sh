#!/bin/sh
# Riavvia Gear: lo spegne, aggiorna dal repository e lo riaccende. Poi riavvia l'app per applicare.
claude plugin disable onmake-gear@onmake
claude plugin marketplace update onmake
claude plugin update onmake-gear@onmake
claude plugin enable onmake-gear@onmake
echo "Gear riavviato. Chiudi e riapri l'app per applicare."
