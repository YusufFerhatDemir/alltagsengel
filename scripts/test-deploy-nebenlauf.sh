#!/usr/bin/env bash
# test-deploy-nebenlauf.sh — die Nebenlauf-Riegel von deploy.sh pruefen.
#
# WAS HIER GETESTET WIRD UND WAS NICHT
# Geprueft werden Mutex, Fremderkennung, HEAD-Wacht und Lock-Aufloesung —
# also genau die Teile, die am 13.09.2026 gefehlt haben (Commit 4df676cf:
# ein Lauf zog die halbfertigen Dateien einer parallelen Sitzung mit hinein).
#
# Der Test laeuft in einem WEGWERF-REPO unter $TMPDIR, niemals im echten
# Arbeitsbaum: er erzeugt absichtlich Konflikte und verwaiste Locks.
# Typecheck, Guard und Push sind darin nicht sinnvoll — getestet wird
# deshalb der aus deploy.sh EXTRAHIERTE Riegel, nicht ein Nachbau. Ein
# Nachbau wuerde beweisen, dass der Nachbau funktioniert.
#
#   bash scripts/test-deploy-nebenlauf.sh
#
# Exit 0 = alle Faelle wie erwartet.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$REPO/deploy.sh"
ARBEIT="$(mktemp -d "${TMPDIR:-/tmp}/deploy-nebenlauf.XXXXXX")"
trap 'rm -rf "$ARBEIT"' EXIT

GRUEN=$'\033[32m'; ROT=$'\033[31m'; DIM=$'\033[2m'; AUS=$'\033[0m'
bestanden=0; durchgefallen=0

pruefe() { # pruefe "Name" erwarteter_exit tatsaechlicher_exit
  if [ "$2" = "$3" ]; then
    echo "${GRUEN}  ✓${AUS} $1 ${DIM}(Exit $3)${AUS}"
    bestanden=$((bestanden + 1))
  else
    echo "${ROT}  ✗${AUS} $1 ${DIM}(erwartet Exit $2, war $3)${AUS}"
    durchgefallen=$((durchgefallen + 1))
  fi
}

# ── Die Riegel aus deploy.sh herausloesen ────────────────────────────
# Von `die() {` bis zum Ende der HEAD-Pruefung: Mutex, Traps, Snapshot.
# Schlaegt das fehl, hat jemand deploy.sh umgebaut — dann ist ein roter
# Test richtig, nicht laestig.
python3 - "$DEPLOY" "$ARBEIT/riegel.sh" <<'PY'
import sys, io
quelle, ziel = sys.argv[1], sys.argv[2]
s = io.open(quelle, encoding='utf-8').read()
def schnitt(von, bis):
    i = s.index(von); j = s.index(bis, i)
    return s[i:j]
teile = [
    "set -uo pipefail\n",
    "RED=$'\\033[31m'; GREEN=$'\\033[32m'; YELLOW=$'\\033[33m'; DIM=''; BOLD=''; RESET=$'\\033[0m'\n",
    'ok()   { echo "  OK   $*"; }\n',
    'warn() { echo "  WARN $*"; }\n',
    'die()  { echo "  DIE  $*" >&2; exit 1; }\n',
    'DEPLOY_START_TS="$(date +%s)"\nDEPLOY_FREMD_AB=$((DEPLOY_START_TS + 5))\n',
    schnitt('DEPLOY_LOCK="${DEPLOY_LOCK:-', 'step "1/7'),
]
# Der Staging-Riegel aus Schritt 3 (nur der else-Zweig ohne DEPLOY_PATHS).
teile.append('\nstage_pruefung() {\n')
teile.append(schnitt('  # ── FREMDERKENNUNG ueber den Startzustand', '  git add -A\nfi'))
teile.append('}\n')
teile.append('''
# Steht fuer den Typecheck: waehrend dieser Zeit kann eine fremde Sitzung
# schreiben. Ohne Wartezeit misst der Test nichts.
sleep "${TEST_ARBEITSDAUER:-8}"
stage_pruefung
pruefe_head
echo "  OK   Lauf komplett"
''')
io.open(ziel, 'w', encoding='utf-8').write(''.join(teile))
print("Riegel extrahiert aus deploy.sh")
PY
[ -f "$ARBEIT/riegel.sh" ] || { echo "${ROT}Extraktion fehlgeschlagen${AUS}"; exit 1; }

neues_repo() { # neues_repo <name>
  local d="$ARBEIT/$1"
  rm -rf "$d"; mkdir -p "$d"; cd "$d"
  git init -q .
  git config user.email test@example.invalid
  git config user.name Test
  echo bestand > bestand.txt
  git add -A && git commit -qm init
  cp "$ARBEIT/riegel.sh" ./riegel.sh
  # riegel.sh selbst darf die Messung nicht stoeren
  echo "riegel.sh" > .gitignore
  git add -A && git commit -qm ignore
}

