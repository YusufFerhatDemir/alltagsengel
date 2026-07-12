#!/usr/bin/env bash
# deploy.sh — die EINE Pipeline, die Agents (und Yusuf) zum Pushen nutzen.
#
# Was sie macht:
#   1. Stale-Lock-Cleanup (xlsx-Locks, .git/index.lock, .next.stale.*)
#   2. Optional: typecheck (warn-only, blockt nichts)
#   3. precommit-guard (BLOCKIERT bei Secrets/.env/node_modules/etc.)
#   4. git add -A → git commit (skip wenn nichts staged)
#   5. git push  origin <current-branch>  ODER  <claude-branch>:main
#   6. verify-push.sh (vergleicht HEAD mit Remote-Wahrheit)
#   7. IndexNow-Ping im Hintergrund (~5 Min nach main-Push; SKIP_INDEXNOW=1 deaktiviert)
#
# Nutzung:
#   ./deploy.sh                              # nimmt vorhandene Staged/Unstaged + Default-Msg
#   ./deploy.sh "feat: ..."                  # mit eigener Commit-Message
#   DEPLOY_REMOTE_REF=refs/heads/main ./deploy.sh "msg"   # erzwingt Ziel-Ref
#   SKIP_TYPECHECK=1 ./deploy.sh "msg"       # typecheck überspringen
#   GUARD_BYPASS=1   ./deploy.sh "msg"       # Notfall: precommit-guard ignorieren
#
# Worktree-Branches (claude/*, worktree/*) pushen automatisch auf main.

set -euo pipefail

RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
BLUE=$'\033[34m'
DIM=$'\033[2m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

step() { echo ""; echo "${BLUE}${BOLD}▶ $*${RESET}"; }
ok()   { echo "${GREEN}  ✓ $*${RESET}"; }
warn() { echo "${YELLOW}  ⚠ $*${RESET}"; }
die()  { echo "${RED}  ✗ $*${RESET}" >&2; exit 1; }

cd "$(dirname "$0")"

COMMIT_MSG="${1:-chore: deploy via deploy.sh}"

# ──────────────────────────────────────────────────────────────────────
step "1/7  Stale-Lock-Cleanup"
# Excel/LibreOffice .~lock.*.xlsx# Dateien
locks=$(find . -maxdepth 3 -name '.~lock.*.xlsx#' 2>/dev/null || true)
if [ -n "$locks" ]; then
  echo "$locks" | xargs rm -f && ok "xlsx-Lock(s) entfernt"
fi
# Git Index-Lock (kann hängenbleiben wenn Editor crasht)
if [ -f .git/index.lock ]; then
  # nur löschen wenn älter als 5 Minuten (sonst evtl. laufendes git)
  if find .git/index.lock -mmin +5 2>/dev/null | grep -q .; then
    rm -f .git/index.lock && ok ".git/index.lock (stale) entfernt"
  else
    warn ".git/index.lock existiert (frisch — nicht angefasst)"
  fi
fi
# Next-Build-Caches
shopt -s nullglob
stale_next=(.next.stale.*)
if [ "${#stale_next[@]}" -gt 0 ]; then
  rm -rf "${stale_next[@]}" && ok "Next.js stale build dirs entfernt (${#stale_next[@]})"
fi
shopt -u nullglob
ok "Cleanup ok"

# ──────────────────────────────────────────────────────────────────────
step "2/7  Typecheck (warn-only)"
if [ "${SKIP_TYPECHECK:-0}" = "1" ]; then
  warn "SKIP_TYPECHECK=1 — übersprungen"
elif [ -f tsconfig.json ] && [ -d node_modules/typescript ]; then
  if npx --no-install tsc --noEmit -p tsconfig.json 2>&1 | tail -5; then
    ok "Typecheck clean"
  else
    warn "Typecheck mit Fehlern — Deploy läuft weiter (warn-only)"
  fi
else
  warn "tsc nicht installiert — übersprungen"
fi

# ──────────────────────────────────────────────────────────────────────
step "3/7  Precommit-Guard"
# erst alles stagen, damit der Guard auch noch ungetrackte Files sieht
git add -A
bash scripts/precommit-guard.sh || die "Guard hat Commit blockiert. Fix oder GUARD_BYPASS=1 als Override."

