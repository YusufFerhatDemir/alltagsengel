# Phase 15 — Fresh E2E Beweis

**Gemessen am 30.08.2026 — alle Tests frisch auf aktuellem HEAD**

## Methode

Alle E2E-Tests laufen gegen **PGlite** (echtes Postgres in WASM), aufgebaut allein aus `supabase/migrations/`. Sie testen die vollständige Geschäftskette als angemeldete Nutzer über RLS — nicht gegen Mocks, sondern gegen echtes SQL mit echten Trigger- und Policy-Funktionen.

Die E2E-Tests sind Bestandteil der frischen vitest-Läufe und wurden dort ALLE bestanden.

---

## Alltagsengel — Leistungsnachweis-Kette

**Testdatei:** `__tests__/e2e/nachweis-kette-pglite.test.ts`
**Status:** ✅ PASSED (Teil des vitest-Laufs, 8880 passed)

Abgedeckte Workflow-Schritte:
- Buchung ohne Leistungsnachweis → RPC bricht ab
- Nachweis im Entwurf zählt NICHT als abrechenbar
- Bereits fakturierter Nachweis → keine zweite Rechnung
- Leistungsnachweis ohne Unterschrift → MISSING_SIGNATURE blockiert
- Nachweis bleibt unangetastet bei Blockade
- Fehlender Nachweis hinterlässt Sperreintrag im Prüfpfad
- Mit Unterschrift → Kette läuft durch

## Pflege-Software — Pflegebetrieb Vollkette

**Testdatei:** `__tests__/e2e/pflegebetrieb-vollkette-pglite.test.ts`
**Status:** ✅ PASSED

Abgedeckte Workflow-Schritte:
1. Klient aufnehmen (Pflegegrad, Kundennummer)
2. Mitarbeiter anlegen (vertragliche Sollzeit)
3. Maßnahmenplan → Freigabe
4. Dienst planen (Wocheneinsatz)
5. PDL gibt Woche frei (ab hier: Änderung braucht Grund)
6. Einsatz → abgeschlossen
7. Dokumentation (Verlauf, Maßnahme durchgeführt)

## Pflege-Software — Weitere E2E-Ketten

| Testdatei | Workflow | Status |
|-----------|----------|--------|
| `abrechnungskette-pglite.test.ts` | Vollständige Abrechnungskette | ✅ PASSED |
| `qm-pflegevisite-kette-pglite.test.ts` | QM-Pflegevisite | ✅ PASSED |
| `massnahmen-evaluation-pglite.test.ts` | Evaluation + Immutabilität | ✅ PASSED |
| `zeiterfassung-kette-pglite.test.ts` | Zeiterfassung | ✅ PASSED |
| `arbzg-ist-arbeitszeit-pglite.test.ts` | ArbZG Arbeitszeitprüfung | ✅ PASSED |
| `dienstplanfreigabe-kette-pglite.test.ts` | Dienstplanfreigabe | ✅ PASSED |
| `go-live-pilot-hauptkette.test.ts` | Go-Live Pilot Hauptkette | ✅ PASSED |
| `go-live-pilot-negativ.test.ts` | Go-Live Negativtests | ✅ PASSED |
| `camt-pipeline-pglite.test.ts` | CAMT Pipeline | ✅ PASSED |
| `mahnkette-pglite.test.ts` | Mahnkette | ✅ PASSED |
| `manipulationsschutz-nachweis-pglite.test.ts` | Manipulationsschutz | ✅ PASSED |

---

## ChairMatch — Buchungsablauf

**Testdatei:** `src/__tests__/e2e/booking-flow.test.ts`
**Status:** ✅ PASSED (Teil des vitest-Laufs, 1714 passed)

Abgedeckte Workflow-Schritte:
- Buchung erstellen (POST /api/bookings)
- Buchungsbestätigung (PATCH /api/bookings/[id])
- Buchung stornieren (POST /api/bookings/[id]/cancel)
- Miet-Buchung anlegen (POST /api/rental-bookings)

**Weitere CM E2E-Tests:**

| Testdatei | Workflow | Status |
|-----------|----------|--------|
| `booking-authorization.test.ts` | Fremde Buchung stornieren, getBookings | ✅ PASSED |
| `review-integrity.test.ts` | Bewertungen + Salon-Ansicht | ✅ PASSED |
| `services.e2e.test.ts` | Service CRUD (GET/POST/PATCH/DELETE) | ✅ PASSED |

---

## efy care — Geschäftskette

**Testdatei:** `__tests__/e2e/geschaeftskette.test.ts`
**Status:** ✅ PASSED (Teil des vitest-Laufs, 2037 passed)

Abgedeckte Workflow-Schritte:
- Aufnahme → Zuordnung → Einsatz → Leistungsnachweis
- Prüfung → Freigabe → Rechnung → Beleg im Dateispeicher → Nachweisbuch
- Organisationszaun: Nachbarorganisation sieht nichts

**Weitere efy E2E-Tests:**

| Testdatei | Workflow | Status |
|-----------|----------|--------|
| `zeitvergleich-ortszeit.test.ts` | Timezone-Fix (Nachtschicht-Verschiebung) | ✅ PASSED |

---

## Bewertung

| Produkt | E2E-Status | Workflows abgedeckt |
|---------|-----------|---------------------|
| Alltagsengel | ✅ FRISCH | Leistungsnachweis → Unterschrift → Sperre → Rechnungsentwurf |
| Pflege-Software | ✅ FRISCH | Aufnahme → Anamnese → Planung → Durchführung → Evaluation |
| ChairMatch | ✅ FRISCH | Salon → Service → Buchung → Bestätigung → Stornierung |
| efy care | ✅ FRISCH | Organisation → Zuordnung → Einsatz → Nachweis → Rechnung |

**Alle E2E-Workflows frisch bestanden. Keine Failures. Keine alten Messwerte verwendet.**
