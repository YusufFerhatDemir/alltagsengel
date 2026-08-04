# PR-Review & Documents-Migration — Abschlussbericht

**Datum:** 2026-08-04  
**Autor:** Automatisierter Audit  
**Status:** Review abgeschlossen — NICHT GEMERGT

---

## 1. PR #24 Review — pflegegrad + completed_at Bereinigung

**Branch:** `cleanup/deprecated-fields-pflegegrad-completed`  
**Letzter Commit:** `162e80b` — cleanup(A1): pflegegrad + completed_at — veraltete Referenzen bereinigt  
**PR:** [#24](https://github.com/YusufFerhatDemir/alltagsengel/pull/24)

### Geänderte Dateien (6)

| Datei | Änderung |
|---|---|
| `app/auth/register/page.tsx` | Pflegegrad-Speicherung von `profiles.update` → `care_recipients.insert` |
| `components/OnboardingFlow.tsx` | Pflegegrad-Read/Write von `profiles` → `care_recipients` |
| `app/api/cron/review-request/route.ts` | `completed_at` → `date` (Feld existierte nicht) |
| `app/engel/buchungen/page.tsx` | Ungenutztes `pflegegrad` aus SELECT entfernt |
| `__tests__/cleanup-deprecated-fields.test.ts` | 5 Tests (NEU) |
| `audit/CLEANUP_A1_A2_REPORT.md` | Gelöscht (wird durch diesen Report ersetzt) |

### Prüfungen

| Prüfpunkt | Ergebnis |
|---|---|
| Secrets (Tokens, Passwörter, Connection-Strings) | **Keine gefunden** |
| DB-Migrationen | **Keine** — reine Code-Änderungen |
| Breaking Changes | **Keine** — Bugfixes für nicht-funktionierenden Code |
| Produktions-Configs | **Nicht betroffen** |

### Bewertung: **GO**

Reine Bugfixes. Code schrieb bisher in nicht-existente Spalten (`profiles.pflegegrad`, `bookings.completed_at`) — still fehlschlagend. Jetzt korrekt auf existierende Spalten gemappt.

---

## 2. PR #25 Review — documents-Tabelle Absicherung

**Branch:** `cleanup/documents-table-analysis`  
**Letzter Commit:** `3fe3c98` — cleanup(A2): documents-Tabelle — Feature-Guards + Absicherung  
**PR:** [#25](https://github.com/YusufFerhatDemir/alltagsengel/pull/25)

### Geänderte Dateien (7)

| Datei | Änderung |
|---|---|
| `lib/upload-document.ts` | `checkDocumentsTableExists()` Guard + Feature-Gate in `uploadDocument()` |
| `app/engel/dokumente/page.tsx` | Feature-Guard + Info-Meldung "wird derzeit eingerichtet" |
| `app/kunde/dokumente/page.tsx` | Feature-Guard + Info-Meldung "wird derzeit eingerichtet" |
| `supabase/migrations/20260419_soft_delete.sql` | DO $$ Guard für documents-Policy (pg_tables-Check) |
| `supabase/functions/account-hard-delete/index.ts` | `.catch(() => {})` für documents-Delete |
| `__tests__/cleanup-documents-table.test.ts` | 6 Tests (NEU) |
| `audit/CLEANUP_A1_A2_REPORT.md` | Gelöscht |

### Prüfungen

| Prüfpunkt | Ergebnis |
|---|---|
| Secrets | **Keine gefunden** |
| DB-Migrationen | **Keine neue CREATE TABLE** — nur Guard in bestehender Migration |
| Breaking Changes | **Keine** — Code funktionierte vorher auch nicht (Tabelle fehlt) |
| Produktions-Configs | **Nicht betroffen** |
| Migration-Änderung sicher? | **Ja** — `20260419_soft_delete.sql` ändert nur die documents-Policy von direkt zu DO $$-Guard. Auf Produktion bereits angewendet, wird nicht erneut ausgeführt. Nur relevant bei DB-Replay. |

### Bewertung: **GO**

Reine Absicherung. Verhindert Runtime-Fehler für nicht-existente Tabelle. Feature-Guard ist elegant — prüft per `SELECT ... LIMIT 0` ob die Tabelle existiert und cached das Ergebnis.

---

## 3. A2-Widerspruch Erklärung

### Das scheinbare Problem

Im früheren Report standen zwei Aussagen:
- "Kann mit einer einzigen CREATE TABLE-Migration aktiviert werden"
- "Keine DB-Migration nötig"

### Warum beides korrekt ist

Diese Aussagen beziehen sich auf **unterschiedliche Ebenen**:

| Aussage | Bezieht sich auf | Bedeutung |
|---|---|---|
| "Keine DB-Migration nötig" | **PR #25 selbst** | Der PR ändert kein DB-Schema. Er fügt nur Code-Guards hinzu. |
| "CREATE TABLE-Migration benötigt" | **Feature-Aktivierung** | Um das Dokumenten-Feature tatsächlich zu nutzen, muss die Tabelle per Migration erstellt werden. |

**Analogie:** Stell dir vor, du installierst eine Steckdose (PR #25 = Absicherung der Verkabelung), aber der Strom ist noch nicht angeschlossen (Migration = Tabelle erstellen). Die Steckdose ist sicher installiert (kein Kurzschluss), aber funktioniert erst wenn der Strom kommt.

PR #25 macht den Code **resilient** gegenüber der fehlenden Tabelle. PR #26 (diese Migration) **erstellt** die Tabelle.

---

## 4. Documents-Migration

**Branch:** `cleanup/documents-table-migration`  
**PR:** [#26](https://github.com/YusufFerhatDemir/alltagsengel/pull/26)  
**Commit:** `175c2e9` — feat: documents-Tabelle Migration (idempotent, RLS, Org-Fence)  
**Datei:** `supabase/migrations/20260804200000_create_documents_table.sql`

### Schema

| Spalte | Typ | Nullable | Default | Bemerkung |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `user_id` | uuid | NOT NULL | — | FK → profiles(id) ON DELETE CASCADE |
| `organization_id` | uuid | NOT NULL | `current_org_id()` | FK → organizations(id) ON DELETE CASCADE |
| `type` | text | NOT NULL | — | CHECK: ausweis, fuehrungszeugnis, zertifikat, versicherung, sonstiges |
| `file_name` | text | NOT NULL | — | Originaler Dateiname |
| `file_path` | text | YES | — | Storage-Pfad für Re-Signierung |
| `file_url` | text | YES | — | Signierte URL (ablaufend) |
| `status` | text | NOT NULL | `'pending'` | CHECK: pending, verified, rejected |
| `note` | text | YES | — | Admin-Notiz |
| `uploaded_at` | timestamptz | NOT NULL | `now()` | Upload-Zeitstempel |
| `verified_at` | timestamptz | YES | — | Verifizierungszeitpunkt |

### RLS-Policies (6)

| Policy | Typ | RESTRICTIVE? | Beschreibung |
|---|---|---|---|
| `documents_org_fence` | ALL | **RESTRICTIVE** | Mandantentrennung via `current_org_id()` |
| `documents_admin` | ALL | PERMISSIVE | Admin-Vollzugriff via `is_admin()` |
| `documents_select_own` | SELECT | PERMISSIVE | Eigene Dokumente lesen + Soft-Delete-Check |
| `documents_insert_own` | INSERT | PERMISSIVE | Eigene Dokumente hochladen + Soft-Delete-Check |
| `documents_update_own` | UPDATE | PERMISSIVE | Eigene Dokumente aktualisieren + Soft-Delete-Check |
| `documents_delete_own` | DELETE | PERMISSIVE | Eigene Dokumente löschen + Soft-Delete-Check |

### Storage

- Bucket `documents` (privat, `public = false`)
- 4 Storage-Policies: Upload/Read/Delete own (per `storage.foldername`), Admin all

### Tests auf Supabase Preview-Branch

| # | Test | Ergebnis |
|---|---|---|
| 1 | Migration anwenden | **PASS** |
| 2 | Spalten korrekt (11 Spalten, Typen, Defaults) | **PASS** |
| 3 | Idempotenz (Migration erneut anwenden) | **PASS** |
| 4 | RLS aktiv (`rowsecurity = true`) | **PASS** |
| 5 | Policies korrekt (6 Policies, richtige qual/with_check) | **PASS** |
| 6 | Org-Fence RESTRICTIVE | **PASS** |
| 7 | Foreign Keys (user_id → profiles, organization_id → organizations) | **PASS** |
| 8 | Indizes (5: PK + user_id, org, status, type) | **PASS** |
| 9 | Rollback (DROP CASCADE) + Re-Apply | **PASS** |
| 10 | SECURITY DEFINER Funktionen vorhanden (is_admin, is_profile_soft_deleted, current_org_id) | **PASS** |
| 11 | Soft-Delete in SELECT-Policies (0 ungeschützte) | **PASS** |

Preview-Branch nach Tests gelöscht.

### Bewertung: **GO**

---

## 5. Sichere Merge- und Deployment-Reihenfolge

### Empfohlene Reihenfolge

| Schritt | Aktion | Begründung |
|---|---|---|
| 1 | **PR #24 mergen** | Unabhängig, reine Bugfixes. Kein DB-Bezug. |
| 2 | **PR #25 mergen** | Sichert documents-Code ab. Kann VOR oder NACH #24, aber definitiv VOR #26. |
| 3 | **PR #26 Migration auf Produktion anwenden** | `20260804200000_create_documents_table.sql` über Supabase Dashboard oder CLI auf `nnwyktkqibdjxgimjyuq` ausführen. |
| 4 | **PR #26 mergen** | Erst NACH erfolgreicher Migration auf Produktion. |

### Wichtige Hinweise

- **PR #24 und #25 brauchen KEINE DB-Migration** vor dem Merge. Sie sind reine Code-Änderungen.
- **PR #26 BRAUCHT die DB-Migration** auf Produktion BEVOR der Code live geht — sonst funktioniert das Feature trotzdem nicht (die Guards aus PR #25 fangen das ab, aber das ist nicht der Zielzustand).
- **PR #25 MUSS vor PR #26** gemergt werden — die Feature-Guards in #25 sind die Fallback-Sicherung falls die Migration fehlschlägt.
- **Reihenfolge #24 vs #25** ist egal — sie ändern unterschiedliche Dateien, kein Merge-Konflikt.

### Braucht man DB-Migrationen vor dem Merge?

| PR | DB-Migration nötig? |
|---|---|
| #24 | **Nein** |
| #25 | **Nein** |
| #26 | **Ja** — Migration `20260804200000` auf Produktion anwenden |

### Wann documents-Migration auf Produktion?

Nach Merge von PR #25 (Guards), vor oder gleichzeitig mit Merge von PR #26. Die Migration ist idempotent — bei Fehler kann sie erneut ausgeführt werden.

---

## 6. Verbleibende Risiken

| Risiko | Schwere | Mitigation |
|---|---|---|
| Migration auf Produktion schlägt fehl (fehlende Abhängigkeit) | Niedrig | `is_admin()`, `is_profile_soft_deleted()`, `current_org_id()` existieren bereits in Produktion. Migration ist idempotent. |
| Storage-Bucket Namenskollision | Sehr niedrig | `ON CONFLICT DO NOTHING` — falls Bucket existiert, wird er nicht überschrieben. |
| `organization_id` Default auf Preview-Branch nicht getestet mit echten Auth-Tokens | Niedrig | `current_org_id()` fällt auf Stamm-Org zurück (`00000000-0000-4000-8000-000460629986`). Pattern identisch zu allen anderen Mandant-Tabellen. |
| `clients.pflegegrad` vs `clients.care_level` Duplikat | Mittel (technische Schuld) | Nicht in diesem Sprint. Langfristig vereinheitlichen. |
| `care_eligibility`-Tabelle (ähnlicher Fall wie documents) | Niedrig | Nicht kritisch, Code referenziert sie kaum. Für spätere Iteration. |

---

## Zusammenfassung

| PR | Branch | Bewertung | Aktion |
|---|---|---|---|
| #24 | `cleanup/deprecated-fields-pflegegrad-completed` | **GO** | Merge-bereit |
| #25 | `cleanup/documents-table-analysis` | **GO** | Merge-bereit |
| #26 | `cleanup/documents-table-migration` | **GO** | Migration erst auf Produktion anwenden, dann mergen |

**Alle drei PRs sind sicher. Keine Secrets, keine Breaking Changes, keine unbeabsichtigten Produktionsänderungen.**
