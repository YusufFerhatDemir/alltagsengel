#!/usr/bin/env bash
# host-health-guard.sh — P0 Host Health Check
# Prüft RAM, Swap, SSD, verwaiste Prozesse
# Exit-Codes: 0=OK, 1=WARNING, 2=CRITICAL (Code-Arbeit pausieren!)
set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

WARN=0
CRIT=0

echo "═══════════════════════════════════════════"
echo "  HOST HEALTH GUARD — $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════"

# --- 1. Memory Pressure ---
echo ""
echo "▸ Memory Pressure"
MEM_PRESSURE=$(memory_pressure 2>/dev/null | grep "System-wide memory free percentage" | awk '{print $NF}' | tr -d '%')
if [ -n "$MEM_PRESSURE" ]; then
  FREE_PCT=$MEM_PRESSURE
  if [ "$FREE_PCT" -lt 10 ]; then
    echo -e "  ${RED}CRITICAL: Nur ${FREE_PCT}% frei${NC}"
    CRIT=1
  elif [ "$FREE_PCT" -lt 25 ]; then
    echo -e "  ${YELLOW}WARNING: ${FREE_PCT}% frei${NC}"
    WARN=1
  else
    echo -e "  ${GREEN}OK: ${FREE_PCT}% frei${NC}"
  fi
else
  # Fallback: vm_stat
  PAGES_FREE=$(vm_stat | grep "Pages free" | awk '{print $NF}' | tr -d '.')
  PAGES_INACTIVE=$(vm_stat | grep "Pages inactive" | awk '{print $NF}' | tr -d '.')
  FREE_MB=$(( (PAGES_FREE + PAGES_INACTIVE) * 4096 / 1048576 ))
  if [ "$FREE_MB" -lt 512 ]; then
    echo -e "  ${RED}CRITICAL: ~${FREE_MB} MB frei${NC}"
    CRIT=1
  elif [ "$FREE_MB" -lt 2048 ]; then
    echo -e "  ${YELLOW}WARNING: ~${FREE_MB} MB frei${NC}"
    WARN=1
  else
    echo -e "  ${GREEN}OK: ~${FREE_MB} MB frei${NC}"
  fi
fi

# --- 2. Swap Usage ---
echo ""
echo "▸ Swap"
SWAP_USED=$(sysctl -n vm.swapusage 2>/dev/null | awk '{print $6}' | tr -d 'M')
if [ -n "$SWAP_USED" ]; then
  SWAP_INT=${SWAP_USED%.*}
  if [ "$SWAP_INT" -gt 4096 ]; then
    echo -e "  ${RED}CRITICAL: ${SWAP_USED}M Swap benutzt${NC}"
    CRIT=1
  elif [ "$SWAP_INT" -gt 1024 ]; then
    echo -e "  ${YELLOW}WARNING: ${SWAP_USED}M Swap benutzt${NC}"
    WARN=1
  else
    echo -e "  ${GREEN}OK: ${SWAP_USED}M Swap benutzt${NC}"
  fi
else
  echo "  (Swap-Info nicht verfügbar)"
fi

# --- 3. Freie SSD ---
echo ""
echo "▸ Freier Speicherplatz"
FREE_GB=$(df -g / | tail -1 | awk '{print $4}')
if [ "$FREE_GB" -lt 5 ]; then
  echo -e "  ${RED}CRITICAL: Nur ${FREE_GB} GB frei${NC}"
  CRIT=1
elif [ "$FREE_GB" -lt 20 ]; then
  echo -e "  ${YELLOW}WARNING: ${FREE_GB} GB frei${NC}"
  WARN=1
else
  echo -e "  ${GREEN}OK: ${FREE_GB} GB frei${NC}"
fi

# --- 4. Verwaiste Node/Build-Prozesse ---
echo ""
echo "▸ Node/Build-Prozesse"
NODE_PROCS=$(pgrep -fl "node|next|vitest|playwright|chromium|esbuild|webpack|turbopack" 2>/dev/null | grep -v "grep" | wc -l | tr -d ' ')
if [ "$NODE_PROCS" -gt 10 ]; then
  echo -e "  ${RED}CRITICAL: ${NODE_PROCS} Node/Build-Prozesse laufen${NC}"
  pgrep -fl "node|next|vitest|playwright|chromium" 2>/dev/null | head -10
  CRIT=1
elif [ "$NODE_PROCS" -gt 5 ]; then
  echo -e "  ${YELLOW}WARNING: ${NODE_PROCS} Node/Build-Prozesse${NC}"
  pgrep -fl "node|next|vitest|playwright|chromium" 2>/dev/null | head -5
  WARN=1
else
  echo -e "  ${GREEN}OK: ${NODE_PROCS} Prozesse${NC}"
fi

# --- 5. npm/npx Zombie-Prozesse ---
echo ""
echo "▸ npm/npx Prozesse"
NPM_PROCS=$(pgrep -fl "npm|npx" 2>/dev/null | grep -v "grep" | wc -l | tr -d ' ')
if [ "$NPM_PROCS" -gt 3 ]; then
  echo -e "  ${YELLOW}WARNING: ${NPM_PROCS} npm/npx-Prozesse${NC}"
  pgrep -fl "npm|npx" 2>/dev/null | head -5
  WARN=1
else
  echo -e "  ${GREEN}OK: ${NPM_PROCS} Prozesse${NC}"
fi

# --- Ergebnis ---
echo ""
echo "═══════════════════════════════════════════"
if [ "$CRIT" -eq 1 ]; then
  echo -e "  ${RED}▶ CRITICAL — CODE-ARBEIT PAUSIEREN!${NC}"
  echo "  Erst Host stabilisieren, dann weiterarbeiten."
  exit 2
elif [ "$WARN" -eq 1 ]; then
  echo -e "  ${YELLOW}▶ WARNING — Vorsicht bei Heavy Tasks${NC}"
  echo "  Nur 1 Heavy Task gleichzeitig."
  exit 1
else
  echo -e "  ${GREEN}▶ OK — Host ist stabil${NC}"
  exit 0
fi
