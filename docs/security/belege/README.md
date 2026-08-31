# Belege — Alarmkette, DDL-Rechte, Migrationsstand

Erhoben am **31.08.2026** gegen die Produktionsdatenbank
(Projekt `nnwyktkqibdjxgimjyuq`) und die Live-Site. Nur lesend.
**In keinem Beleg stehen Zugangsdaten.**

Erzeugt von `scripts/belege-sammeln.mjs` → `scripts/belege-rendern.mjs`
(Playwright/Chromium, 2× Pixeldichte). Rohdaten liegen unter `roh/`.

| Beleg | Zeigt | Quelle |
|---|---|---|
| `beleg-1_security-audit-log.png` | die beiden Test-Alarm-Ereignisse `8dfd95d7` und `cf56c43b`, **alle Spalten** | `SELECT * FROM security_audit_log` |
| `beleg-2_watchlist-karakaya.png` | Watchlist-Eintrag `12db4b18…` für Rukiye Karakaya, alle Spalten | `SELECT * FROM security_watchlist` |
| `beleg-3_zustellung-provider.png` | Zustelldatensätze mit Provider-ID/Status/Empfänger **plus** die Antwort von Resend | `notification_delivery_log` + `GET api.resend.com/emails/{id}` |
| `beleg-4_migrationsstand.png` | Migrationsstand live: 24 stehen, **8 stehen nicht** | `npm run check:migrationen` |
| `beleg-5_ddl-blocker.png` | `current_user = service_role`, alle vier DDL-Arten **42501** | `node scripts/verify-ddl-rechte-live.mjs` |
| `beleg-6_admin-ansicht-live.png` | `/admin/security/audit-log` im Browser: „Zugriff verweigert" | Chromium gegen Production, ohne Anmeldung |
| `beleg-7_admin-berechtigung.png` | Weiterleitungsspur, Berechtigungsriegel im Code, Testlauf 15/15 | Code + `vitest` |

## Die drei Kernbefunde

**1 · Der P0-Fix ist im Abstand von zwei Minuten belegt.**
Ereignis `8dfd95d7` (13:42:19 Berlin) hat eine Meldezeile, aber **keinen
Zustellbeleg** — die Sicherheitsmeldung ging raus, ohne eine Spur zu
hinterlassen; `organization_id` ist dort `NULL`. Ereignis `cf56c43b`
(13:44:40 Berlin), nach dem Fix, trägt die Organisation und einen
vollständigen Beleg: Provider-ID `13307e4c…`, Status `sent`, beim
Provider `delivered`. Dieselbe Kette, zwei Minuten später, jetzt
nachweisbar. (Beleg 1 und 3)

**2 · DDL ist über den Dienstschlüssel blockiert — gemessen, nicht vermutet.**
`current_user = service_role`, kein Mitglied von `postgres`, kein CREATE
auf `public`. CREATE FUNCTION, CREATE TRIGGER, CREATE POLICY und CREATE
INDEX scheitern alle mit **SQLSTATE 42501**. Jede Probe endet mit
`RAISE EXCEPTION`, es bleibt nichts zurück. (Beleg 5)

**3 · Acht Migrationen stehen nicht live** und können wegen Befund 2 nur
im Supabase-SQL-Editor als `postgres` angewendet werden:
`20261008000000_vitalwerte_plausibilitaet_db_check`,
`20261009000000_pflege_massnahmenplaene_ein_aktiver_plan`,
`20261010000000_medikamente_abgesetzt_sperre_db`,
`20261010000002_wund_kindtabellen_sperre_db`,
`20261010000004_pflege_verlauf_backdating_sperre_db`,
`20261021000002_secdef_trigger_revoke`,
`20261021000004_is_internal_staff_ohne_buero`,
`20261022000000_rk_lesepolicies_verwaltungsrollen`. (Beleg 4)

## Zwei Einschränkungen, offen benannt

- **`supabase_migrations.schema_migrations` ist für den Dienstschlüssel
  nicht lesbar** (`permission denied for schema supabase_migrations`).
  Der Stand in Beleg 4 wird deshalb über **Objektpräsenz** gemessen: für
  jede Migration wird geprüft, ob Funktion/Index/Policy live existiert.
  Das ist das härtere Kriterium — es belegt Wirkung statt eines Eintrags.
- **Die Admin-Ansicht wurde nicht angemeldet aufgerufen.** Passworteingabe
  ist ausgeschlossen. Beleg 6 zeigt die Abweisung, Beleg 7 den
  Berechtigungsriegel im Code und den grünen Testlauf.
