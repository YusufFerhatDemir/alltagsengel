# Lead-Funnel — Beweisbericht 11.09.2026

Code-Commit: `cdb005b8` (Vercel: success · CI „Typecheck, Lint, Tests, Build": success · E2E Playwright: success)

## Teil 1 — Kundenfunnel Live-Roundtrip (Production, vor dem Code-Umbau)

| Schritt | Ergebnis |
|---|---|
| `GET /warteliste` | 200 |
| `POST /api/waitlist` (curl, Testadresse `delivered+wl…@resend.dev`) | **201** `{"success":true}` |
| `state_waitlist` (PostgREST, Dienstschlüssel) | Zeile `825e764d…`, status `neu`, Pflegegrad 3, 2 Leistungen, UTM gesetzt |
| `notification_delivery_log` | `email / sent / resend`, vorgang_art `warteliste-bestaetigung`, provider_id `87cb40fc…` |
| Resend-API `GET /emails/87cb40fc…` | from `Alltagsengel <info@alltagsengel.care>`, **last_event: delivered** |
| Admin-Ansicht | `/admin/waitlist` anonym → 307 Login (Riegel greift). Eingeloggter Screenshot NICHT erstellt: der Agent gibt keine Zugangsdaten ein; die verbundene Chrome-Sitzung war nicht angemeldet. |
| Löschen | beide Testzeilen per DELETE entfernt, Nachkontrolle `[]` |

## Teil 4.1 — Bewerberfunnel Live-Roundtrip

| Schritt | Ergebnis |
|---|---|
| `GET /engel-werden` | 200 |
| `POST /api/apply` | **201** |
| `lead_inquiries` | Zeile `e89ccd1c…`, art `bewerbung`, source `engel-bewerbung`, bewerbung_daten v1 |
| Zustellspur + Resend | `sent` → **delivered**, Betreff „Ihre Bewerbung bei Alltagsengel — vielen Dank!" |

## Live-Proben der Status-CHECKs (bestimmen die Bauweise)

- `state_waitlist SET status='termin'` → **23514** `state_waitlist_status_check`
- `lead_inquiries SET status='vorgeprueft'` → **23514** `lead_inquiries_status_check`

Folge: Bewerber-Stufen (8) laufen ohne DDL über `bewerbung_daten.pipeline` + CRM-Status + `follow_up_date`.
Warteliste: 5 von 6 Stufen über Übersetzung live; „Termin" braucht Migration `20261104000000` (wartet auf Anwendung, siehe MIGRATION_LEDGER Block 6).

## Tests (lokal, vor Deploy)

- `npm run typecheck` → EXIT 0
- `vitest run` → 462 Dateien, **10.109 bestanden**, 0 rot
- `npm run test:unit` → **2.766/2.766**
- neu: `__tests__/leads/*` (3 Dateien), `__tests__/automation/lead-follow-up.test.ts`, `__tests__/migrations/state-waitlist-stufe-termin-pglite.test.ts` (echtes Postgres)
- 7 CI-Lints (forbidden, org-id, route-auth, ladefehler, leerzustand, client-bundle, rls-sicht) → alle EXIT 0

## Produktionscode gegen Live-DB (`scripts/verify-lead-funnel-live.ts`, nur lesend)

```
Lauf: 2026-09-11T14:25:30.741Z  Org: 00000000-0000-4000-8000-000460629986

── 1. zaehleLeadFollowUps (Kette 13, ohne Versand) ──
{
 "warteliste": {
  "erinnerung": 0,
  "eskalation": 0,
  "dringend": 0,
  "gesamt": 0
 },
 "bewerbungen": {
  "erinnerung": 1,
  "eskalation": 2,
  "dringend": 32,
  "gesamt": 35
 },
 "anfragen": {
  "erinnerung": 1,
  "eskalation": 0,
  "dringend": 12,
  "gesamt": 13
 }
}

── 2. Warteliste (1 Einträge), sortiert nach Priorität ──
   34  Neu         keine      E2E Test Roundtrip 1789134587
       Pflegegrad:Pflegegrad 3(+14) | Region:Im Einsatzgebiet(+12) | Leistungswunsch:2 Leistung(en), davon Demenz/Angehörigen-Entlastung(+8)

── 3. Bewerbungen (36) ──
Stufen: {"neu":35,"vorgeprueft":1} 
Follow-up: {"keine":1,"erinnerung":1,"eskalation":2,"dringend":32}
Jüngste 3:
  Neu                  WV=2026-09-12T13:51:09.031Z  FU=keine  E2E Bewerber 1789134587
  Neu                  WV=2026-09-10T19:32:05.964Z  FU=erinnerung  Ziyana Filote
  Neu                  WV=2026-09-10T05:31:01.739Z  FU=eskalation  Rahwa Ghirmai

ERGEBNIS: GRÜN
```

Befund: **32 Bewerbungen und 12 Kundenanfragen lagen über 72 h auf „new"**. Die Kette
`lead_follow_up` meldet das ab dem nächsten 05:00-Cron an admin/superadmin (In-App + E-Mail ab Eskalation).
