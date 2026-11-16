#!/bin/sh
# Empaqueta el lector DWG (acad-ts 3.7.0, licencia MIT) en ../lib/dwg.js
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm i --no-save @node-projects/acad-ts@3.7.0 esbuild@0.24.0
npx esbuild entrada.js --bundle --minify --format=iife --global-name=DWGLector --outfile=../lib/dwg.js --legal-comments=eof
