#!/usr/bin/env bash
# -----------------------------------------------------------------------------
#  install.sh — installiert die versionierten Git-Hooks ins lokale .git/hooks/
# -----------------------------------------------------------------------------
#  Ausführung:  bash scripts/hooks/install.sh
#               (oder über npm:  npm run setup:hooks)
#
#  Wird von jedem Entwickler EINMAL nach `git clone` aufgerufen.
#  Dadurch geht der Hook nicht verloren, da `.git/` nicht versioniert ist.
# -----------------------------------------------------------------------------

set -e

ROOT="$(git rev-parse --show-toplevel)"
SRC_DIR="$ROOT/scripts/hooks"
DEST_DIR="$ROOT/.git/hooks"

if [ ! -d "$DEST_DIR" ]; then
  echo "❌ $DEST_DIR existiert nicht. Läuft der Befehl wirklich im Repo-Root?"
  exit 1
fi

# Alle Hooks (außer dem Installer selbst) kopieren.
for src in "$SRC_DIR"/*; do
  name="$(basename "$src")"
  case "$name" in
    install.sh) continue ;;
    *.md) continue ;;
  esac
  dest="$DEST_DIR/$name"
  cp "$src" "$dest"
  chmod +x "$dest"
  echo "✅ Installiert: .git/hooks/$name"
done

echo ""
echo "Fertig. Verbotene Strings werden jetzt bei jedem Commit geprüft."
