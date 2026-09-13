#!/usr/bin/env bash
# deploy.sh — die EINE Pipeline, die Agents (und Yusuf) zum Pushen nutzen.
#
# Was sie macht:
#   0. Mutex (.git/deploy.lock, PID-basiert) — nur EIN Lauf je Arbeitsbaum.
#      Verwaiste Locks nach einem Absturz werden uebernommen, laufende
#      nicht. Trap gibt den Lock auch bei Strg-C/TERM frei.
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
#   DEPLOY_ALL=1     ./deploy.sh "msg"       # `git add -A` bewusst gewollt
#   DEPLOY_LOCK=…    ./deploy.sh "msg"       # anderer Lock-Ort (fuer Tests)
#
# DEPLOY_PATHS ist für parallele Sessions gedacht: laufen zwei Agents
# gleichzeitig im selben Working Tree, würde `git add -A` die halbfertigen
# Dateien des anderen Agents mitcommitten. Mit DEPLOY_PATHS staged der Lauf
# nur die eigenen Pfade; der Guard prüft weiterhin genau das, was staged ist.
#
# OHNE DEPLOY_PATHS staged der Lauf weiterhin alles — aber nicht mehr
# stillschweigend: Schritt 3 listet auf, was eingesammelt wird, und bricht
# ab, wenn eine Datei waehrend des Laufs NEU DAZUKAM (Snapshot-Vergleich)
# oder VERAENDERT wurde (mtime). Genau so ging am
# 13.09.2026 Commit 4df676cf schief: ein Lauf zog die halbfertigen Dateien
# einer parallelen Sitzung mit hinein (fremde Commit-Nachricht) und liess
# die zugehoerige Registrierung zurueck (CI rot). DEPLOY_ALL=1 sagt
# ausdruecklich „alles einsammeln ist gewollt" und hebt den Abbruch auf.
#
# Ausserdem bricht der Lauf ab, wenn sich HEAD oder Branch waehrenddessen
# aendern, und er pusht unter keinen Umstaenden mit --force.
#
# Worktree-Branches (claude/*, worktree/*) pushen automatisch auf main.

set -euo pipefail

# Startzeit des Laufs. Dient dem Nebenlaeufer-Riegel in Schritt 3: eine
# Datei, die WAEHREND dieses Laufs geschrieben wird, kann nicht zu ihm
# gehoeren — da schreibt jemand anders.
#
# KARENZ: `date +%s` loest nur auf Sekunden auf. Wer eine Datei schreibt und
# sofort deploy.sh aufruft, traefe sonst denselben Sekundenwert und wuerde
# faelschlich als Fremdsitzung geblockt — der haeufigste Fall ueberhaupt.
# Fuenf Sekunden Luft kosten nichts: zwischen Start und Schritt 3 liegt der
# Typecheck (~30-60 s), eine wirklich parallele Sitzung schreibt also weit
# jenseits dieser Grenze.
DEPLOY_START_TS="$(date +%s)"
DEPLOY_FREMD_AB=$((DEPLOY_START_TS + 5))

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

# ══════════════════════════════════════════════════════════════════════
# MUTEX — nur ein deploy.sh je Arbeitsbaum
#
# Warum ein Verzeichnis und kein `flock`: macOS liefert bash 3.2 und kein
# flock(1). `mkdir` ist auf jedem POSIX-Dateisystem atomar — entweder es
# gelegt, oder jemand anders war schneller. Genau die Eigenschaft, die ein
# Mutex braucht.
#
# Warum unter .git/: dort landet nichts je in einem Commit, und der Ort
# gehoert zum Arbeitsbaum, nicht zum Dateisystem. Zwei Klone auf derselben
# Maschine sperren sich damit nicht gegenseitig aus.
#
# NACH EINEM ABSTURZ: der Lock traegt die PID. Lebt der Prozess nicht mehr
# (`kill -0` schlaegt fehl), ist der Lock verwaist und wird uebernommen.
# Ein Lock, der nur nach Alter verfaellt, ist entweder zu frueh weg (langer
# Typecheck) oder zu lange da (Absturz nach zwei Sekunden).
# ══════════════════════════════════════════════════════════════════════
DEPLOY_LOCK="${DEPLOY_LOCK:-.git/deploy.lock}"
DEPLOY_LOCK_GEHALTEN=0

lock_freigeben() {
  # NUR den eigenen Lock loesen. Sonst raeumt ein Lauf, der am fremden Lock
  # gescheitert ist, beim Beenden genau den Lock weg, der ihn ausgesperrt hat.
  if [ "$DEPLOY_LOCK_GEHALTEN" = "1" ] && [ -d "$DEPLOY_LOCK" ]; then
    if [ "$(cat "$DEPLOY_LOCK/pid" 2>/dev/null || echo '')" = "$$" ]; then
      rm -rf "$DEPLOY_LOCK"
    fi
  fi
}