# ──────────────────────────────────────────────────────────────────────
step "4/7  Commit"
if git diff --cached --quiet; then
  warn "Nichts zu committen (working tree clean)"
  SKIP_COMMIT=1
else
  # Commit mit HEREDOC, Co-Author wird vom Agent-Caller per Env angehängt
  CO_AUTHOR_LINE="${DEPLOY_CO_AUTHOR:-Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>}"
  git commit -m "$(cat <<EOF
${COMMIT_MSG}

${CO_AUTHOR_LINE}
EOF
)" || die "git commit fehlgeschlagen"
  ok "Commit erstellt: $(git --no-pager log -1 --oneline)"
fi

# ──────────────────────────────────────────────────────────────────────
step "5/7  Push"
branch="$(git rev-parse --abbrev-ref HEAD)"
[ -z "$branch" ] || [ "$branch" = "HEAD" ] && die "Detached HEAD — kein Push möglich."

# Worktree-Branches pushen auf main, sonst auf gleichnamigen Remote-Branch.
remote_ref="${DEPLOY_REMOTE_REF:-}"
if [ -z "$remote_ref" ]; then
  case "$branch" in
    claude/*|worktree/*) remote_ref="refs/heads/main" ;;
    *) remote_ref="refs/heads/${branch}" ;;
  esac
fi
remote_branch_short="${remote_ref#refs/heads/}"

# Schutz: niemals Force-Push auf main
push_args=(origin "${branch}:${remote_branch_short}")

# Falls Remote vorgewandert: erst rebasen, dann push (kein force).
git fetch origin "$remote_branch_short" --quiet 2>/dev/null || true
remote_sha="$(git rev-parse "origin/${remote_branch_short}" 2>/dev/null || echo "")"
local_sha="$(git rev-parse HEAD)"

if [ -n "$remote_sha" ] && [ "$remote_sha" != "$local_sha" ]; then
  if git merge-base --is-ancestor "$local_sha" "$remote_sha" 2>/dev/null; then
    warn "Remote ist VOR local — wir sind hinten. Rebase nötig vor Push."
    die  "Manuell: git rebase origin/${remote_branch_short}  (dann ./deploy.sh erneut)"
  fi
  if ! git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
    warn "Branches divergieren — Rebase versuchen …"
    if ! git rebase "origin/${remote_branch_short}" 2>&1 | tail -5; then
      die "Rebase fehlgeschlagen — Konflikte manuell lösen, dann erneut deploy.sh"
    fi
    ok "Rebase ok"
  fi
fi

echo "${DIM}  push: ${branch} → origin/${remote_branch_short}${RESET}"
git push "${push_args[@]}" 2>&1 | tail -5 || die "git push fehlgeschlagen"
ok "Push abgeschickt"

# ──────────────────────────────────────────────────────────────────────
step "6/7  Verify-Push"
DEPLOY_REMOTE_REF="$remote_ref" bash scripts/verify-push.sh || die "Push nicht angekommen — siehe oben."

# ──────────────────────────────────────────────────────────────────────
step "7/7  IndexNow-Ping (Hintergrund)"
# Nach jedem main-Deploy die Sitemap-URLs bei IndexNow einreichen (Bing & Co).
# 5 Min Verzögerung = Puffer für den Vercel-Build, damit die NEUE Sitemap
# gepingt wird. Läuft detached weiter, blockiert den Deploy nicht; Fehler
# sind unkritisch (täglicher Cron /api/cron/indexnow pingt ohnehin).
if [ "$remote_branch_short" = "main" ] && [ "${SKIP_INDEXNOW:-0}" != "1" ]; then
  nohup bash -c 'sleep 300 && npm run --silent indexnow:ping' \
    >> .indexnow-ping.log 2>&1 &
  disown || true
  ok "Ping geplant (in ~5 Min, Log: .indexnow-ping.log)"
else
  warn "Kein main-Deploy oder SKIP_INDEXNOW=1 — übersprungen"
fi

echo ""
echo "${GREEN}${BOLD}✓ deploy.sh erfolgreich.${RESET}"
echo "${DIM}  Local : $local_sha${RESET}"
echo "${DIM}  Remote: ${remote_ref}${RESET}"