echo ""
echo "═══ 1. Zwei parallele Laeufe — der zweite muss abgewiesen werden ═══"
neues_repo fall1
TEST_ARBEITSDAUER=6 bash riegel.sh >/tmp/l1.log 2>&1 &
erster=$!
sleep 1
TEST_ARBEITSDAUER=1 bash riegel.sh >/tmp/l2.log 2>&1
pruefe "Zweiter Lauf wird vom Mutex abgewiesen" 1 "$?"
grep -q "laeuft bereits" /tmp/l2.log \
  && echo "${DIM}      Meldung nennt die fremde PID${AUS}" \
  || { echo "${ROT}      Meldung nennt den Grund nicht${AUS}"; durchgefallen=$((durchgefallen+1)); }
wait $erster
pruefe "Erster Lauf laeuft ungestoert durch" 0 "$?"

echo ""
echo "═══ 2. Datei wird WAEHREND Lauf 1 veraendert ═══"
neues_repo fall2
( sleep 7; echo dazu > fremd.txt ) &
schreiber=$!
TEST_ARBEITSDAUER=9 bash riegel.sh >/tmp/l3.log 2>&1
pruefe "Fremde Datei bricht den Lauf ab" 1 "$?"
wait $schreiber 2>/dev/null
grep -q "fremd.txt" /tmp/l3.log \
  && echo "${DIM}      Die fremde Datei wird namentlich genannt${AUS}" \
  || { echo "${ROT}      Datei nicht genannt${AUS}"; durchgefallen=$((durchgefallen+1)); }

echo ""
echo "═══ 3. Lauf 2 aendert unabhaengig — HEAD-Wacht muss greifen ═══"
neues_repo fall3
(
  sleep 5
  cd "$ARBEIT/fall3"
  echo andere > andere.txt
  git add andere.txt && git commit -qm "fremder Commit"
) &
committer=$!
TEST_ARBEITSDAUER=9 DEPLOY_ALL=1 bash riegel.sh >/tmp/l4.log 2>&1
pruefe "Fremder Commit waehrend des Laufs bricht ab" 1 "$?"
wait $committer 2>/dev/null
grep -q "HEAD hat sich" /tmp/l4.log \
  && echo "${DIM}      Meldung nennt HEAD-Wechsel${AUS}" \
  || { echo "${ROT}      HEAD-Wechsel nicht gemeldet${AUS}"; durchgefallen=$((durchgefallen+1)); }

echo ""
echo "═══ 4. Kein Cross-Staging — nichts wird gestaget, wenn abgebrochen wird ═══"
neues_repo fall4
echo meins > meins.txt
( sleep 7; echo fremdes > fremdes.txt ) &
schreiber=$!
TEST_ARBEITSDAUER=9 bash riegel.sh >/tmp/l5.log 2>&1
wait $schreiber 2>/dev/null
gestaged="$(git diff --cached --name-only | wc -l | tr -d ' ')"
pruefe "Nach Abbruch ist der Index leer" 0 "$gestaged"

echo ""
echo "═══ 5. Lock-Aufloesung nach Absturz ═══"
neues_repo fall5
mkdir -p .git/deploy.lock
# PID, die garantiert nicht laeuft: eigene PID + grosser Versatz, geprueft.
tot=99999
while kill -0 "$tot" 2>/dev/null; do tot=$((tot - 1)); done
echo "$tot" > .git/deploy.lock/pid
echo "$(( $(date +%s) - 3600 ))" > .git/deploy.lock/seit
TEST_ARBEITSDAUER=1 bash riegel.sh >/tmp/l6.log 2>&1
pruefe "Verwaister Lock wird uebernommen" 0 "$?"
grep -q "Verwaister Lock" /tmp/l6.log \
  && echo "${DIM}      Uebernahme wird gemeldet, nicht verschwiegen${AUS}" \
  || { echo "${ROT}      Uebernahme nicht gemeldet${AUS}"; durchgefallen=$((durchgefallen+1)); }
[ -d .git/deploy.lock ] \
  && { echo "${ROT}      Lock nach Lauf noch da${AUS}"; durchgefallen=$((durchgefallen+1)); } \
  || echo "${DIM}      Lock am Ende sauber freigegeben${AUS}"

echo ""
echo "═══ 5b. Lebender Lock wird NICHT uebernommen ═══"
neues_repo fall5b
mkdir -p .git/deploy.lock
sleep 30 & lebend=$!
echo "$lebend" > .git/deploy.lock/pid
echo "$(( $(date +%s) - 7200 ))" > .git/deploy.lock/seit   # uralt, aber lebendig
TEST_ARBEITSDAUER=1 bash riegel.sh >/tmp/l7.log 2>&1
pruefe "Alter Lock mit lebendem Prozess bleibt unangetastet" 1 "$?"
kill "$lebend" 2>/dev/null; wait "$lebend" 2>/dev/null

