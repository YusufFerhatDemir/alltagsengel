# Dispatch: sechs wartende Migrationen

> **Erzeugt aus `lib/migration/stand.ts`.** Nicht von Hand ändern —
> `npm run migrations:dispatch` schreibt die Datei neu, ein Test hält sie dagegen.

DDL ist aus der Anwendung heraus nicht möglich (42501). Diese sechs
Migrationen gehen deshalb durch den Supabase-SQL-Editor.

**Nach jedem Schritt messen:** `npm run verify:migrationsstand`.
Der Lauf fragt nicht das Migrations-Verzeichnis, sondern die *Wirkung* —
ein Apply ohne Rechte meldet HTTP 204 und bewirkt nichts.

Die sechs sind **voneinander unabhängig**. Jede lässt sich einzeln
einspielen und einzeln zurücknehmen; die Reihenfolge unten ist die
nach Nummern, keine Abhängigkeitskette.

## 1. Audit-Luecke: `lead_follow_up_lauf` fehlt im CHECK

**Datei:** `supabase/migrations/20261105000000_audit_action_lead_follow_up.sql`
**Rücknahme:** `supabase/migrations/20261105000001_rollback_audit_action_lead_follow_up.sql`

**Ohne sie:**

`mis_audit_log.action` hat einen CHECK. Ein unbekannter Wert laesst den Insert lautlos scheitern — die Nachfass-Laeufe des Lead-Funnels stehen dann in keinem Protokoll. `logAuditEventOrWarn` meldet bis dahin eine „AUDIT-LUECKE" ins Log: sichtbar, aber eben nur im Log.

**Messbare Wirkung (1):**

- Constraint `mis_audit_log_action_check` auf `mis_audit_log` — Der CHECK laesst den Wert `lead_follow_up_lauf` zu.

## 2. Mandantenzaun fuer drei org-blinde Tabellen

**Datei:** `supabase/migrations/20261115000000_org_fence_drei_blinde_tabellen.sql`
**Rücknahme:** `supabase/migrations/20261115000001_rollback_org_fence_drei_blinde_tabellen.sql`

**Ohne sie:**

Die drei Tabellen tragen `organization_id`, nennen sie aber in keiner Policy. Ihre Admin-Policy ist damit mandantenblind: eine Verwaltung saehe die E-Mail-Entwuerfe, den Content-Stand und die Sicherheits-Ueberwachung eines FREMDEN Mandanten.

**Messbare Wirkung (3):**

- Policy `email_entwuerfe_org_fence` auf `email_entwuerfe` (RESTRICTIVE) — Mandantenzaun auf `email_entwuerfe` — RESTRICTIVE, sonst wirkungslos neben is_admin().
- Policy `marketing_content_status_org_fence` auf `marketing_content_status` (RESTRICTIVE) — Mandantenzaun auf `marketing_content_status` — RESTRICTIVE, sonst wirkungslos neben is_admin().
- Policy `security_watchlist_org_fence` auf `security_watchlist` (RESTRICTIVE) — Mandantenzaun auf `security_watchlist` — RESTRICTIVE, sonst wirkungslos neben is_admin().

**Zusätzlich danach:** `npm run verify:mandantenzaun`

## 3. Kundenbindung fuer `pflege_massnahmen`

**Datei:** `supabase/migrations/20261120000000_kunde_pflege_massnahmen_select.sql`
**Rücknahme:** `supabase/migrations/20261120000001_rollback_kunde_pflege_massnahmen_select.sql`

**Ohne sie:**

/kunde/pflegedoku zeigt den Massnahmenplan HEUTE ohne Inhalt. Als einzige der drei Pflegedoku-Tabellen hat sie keine Kundenbindung, und PostgREST beantwortet eine RLS-Verweigerung mit `200 []` statt mit einem Fehler — die Kundin sieht eine leere Seite, keine Meldung.

**Messbare Wirkung (1):**

- Policy `kunde_pflege_massnahmen_select` auf `pflege_massnahmen` — Die Kundin darf die Massnahmen ihres eigenen Klienten lesen.

**Zusätzlich danach:** `npm run verify:portal-bindung`

## 4. Die Pflegekraft darf ihren eigenen Datensatz lesen

