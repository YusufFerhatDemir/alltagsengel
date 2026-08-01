# Top 10 Risiken + Testplan

**Audit-Datum:** 01.08.2026

---

## TOP 10 RISIKEN (nach Schwere sortiert)

### P0 — KRITISCH (Blockieren Go-Live)

| # | Risiko | Projekt | Evidenz | Auswirkung |
|---|--------|---------|---------|------------|
| 1 | **Admin-Routen ohne Server-Schutz** | Alltagsengel | Kein middleware.ts vorhanden | Jeder kann /admin/* aufrufen, Gesundheitsdaten einsehen, Abrechnungen manipulieren |
| 2 | **9 RLS-Policies ohne org_id bei Multi-Mandant** | efy care | audit_logs, caregivers, quality_measures, service_visits etc. — INSERT/UPDATE ohne org_id-Check | Bei Multi-Mandant-Aktivierung: Mandant A sieht/ändert Daten von Mandant B |
| 3 | **Auth-Tokens in AsyncStorage** | efy care | Supabase-Client nutzt AsyncStorage statt expo-secure-store | Auf gerooteten Geräten: Tokens auslesbar → voller Zugang zu Gesundheitsdaten |
| 4 | **QM-Storage-Bucket nicht org-scoped** | efy care | qualitaetsmanagement Bucket ohne org-Pfad-Policy | Qualitätsdokumente aller Mandanten für jeden lesbar |
| 5 | **IK-Nummer hardcodiert in Business-Logic** | Beide | edifact-generator.ts:42, leistungsnachweis.ts:36, leistungsnachweis-pdf.ts:35, admin/einstellungen:14 | Multi-Mandant-Betrieb unmöglich, falsche IK auf Abrechnungen anderer Mandanten |

### P1 — HOCH (Blockieren sicheren Betrieb)

| # | Risiko | Projekt | Evidenz | Auswirkung |
|---|--------|---------|---------|------------|
| 6 | **Kein CI/CD für Alltagsengel/efy care** | Beide | .github/workflows/ enthält nur ChairMatch | Kein Quality-Gate, jeder Push geht ungetestet live |
| 7 | **SECON nicht implementiert in efy care** | efy care | 0 Crypto-Funktionen, nur UI-Labels | Elektronische EDIFACT-Übermittlung blockiert |
| 8 | **0 Tests in efy care, 6 in Alltagsengel** | Beide | find -name "*.test.*" → 0 (efy care), 6 (Alltagsengel) | Kein Regressions-Schutz, jede Änderung = Risiko |

### P2 — MITTEL

| # | Risiko | Projekt | Evidenz | Auswirkung |
|---|--------|---------|---------|------------|
| 9 | **CORS erlaubt * auf Edge Functions** | efy care | cors.ts → Access-Control-Allow-Origin: * | Jede Website kann Stripe-Checkout/OCR aufrufen |
| 10 | **Kein Error-Monitoring (Sentry etc.)** | efy care | Keine Sentry/Bugsnag-Integration | Produktionsfehler bleiben unbemerkt |

---

## KONKRETER TESTPLAN

### Phase 3.1 — Sofort-Tests (Woche 1)

**Ziel:** Kritische Sicherheitslücken absichern

| Test | Typ | Framework | Dateien |
|------|-----|-----------|---------|
| Admin-Route-Schutz | Integration | Vitest + Next.js Test-Utils | `__tests__/api/admin-auth.test.ts` |
| RLS-Tenant-Isolation | DB-Test | Vitest + Supabase Client | `__tests__/rls/tenant-isolation.test.ts` |
| Stripe-Webhook-Signatur | Unit | Vitest | `__tests__/api/stripe-webhook.test.ts` |
| WhatsApp-Webhook-Signatur | Unit | Vitest | `__tests__/api/whatsapp-webhook.test.ts` |
| IK-Validierung | Unit | Vitest | `__tests__/lib/ik-validation.test.ts` |
| EDIFACT-Golden-Master | Unit | Vitest | `__tests__/lib/edifact-golden-master.test.ts` |
| SECON-Round-Trip | Unit | node:test (existiert) | `lib/abrechnung/secon.test.ts` (erweitern) |
| Auth-Token-Speicherung | Unit | Jest + RN Testing | `__tests__/auth/token-storage.test.ts` |

### Phase 3.2 — Build-Verification (Woche 1-2)

| Prüfung | Befehl | Erwartung |
|---------|--------|-----------|
| TypeScript Strict | `npx tsc --noEmit` | 0 Fehler |
| Lint | `npx next lint` | 0 Fehler |
| Production Build | `npm run build` | Erfolg |
| Secret-Scan | `scripts/precommit-guard` | 0 Treffer |
| Dependency Audit | `npm audit --production` | 0 critical/high |

### Phase 3.3 — Integrationstests (Woche 2-3)

| Test | Beschreibung |
|------|-------------|
| Multi-Mandant-Isolation | Benutzer Org A liest/schreibt → darf nur Org A sehen |
| Billing-Lifecycle | Entwurf → geprüft → freigegeben → erzeugt → (alle Status) |
| Offline-Sync-Konflikte | 2 Geräte ändern gleichen Datensatz |
| Stripe-Tarifwechsel | Upgrade/Downgrade/Kündigung |
| Storage-Bucket-Isolation | Upload in Org A → nicht lesbar in Org B |

### Phase 3.4 — CI/CD-Pipeline (Woche 2)

```yaml
# .github/workflows/ci.yml — Minimale Gates
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx tsc --noEmit          # Typecheck
      - run: npx next lint              # Lint
      - run: npm test                   # Unit + Integration
      - run: npm audit --production     # Dependency-Scan
      - run: npm run build              # Build-Test
```

### Einzelbefehl: `npm run verify`

```json
{
  "scripts": {
    "verify": "tsc --noEmit && next lint && vitest run && npm audit --production && next build"
  }
}
```

---

## DATEIEN, DIE VERÄNDERT WERDEN (nach Freigabe)

### P0 — Sofort

| Datei | Änderung | Grund |
|-------|----------|-------|
| `alltagsengel/middleware.ts` | **NEU ERSTELLEN** | Server-seitiger Admin-Route-Schutz |
| `efy-care/supabase/migrations/XXXXXXXX_fix_rls_org_scope.sql` | **NEU ERSTELLEN** | 9 RLS-Policies auf org_id updaten |
| `efy-care/app/src/lib/supabase.ts` | **ÄNDERN** | AsyncStorage → expo-secure-store |
| `efy-care/supabase/migrations/XXXXXXXX_storage_org_scope.sql` | **NEU ERSTELLEN** | QM-Bucket org-scopen |
| `alltagsengel/lib/abrechnung/edifact-generator.ts` | **ÄNDERN** | IK aus Org-Config laden statt Konstante |
| `alltagsengel/lib/abrechnung/leistungsnachweis-pdf.ts` | **ÄNDERN** | IK aus Org-Config laden |
| `alltagsengel/app/admin/abrechnung/einstellungen/page.tsx` | **ÄNDERN** | IK aus Org-Config laden |
| `alltagsengel/app/api/leistungsnachweis/route.ts` | **ÄNDERN** | IK aus Org-Config laden |
| `efy-care/app/src/features/abrechnung/leistungsnachweis.ts` | **ÄNDERN** | IK aus Org-Config laden |

### P1 — Woche 1-2

| Datei | Änderung | Grund |
|-------|----------|-------|
| `.github/workflows/ci.yml` | **NEU ERSTELLEN** | CI/CD für Alltagsengel |
| `efy-care/.github/workflows/ci.yml` | **NEU ERSTELLEN** | CI/CD für efy care |
| `alltagsengel/vitest.config.ts` | **NEU ERSTELLEN** | Test-Framework |
| `alltagsengel/package.json` | **ÄNDERN** | Test-Scripts hinzufügen |
| `efy-care/supabase/functions/_shared/cors.ts` | **ÄNDERN** | CORS auf erlaubte Origins |
| `alltagsengel/supabase/config.toml` | **NEU ERSTELLEN** | Lokale Supabase-Entwicklung |
| `efy-care/supabase/config.toml` | **NEU ERSTELLEN** | Lokale Supabase-Entwicklung |
| Diverse `__tests__/` Dateien | **NEU ERSTELLEN** | Test-Suite aufbauen |

### NICHT ANFASSEN (ohne explizite Freigabe)

- ❌ Produktive Supabase-Datenbank
- ❌ Multi-Mandant-Migration auf Prod
- ❌ Vercel Production Deployment
- ❌ Stripe Live-Mode
- ❌ Echte Patienten-/Gesundheitsdaten
- ❌ EDIFACT-Übermittlung an Datenannahmestellen

---

## GO/NO-GO BEWERTUNG (Stand jetzt)

**❌ NO-GO für Produktionsbetrieb**

Begründung:
1. 5 offene P0-Probleme
2. 0 automatisierte Tests für kritische Geschäftslogik
3. Admin-Routen ohne Server-Schutz
4. Multi-Mandant-RLS-Lücken
5. Kein CI/CD
6. Backup/Restore nie getestet
7. SECON in efy care nicht implementiert

**Nächster Schritt:** Deine Freigabe für die P0-Fixes auf Branch `audit/production-hardening`.
