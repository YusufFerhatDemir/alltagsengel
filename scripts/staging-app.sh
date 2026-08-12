#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# staging-app.sh — Next.js gegen die Shadow-/Staging-DB starten
# ════════════════════════════════════════════════════════════════════
#
#   ./scripts/staging-app.sh          Build + Start auf :8080
#   ./scripts/staging-app.sh build    nur bauen
#
# Voraussetzung:
#   ./scripts/shadow-db.sh test        (DB + Seed)
#   ./scripts/shadow-db-http.sh up     (PostgREST + Auth-Shim)
#
# ── WARUM .env.local WEGGELEGT WIRD ─────────────────────────────────
# Exportierte Umgebungsvariablen reichen NICHT. Beim ersten Versuch lief
# `npx next start` mit gesetzten Variablen — der next-server-Kindprozess
# hatte sie trotzdem nicht und las stattdessen .env.local. Ergebnis: die
# Staging-App sprach serverseitig mit dem PRODUCTION-Supabase-Projekt.
# (Nur Lesezugriffe auf eine dort nicht existierende View, aber genau das
# darf nicht passieren.)
#
# Deshalb wird .env.local fuer die Dauer des Laufs beiseitegelegt und eine
# reine Staging-Fassung geschrieben. Ein EXIT-Trap stellt das Original
# wieder her — auch bei Strg-C oder Abbruch. Ein von einem Absturz
# liegengebliebenes Backup wird beim naechsten Start zuerst zurueckgespielt.
#
# Zusaetzlich bricht das Skript ab, wenn die Ziel-URL nach supabase.co
# zeigt. Staging kann Production damit technisch nicht erreichen.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHIM_PORT="${SHADOW_SHIM_PORT:-55440}"
PGPORT="${SHADOW_PGPORT:-55432}"
DB="${SHADOW_DB_NAME:-shadow}"
APP_PORT="${STAGING_APP_PORT:-8080}"
JWT_SECRET="${SHADOW_JWT_SECRET:-shadow-local-jwt-secret-0123456789abcdef0123456789}"

ENV_DATEI="$ROOT/.env.local"
ENV_BACKUP="$ROOT/.env.local.prod-backup"

# Liegengebliebenes Backup aus einem abgebrochenen Lauf zuerst zurueckspielen.
if [ -f "$ENV_BACKUP" ]; then
  echo "Hinweis: Backup aus einem frueheren Lauf gefunden — stelle .env.local wieder her."
  mv -f "$ENV_BACKUP" "$ENV_DATEI"
fi

env_wiederherstellen() {
  if [ -f "$ENV_BACKUP" ]; then
    mv -f "$ENV_BACKUP" "$ENV_DATEI"
    echo ""
    echo "✓ .env.local wiederhergestellt (Produktionsschluessel zurueck)."
  fi
}
trap env_wiederherstellen EXIT INT TERM

sign_jwt() {
  J="$JWT_SECRET" node -e '
    const crypto = require("crypto")
    const b64 = (s) => Buffer.from(s).toString("base64url")
    const h = b64(JSON.stringify({alg:"HS256",typ:"JWT"}))
    const p = b64(process.argv[1])
    const s = crypto.createHmac("sha256", process.env.J).update(h+"."+p).digest("base64url")
    console.log(h+"."+p+"."+s)
  ' "$1"
}

NOW=$(date +%s); EXP=$((NOW + 86400))
STAGING_URL="http://127.0.0.1:$SHIM_PORT"
ANON_KEY="$(sign_jwt "{\"role\":\"anon\",\"iss\":\"shadow-shim\",\"iat\":$NOW,\"exp\":$EXP}")"
SERVICE_KEY="$(sign_jwt "{\"role\":\"service_role\",\"iss\":\"shadow-shim\",\"iat\":$NOW,\"exp\":$EXP}")"

# ── Sicherung: niemals gegen ein echtes Supabase-Projekt ────────────
case "$STAGING_URL" in
  *supabase.co*|*supabase.in*|https://*)
    echo "ABBRUCH: Staging-URL '$STAGING_URL' zeigt nicht auf localhost."
    exit 1 ;;
esac

# ── Staging-.env.local schreiben ────────────────────────────────────
[ -f "$ENV_DATEI" ] && mv -f "$ENV_DATEI" "$ENV_BACKUP"
cat > "$ENV_DATEI" <<EOF
# ════════════════════════════════════════════════════════════════
# TEMPORAER — von scripts/staging-app.sh erzeugt.
# Das Original liegt in .env.local.prod-backup und wird beim Beenden
# automatisch zurueckgespielt. NICHT committen (.gitignore deckt es ab).
# ════════════════════════════════════════════════════════════════
NEXT_PUBLIC_SUPABASE_URL=$STAGING_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
NEXT_PUBLIC_APP_URL=http://127.0.0.1:$APP_PORT
# Leer: aus Staging geht keine E-Mail raus.
RESEND_API_KEY=
EOF

export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="--max-old-space-size=8192"

echo "────────────────────────────────────────────────"
echo "  Staging-App"
echo "  Supabase : $STAGING_URL  (Shim → PostgREST → $DB:$PGPORT)"
echo "  App      : http://127.0.0.1:$APP_PORT"
echo "  .env.local temporaer ersetzt, Original in $(basename "$ENV_BACKUP")"
echo "────────────────────────────────────────────────"

if [ "${1:-run}" = "build" ]; then
  npx next build --webpack
  exit 0
fi

npx next build --webpack
npx next start -p "$APP_PORT"
