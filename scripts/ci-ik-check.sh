#!/usr/bin/env bash
# ci-ik-check.sh — CI-Gate gegen hartcodierte IK (Institutionskennzeichen).
#
# Alltagsengels IK (460629986) darf NICHT als String-Literal in app/
# oder lib/ (Geschäftslogik) stehen — sie kommt ausschließlich aus der
# organizations-Tabelle / ALLTAGSENGEL_IK-Env (s. lib/config/org-config.ts,
# P0-5-Fix). Testcode (SECON-Zertifikatsfixtures) und Doku/Platzhalter
# (z. B. Onboarding-Formular-Placeholder "z. B. 460629986") sind erlaubt.
#
# Ergänzt den bereits vorhandenen Vitest-Test
# __tests__/security/p0-5-no-hardcoded-ik.test.ts als eigenständiges,
# von der Testsuite unabhängiges CI-Gate.
#
# Exit 0 = clean, Exit 1 = Treffer außerhalb Test-/Placeholder-Kontext.

set -euo pipefail

RED=$'\033[31m'
GREEN=$'\033[32m'
RESET=$'\033[0m'

IK='460629986'

# Nur app/ + lib/, nur .ts/.tsx, keine *.test.ts(x), keine reinen
# UI-Placeholder-Strings (z. B. "z. B. 460629986" im Onboarding-Formular —
# dort ist es Beispieltext für den Nutzer, keine Geschäftslogik-Konstante).
hits="$(
  git --no-pager grep -nE "['\"]${IK}['\"]" -- 'app/*.ts' 'app/**/*.ts' 'app/*.tsx' 'app/**/*.tsx' 'lib/*.ts' 'lib/**/*.ts' \
    ':(exclude)**/*.test.ts' ':(exclude)**/*.test.tsx' \
    2>/dev/null | grep -v -- 'z\. B\. 460629986' || true
)"

if [ -n "$hits" ]; then
  echo "${RED}✗ Hartcodierte IK ($IK) außerhalb Test-/Placeholder-Kontext gefunden:${RESET}" >&2
  echo "$hits" | sed 's/^/    /' >&2
  echo "" >&2
  echo "${RED}Fix: IK über lib/config/org-config.ts::getOrgIK() laden, nicht literal einbetten.${RESET}" >&2
  exit 1
fi

echo "${GREEN}✓ ci-ik-check: keine hartcodierte IK in app/lib-Geschäftslogik${RESET}"
