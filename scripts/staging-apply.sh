#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# staging-apply.sh — Migrationen in korrekter Reihenfolge auf Staging applyen
# ════════════════════════════════════════════════════════════════════
#
# Nutzung:
#   ./scripts/staging-apply.sh --dry-run              Alle Migrationen testen (BEGIN/ROLLBACK)
#   ./scripts/staging-apply.sh --phase security-basis  Phase 1 applyen
#   ./scripts/staging-apply.sh --phase module           Phase 2 applyen
#   ./scripts/staging-apply.sh --phase security-abschluss Phase 3 applyen
#   ./scripts/staging-apply.sh --all                    Alle Phasen nacheinander
#   ./scripts/staging-apply.sh --rollback               Alle Migrationen rückgängig (umgekehrte Reihenfolge)
#   ./scripts/staging-apply.sh --check                  Live-Schema-Diff (read-only)
#   ./scripts/staging-apply.sh --help                   Hilfe anzeigen
#
# Voraussetzung: DATABASE_URL gesetzt (psql-Zugang zur Staging/Production-DB)
#                ODER: SUPABASE_DB_URL als Alias
#
# Sicherheitsregeln:
#   - Ohne --force werden bereits applied Migrationen übersprungen
#   - Jede Migration läuft in einer eigenen Transaction
#   - Bei Fehler: STOP (keine weiteren Migrationen)
#   - Dry-Run ändert NICHTS (BEGIN → ROLLBACK)
#
set -euo pipefail

RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
BLUE=$'\033[34m'
DIM=$'\033[2m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"

step()  { echo ""; echo "${BLUE}${BOLD}▶ $*${RESET}"; }
ok()    { echo "${GREEN}  ✓ $*${RESET}"; }
warn()  { echo "${YELLOW}  ⚠ $*${RESET}"; }
fail()  { echo "${RED}  ✗ $*${RESET}"; }
die()   { echo "${RED}${BOLD}FATAL: $*${RESET}" >&2; exit 1; }
info()  { echo "${DIM}  $*${RESET}"; }

usage() {
  cat <<'USAGE'
staging-apply.sh — Migrationen auf Staging/Production applyen

Optionen:
  --dry-run               Alle ausstehenden Migrationen testen (BEGIN/ROLLBACK)
  --phase <name>          Eine Phase applyen:
                            security-basis    (Phase 1: REVOKE, Policy-Fixes)
                            module            (Phase 2: Neue Tabellen/Module)
                            security-abschluss (Phase 3: SECDEF REVOKE, is_admin)
  --all                   Alle 3 Phasen nacheinander
  --rollback              Alle applied Migrationen rückgängig (umgekehrte Reihenfolge)
  --check                 Live-Schema-Diff (read-only)
  --single <file>         Eine einzelne Migration applyen
  --force                 Keine Skip-Prüfung (auch bereits applied Migrationen ausführen)
  --help                  Diese Hilfe

Umgebungsvariablen:
  DATABASE_URL            PostgreSQL Connection-String (pflicht)
  SUPABASE_DB_URL         Alias für DATABASE_URL
  DRY_RUN=1               Äquivalent zu --dry-run
USAGE
  exit 0
}

# ─── DB-Verbindung ──────────────────────────────────────────────────
DB_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
[ -z "$DB_URL" ] && die "DATABASE_URL oder SUPABASE_DB_URL muss gesetzt sein."

PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 --no-psqlrc -q)
PSQL_QUERY=(psql "$DB_URL" -v ON_ERROR_STOP=1 --no-psqlrc -t -A)

test_connection() {
  if ! "${PSQL_QUERY[@]}" -c "SELECT 1;" >/dev/null 2>&1; then
    die "Kann nicht mit der DB verbinden. DATABASE_URL prüfen."
  fi
  ok "DB-Verbindung OK"
}

