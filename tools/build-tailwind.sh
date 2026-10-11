#!/usr/bin/env bash
# 重新產生事先編好的 Tailwind CSS（說明見 tools/tailwind.*.config.js）
#   tailwind.salary.css ← salary.html
#   tailwind.index.css  ← index.html（主頁）
set -euo pipefail
cd "$(dirname "$0")/.."
for page in salary index; do
  npx --yes tailwindcss@3.4.19 \
    -c "tools/tailwind.$page.config.js" \
    -o "tailwind.$page.css" \
    --minify
done
