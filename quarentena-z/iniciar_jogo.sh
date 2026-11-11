#!/usr/bin/env bash
cd "$(dirname "$0")"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$(pwd)/index.html"
elif command -v open >/dev/null 2>&1; then
  open "$(pwd)/index.html"
else
  echo "Abra o arquivo index.html em um navegador moderno."
fi
