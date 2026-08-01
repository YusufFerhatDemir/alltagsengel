#!/usr/bin/env bash
# ci-secret-scan.sh — Secret-Scan für CI (Voll-Repo, git-tracked Dateien).
#
# Ergänzt scripts/precommit-guard.sh (das nur den *Diff* eines Commits
# prüft) um einen Voll-Scan über den gesamten getrackten Baum — als
# CI-Gate, das auch dann greift, wenn ein Secret den lokalen Hook
# umgangen hat (z. B. GUARD_BYPASS=1, oder Commit von außerhalb).
#
# Exit 0 = clean, Exit 1 = mindestens ein Treffer.

set -euo pipefail

RED=$'\033[31m'
GREEN=$'\033[32m'
RESET=$'\033[0m'

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
)

# Dokumentation/Beispiele dürfen Platzhalter-Patterns zeigen (z. B. .env.example,
# dieses Script und precommit-guard.sh selbst, die die Patterns als Text enthalten).
#
# chairmatch-landing/: statische, buildlose Ads-Landingpages (eigener Deploy
# via .github/workflows/deploy-chairmatch.yml, kein Next.js-Build). Sie rufen
# die Supabase-REST-API direkt aus dem Browser auf und enthalten dafür den
# Supabase-ANON-Key (role=anon, kein service_role!) im Klartext. Das ist bei
# einer buildlosen Seite ohne Env-Injection der einzig mögliche Weg — der
# Anon-Key ist ohnehin öffentlich (jeder Client-seitige Supabase-Call
# enthält ihn), Schutz kommt über RLS auf der Zieltabelle, nicht über
# Geheimhaltung des Keys. Siehe audit/CI_CD_PIPELINE.md.
exclude_paths=(
  ':(exclude)*.md'
  ':(exclude)*.example'
  ':(exclude)scripts/precommit-guard.sh'
  ':(exclude)scripts/ci-secret-scan.sh'
  ':(exclude)chairmatch-landing/**'
)

violations=0
for pat in "${secret_patterns[@]}"; do
  hits="$(git --no-pager grep -nE "$pat" -- . "${exclude_paths[@]}" 2>/dev/null || true)"
  if [ -n "$hits" ]; then
    echo "${RED}✗ Möglicher Secret-Fund (Pattern: $pat):${RESET}" >&2
    echo "$hits" | head -5 | sed 's/^/    /' >&2
    violations=$((violations+1))
  fi
done

if [ "$violations" -gt 0 ]; then
  echo "" >&2
  echo "${RED}ci-secret-scan: $violations Pattern(e) mit Treffern — Pipeline blockiert.${RESET}" >&2
  exit 1
fi

echo "${GREEN}✓ ci-secret-scan: clean${RESET}"
