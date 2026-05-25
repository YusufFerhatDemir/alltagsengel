#!/usr/bin/env bash
# verify-push.sh — bestätigt, dass lokaler HEAD = origin/<current-branch>
#
# Wird am Ende von ./deploy.sh aufgerufen. Gibt Exit 0 wenn synchron, 1 wenn
# der Push offenbar verloren ging (Network-Hänger, Force-Push-Race, …).
#
# Idee: nicht raten, ob `git push` erfolgreich war — gegen die Wahrheitsquelle
# (Remote) prüfen.

set -euo pipefail

RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
DIM=$'\033[2m'
RESET=$'\033[0m'

branch="$(git rev-parse --abbrev-ref HEAD)"
local_sha="$(git rev-parse HEAD)"

if [ -z "$branch" ] || [ "$branch" = "HEAD" ]; then
  echo "${RED}✗ verify-push: detached HEAD — kann nicht verifizieren${RESET}" >&2
  exit 2
fi

# Welcher Branch soll auf Remote geprüft werden? Wenn wir auf einem Worktree-
# Branch sind (z.B. claude/foo), pushte deploy.sh nach origin/main. Sonst
# auf origin/<same-name>. Override via DEPLOY_REMOTE_REF.
remote_ref="${DEPLOY_REMOTE_REF:-}"
if [ -z "$remote_ref" ]; then
  case "$branch" in
    claude/*|worktree/*) remote_ref="refs/heads/main" ;;
    *) remote_ref="refs/heads/${branch}" ;;
  esac
fi

echo "${DIM}verify-push: lokal=${branch}@${local_sha:0:8}  remote=${remote_ref}${RESET}"

remote_line="$(git ls-remote origin "$remote_ref" 2>/dev/null || true)"
if [ -z "$remote_line" ]; then
  echo "${RED}✗ verify-push: ${remote_ref} existiert nicht auf origin${RESET}" >&2
  exit 1
fi

remote_sha="${remote_line%%	*}"

if [ "$local_sha" = "$remote_sha" ]; then
  echo "${GREEN}✓ verify-push: synchron (${local_sha:0:8})${RESET}"
  exit 0
fi

# Nicht synchron: ist Remote ein Ancestor von local? Dann hat Push nicht
# gegriffen. Ist local ein Ancestor von Remote? Dann ist Remote vorne (jemand
# anderes hat zwischen drin gepusht — eigentlich auch Bug).
if git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
  echo "${RED}✗ verify-push: Remote ist HINTER local — Push nicht durchgekommen${RESET}" >&2
  echo "${DIM}  local : ${local_sha}${RESET}" >&2
  echo "${DIM}  remote: ${remote_sha}${RESET}" >&2
  exit 1
fi

if git merge-base --is-ancestor "$local_sha" "$remote_sha" 2>/dev/null; then
  echo "${YELLOW}⚠ verify-push: Remote ist VOR local — fetch + rebase nötig${RESET}" >&2
  echo "${DIM}  local : ${local_sha}${RESET}" >&2
  echo "${DIM}  remote: ${remote_sha}${RESET}" >&2
  exit 1
fi

echo "${RED}✗ verify-push: divergiert (kein Ancestor in beide Richtungen)${RESET}" >&2
echo "${DIM}  local : ${local_sha}${RESET}" >&2
echo "${DIM}  remote: ${remote_sha}${RESET}" >&2
exit 1
