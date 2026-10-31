#!/bin/sh
# Inserts/updates GEAR-corto.md between markers in existing AI instruction files. --togli removes the block.
# Never creates files; backup *.prima-gear only once.
D=$(cd "$(dirname "$0")" && pwd)
S='<!-- ONMAKE-GEAR:START -->'; E='<!-- ONMAKE-GEAR:END -->'
BLK=$(mktemp); { echo "$S"; cat "$D/GEAR-corto.md"; echo "$E"; } > "$BLK"
TOGLI=0; [ "$1" = "--togli" ] && TOGLI=1
for f in "$HOME/.config/opencode/AGENTS.md" "$HOME/.dsh/AGENTS.md" "$HOME/.codex/AGENTS.md" "$HOME/.gemini/GEMINI.md" "$HOME/.cursor/rules"; do
  [ -f "$f" ] || { echo "SKIP (missing or not a file): $f"; continue; }
  [ -e "$f.prima-gear" ] || cp -p "$f" "$f.prima-gear"
  T=$(mktemp)
  if grep -qF "$S" "$f"; then
    # replace (or drop) the existing block in place
    awk -v blk="$BLK" -v s="$S" -v e="$E" -v rm="$TOGLI" '
      index($0,s){skip=1; if(!rm){while((getline l<blk)>0)print l; close(blk)}; next}
      index($0,e){skip=0; next}
      !skip{print}' "$f" > "$T"
  elif [ $TOGLI = 1 ]; then cp "$f" "$T"
  elif cmp -s "$f" "$D/GEAR.md"; then cp "$BLK" "$T"   # file was only the full copy of GEAR.md
  else { cat "$f"; echo; cat "$BLK"; } > "$T"
  fi
  cat "$T" > "$f"; rm -f "$T"
  [ $TOGLI = 1 ] && echo "REMOVED: $f" || echo "OK: $f"
done
rm -f "$BLK"