echo ""
echo "═══ 6. Normaler Einzellauf ═══"
neues_repo fall6
echo eigene > eigene.txt
TEST_ARBEITSDAUER=8 bash riegel.sh >/tmp/l8.log 2>&1
pruefe "Einzellauf mit eigener Aenderung geht durch" 0 "$?"
neues_repo fall6b
TEST_ARBEITSDAUER=1 bash riegel.sh >/tmp/l9.log 2>&1
pruefe "Einzellauf im sauberen Baum geht durch" 0 "$?"

echo ""
echo "═══ 7. Strg-C gibt den Lock frei ═══"
neues_repo fall7
TEST_ARBEITSDAUER=20 bash riegel.sh >/tmp/l10.log 2>&1 &
opfer=$!
sleep 2
[ -d .git/deploy.lock ] \
  && echo "${DIM}      Lock waehrend des Laufs vorhanden${AUS}" \
  || { echo "${ROT}      Lock fehlt waehrend des Laufs${AUS}"; durchgefallen=$((durchgefallen+1)); }
kill -INT "$opfer" 2>/dev/null
wait "$opfer" 2>/dev/null
sleep 1
[ -d .git/deploy.lock ] \
  && { echo "${ROT}      Lock nach SIGINT noch da${AUS}"; durchgefallen=$((durchgefallen+1)); } \
  || { echo "${GRUEN}  ✓${AUS} Lock nach SIGINT freigegeben"; bestanden=$((bestanden+1)); }

echo ""
echo "═══ 8. deploy.sh pusht nirgends mit --force ═══"
if grep -nE 'git push[^|]*(--force|[[:space:]]-f[[:space:]])' "$DEPLOY" | grep -v '^\s*#'; then
  echo "${ROT}  ✗${AUS} Force-Push im Skript gefunden"
  durchgefallen=$((durchgefallen + 1))
else
  echo "${GRUEN}  ✓${AUS} Kein Force-Push im Skript"
  bestanden=$((bestanden + 1))
fi

echo ""
echo "═══ 9. Co-Author-Zeile wird nicht verdoppelt ═══"
neues_repo fall9
export COMMIT_MSG_TEST=1
mit_zeile="$(printf 'Test\n\nCo-Authored-By: Claude X <noreply@anthropic.com>')"
ohne_zeile="Test ohne Zeile"
# Dieselbe Bedingung wie in deploy.sh, aus dem Skript gelesen statt getippt.
bedingung="$(grep -n "printf '%s' \"\$COMMIT_MSG\" | grep -qi" "$DEPLOY" | head -1)"
if [ -z "$bedingung" ]; then
  echo "${ROT}  ✗${AUS} Dedup-Bedingung fehlt in deploy.sh"
  durchgefallen=$((durchgefallen + 1))
else
  COMMIT_MSG="$mit_zeile"
  if printf '%s' "$COMMIT_MSG" | grep -qi '^Co-Authored-By:'; then trifft=1; else trifft=0; fi
  pruefe "Nachricht MIT Co-Author wird erkannt" 1 "$trifft"
  COMMIT_MSG="$ohne_zeile"
  if printf '%s' "$COMMIT_MSG" | grep -qi '^Co-Authored-By:'; then trifft=1; else trifft=0; fi
  pruefe "Nachricht OHNE Co-Author bekommt eine" 0 "$trifft"
fi

echo ""
echo "═══ 10. Nachricht aus Datei ueberlebt Backticks ═══"
neues_repo fall10
nachricht="$ARBEIT/msg.txt"
printf 'fix: die Quelle `source` und `stille` bleiben stehen\n' > "$nachricht"
# Dieselbe Leseweise wie in deploy.sh, aus dem Skript gelesen.
gelesen="$(DEPLOY_MSG_FILE="$nachricht" bash -c 'cat "$DEPLOY_MSG_FILE"')"
if printf '%s' "$gelesen" | grep -q '`source`' && printf '%s' "$gelesen" | grep -q '`stille`'; then
  echo "${GRUEN}  ✓${AUS} Backticks bleiben unveraendert erhalten"
  bestanden=$((bestanden + 1))
else
  echo "${ROT}  ✗${AUS} Backticks verloren: $gelesen"
  durchgefallen=$((durchgefallen + 1))
fi
if grep -q 'DEPLOY_MSG_FILE' "$DEPLOY"; then
  echo "${GRUEN}  ✓${AUS} deploy.sh kennt DEPLOY_MSG_FILE"
  bestanden=$((bestanden + 1))
else
  echo "${ROT}  ✗${AUS} DEPLOY_MSG_FILE fehlt in deploy.sh"
  durchgefallen=$((durchgefallen + 1))
fi

echo ""
echo "──────────────────────────────────────────────"
echo "  bestanden: $bestanden   durchgefallen: $durchgefallen"
[ "$durchgefallen" = "0" ] || exit 1
echo "${GRUEN}  Alle Nebenlauf-Faelle wie erwartet.${AUS}"
