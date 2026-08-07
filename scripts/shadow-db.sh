#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# shadow-db.sh — baut eine leere Testdatenbank ausschließlich aus dem Repo
# ════════════════════════════════════════════════════════════════════
#
#   ./scripts/shadow-db.sh up       Cluster starten + DB von null aufbauen
#   ./scripts/shadow-db.sh reset    DB verwerfen + neu aufbauen
#   ./scripts/shadow-db.sh psql     interaktive Shell auf der Shadow-DB
#   ./scripts/shadow-db.sh dump     Backup nach $SHADOW_DIR/backup.dump
#   ./scripts/shadow-db.sh restore  Restore aus $SHADOW_DIR/backup.dump
#   ./scripts/shadow-db.sh down     Cluster stoppen
#
# Berührt NIE ein Supabase-Projekt. Alles läuft gegen ein lokales
# Postgres-Cluster unter $SHADOW_DIR (Default: .shadow-db/, gitignored).
#
# Voraussetzung: PostgreSQL 16 (macOS: brew install postgresql@16).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHADOW_DIR="${SHADOW_DIR:-$ROOT/.shadow-db}"
PGPORT="${SHADOW_PGPORT:-55432}"
PGDATA="$SHADOW_DIR/pgdata"
DB="${SHADOW_DB_NAME:-shadow}"

# macOS/Homebrew-Postgres startet ohne C-Locale nicht ("Postmaster ist
# während des Starts multithreaded geworden").
export LC_ALL=C LANG=C
for p in /opt/homebrew/opt/postgresql@16/bin /usr/local/opt/postgresql@16/bin; do
  [ -d "$p" ] && export PATH="$p:$PATH"
done
command -v psql >/dev/null || { echo "FEHLER: psql nicht gefunden (brew install postgresql@16)"; exit 1; }

PSQL=(psql -h 127.0.0.1 -p "$PGPORT" -U postgres -v ON_ERROR_STOP=1 --no-psqlrc)

start_cluster() {
  if [ ! -d "$PGDATA" ]; then
    mkdir -p "$SHADOW_DIR"
    initdb -D "$PGDATA" -U postgres --locale=C --encoding=UTF8 >/dev/null
  fi
  if ! pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
    pg_ctl -D "$PGDATA" -o "-p $PGPORT" -l "$SHADOW_DIR/pg.log" -w start >/dev/null
  fi
}

# Reihenfolge ist nicht alphabetisch, sondern topologisch:
#   1. Bootstrap  — auth/storage/Rollen, die Supabase sonst mitbringt
#   2. initial-setup.sql — profiles & Co., Basis für alles Weitere
#   3. alle Migrationen aufsteigend nach Dateiname
#
# Alle Migrationen tragen seit 2026-08-02 einen sortierbaren Zeitstempel
# (vorher: fix_rls_policies.sql ohne Präfix → sortierte ans Ende und
# lief dadurch vor den Tabellen, die es voraussetzt).
build() {
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE);" >/dev/null
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE $DB;" >/dev/null

  local files=(
    "$ROOT/supabase/shadow/00_supabase_bootstrap.sql"
    "$ROOT/supabase/initial-setup.sql"
  )
  # NUR der Vorwaertspfad. Zwei Gruppen werden bewusst uebersprungen:
  #
  #   *rollback*  — das sind die Ruecknahmen. Alphabetisch landen sie direkt
  #                 hinter ihrer Forward-Migration und machen sie sofort
  #                 wieder rueckgaengig (20260806200001_rollback_… loescht
  #                 billing_tariffs, das 20260806200000 gerade angelegt hat).
  #                 Ein Deployment spielt sie nie mit ein.
  #   20260806700000_overhauled_backfill — einmalige Datenmigration mit
  #                 hartem Count-Guard auf genau 5 Production-Rechnungen.
  #                 Auf einer leeren DB kann sie nur scheitern.
  while IFS= read -r f; do
    case "$(basename "$f")" in
      *rollback*)                        continue ;;
      20260806700000_overhauled_backfill.sql) continue ;;
    esac
    files+=("$f")
  done < <(ls "$ROOT"/supabase/migrations/*.sql | sort)

  local ok=0 fail=0
  for f in "${files[@]}"; do
    printf '  %-64s' "$(basename "$f")"
    if out=$("${PSQL[@]}" -d "$DB" -f "$f" 2>&1); then
      echo "OK"; ok=$((ok+1))
    else
      echo "FEHLER"; fail=$((fail+1))
      # nur echte ERROR-Zeilen — NOTICE/WARNING sind bei idempotenten
      # DROP ... IF EXISTS normal und würden die Ursache verdecken.
      echo "$out" | grep -E 'ERROR:|FEHLER:' | head -5 | sed 's/^/      /'
    fi
  done
  echo
  echo "  Dateien: $ok OK, $fail fehlgeschlagen"
  [ "$fail" -eq 0 ]
}

seed_and_test() {
  echo
  echo "Seed (Org A / Org B):"
  "${PSQL[@]}" -q -d "$DB" -f "$ROOT/supabase/shadow/10_seed_two_orgs.sql" >/dev/null
  echo "  OK"
  echo
  echo "Tenant-Tests:"
  "${PSQL[@]}" -q -d "$DB" -f "$ROOT/supabase/shadow/20_tenant_tests.sql"
}

case "${1:-up}" in
  up|reset)
    start_cluster
    echo "Shadow-DB '$DB' auf Port $PGPORT — Aufbau von null:"
    build
    ;;
  test)
    start_cluster
    echo "Shadow-DB '$DB' — Aufbau von null:"
    build
    seed_and_test
    ;;
  # Zweiter Durchlauf ALLER Migrationen auf der bereits gebauten DB.
  # Muss fehlerfrei sein — sonst ist mindestens eine Migration nicht
  # idempotent und ein Wiederholungslauf (Retry, Teil-Deploy) würde
  # hängenbleiben.
  idempotency)
    start_cluster
    echo "Zweiter Migrationslauf auf bestehender DB (Idempotenz):"
    idem_fail=0
    for f in "$ROOT"/supabase/migrations/*.sql; do
      case "$(basename "$f")" in
        *rollback*)                             continue ;;
        20260806700000_overhauled_backfill.sql) continue ;;
      esac
      printf '  %-64s' "$(basename "$f")"
      if out=$("${PSQL[@]}" -d "$DB" -f "$f" 2>&1); then echo "OK"
      else echo "FEHLER"; echo "$out" | grep -E 'ERROR:' | head -3 | sed 's/^/      /'; idem_fail=1; fi
    done
    exit $idem_fail
    ;;
  psql)    start_cluster; exec psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d "$DB" ;;
  dump)    start_cluster; pg_dump -h 127.0.0.1 -p "$PGPORT" -U postgres -Fc -d "$DB" -f "$SHADOW_DIR/backup.dump"
           echo "Backup: $SHADOW_DIR/backup.dump ($(du -h "$SHADOW_DIR/backup.dump" | cut -f1))" ;;
  restore) start_cluster
           "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB}_restored WITH (FORCE);" >/dev/null
           "${PSQL[@]}" -d postgres -c "CREATE DATABASE ${DB}_restored;" >/dev/null
           pg_restore -h 127.0.0.1 -p "$PGPORT" -U postgres -d "${DB}_restored" "$SHADOW_DIR/backup.dump"
           echo "Restore nach ${DB}_restored OK" ;;
  down)    pg_ctl -D "$PGDATA" -w stop >/dev/null 2>&1 || true; echo "Cluster gestoppt" ;;
  *)       echo "Unbekannt: $1"; exit 1 ;;
esac