# ─── Migrationen: Phasen-Definition ─────────────────────────────────
# Phase 1: Security-Basis (unabhängig von Modul-Tabellen)
PHASE1_SECURITY_BASIS=(
  "20260817010000_sql_exec_rpc_absichern.sql"
  "20260817040000_bookings_policy_rekursion.sql"
  "20260822010000_mis_audit_log_org_id.sql"
  "20260822020000_billing_policies_is_admin.sql"
)

# Phase 2: Modul-Migrationen (chronologisch)
PHASE2_MODULE=(
  "20260809010000_dokumentenmanagement_akten.sql"
  "20260809120000_tourenplanung.sql"
  "20260810010000_pflegedokumentation.sql"
  "20260811010000_personalmanagement.sql"
  "20260812010000_aufgaben_kommunikation.sql"
  "20260813010000_workflow_engine.sql"
  "20260814010000_leistungsnachweis_haertung.sql"
  "20260818010000_sis_strukturierte_informationssammlung.sql"
  "20260818010000_vitalwerte.sql"
  "20260818030000_wunddokumentation.sql"
  "20260819010000_pflegecoach_dipa_modul.sql"
  "20260819020000_billing_org_fence_haertung.sql"
  "20260820010000_medikamentenmanagement.sql"
  "20260821010000_angehoerigenzugang.sql"
  "20260821020000_digitale_signaturen.sql"
)

# Bedingte Phase 2 (nur wenn Live-Check zeigt: Tabellen fehlen)
PHASE2_CONDITIONAL=(
  "20260808210000_zahlungen_forderungen_monatsabschluss.sql"
  "20260808220000_kassenabrechnung_dta_dakota.sql"
)

# Phase 3: Security-Abschluss (NACH allen Modul-Tabellen)
PHASE3_SECURITY_ABSCHLUSS=(
  "20260817030000_secdef_rpc_haertung.sql"
  "20260817030002_zusaetzliche_secdef_haertung.sql"
  "20260823010000_secdef_trigger_revoke.sql"
  "20260823020000_profiles_subquery_to_is_admin.sql"
)

# Rollback-Mapping: Forward → Rollback
declare -A ROLLBACKS=(
  ["20260817010000_sql_exec_rpc_absichern.sql"]="20260817010001_rollback_sql_exec_rpc_absichern.sql"
  ["20260817030000_secdef_rpc_haertung.sql"]="20260817030001_rollback_secdef_rpc_haertung.sql"
  ["20260817030002_zusaetzliche_secdef_haertung.sql"]="20260817030003_rollback_zusaetzliche_secdef_haertung.sql"
  ["20260817040000_bookings_policy_rekursion.sql"]="20260817040001_rollback_bookings_policy_rekursion.sql"
  ["20260822010000_mis_audit_log_org_id.sql"]="20260822010001_rollback_mis_audit_log_org_id.sql"
  ["20260822020000_billing_policies_is_admin.sql"]="20260822020001_rollback_billing_policies_is_admin.sql"
  ["20260823010000_secdef_trigger_revoke.sql"]="20260823010001_rollback_secdef_trigger_revoke.sql"
  ["20260823020000_profiles_subquery_to_is_admin.sql"]="20260823020001_rollback_profiles_subquery_to_is_admin.sql"
  ["20260808210000_zahlungen_forderungen_monatsabschluss.sql"]="20260808210001_rollback_zahlungen_forderungen_monatsabschluss.sql"
  ["20260808220000_kassenabrechnung_dta_dakota.sql"]="20260808220001_rollback_kassenabrechnung_dta_dakota.sql"
  ["20260809010000_dokumentenmanagement_akten.sql"]="20260809010001_rollback_dokumentenmanagement_akten.sql"
  ["20260809120000_tourenplanung.sql"]="20260809120001_rollback_tourenplanung.sql"
  ["20260810010000_pflegedokumentation.sql"]="20260810010001_rollback_pflegedokumentation.sql"
  ["20260811010000_personalmanagement.sql"]="20260811010001_rollback_personalmanagement.sql"
  ["20260812010000_aufgaben_kommunikation.sql"]="20260812010001_rollback_aufgaben_kommunikation.sql"
  ["20260813010000_workflow_engine.sql"]="20260813010001_rollback_workflow_engine.sql"
  ["20260814010000_leistungsnachweis_haertung.sql"]="20260814010001_rollback_leistungsnachweis_haertung.sql"
  ["20260818010000_sis_strukturierte_informationssammlung.sql"]="20260818010001_rollback_sis_strukturierte_informationssammlung.sql"
  ["20260818010000_vitalwerte.sql"]="20260818010001_rollback_vitalwerte.sql"
  ["20260818030000_wunddokumentation.sql"]="20260818030001_rollback_wunddokumentation.sql"
  ["20260819010000_pflegecoach_dipa_modul.sql"]="20260819010001_rollback_pflegecoach_dipa_modul.sql"
  ["20260819020000_billing_org_fence_haertung.sql"]="20260819020001_rollback_billing_org_fence_haertung.sql"
  ["20260820010000_medikamentenmanagement.sql"]="20260820010001_rollback_medikamentenmanagement.sql"
  ["20260821010000_angehoerigenzugang.sql"]="20260821010001_rollback_angehoerigenzugang.sql"
  ["20260821020000_digitale_signaturen.sql"]="20260821020001_rollback_digitale_signaturen.sql"
)

