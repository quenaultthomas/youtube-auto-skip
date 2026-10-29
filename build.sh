#!/bin/sh
# Génère dist/youtube-auto-skip-<version>.zip, prêt à être partagé.
set -e
cd "$(dirname "$0")"

version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json)
out="dist/youtube-auto-skip-$version.zip"

mkdir -p dist
rm -f "$out"
zip -q "$out" manifest.json content.js background.js README.md
echo "Créé : $out"
