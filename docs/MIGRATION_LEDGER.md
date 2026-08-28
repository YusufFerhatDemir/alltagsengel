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

## Gesamtstand

- **Total Migrationen in Supabase**: 284
- **Letzte Version**: 20260828125757
- **HEAD**: f4231e6
