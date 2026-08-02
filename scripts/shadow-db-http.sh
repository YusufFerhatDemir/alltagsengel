#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# shadow-db-http.sh — HTTP-Stack (PostgREST + Auth-Shim) auf der Shadow-DB
# ════════════════════════════════════════════════════════════════════
#
#   ./scripts/shadow-db-http.sh up      Stack starten, Env-Exports ausgeben
#   ./scripts/shadow-db-http.sh down    Stack stoppen
#
# Voraussetzung: ./scripts/shadow-db.sh test lief vorher (Cluster + Seed).
# Macht die dynamischen Tests in __tests__/shadow-db/tenant-isolation.test.ts
# lokal lauffähig — ohne Docker, ohne Supabase-Projekt:
#
#   PostgREST (brew install postgrest) übernimmt /rest/v1 inkl. RLS,
#   scripts/shadow-auth-shim.mjs ersetzt nur den GoTrue-Token-Endpunkt.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHADOW_DIR="${SHADOW_DIR:-$ROOT/.shadow-db}"
PGPORT="${SHADOW_PGPORT:-55432}"
DB="${SHADOW_DB_NAME:-shadow}"
PGRST_PORT="${SHADOW_PGRST_PORT:-55434}"
SHIM_PORT="${SHADOW_SHIM_PORT:-55440}"
# Nur für die lokale Wegwerf-DB — kein Produktionsgeheimnis.
JWT_SECRET="${SHADOW_JWT_SECRET:-shadow-local-jwt-secret-0123456789abcdef0123456789}"

export LC_ALL=C LANG=C
for p in /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin /opt/homebrew/bin; do
  [ -d "$p" ] && export PATH="$p:$PATH"
done
command -v postgrest >/dev/null || { echo "FEHLER: postgrest nicht gefunden (brew install postgrest)"; exit 1; }

sign_jwt() { # sign_jwt '<claims-json>' → JWT auf stdout
  node -e '
    const crypto = require("crypto")
    const b64 = (s) => Buffer.from(s).toString("base64url")
    const h = b64(JSON.stringify({alg:"HS256",typ:"JWT"}))
    const p = b64(process.argv[1])
    const s = crypto.createHmac("sha256", process.env.J).update(h+"."+p).digest("base64url")
    console.log(h+"."+p+"."+s)
  ' "$1"
}

case "${1:-up}" in
  up)
    mkdir -p "$SHADOW_DIR"
    cat > "$SHADOW_DIR/postgrest.conf" <<EOF
db-uri = "postgres://authenticator@127.0.0.1:$PGPORT/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = $PGRST_PORT
EOF
    postgrest "$SHADOW_DIR/postgrest.conf" > "$SHADOW_DIR/postgrest.log" 2>&1 &
    echo $! > "$SHADOW_DIR/postgrest.pid"

    USERS=$(psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d "$DB" -t -A -c \
      "SELECT json_object_agg(email, id) FROM auth.users;")
    NOW=$(date +%s); EXP=$((NOW + 86400))
    export J="$JWT_SECRET"
    ANON_KEY=$(sign_jwt "{\"role\":\"anon\",\"iss\":\"shadow-shim\",\"iat\":$NOW,\"exp\":$EXP}")
    SERVICE_KEY=$(sign_jwt "{\"role\":\"service_role\",\"iss\":\"shadow-shim\",\"iat\":$NOW,\"exp\":$EXP}")

    SHIM_PORT="$SHIM_PORT" PGRST_URL="http://127.0.0.1:$PGRST_PORT" \
      SHADOW_JWT_SECRET="$JWT_SECRET" SHADOW_USERS="$USERS" \
      node "$ROOT/scripts/shadow-auth-shim.mjs" > "$SHADOW_DIR/shim.log" 2>&1 &
    echo $! > "$SHADOW_DIR/shim.pid"

    sleep 1
    kill -0 "$(cat "$SHADOW_DIR/postgrest.pid")" || { echo "PostgREST-Start fehlgeschlagen:"; tail -5 "$SHADOW_DIR/postgrest.log"; exit 1; }
    kill -0 "$(cat "$SHADOW_DIR/shim.pid")" || { echo "Shim-Start fehlgeschlagen:"; tail -5 "$SHADOW_DIR/shim.log"; exit 1; }

    echo "Shadow-HTTP-Stack läuft. Für die dynamischen Tests:"
    echo "export SHADOW_SUPABASE_URL=http://127.0.0.1:$SHIM_PORT"
    echo "export SHADOW_SUPABASE_ANON_KEY=$ANON_KEY"
    echo "export SHADOW_SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY"
    ;;
  down)
    for f in postgrest.pid shim.pid; do
      [ -f "$SHADOW_DIR/$f" ] && kill "$(cat "$SHADOW_DIR/$f")" 2>/dev/null || true
      rm -f "$SHADOW_DIR/$f"
    done
    echo "Stack gestoppt"
    ;;
  *) echo "Unbekannt: $1"; exit 1 ;;
esac