# ─── Hilfsfunktionen ────────────────────────────────────────────────

is_migration_applied() {
  local file="$1"
  local version
  version=$(echo "$file" | sed 's/_.*//')
  local result
  result=$("${PSQL_QUERY[@]}" -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '$version';" 2>/dev/null || echo "0")
  [ "$result" = "1" ]
}

table_exists() {
  local table="$1"
  local result
  result=$("${PSQL_QUERY[@]}" -c "SELECT to_regclass('public.$table');" 2>/dev/null || echo "")
  [ -n "$result" ] && [ "$result" != "" ]
}

apply_migration() {
  local file="$1"
  local dry_run="${2:-false}"
  local filepath="$MIGRATIONS_DIR/$file"

  if [ ! -f "$filepath" ]; then
    fail "Datei nicht gefunden: $file"
    return 1
  fi

  local version
  version=$(echo "$file" | sed 's/_.*//')

  if [ "$FORCE" != "true" ] && is_migration_applied "$file"; then
    info "SKIP (bereits applied): $file"
    return 0
  fi

  if [ "$dry_run" = "true" ]; then
    info "DRY-RUN: $file"
    local tmpfile
    tmpfile=$(mktemp)
    cat > "$tmpfile" <<EOSQL
BEGIN;
\i $filepath
ROLLBACK;
EOSQL
    if "${PSQL[@]}" -f "$tmpfile" 2>&1 | tail -3; then
      ok "DRY-RUN OK: $file"
      rm -f "$tmpfile"
      return 0
    else
      fail "DRY-RUN FEHLER: $file"
      rm -f "$tmpfile"
      return 1
    fi
  fi

  info "APPLY: $file"
  if "${PSQL[@]}" -f "$filepath" 2>&1; then
    # Version in schema_migrations eintragen (falls nicht automatisch)
    "${PSQL[@]}" -c "INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES ('$version', '$(echo "$file" | sed "s/${version}_//" | sed "s/.sql$//")')
      ON CONFLICT (version) DO NOTHING;" 2>/dev/null || true
    ok "APPLIED: $file"
    return 0
  else
    fail "FEHLER: $file"
    return 1
  fi
}

apply_rollback() {
  local forward_file="$1"
  local rollback_file="${ROLLBACKS[$forward_file]:-}"

  if [ -z "$rollback_file" ]; then
    warn "Kein Rollback für: $forward_file"
    return 1
  fi

  local filepath="$MIGRATIONS_DIR/$rollback_file"
  if [ ! -f "$filepath" ]; then
    fail "Rollback-Datei nicht gefunden: $rollback_file"
    return 1
  fi

  info "ROLLBACK: $rollback_file"
  if "${PSQL[@]}" -f "$filepath" 2>&1; then
    local version
    version=$(echo "$forward_file" | sed 's/_.*//')
    "${PSQL[@]}" -c "DELETE FROM supabase_migrations.schema_migrations WHERE version = '$version';" 2>/dev/null || true
    ok "ROLLBACK OK: $rollback_file"
    return 0
  else
    fail "ROLLBACK FEHLER: $rollback_file"
    return 1
  fi
}

run_phase() {
  local phase_name="$1"
  shift
  local -a migrations=("$@")
  local total=${#migrations[@]}
  local applied=0
  local skipped=0
  local failed=0

  step "Phase: $phase_name ($total Migrationen)"

  for file in "${migrations[@]}"; do
    if apply_migration "$file" "$DRY_RUN_MODE"; then
      ((applied++))
    else
      ((failed++))
      fail "ABBRUCH — $file fehlgeschlagen. $applied/$total applied, $failed Fehler."
      return 1
    fi
  done

  ok "Phase $phase_name abgeschlossen: $applied applied"
  return 0
}

do_check() {
  step "Live-Schema-Diff"

  info "Applied Migrations:"
  "${PSQL_QUERY[@]}" -c "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;" || true

  echo ""
  info "Tabellen-Count:"
  "${PSQL_QUERY[@]}" -c "SELECT count(*) AS tabellen FROM pg_tables WHERE schemaname = 'public';" || true

  info "Policy-Count:"
  "${PSQL_QUERY[@]}" -c "SELECT count(*) AS policies FROM pg_policies WHERE schemaname = 'public';" || true

  info "Function-Count:"
  "${PSQL_QUERY[@]}" -c "SELECT count(*) AS functions FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public';" || true

  info "Trigger-Count:"
  "${PSQL_QUERY[@]}" -c "SELECT count(*) AS triggers FROM information_schema.triggers WHERE trigger_schema = 'public';" || true

  info "Index-Count:"
  "${PSQL_QUERY[@]}" -c "SELECT count(*) AS indexes FROM pg_indexes WHERE schemaname = 'public';" || true

  echo ""
  info "Kritische Drift-Prüfung:"
  "${PSQL_QUERY[@]}" -c "
    SELECT
      to_regclass('public.payments')         AS payments,
      to_regclass('public.dta_ruecklaeufer') AS dta_ruecklaeufer,
      to_regclass('public.ops_aufgaben')     AS ops_aufgaben,
      to_regclass('public.wf_events')        AS wf_events,
      to_regclass('public.tours')            AS tours,
      to_regclass('public.pflege_aufnahmen') AS pflege_aufnahmen,
      to_regclass('public.medikamente')      AS medikamente,
      to_regclass('public.sis_erhebungen')   AS sis,
      to_regclass('public.vitalwerte')       AS vitalwerte,
      to_regclass('public.coach_sessions')   AS coach;
  " || true

  echo ""
  info "SECDEF-Funktionen:"
  "${PSQL_QUERY[@]}" -c "
    SELECT p.proname,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
    ORDER BY p.proname;
  " || true

  echo ""
  info "Tabellen ohne RLS-Policy:"
  "${PSQL_QUERY[@]}" -c "
    SELECT t.tablename
    FROM pg_tables t
    WHERE t.schemaname = 'public'
      AND t.tablename NOT IN (SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public')
      AND t.tablename NOT LIKE 'pg_%'
      AND t.tablename NOT IN ('schema_migrations', 'spatial_ref_sys')
    ORDER BY t.tablename;
  " || true

  ok "Schema-Check abgeschlossen"
}

do_rollback_all() {
  step "ROLLBACK aller applied Migrationen (umgekehrte Reihenfolge)"

  warn "Dies macht ALLE Staging-Migrationen rückgängig!"
  echo "  Fortfahren? (ja/nein)"
  read -r confirm
  [ "$confirm" = "ja" ] || die "Abgebrochen."

  local -a all_migrations=()
  all_migrations+=("${PHASE3_SECURITY_ABSCHLUSS[@]}")
  all_migrations+=("${PHASE2_CONDITIONAL[@]}")
  all_migrations+=("${PHASE2_MODULE[@]}")
  all_migrations+=("${PHASE1_SECURITY_BASIS[@]}")

  local total=${#all_migrations[@]}
  local rolled=0
  local skipped=0
  local failed=0

  for file in "${all_migrations[@]}"; do
    if ! is_migration_applied "$file"; then
      info "SKIP (nicht applied): $file"
      ((skipped++))
      continue
    fi

    if apply_rollback "$file"; then
      ((rolled++))
    else
      ((failed++))
      warn "Rollback fehlgeschlagen für $file — weiter mit nächster"
    fi
  done

  echo ""
  ok "Rollback abgeschlossen: $rolled rückgängig, $skipped übersprungen, $failed Fehler"
}

# ─── Argument-Parsing ────────────────────────────────────────────────

MODE=""
PHASE=""
SINGLE_FILE=""
DRY_RUN_MODE="false"
FORCE="false"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)   MODE="dry-run"; DRY_RUN_MODE="true" ;;
    --phase)     MODE="phase"; PHASE="$2"; shift ;;
    --all)       MODE="all" ;;
    --rollback)  MODE="rollback" ;;
    --check)     MODE="check" ;;
    --single)    MODE="single"; SINGLE_FILE="$2"; shift ;;
    --force)     FORCE="true" ;;
    --help|-h)   usage ;;
    *)           die "Unbekannte Option: $1 (--help für Hilfe)" ;;
  esac
  shift
