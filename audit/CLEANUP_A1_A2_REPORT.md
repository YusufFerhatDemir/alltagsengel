# Cleanup A1 + A2 — Abschlussbericht

**Datum:** 2026-08-04  
**Autor:** Automatisierter Audit  
**Status:** Bereit zum Review

---

## A1: pflegegrad + completed_at Bereinigung

### Branch
`cleanup/deprecated-fields-pflegegrad-completed`  
**PR:** [#24](https://github.com/YusufFerhatDemir/alltagsengel/pull/24)

### Ursache

Mehrere Code-Stellen referenzieren DB-Spalten, die in der jeweiligen Tabelle **nicht existieren**:

| Code-Stelle | Referenziert | Tatsächlicher DB-Zustand |
|---|---|---|
| `app/auth/register/page.tsx` | `profiles.pflegegrad` (UPDATE) | `profiles` hat **kein** `pflegegrad` |
| `components/OnboardingFlow.tsx` | `profiles.pflegegrad` (SELECT + UPDATE) | `profiles` hat **kein** `pflegegrad` |
| `app/api/cron/review-request/route.ts` | `bookings.completed_at` (SELECT + Filter) | `bookings` hat **kein** `completed_at` |
| `app/engel/buchungen/page.tsx` | `care_recipients.pflegegrad` (SELECT, nie gerendert) | Spalte existiert, aber Wert wird verworfen |

Zusätzlich: `clients` hat **sowohl** `pflegegrad` als auch `care_level` — Duplikat, aber beide aktiv genutzt (Abrechnung coalesced sie).

### DB-Spalten-Ist-Zustand (Produktion)

| Tabelle | Spalte | Existiert | Aktiv genutzt |
|---|---|---|---|
| `clients` | `pflegegrad` | Ja (integer) | Ja (Abrechnung) |
| `clients` | `care_level` | Ja (integer) | Ja (Admin, CRM, Native) |
| `care_recipients` | `pflegegrad` | Ja (integer, CHECK 1-5) | Ja (Buchungen, Register) |
| `hygienebox_orders` | `pflegegrad` | Ja (integer NOT NULL) | Ja (Bestellformular) |
| `profiles` | `pflegegrad` | **Nein** | Code schreibt ins Leere |
| `bookings` | `completed_at` | **Nein** | Cron-Job filtert nach nicht-existenter Spalte |
| `referrals` | `completed_at` | Ja (timestamptz) | Ja (Referral-Abschluss) |
| `mis_privacy_requests` | `completed_at` | Ja (timestamptz) | Ja (DSGVO-Anfragen) |
| `mis_tasks` | `completed_at` | Ja (timestamptz) | Ja (Task-Management) |

### Betroffene Dateien

1. `app/auth/register/page.tsx` — **FIX:** Pflegegrad-Speicherung von `profiles` → `care_recipients` (Selbst-Modus)
2. `components/OnboardingFlow.tsx` — **FIX:** Pflegegrad-Lesen/Schreiben von `profiles` → `care_recipients`
3. `app/api/cron/review-request/route.ts` — **FIX:** `completed_at` → `date` (Buchungsdatum als Filter)
4. `app/engel/buchungen/page.tsx` — **FIX:** Ungenutztes `pflegegrad` aus SELECT entfernt

### Datenbankauswirkung
Keine Schemaänderungen. Reine Code-Korrekturen.

### Sicherheits- und Datenschutzrisiko
- **Vorher:** `profiles.pflegegrad` Updates schlugen still fehl (Supabase gibt keinen Fehler bei Update auf nicht-existente Spalte via PostgREST, aber der Wert ging verloren). Kunden, die sich im Selbst-Modus registrierten, verloren ihren eingegebenen Pflegegrad.
- **Nachher:** Pflegegrad wird zuverlässig in `care_recipients` gespeichert (wo er hingehört).
- **Cron-Job:** Bewertungs-Emails wurden nie versendet, weil `bookings.completed_at` Filter immer leer zurückkam.

### Tests
`__tests__/cleanup-deprecated-fields.test.ts` — 5 Tests, alle grün

### Migration / Rollback
- Keine DB-Migration nötig
- Rollback: `git revert` des Commits auf dem Branch

### Bewertung: **GO**
Reine Bug-Fixes. Kein Breaking Change. Keine Produktionsdaten betroffen.

---

## A2: documents-Tabelle Analyse

### Branch
`cleanup/documents-table-analysis`  
**PR:** [#25](https://github.com/YusufFerhatDemir/alltagsengel/pull/25)

### Ursache

Die `documents`-Tabelle ist **nur in `supabase/initial-setup.sql` definiert** (Zeile 192), wurde aber **nie als Migration ausgeführt**. Sie existiert nicht in der Produktions-DB. Trotzdem referenzieren mehrere Code-Stellen die Tabelle direkt.

### DB-Prüfung
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema='public' AND table_name='documents'
);
-- Ergebnis: false
```

### Migrations-Prüfung
Die Tabelle kommt in den Migrations-Dateien **nicht** als `CREATE TABLE` vor. Sie ist nur in `initial-setup.sql` definiert (keine Migration, kein Deploy).

### Betroffene Dateien — DB-Tabellen-Referenzen

| Datei | Art | Kritisch? | Fix |
|---|---|---|---|
| `lib/upload-document.ts` | INSERT + Storage-Upload | **KRITISCH** — Runtime-Fehler | Feature-Guard `checkDocumentsTableExists()` |
| `app/engel/dokumente/page.tsx` | SELECT | **KRITISCH** — Seite crasht | Feature-Guard + Info-Meldung |
| `app/kunde/dokumente/page.tsx` | SELECT | **KRITISCH** — Seite crasht | Feature-Guard + Info-Meldung |
| `supabase/migrations/20260419_soft_delete.sql` | CREATE POLICY (unguarded) | **BRICHT** bei frischem DB-Replay | DO $$ Block mit pg_tables-Check |
| `supabase/functions/account-hard-delete/index.ts` | DELETE | Silent fail (nicht fatal) | `.catch(() => {})` hinzugefügt |
| `supabase/migrations/20260319000000_fix_rls_policies.sql` | RLS (IF NOT EXISTS Guard) | SAFE | Kein Fix nötig |

### Nicht betroffen (Wort "documents" in anderem Kontext)

Diese Dateien verwenden `documents` **nicht** als DB-Tabelle:
- `caregiver_documents` — eigene Tabelle (in Migrationen korrekt definiert)
- `mis_documents` / `mis_document_categories` — MIS-Modul (eigene Tabelle, funktioniert)
- `applications.documents` — JSONB-Feld (kein Tabellen-Bezug)
- `app/investor/...` — Prosa-Text
- `lib/types/pricing.ts` — Interface `DocumentSpec` (kein DB-Bezug)
- `lib/mis/constants.ts` — Nav-Link `/mis/documents` (zeigt auf `mis_documents`)

### Entscheidung
**Feature deaktiviert/abgesichert** statt entfernt. Begründung:
- Die Dokumenten-Verwaltung ist vollständig implementiert (Upload, Anzeige, Signierte URLs, DSGVO-konform)
- Kann mit einer einzigen Migration (`CREATE TABLE public.documents ...`) aktiviert werden
- Löschen wäre destruktiv und würde zukünftige Arbeit erfordern

### Datenbankauswirkung
Keine Schemaänderungen. Reine Code-Absicherung.

### Sicherheits- und Datenschutzrisiko
- **Vorher:** Engel-/Kunden-Dokumente-Seiten zeigten stille Fehler (leere Liste, Upload-Fehler ohne Erklärung)
- **Nachher:** Klare Info-Meldung "wird derzeit eingerichtet"
- **DSGVO:** Die Dokumenten-Funktion ist korrekt mit signierten URLs implementiert (kein Public Bucket). Wenn aktiviert, DSGVO-konform.

### Tests
`__tests__/cleanup-documents-table.test.ts` — 6 Tests, alle grün

### Migration / Rollback
- Keine DB-Migration nötig (nur Code-Guards)
- Zum Aktivieren des Features: `CREATE TABLE public.documents` Migration erstellen (Schema aus `initial-setup.sql` Zeile 192)
- Rollback: `git revert` des Commits auf dem Branch

### Bewertung: **GO**
Reine Absicherung. Kein Breaking Change. Verhindert stille Runtime-Fehler.

---

## Zusammenfassung

| | A1 | A2 |
|---|---|---|
| Branch | `cleanup/deprecated-fields-pflegegrad-completed` | `cleanup/documents-table-analysis` |
| PR | #24 | #25 |
| Geänderte Dateien | 4 + 1 Test | 5 + 1 Test |
| DB-Migration | Keine | Keine |
| Tests | 5/5 grün | 6/6 grün |
| TypeScript | 0 Fehler | 0 Fehler |
| Risiko | Niedrig | Niedrig |
| Empfehlung | **GO** | **GO** |

### Offene Punkte (für spätere Iteration)
1. **clients.pflegegrad vs clients.care_level** — Duplikat sollte langfristig vereinheitlicht werden (care_level als einzige Quelle, pflegegrad per Migration droppen). Erfordert Datenmigration.
2. **documents-Tabelle aktivieren** — Migration aus `initial-setup.sql` extrahieren, Storage-Bucket `documents` anlegen, Feature freischalten.
3. **care_eligibility-Tabelle** — wird an mehreren Stellen als "existiert nicht" kommentiert. Ähnlicher Fall wie documents.

### Status: NICHT GEMERGT — wartet auf Review
