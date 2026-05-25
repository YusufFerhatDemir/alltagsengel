#!/usr/bin/env bash
# rollback.sh — revertet die letzten N Commits via `git revert` (KEIN reset).
#
# Nutzung:
#   ./scripts/rollback.sh         # revert HEAD (1 Commit)
#   ./scripts/rollback.sh 3       # revert die letzten 3 Commits
#   ./scripts/rollback.sh 1 --push # revertieren + via deploy.sh pushen
#
# Warum revert statt reset --hard?
#   - Push-bare: erzeugt neue Commits, keine History-Rewrite.
#   - Co-Pflege-sicher: niemand muss force-fetchen.
#   - Audit-fest: revert-Commits stehen in git log.

set -euo pipefail

RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
DIM=$'\033[2m'
RESET=$'\033[0m'

count="${1:-1}"
do_push=0
if [ "${2:-}" = "--push" ]; then
  do_push=1
fi

if ! [[ "$count" =~ ^[0-9]+$ ]] || [ "$count" -lt 1 ] || [ "$count" -gt 20 ]; then
  echo "${RED}rollback: N muss 1..20 sein (war: $count)${RESET}" >&2
  exit 2
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
  echo "${RED}rollback: detached HEAD${RESET}" >&2
  exit 2
fi

# Was wird revertet?
echo "${YELLOW}Folgende Commits werden revertet (neuester zuerst):${RESET}"
git --no-pager log --oneline -n "$count"
echo ""

# Sicherheitsfrage: nur wenn TTY interaktiv UND nicht im CI/Agent-Modus
if [ -t 0 ] && [ "${ROLLBACK_AUTO:-0}" != "1" ]; then
  read -r -p "Wirklich revertieren? [y/N] " yn
  case "$yn" in
    y|Y|yes|YES) ;;
    *) echo "Abgebrochen."; exit 0 ;;
  esac
fi

# Revertieren von neuestem nach ältestem — `git revert` will Reihenfolge.
# Wir nutzen `HEAD~i` Sequence; jeder revert ist ein eigener Commit.
for i in $(seq 0 $((count-1))); do
  sha="$(git rev-parse "HEAD~$i")"
  echo "${DIM}revertiere $sha …${RESET}"
done

# Single multi-revert mit --no-edit, erzeugt N Commits in einem Schwung
git revert --no-edit "HEAD~${count}..HEAD"

echo "${GREEN}✓ rollback: $count Commit(s) revertet auf ${branch}${RESET}"
git --no-pager log --oneline -n "$((count+1))"

if [ "$do_push" -eq 1 ]; then
  echo ""
  echo "${DIM}→ Push via ./deploy.sh …${RESET}"
  ROLLBACK_AUTO=1 ./deploy.sh "rollback: $count Commit(s) revertet"
fi
