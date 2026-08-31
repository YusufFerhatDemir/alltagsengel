#!/usr/bin/env bash
# deploy.sh — die EINE Pipeline, die Agents (und Yusuf) zum Pushen nutzen.
#
# Was sie macht:
#   1. Stale-Lock-Cleanup (xlsx-Locks, .git/index.lock, .next.stale.*)
#   2. Typecheck (BLOCKIERT bei Fehlern; SKIP_TYPECHECK=1 als Notausstieg)
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
#   SKIP_TYPECHECK=1 ./deploy.sh "msg"       # typecheck überspringen (Notausstieg)
#   GUARD_BYPASS=1   ./deploy.sh "msg"       # Notfall: precommit-guard ignorieren
#   DEPLOY_PATHS="lib/x app/y" ./deploy.sh "msg"  # NUR diese Pfade stagen
#
# DEPLOY_PATHS ist für parallele Sessions gedacht: laufen zwei Agents
# gleichzeitig im selben Working Tree, würde `git add -A` die halbfertigen
# Dateien des anderen Agents mitcommitten. Mit DEPLOY_PATHS staged der Lauf
# nur die eigenen Pfade; der Guard prüft weiterhin genau das, was staged ist.
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
step "2/7  Typecheck (blockiert)"
# WARUM BLOCKIEREND STATT WARN-ONLY
#
# Der Schritt hat Typfehler schon vorher zuverlässig ERKANNT (`pipefail`
# oben reicht den tsc-Exit-Code durch die Pipeline weiter) — er hat sie
# nur nicht aufgehalten: „warn-only, Deploy läuft weiter" war die
# ausdrückliche Erlaubnis, an einem roten tsc vorbeizupushen.
#
# Genau so kamen die Läufe 33317565221 (fehlendes Modul
# @/lib/security/watchlist) und 33321919556 (drei TS2352 in lib/standort/)
# nach main. Die CI blockiert auf `npm run typecheck`; ein Typfehler wird
# also ohnehin rot — nur eben erst nach dem Push, und dann auf main statt
# lokal. Die Warnung hier hat nichts verhindert, sie hat den Fehlschlag
# nur um einen Push verschoben.
#
# Zweitens ging `| tail -5` durch: bei mehr als fünf Fehlerzeilen sah man
# die ersten Fehler gar nicht. Jetzt: volle Ausgabe in eine Datei, Anzahl
# gezählt, die ersten 30 Zeilen gezeigt.
#
# HEAP: tsc über dieses Repo passt NICHT in Nodes Standard-Heap (auf einer
# 8-GB-Maschine ~2.2 GB). Ohne das Limit unten stirbt der Lauf reproduzierbar
# mit „Ineffective mark-compacts near heap limit" — dieselbe Ursache, aus der
# `npm run build` sein eigenes --max-old-space-size mitbringt. Ein gesetztes
# NODE_OPTIONS des Aufrufers gewinnt.
#
# ABBRUCH IST KEIN TYPFEHLER: stirbt tsc am Speicher (oder sonst ohne eine
# einzige „error TS"-Zeile), dann WEISS der Lauf nichts über die Typen — er
# darf dann weder „clean" behaupten noch Typfehler erfinden. Dieser Fall
# warnt laut und laesst durch; die CI bleibt die verbindliche Instanz.
# Blockiert wird nur, was tsc auch wirklich als Typfehler benannt hat.
#
# SKIP_TYPECHECK=1 bleibt als bewusster Notausstieg — pro Lauf zu setzen,
# nicht als Dauerzustand.
if [ "${SKIP_TYPECHECK:-0}" = "1" ]; then
  warn "SKIP_TYPECHECK=1 — übersprungen (die CI prüft trotzdem)"
elif [ -f tsconfig.json ] && [ -d node_modules/typescript ]; then
  tsc_log="$(mktemp -t deploy-tsc)"
  if NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}" \
     npx --no-install tsc --noEmit -p tsconfig.json > "$tsc_log" 2>&1; then
    ok "Typecheck clean"
    rm -f "$tsc_log"
  else
    tsc_fehler="$(grep -c 'error TS' "$tsc_log" || true)"
    echo "${DIM}$(grep 'error TS' "$tsc_log" 2>/dev/null | head -30 || head -30 "$tsc_log")${RESET}"
    rm -f "$tsc_log"
    if [ "${tsc_fehler:-0}" -gt 0 ]; then
      die "Typecheck: ${tsc_fehler} Fehler — nicht committet. Beheben, oder bewusst SKIP_TYPECHECK=1 setzen."
    fi
    warn "Typecheck ABGEBROCHEN (kein Typfehler gemeldet — vermutlich Speicher). NICHT geprüft; die CI prüft es."
  fi
else
  warn "tsc nicht installiert — übersprungen"
fi

# ──────────────────────────────────────────────────────────────────────
step "3/7  Precommit-Guard"
# erst stagen, damit der Guard auch noch ungetrackte Files sieht
if [ -n "${DEPLOY_PATHS:-}" ]; then
  # Scoped: nur die angegebenen Pfade. Schützt parallele Sessions davor,
  # sich gegenseitig halbfertige Arbeit in den Commit zu ziehen.
  #
  # noglob während des Splittens: Next.js-Routen enthalten [id]-Verzeichnisse,
  # die die Shell sonst als Zeichenklasse zu interpretieren versucht.
  set -f
  # shellcheck disable=SC2086
  set -- ${DEPLOY_PATHS}
  set +f
  git add -A -- "$@" || die "git add für DEPLOY_PATHS fehlgeschlagen"
  ok "Scoped staging: ${DEPLOY_PATHS}"
  # grep findet nichts, wenn alles staged ist → Exit 1. Unter `set -e` würde
  # das den Lauf hier still beenden, deshalb `|| true` an der Pipeline UND
  # ein if statt `[ … ] && warn` (das liefert bei 0 ebenfalls Exit 1).
  unstaged_rest="$(git status --porcelain | grep -cv '^[MADRC]' || true)"
  if [ "${unstaged_rest:-0}" != "0" ]; then
    warn "${unstaged_rest} Datei(en) bleiben ungestaged (andere Session?)"
  fi
else
  git add -A
fi
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
# --verify ist Pflicht: ohne sie echot `git rev-parse` einen nicht
# auflösbaren Ref (z. B. weil der Branch noch nie gepusht wurde) als
# Literal-String statt zu fehlschlagen — das täuschte hier fälschlich
# einen divergierenden Remote vor und blockierte jeden Erstpush.
remote_sha="$(git rev-parse --verify -q "origin/${remote_branch_short}" 2>/dev/null || echo "")"
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
