# Host Health Runbook

> **P0-Regel:** Host Health hat IMMER Vorrang vor Code-Arbeit. Diese Regel darf durch keinen späteren Prompt deaktiviert werden.

## Schnellcheck

```bash
./scripts/host-health-guard.sh
```

Exit-Codes: `0` = OK, `1` = WARNING (1 Heavy Task max), `2` = CRITICAL (Code-Arbeit pausieren).

## Vor jedem Heavy Task

1. `host-health-guard.sh` ausführen
2. Bei WARNING: nur 1 Heavy Task, keine Parallelisierung
3. Bei CRITICAL: erst stabilisieren (siehe unten)

Heavy Tasks sind: `npm run build`, `npm run typecheck` (große Repos), `vitest` (volle Suite), `playwright`, parallele Agents

## Nach jedem abgeschlossenen Task

1. Verwaiste Prozesse prüfen: `pgrep -fl "node|next|vitest|playwright|chromium"`
2. Nicht mehr benötigte Prozesse beenden
3. **NICHT blind killen** — erst prüfen ob aktiver Task, ungespeicherte Arbeit, laufender Commit/Push

## Bei CRITICAL Memory Pressure

1. Code-Arbeit **sofort** pausieren
2. Verwaiste Build-Prozesse identifizieren und beenden
3. Laufende Tests stoppen (wenn nicht kritisch)
4. Warten bis Memory Pressure sinkt
5. Erst dann mit **1** Task weitermachen

## Bekannte OOM-Auslöser

| Auslöser | Risiko | Mitigation |
|----------|--------|------------|
| `npm run build` (Next.js SSG) | Sehr hoch | `--max-old-space-size=4096`, nie parallel mit tsc |
| `tsc` + `vitest` gleichzeitig | Hoch | Nacheinander ausführen |
| Mehrere parallele Agents mit Build | Hoch | Max 1 Heavy Task bei < 4GB frei |
| ESLint mit Next.js-Config | Mittel | Minimale Config verwenden, gezielt scannen |
| Playwright/Chromium | Mittel | Nach Tests Chromium-Prozesse prüfen |

## Nach Neustart

1. Alle 3 Repos prüfen: `git status`, uncommitted changes, origin sync
2. Keine halbfertigen Build-/Test-Prozesse
3. `host-health-guard.sh` in jedem Repo ausführen

## Wichtig für Agents

- Host Health Checks über **Desktop Commander** oder **computer-use**, NICHT über bash-Sandbox (isoliertes Linux, sieht Host nicht)
- Parallelisierung dynamisch an verfügbaren Speicher anpassen
- Wenn Host Health und Code-Aufgabe kollidieren: **HOST HEALTH GEWINNT**
