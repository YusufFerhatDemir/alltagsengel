#!/usr/bin/env bash
# Dead-Code-Cleanup-Skript
# ------------------------
# Generiert aus docs/audit/DEAD_CODE_MASTER.md
# Führt die Phase-2-Quick-Wins + Phase-3-API-Löschungen durch.
#
# Verwendung:
#   ./scripts/cleanup-deadcode.sh          # zeigt was getan wird (dry-run)
#   ./scripts/cleanup-deadcode.sh --apply  # führt aus
#
# Nach Ausführung: npm run lint:forbidden && git status

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DRY=1
if [[ "${1:-}" == "--apply" ]]; then
  DRY=0
fi

echo "==> Repo: $REPO_ROOT"
if [[ $DRY -eq 1 ]]; then
  echo "==> DRY-RUN (kein Apply). Zum echten Löschen: $0 --apply"
else
  echo "==> APPLY-Modus."
fi
echo ""

# ----------------------------------------------------------------------
# Phase 2: Quick-Wins
# ----------------------------------------------------------------------

declare -a ARCHIVE_DIRS=(
  "archive/debug-screenshots"     # 11 MB, alte Chrome-Debug-Screenshots
  "archive/dripfy-mis-legacy"     # 324 KB, MIS-Vorgaengerprojekt (enthaelt eine .env mit nur public-keys)
  "archive/expo-legacy"           # 32 KB, Reste vor Capacitor-Umstieg
)

declare -a UNUSED_ICONS=(
  "public/app-icon-1024.png"      # 71 KB, nicht referenziert
  "public/app-icon-1024-v3.png"   # 260 KB, nicht referenziert
  "public/icon-512x512-v3.png"    # 81 KB, nicht referenziert
)

# Test-Stub-Dateien aus Sandbox-Sessions
declare -a SANDBOX_TESTS=(
  "archive/test_12246.txt"
  "public/test_12246.txt"
)

# ----------------------------------------------------------------------
# Phase 3: API-Endpoints ohne Frontend-Caller (Backend-Audit)
# ----------------------------------------------------------------------

declare -a UNUSED_API_ROUTES=(
  "app/api/scan-medikament"       # Vision/LLM Medikament-Scanner, kein Caller
  "app/api/payment"               # Stripe-Stub, Code auskommentiert
  "app/api/content-blocks"        # Admin-CMS CRUD, kein Frontend
)

# ----------------------------------------------------------------------
# Aktionen
# ----------------------------------------------------------------------

run() {
  if [[ $DRY -eq 1 ]]; then
    echo "  [dry] $*"
  else
    echo "  [run] $*"
    eval "$@"
  fi
}

echo "==> [Phase 2] Tracked Archive-Ordner"
for d in "${ARCHIVE_DIRS[@]}"; do
  if [[ -e "$d" ]]; then
    run "git rm -rf '$d'"
  else
    echo "  [skip] $d existiert nicht"
  fi
done

echo ""
echo "==> [Phase 2] Ungenutzte Icons"
for f in "${UNUSED_ICONS[@]}"; do
  if [[ -e "$f" ]]; then
    run "git rm '$f'"
  else
    echo "  [skip] $f existiert nicht"
  fi
done

echo ""
echo "==> [Sandbox-Aufraeumung] Test-Stubs"
for f in "${SANDBOX_TESTS[@]}"; do
  if [[ -e "$f" ]]; then
    run "rm '$f'"
  else
    echo "  [skip] $f existiert nicht (gut)"
  fi
done

echo ""
echo "==> [Phase 3] Ungenutzte API-Routen"
for d in "${UNUSED_API_ROUTES[@]}"; do
  if [[ -e "$d" ]]; then
    run "git rm -rf '$d'"
  else
    echo "  [skip] $d existiert nicht"
  fi
done

echo ""
echo "==> Fertig."
if [[ $DRY -eq 1 ]]; then
  echo ""
  echo "Nichts wurde geändert. Zum echten Aufräumen:"
  echo "  $0 --apply"
else
  echo ""
  echo "Naechste Schritte:"
  echo "  1. npm run lint:forbidden    # Regressions-Check"
  echo "  2. git status                # Diff anschauen"
  echo "  3. git commit -m 'chore(cleanup): Phase 2+3 Dead-Code (Audit)'"
  echo "  4. git push"
fi