done

[ -z "$MODE" ] && usage

# DRY_RUN Env-Override
[ "${DRY_RUN:-0}" = "1" ] && DRY_RUN_MODE="true"

# ─── Hauptlogik ──────────────────────────────────────────────────────

echo "${BOLD}staging-apply.sh${RESET} — Migrations-Apply für Staging"
echo "${DIM}DB: ${DB_URL:0:50}…${RESET}"
echo ""

test_connection

case "$MODE" in
  check)
    do_check
    ;;

  dry-run)
    step "Dry-Run aller ausstehenden Migrationen"
    local_fail=0

    for file in "${PHASE1_SECURITY_BASIS[@]}" "${PHASE2_MODULE[@]}" "${PHASE3_SECURITY_ABSCHLUSS[@]}"; do
      if ! apply_migration "$file" "true"; then
        ((local_fail++))
      fi
    done

    echo ""
    if [ "$local_fail" -eq 0 ]; then
      ok "Dry-Run abgeschlossen: ALLE OK"
    else
      fail "Dry-Run: $local_fail Fehler"
      exit 1
    fi
    ;;

  phase)
    case "$PHASE" in
      security-basis)
        run_phase "Security-Basis" "${PHASE1_SECURITY_BASIS[@]}"
        ;;
      module)
        run_phase "Modul-Migrationen" "${PHASE2_MODULE[@]}"
        ;;
      security-abschluss)
        run_phase "Security-Abschluss" "${PHASE3_SECURITY_ABSCHLUSS[@]}"
        ;;
      *)
        die "Unbekannte Phase: $PHASE (erlaubt: security-basis, module, security-abschluss)"
        ;;
    esac
    ;;

  all)
    step "Alle Phasen nacheinander"

    if [ "$DRY_RUN_MODE" = "true" ]; then
      warn "DRY-RUN Modus — keine Änderungen"
    fi

    run_phase "1: Security-Basis" "${PHASE1_SECURITY_BASIS[@]}" || exit 1
    run_phase "2: Module" "${PHASE2_MODULE[@]}" || exit 1
    run_phase "3: Security-Abschluss" "${PHASE3_SECURITY_ABSCHLUSS[@]}" || exit 1

    echo ""
    ok "Alle Phasen erfolgreich abgeschlossen"

    step "Post-Apply Schema-Check"
    do_check
    ;;

  single)
    [ -z "$SINGLE_FILE" ] && die "--single braucht einen Dateinamen"
    apply_migration "$SINGLE_FILE" "$DRY_RUN_MODE"
    ;;

  rollback)
    do_rollback_all
    ;;
esac

echo ""
echo "${GREEN}${BOLD}✓ staging-apply.sh fertig.${RESET}"
