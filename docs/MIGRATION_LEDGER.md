# Migration Ledger — Alltagsengel

> Erstellt: 2026-08-28 | Projekt: nnwyktkqibdjxgimjyuq
> Regeln: Neue Migrationen NUR mit realem Timestamp. `supabase db push` NIEMALS verwenden.

## Bekannte Drift-Einträge

| Repo-Datei | Repo-Timestamp | Supabase-Version | Supabase-Name | Status |
|---|---|---|---|---|
| `20260823000000_invoice_email_log.sql` | 20260823 | 20260823140018 | `20260823000000_invoice_email_log` | ⚠ Duplikat (auch unter 20260823112427) |
| `20260923000000_notification_delivery_log.sql` | 20260923 | 20260823140040 | `20260923000000_notification_delivery_log` | ⚠ FUTURE-TIMESTAMP |
| `20260924000000_rollenkonzept_least_privilege.sql` | 20260924 | 20260823140128 | `20260924000000_rollenkonzept_least_privilege` | ⚠ FUTURE-TIMESTAMP |
| `20261015000000_angels_policy_haertung.sql` | 20261015 | 20260828095828 | `20261015000000_angels_policy_haertung` | ⚠ FUTURE-TIMESTAMP |
| `20261016000000_loeschkette_bookings_angel_fk.sql` | 20261016 | 20260828113910 | `loeschkette_bookings_angel_fk` | ⚠ FUTURE-TIMESTAMP, Name ohne Prefix |
| `20261017000000_abrechnungsintegritaet_leistungsnachweis.sql` | 20261017 | 20260828125714 | `abrechnungsintegritaet_leistungsnachweis` | ⚠ FUTURE-TIMESTAMP, Name ohne Prefix |
| `20261017000002_obergrenze_angebotstyp.sql` | 20261017 | 20260828125757 | `obergrenze_angebotstyp` | ⚠ FUTURE-TIMESTAMP, Name ohne Prefix |

## Risikobewertung

- **`supabase db push`** würde alle Future-Timestamp-Dateien als "nicht angewendet" sehen → **NIEMALS verwenden**
- **`apply_migration` MCP-Tool** ist der einzig sichere Deployment-Weg
- **Neue Migrationen**: Ab sofort NUR mit echtem aktuellem Timestamp (YYYYMMDDHHMMSS)
- Production-Objekte sind korrekt — kein Eingriff nötig

## Applied Entries

| Repo-Datei | Original-Name | Final-Version | Supabase-Name | Track | Methode | Status |
|---|---|---|---|---|---|---|
| `20260828180000_perimeter_lead_inquiries_offene_tuer.sql` | `20261018000000_…` (Future-TS umbenannt) | 20260828180000 | `20260828180000_perimeter_lead_inquiries_offene_tuer` | AE13 | execute_sql | PROVEN_LIVE |

### AE13 Migration Verification (2026-08-28)

- **Policy "Anyone can submit lead inquiry"**: ENTFERNT ✓
- **Constraint lead_inquiries_status_check**: ANGELEGT ✓
- **schema_migrations**: version=20260828180000 ✓
- **Original Future-TS**: 20261018000000 → umbenannt auf 20260828180000
- **Rollback**: 20260828180001_rollback_perimeter_lead_inquiries_offene_tuer.sql

## Gesamtstand

- **Total Migrationen in Supabase**: 285
- **Letzte Version**: 20260828180000
- **HEAD**: 42f328d5

---

> **ÜBERHOLT (31.08.2026).** Der Abschnitt unten stimmte nicht mehr: alle
> drei Marketing-Migrationen stehen live (6 Tabellen, `marketing.verwalten`
> in `rollen_matrix()`, `mis_audit_log_action_check` erweitert). Umgekehrt
> galten `20261008000000` und `20261009000000` hier als erledigt und fehlen
> live.
>
> **Diese Datei ist ab sofort nicht mehr die Quelle für „ist X live?".**
> Die Antwort misst `npm run check:migrationen`
> (`scripts/check-migrationen-live.mjs`) am Katalog der Datenbank. Der
> Stand vom 31.08.2026 mit Grund, Risiko, SQL und Verifikationsabfrage je
> Datei steht in `docs/MIGRATIONEN_OFFEN_2026-08-31.md` — acht offene
> Migrationen, nicht drei.

## Block 20 — Marketing/CRM (2026-08-30) — ÜBERHOLT, siehe Kasten oben

| Repo-Datei | Zweck | Status |
|---|---|---|
| `20261019000000_marketing_crm.sql` | 6 Tabellen: marketing_consents, email_suppression_list, email_templates, email_campaigns, email_campaign_logs, marketing_automations | **OFFEN — im SQL-Editor einzuspielen** |
| `20261019000002_rollenmatrix_marketing_verwalten.sql` | SQL-Spiegel der Rollenmatrix um `marketing.verwalten` ergänzt | **OFFEN** |
| `20261019000004_audit_action_marketing.sql` | `mis_audit_log_action_check` um drei Marketing-Aktionen erweitert | **OFFEN** |

Rollbacks: `…000001`, `…000003`, `…000005`.

### Warum diese Dateien einen Zukunfts-Zeitstempel tragen

Die Regel oben lautet „neue Migrationen nur mit echtem aktuellem
Timestamp". **Dieser Block weicht bewusst ab** — und der Grund ist die
Reihenfolge, nicht Bequemlichkeit:

`20261019000002` ersetzt `public.rollen_matrix()` per `CREATE OR REPLACE`
**vollständig**. Dieselbe Funktion wird von `20261014000000`
(`bonus.verwalten`) und `20261018000000` (`sicherheit.lesen`) ebenfalls
ganz ersetzt. Die **zuletzt angewendete Fassung gewinnt**.

Ein echter Zeitstempel (`20260830…`) würde vor den gesamten
`20261014`–`20261018`-Block sortieren. Der Dateiname behauptete dann eine
Anwendungsreihenfolge, die der tatsächlichen widerspricht — und genau
daraus entsteht die Klasse Fehler, gegen die dieser Block sich absichert.

**Zusätzliche Absicherung:** alle drei Matrix-Migrationen führen inzwischen
die *vollständige* Berechtigungsliste. `20261018000000` trägt
`marketing.verwalten` mit, `20261019000002` trägt `sicherheit.lesen` mit.
Damit ist das Endergebnis in **jeder** Anwendungsreihenfolge dasselbe. Wer
künftig eine Berechtigung ergänzt, übernimmt die vollständige Liste aus
`lib/auth/rollen.ts` und verlässt sich nicht auf die letzte Migration, die
er zufällig gelesen hat.

### Anwenden

DDL ist mit dem Dienstschlüssel nicht möglich (42501, siehe
`REVOKE braucht Owner-Rechte`). Die drei Dateien gehören in den
Supabase-SQL-Editor, in dieser Reihenfolge:

1. `20261019000000_marketing_crm.sql`
2. `20261019000002_rollenmatrix_marketing_verwalten.sql`
3. `20261019000004_audit_action_marketing.sql`

Danach `npm run verify:marketing` — das Skript prüft alle sechs Tabellen,
sperrt `anon` gegen und meldet Exit 1, solange etwas fehlt.

**Bis dahin ist der Marketing-Code vollständig und wirkungslos:** die
Routen laufen in „Tabelle existiert nicht" und das Cockpit zeigt einen
Ladefehler. Das ist der richtige Zustand — kein Versand ohne Schema.
