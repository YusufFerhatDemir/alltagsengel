#!/usr/bin/env bash
# precommit-guard.sh — letzte Verteidigungslinie vor `git commit`.
#
# Blockt:
#   1. .env-Files (außer .env.example)
#   2. node_modules/
#   3. Service-Account-JSON, *.pem, *.p12, *.keystore, *firebase-adminsdk*
#   4. APK/AAB/IPA-Build-Outputs
#   5. Klassische Secret-Patterns im Diff: "AKIA…", "sk_live_…", "sk-proj-…",
#      "re_…" (Resend), "sb_secret_…" (Supabase), Bearer-Tokens längerer Art, etc.
#
# Warnt (blockiert NICHT):
#   6. Schema-Drift — Code, der live nicht existierende Spalten anspricht.
#
# Wird sowohl von ./deploy.sh als auch (manuell) vom Git-Pre-Commit-Hook
# aufgerufen. Exit-Code 0 = ok, 1 = blockiert.

set -euo pipefail

RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
DIM=$'\033[2m'
RESET=$'\033[0m'

# Bereich, der geprüft wird:
#   - normaler Modus: alle staged Files (`git diff --cached --name-only`)
#   - --all: gesamtes Repo (für audit-Run)
mode="staged"
if [ "${1:-}" = "--all" ]; then
  mode="all"
fi

if [ "$mode" = "all" ]; then
  files="$(git ls-files)"
  diff_cmd=(git --no-pager grep -n -E)
  diff_args=(--)
else
  files="$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)"
  diff_cmd=(git --no-pager diff --cached -U0)
  diff_args=()
fi

if [ -z "$files" ]; then
  echo "${DIM}precommit-guard: keine Dateien zu prüfen.${RESET}"
  exit 0
fi

violations=0
note() { echo "${RED}✗${RESET} $*" >&2; violations=$((violations+1)); }

# ── 1. Verbotene Pfad-Patterns ────────────────────────────────────────
forbidden_paths_regex='^(\.env$|\.env\..+|(.*/)?node_modules/|.*\.pem$|.*\.p12$|.*\.keystore$|.*-service-account.*\.json$|.*firebase-adminsdk.*\.json$|.*\.apk$|.*\.aab$|.*\.ipa$|.*\.mobileprovision$)'

while IFS= read -r f; do
  [ -z "$f" ] && continue
  # Ausnahme: .env.example darf rein.
  case "$f" in
    .env.example) continue ;;
  esac
  if [[ "$f" =~ $forbidden_paths_regex ]]; then
    note "Verbotener Pfad gestaged: $f"
  fi
done <<< "$files"

# ── 2. Secret-Patterns im Inhalt ──────────────────────────────────────
# Heuristiken — bewusst konservativ, false-positives sind teuer.
declare -a secret_patterns=(
  'AKIA[0-9A-Z]{16}'                                    # AWS Access Key
  'aws_secret_access_key[^A-Za-z0-9]+[A-Za-z0-9/+=]{30,}' # AWS secret
  'sk_live_[A-Za-z0-9]{20,}'                            # Stripe live
  'sk-proj-[A-Za-z0-9_-]{20,}'                          # OpenAI proj key
  'sk-ant-[A-Za-z0-9_-]{20,}'                           # Anthropic key
  'xoxb-[0-9A-Za-z-]{20,}'                              # Slack Bot Token
  'eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}' # JWT (lang)
  'github_pat_[A-Za-z0-9_]{20,}'                        # GitHub PAT (fine-grained)
  'ghp_[A-Za-z0-9]{30,}'                                # GitHub classic PAT
  'gho_[A-Za-z0-9]{30,}'                                # GitHub OAuth
  'service_role.*ey[A-Za-z0-9_-]{30,}'                  # Supabase service-role JWT inline
  '\bre_[A-Za-z0-9]{20,}'                               # Resend API-Key (re_ + 33 Zeichen)
  '\bsb_secret_[A-Za-z0-9_-]{20,}'                      # Supabase Secret-Key (neues Format)
)

# Markdown/Doku ist ok für *Beispiel-Patterns*. Wir checken nur Code-Änderungen.
if [ "$mode" = "staged" ]; then
  diff_output="$(git --no-pager diff --cached -U0 -- ':(exclude)*.md' ':(exclude)*.example' ':(exclude)scripts/precommit-guard.sh' 2>/dev/null || true)"
else
  diff_output="$(git --no-pager grep -n -E "$(IFS='|'; echo "${secret_patterns[*]}")" -- ':(exclude)*.md' ':(exclude)*.example' ':(exclude)scripts/precommit-guard.sh' 2>/dev/null || true)"
fi

if [ -n "$diff_output" ]; then
  for pat in "${secret_patterns[@]}"; do
    if echo "$diff_output" | grep -E "$pat" >/dev/null 2>&1; then
      hits=$(echo "$diff_output" | grep -nE "$pat" | head -3)
      note "Möglicher Secret-Fund (Pattern: $pat):"
      echo "$hits" | sed 's/^/    /' >&2
    fi
  done
fi

# ── 3. Schema-Drift (warn-only) ───────────────────────────────────────
# Findet Code, der Spalten anspricht, die es live nicht gibt. PostgREST
# lehnt so eine Abfrage komplett ab (42703) — im Code sieht das aus wie
# „keine Daten"; genau so waren Budget-Anlage, Mahnungsversand und
# DATEV-Export monatelang still tot.
#
# BLOCKIERT NICHT. Schema-Drift ist P2 und der Check braucht Netz; ein
# Aussetzer darf keinen Commit verhindern. Er läuft nur, wenn überhaupt
# .ts/.tsx unter app/ oder lib/ gestaged sind, und lässt sich mit
# SKIP_SCHEMA_DRIFT=1 abschalten.
if [ "${SKIP_SCHEMA_DRIFT:-0}" != "1" ]; then
  relevante="$(echo "$files" | grep -E '^(app|lib)/.*\.tsx?$' || true)"
  if [ -n "$relevante" ]; then
    echo "${DIM}precommit-guard: Schema-Drift-Check (warn-only) …${RESET}"
    if ! node "$(dirname "${BASH_SOURCE[0]}")/schema-drift-check.mjs" --warn-only; then
      echo "${YELLOW}⚠ Schema-Drift-Check nicht durchgelaufen — Commit geht trotzdem durch.${RESET}" >&2
    fi
  fi
fi

if [ "$violations" -gt 0 ]; then
  echo "" >&2
  echo "${RED}precommit-guard: $violations Treffer — Commit blockiert.${RESET}" >&2
  echo "${DIM}  Override (nur wenn du sicher bist):  GUARD_BYPASS=1 ./deploy.sh \"…\"${RESET}" >&2
  if [ "${GUARD_BYPASS:-0}" = "1" ]; then
    echo "${YELLOW}⚠ GUARD_BYPASS=1 gesetzt — gehe trotzdem durch.${RESET}" >&2
    exit 0
  fi
  exit 1
fi

echo "${GREEN}✓ precommit-guard: clean${RESET}"
exit 0
