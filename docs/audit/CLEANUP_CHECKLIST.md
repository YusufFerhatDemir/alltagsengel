# Dead Code Cleanup Checklist

**Status:** Optional — niedrige Priorität  
**Erstellungsdatum:** 20. April 2026

---

## Quick Wins (15 Minuten)

### ☐ 1. Auskommentierte Debug-Zeilen entfernen
**Datei:** `app/mis/analytics/page.tsx`  
**Lines:** 86, 107, 115, 143

```diff
- // console.log('[MIS_DEBUG] Auth OK:', session.user?.email, 'role_meta:', meta?.role, 'expires:', new Date((session.expires_at || 0) * 1000).toISOString())
- // console.log('[MIS_DEBUG] auth_logs:', logs?.length || 0, 'rows')
- // console.log('[MIS_DEBUG] profiles:', profiles?.length || 0, 'rows')
- // console.log('[MIS_DEBUG] visitors:', visitorData?.length || 0, 'rows')
```

**Impact:** 4 LOC, sehr niedrig

---

## Short-Term (1-2 Stunden)

### ☐ 2. Console.debug mit Environment-Check wrappen
**Dateien:**
- `components/SessionKeepAlive.tsx` (lines 45, 64, 66, 69)
- `components/NativePushProvider.tsx` (lines 43, 67, 76, 90, 104)
- `components/SplashController.tsx` (line 39)

**Pattern:**
```typescript
// BEFORE:
console.debug('[SessionKeepAlive] Session aus IndexedDB wiederhergestellt');

// AFTER:
if (process.env.NODE_ENV === 'development') {
  console.debug('[SessionKeepAlive] Session aus IndexedDB wiederhergestellt');
}
```

**Impact:** ~10 LOC bereinigt, verhindert Debug-Output in Production

### ☐ 3. API Route console.log überprüfen
Die folgenden sind OK (Backend), aber könnten auch mit Environment-Checks versehen werden:
- `app/api/scan-medikament/route.ts:147`
- `app/api/ai-chat/route.ts:294`
- `app/api/cron/drip/route.ts:27`
- `app/api/cron/review-request/route.ts:124`

**Optional:** Können mit `process.env.DEBUG` oder Logging-Library (`winston`, `pino`) versehen werden.

---

## Medium-Term (halber Tag)

### ☐ 4. Allgemeine auskommentierte Code-Blöcke inventarisieren
**Befehl:**
```bash
grep -rn "^[[:space:]]*/\*" app lib components --include="*.ts" --include="*.tsx" | wc -l
# Ergebnis: 143 Blöcke
```

**Aufgabe:** Durchsehen und entfernen.  
**Hinweis:** Manche sind absichtlich gelassen (fallback logic) — mit Team klären.

---

## Long-Term (Optional, keine hohe Priorität)

### ☐ 5. Größere refactorings
- Konsolidierung doppelter Type-Definitions in `lib/types/`
- Vereinfachung von Feature-Flag-Logik (wenn vereinfacht)
- Zusammenfassung ähnlicher Tracking-Events in `lib/tracking.ts`

**Impact:** ~100 LOC, aber benötigt Architecture-Review

---

## Nicht machen (False Positives)

### ❌ Archiv-Dateien löschen
```
archive/expo-legacy/
archive/dripfy-mis-legacy/
```
**Grund:** Intentional archiviert für historische Referenz.

### ❌ Feature-Flags entfernen
```
lib/feature-flags.ts
```
**Grund:** Wird aktiv für A/B-Tests verwendet.

### ❌ Sentry-Example entfernen
```
app/sentry-example/
```
**Grund:** Demo-Code für Error-Tracking-Integration.

### ❌ Next.js Special Files als Dead markieren
Dateien wie `page.tsx`, `layout.tsx`, `error.tsx`, `route.ts` sind implizite Entry-Points und NICHT dead.

---

## Verification nach Cleanup

Nach jeder Änderung:

```bash
# Build testen
npm run build

# Linting
npm run lint

# Tests (falls vorhanden)
npm run test

# Production-Build überprüfen
npm run build && npm run start
```

---

## Git Workflow

```bash
# Feature Branch erstellen
git checkout -b feat/cleanup-dead-code-phase1

# Änderungen committen
git add .
git commit -m "cleanup: entferne auskommentierte MIS-debug-zeilen"

# Push
git push origin feat/cleanup-dead-code-phase1

# PR erstellen und mergen
```

---

## Priorisierung

| Task | LOC | Aufwand | Priorität | ROI |
|------|-----|---------|-----------|-----|
| MIS debug comments löschen | 4 | Trivial | Niedrig | Hoch |
| console.debug wrappen | 10 | Niedrig | Niedrig | Hoch |
| API console.log wrappen | 7 | Niedrig | Sehr Niedrig | Mittel |
| Allgemeine Blocks | 150+ | Mittel | Sehr Niedrig | Niedrig |

**Empfehlung:** Task 1 + 2 machen, Task 3 + 4 später oder mit größerem Refactoring.

---

## Kontakt & Fragen

Bei Fragen zu diesem Audit:
- Siehe `docs/audit/DEAD_CODE_FRONTEND.md` für detaillierten Report
- Siehe `docs/audit/DEAD_CODE_FINDINGS.json` für maschinenlesbares Format