# Aufraeumen bei Abbruch (Strg-C, kill) UND bei jedem regulaeren Ende.
trap 'lock_freigeben' EXIT
trap 'echo ""; warn "Abgebrochen — Lock wird freigegeben."; lock_freigeben; exit 130' INT
trap 'echo ""; warn "Beendet (TERM) — Lock wird freigegeben."; lock_freigeben; exit 143' TERM

lock_holen() {
  if mkdir "$DEPLOY_LOCK" 2>/dev/null; then
    DEPLOY_LOCK_GEHALTEN=1
    echo "$$" > "$DEPLOY_LOCK/pid"
    date +%s > "$DEPLOY_LOCK/seit"
    return 0
  fi
  return 1
}

if ! lock_holen; then
  fremd_pid="$(cat "$DEPLOY_LOCK/pid" 2>/dev/null || echo '')"
  fremd_seit="$(cat "$DEPLOY_LOCK/seit" 2>/dev/null || echo '0')"
  alter=$(( $(date +%s) - fremd_seit ))
  if [ -n "$fremd_pid" ] && kill -0 "$fremd_pid" 2>/dev/null; then
    die "Ein anderer deploy.sh laeuft bereits (PID ${fremd_pid}, seit ${alter}s).
      Warten, bis er fertig ist. Zwei gleichzeitige Laeufe committen sich
      gegenseitig halbfertige Arbeit — genau so entstand 4df676cf."
  fi
  warn "Verwaister Lock von PID ${fremd_pid:-?} (${alter}s alt, Prozess lebt nicht mehr) — uebernommen."
  rm -rf "$DEPLOY_LOCK"
  lock_holen || die "Lock liess sich nicht uebernehmen: $DEPLOY_LOCK"
fi

# ── Zustand beim Start festhalten ─────────────────────────────────────
# Der Bezugspunkt fuer alle Riegel weiter unten. Was jetzt da ist, gehoert
# zu diesem Lauf; was spaeter dazukommt, gehoert jemand anderem.
DEPLOY_START_HEAD="$(git rev-parse HEAD 2>/dev/null || echo '')"
DEPLOY_START_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
# Portabel: GNU-mktemp verlangt XXXXXX im Template, BSD/macOS nicht.
# Ohne das X-Muster bricht der Aufruf unter Linux ab — und damit jeder
# Lauf in der CI.
DEPLOY_SNAPSHOT="$(mktemp "${TMPDIR:-/tmp}/deploy-snapshot.XXXXXX")"
git status --porcelain 2>/dev/null | sed 's/^...//' | sed 's/^.* -> //' | sort > "$DEPLOY_SNAPSHOT" || true
trap 'rm -f "$DEPLOY_SNAPSHOT"; lock_freigeben' EXIT

