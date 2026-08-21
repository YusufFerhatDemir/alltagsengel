#!/usr/bin/env bash
# Generiert chairmatch-landing/js/supabase-config.js aus Umgebungsvariablen.
# Nutzung: SUPABASE_URL=... SUPABASE_ANON_KEY=... ./generate-config.sh
set -euo pipefail

: "${SUPABASE_URL:?Fehlt: SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?Fehlt: SUPABASE_ANON_KEY}"

DIR="$(cd "$(dirname "$0")" && pwd)"
cat > "$DIR/js/supabase-config.js" << EOF
// Auto-generiert von generate-config.sh — NICHT committen.
window.__SUPABASE_URL = '${SUPABASE_URL}';
window.__SUPABASE_ANON_KEY = '${SUPABASE_ANON_KEY}';
EOF

echo "supabase-config.js generiert in $DIR/js/"