**Datei:** `supabase/migrations/20261125000000_engel_caregivers_select_own.sql`
**Rücknahme:** `supabase/migrations/20261125000001_rollback_engel_caregivers_select_own.sql`

**Ohne sie:**

Keine der fuenf Policies auf `caregivers` bindet die Pflegekraft an ihre eigene Zeile, und die Rolle `engel` traegt keine Berechtigung. Das `.single()` in /engel/medikamente, /engel/pflegedoku/verlauf und /engel/einsaetze findet deshalb HEUTE nie eine Zeile.

**Messbare Wirkung (1):**

- Policy `engel_caregivers_select_own` auf `caregivers` — Die Pflegekraft liest ihren eigenen Datensatz (`user_id = auth.uid()`).

**Zusätzlich danach:** `npm run verify:portal-bindung`

## 5. Ohne Einsatzdauer nicht abrechenbar

**Datei:** `supabase/migrations/20261130000000_service_records_dauer_pflicht.sql`
**Rücknahme:** `supabase/migrations/20261130000001_rollback_service_records_dauer_pflicht.sql`

**Ohne sie:**

`duration_minutes` ist GENERATED und bleibt NULL, wenn die Zeiten fehlen — genau so legt /admin/leistungsnachweis-upload Nachweise an. `create_invoice_draft_atomic` rechnet dann mit `COALESCE(duration_minutes, 60)` eine volle Stunde, die niemand erfasst hat. Der Anwendungscode ist bis dahin der einzige Riegel.

**Messbare Wirkung (1):**

- Constraint `service_records_dauer_vor_abrechnung` auf `service_records` — Kein `complete`/`signed`/`invoiced` ohne Dauer; Entwuerfe bleiben erlaubt.

## 6. Eindeutigkeit je Mandant statt global

**Datei:** `supabase/migrations/20261205000000_mandanten_eindeutigkeit.sql`
**Rücknahme:** `supabase/migrations/20261205000001_rollback_mandanten_eindeutigkeit.sql`

**Ohne sie:**

Die Rechnungsnummer ist global eindeutig, der Zaehler laeuft je Mandant. Der ZWEITE Mandant erzeugt erneut `RE-2026-00001`, laeuft in eine Unique-Verletzung, der Zaehler faellt mit der Transaktion zurueck — er koennte NIE eine Rechnung stellen. Dasselbe beim Handzeichen der Pflegekraft.

**Messbare Wirkung (7):**

- Constraint `invoices_invoice_number_org_key` auf `invoices` — Rechnungsnummer je Mandant eindeutig.
- Constraint `caregivers_initials_org_key` auf `caregivers` — Handzeichen je Mandant eindeutig.
- Constraint `leistungspreise_org_bundesland_leistungsart_gueltig_ab_key` auf `leistungspreise` — Leistungspreis je Mandant, Land und Leistungsart.
- Constraint `abrechnung_zertifikate_org_ik_typ_key` auf `abrechnung_zertifikate` — Abrechnungs-Zertifikat je Mandant und IK.
- Constraint `security_watchlist_org_user_key` auf `security_watchlist` — Ein Konto kann in mehreren Organisationen ueberwacht werden.
- Constraint `mis_purchase_orders_org_po_number_key` auf `mis_purchase_orders` — Bestellnummer je Mandant.
- Constraint `mis_quality_processes_org_process_id_key` auf `mis_quality_processes` — Prozesskennung je Mandant.

**Zusätzlich danach:** `npm run verify:mandanten-eindeutigkeit`

## Wenn etwas schiefgeht

`npm run verify:migrationsstand` unterscheidet drei Antworten:

- **angewendet** — jede Wirkung ist da.
- **offen** — keine.
- **teilweise** — ein Teil der Anweisungen ist durchgelaufen. Das ist der
  gefährliche Fall: im SQL-Editor sieht er aus wie Erfolg. Der Lauf nennt
  dann namentlich, welche Wirkung fehlt.

Eine Rücknahme kann **scheitern**, sobald Daten entstanden sind, die der
alte, engere Zustand nicht zulässt — bei `20261205000000` etwa, sobald ein
zweiter Mandant eine Rechnung gestellt hat. Das ist kein Fehler der Datei,
sondern der Beleg, dass die Migration gebraucht wurde.