# Bricht ab, wenn jemand anders waehrend des Laufs den Branch gewechselt
# oder committet hat. Ein Commit auf einem HEAD, den man nicht mehr kennt,
# ist kein Commit mehr, sondern ein Ratespiel.
pruefe_head() {
  local jetzt_head jetzt_branch
  jetzt_head="$(git rev-parse HEAD 2>/dev/null || echo '')"
  jetzt_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
  if [ "$jetzt_branch" != "$DEPLOY_START_BRANCH" ]; then
    die "Branch hat sich waehrend des Laufs geaendert: ${DEPLOY_START_BRANCH} → ${jetzt_branch}.
      Abgebrochen, ohne zu schreiben."
  fi
  if [ "$jetzt_head" != "$DEPLOY_START_HEAD" ]; then
    die "HEAD hat sich waehrend des Laufs geaendert: ${DEPLOY_START_HEAD:0:8} → ${jetzt_head:0:8}.
      Da hat jemand anders committet. Abgebrochen, ohne zu schreiben —
      erneut aufrufen, dann steht der neue Stand fest."
  fi
}

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
  tsc_log="$(mktemp -t deploy-tsc-XXXXXX)"
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
  # ── NEBENLAEUFER-RIEGEL (13.09.2026) ────────────────────────────────
  # `git add -A` nimmt alles, was im Baum liegt — auch die halbfertige
  # Arbeit einer parallelen Sitzung. Das ist kein theoretischer Fall:
  # Commit 4df676cf hat genau so fremde Dateien unter falscher Nachricht
  # eingesammelt und die CI rot gemacht.
  #
  # Blind bleibt es trotzdem nicht mehr. Erst wird aufgelistet, was
  # eingesammelt wird; dann wird geprueft, ob etwas WAEHREND dieses Laufs
  # geschrieben wurde. Das ist das verlaessliche Zeichen: eigene Aenderungen
  # sind vor dem Aufruf fertig, fremde entstehen waehrenddessen weiter.
  # ── FREMDERKENNUNG ueber den Startzustand ───────────────────────────
  # Zwei unabhaengige Zeugen, weil jeder allein Luecken hat:
  #
  #   1. SNAPSHOT — was beim Start nicht im Arbeitsbaum stand, aber jetzt
  #      drin ist, kann nicht zu diesem Lauf gehoeren. Exakt, erwischt aber
  #      keine Datei, die schon vorher geaendert war und weiter waechst.
  #   2. MTIME — was waehrend des Laufs geschrieben wurde. Erwischt genau
  #      diesen Fall, ist dafuer nur sekundengenau (daher die Karenz oben).
  #
  # macOS liefert bash 3.2 — kein `mapfile`, deshalb while-read. Und kein
  # `[ … ] && echo` als letzter Ausdruck: unter `set -e` beendet der
  # Rueckgabewert 1 sonst still den ganzen Lauf.
  zu_stagen=()
  while IFS= read -r zeile; do
    [ -n "$zeile" ] && zu_stagen+=("$zeile")
  done < <(git status --porcelain | sed 's/^...//' | sed 's/^.* -> //')

  anzahl="${#zu_stagen[@]}"
  if [ "$anzahl" -gt 0 ]; then
    warn "DEPLOY_PATHS nicht gesetzt — ${anzahl} Datei(en) kaemen in den Commit:"
    printf '%s\n' "${zu_stagen[@]}" | head -20 | sed 's/^/      /'
    if [ "$anzahl" -gt 20 ]; then echo "      … und $((anzahl - 20)) weitere"; fi

    fremd=()
    for f in "${zu_stagen[@]}"; do
      neu_dazu=0
      grep -qxF "$f" "$DEPLOY_SNAPSHOT" 2>/dev/null || neu_dazu=1
      frisch=0
      if [ -f "$f" ]; then
        mt="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)"
        if [ "$mt" -gt "$DEPLOY_FREMD_AB" ]; then frisch=1; fi
      fi
      if [ "$neu_dazu" = "1" ] || [ "$frisch" = "1" ]; then fremd+=("$f"); fi
    done

    if [ "${#fremd[@]}" -gt 0 ] && [ -z "${DEPLOY_ALL:-}" ]; then
      echo ""
      warn "Waehrend dieses Laufs entstanden oder veraendert:"
      printf '%s\n' "${fremd[@]}" | sed 's/^/      /'
      die "Da arbeitet eine andere Sitzung im selben Baum. Nichts wurde gestaget.
      Gezielt stagen: DEPLOY_PATHS=\"…\" ./deploy.sh \"msg\"
      Oder wenn das Einsammeln gewollt ist: DEPLOY_ALL=1 ./deploy.sh \"msg\""
    fi
  fi
  git add -A
fi
bash scripts/precommit-guard.sh || die "Guard hat Commit blockiert. Fix oder GUARD_BYPASS=1 als Override."

# ──────────────────────────────────────────────────────────────────────
step "4/7  Commit"
pruefe_head
if git diff --cached --quiet; then
  warn "Nichts zu committen (working tree clean)"
  SKIP_COMMIT=1
else
  # Commit mit HEREDOC, Co-Author wird vom Agent-Caller per Env angehängt.
  #
  # NUR WENN DIE NACHRICHT KEINE TRAEGT. Bringt der Aufrufer seine eigene
  # Co-Author-Zeile mit — was Agenten tun, die ihr Modell selbst kennen —,
  # entstanden hier bis zum 13.09.2026 zwei Zeilen: die eigene und diese
  # Vorgabe. Sechs Commits dieser Sitzung tragen den Doppel, sichtbar erst
  # im Nachhinein. Das laesst sich nicht mehr geraderuecken (Rewrite plus
  # Force-Push), aber ab hier nicht mehr wiederholen.
  CO_AUTHOR_LINE="${DEPLOY_CO_AUTHOR:-Co-Authored-By: Claude <noreply@anthropic.com>}"
  if printf '%s' "$COMMIT_MSG" | grep -qi '^Co-Authored-By:'; then
    git commit -m "$COMMIT_MSG" || die "git commit fehlgeschlagen"
  else
    git commit -m "$(cat <<EOF
${COMMIT_MSG}

${CO_AUTHOR_LINE}
EOF
)" || die "git commit fehlgeschlagen"
  fi
  ok "Commit erstellt: $(git --no-pager log -1 --oneline)"
fi

# ──────────────────────────────────────────────────────────────────────
step "5/7  Push"
# HEAD darf sich seit dem Commit nur durch UNSEREN Commit veraendert haben.
if [ "${SKIP_COMMIT:-0}" = "1" ]; then pruefe_head; fi
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

# Schutz: niemals Force-Push — und zwar nachpruefbar, nicht nur behauptet.
# Die Zusicherung steht hier, weil ein spaeteres `push_args+=(…)` sonst
# unbemerkt ein --force einschleusen koennte.
push_args=(origin "${branch}:${remote_branch_short}")
for arg in "${push_args[@]}"; do
  case "$arg" in
    --force|-f|--force-with-lease|--force-if-includes)
      die "Force-Push ist in deploy.sh nicht vorgesehen (Argument: $arg)." ;;
  esac
done

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
