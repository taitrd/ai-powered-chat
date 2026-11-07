#!/usr/bin/env bash
# Renders every Mermaid source in this folder to a PNG image beside it.
set -euo pipefail
cd "$(dirname "$0")"
for src in *.mmd; do
  npx -y @mermaid-js/mermaid-cli@11.4.0 -i "$src" -o "${src%.mmd}.png" -b white -s 2 -q
  echo "Rendered ${src%.mmd}.png"
done
