# MASTER-ABSCHLUSSBERICHT 24.08.2026 / 14:00

## Phase 4.5 — Migrationen live, Delta-Check beider Repos, Resend E2E

Vorgänger: Abschlussbericht Phase 4 (24.08.2026 / 01:30, Commit `77070b4`).

---

## 1. Migrationen live eingespielt

### Alltagsengel (`nnwyktkqibdjxgimjyuq`) — 4/4 live verifiziert

| Migration | Wirkung | Status |
|---|---|---|
| `mahnqueue_retry_dead_letter` | 3 neue Spalten, Status `aufgegeben`, Retry-Index | ✅ live |
| `vpkzp_mandantenpaarung` | Cross-Tenant-Trigger (client_id ↔ organization_id) | ✅ live |
| `least_privilege_delta` | anon-Schreibrechte: 225 → 0 Tabellen | ✅ live |
| `billing_landesregeln_mandantenzaun` | Org-Fence + Policy | ✅ live |

**Live-Checks: 38/38 bestanden** (Phase 4 endete bei 34/38 — die 4 offenen Punkte waren genau die Migrationen, die Owner-Rechte brauchten).

### ChairMatch (`pwdbjqfpgumyfktbfswg`) — 3/3 live verifiziert

| Migration | Wirkung | Status |
|---|---|---|
| `analytics_events` | Tabelle + Indexes + RLS | ✅ live |
| `newsletter_schema_repair` | Subscribers-Spalten, Campaigns, Sends, Backfill | ✅ live |
| `schema_drift_repair` | `visit_logs`, `salon_images`, `services.slug`, `authorities_packs`, `submission_tickets` | ✅ live |

**9/9 Spalten-Verifikation bestanden.**

---

## 2. Delta-Check Alltagsengel

Commits: `45d0179`, `1182850`, `45f7364`

### P0 — Geldfehler im CAMT-Zahlungseingang

1. **Rücklastschrift-Fehlerkennung.** Jede ausgehende SEPA-Überweisung wurde als Rücklastschrift gezählt. Folge pro Treffer: Rechnung wieder geöffnet, 5 € Gebühr gebucht, SEPA-Mandat gekündigt — für Kunden, die korrekt bezahlt hatten.
2. **Fallback-Suche nur nach Betrag.** Ohne Referenz wurde allein über den Betrag gesucht → Zahlung landete beim falschen Kunden.
3. **Sammelbuchung.** Jeder Unterposten bekam den Gesamtbetrag statt seines Teilbetrags.

### P1 — Stille Fehler geschlossen

- Unlesbare Beträge fielen still auf 0,00 € → jetzt Exception
- Fehlendes Buchungsdatum wurde durch „heute" ersetzt → jetzt Exception
- `PDNG`-Status (vorgemerkt) wurde als Einzahlung verbucht
- Duplikaterkennung über 32-Bit-Hash → SHA-256
- Stille Import-Fehler: Teilimport, fehlgeschlagener Insert, ausgehende Zahlungen per `Math.abs()`
- **Stripe:** fehlende `STRIPE_PRICE_*` fielen still auf Plan `free` zurück → jetzt fail-closed
- **Rate-Limit:** 9 kostenrelevante Endpunkte auf persistenten DB-Limiter umgestellt
- **PflegeCoach-Mails:** eigener Resend-Client ohne Zeitlimit und ohne Provider-ID → `sendRawEmail()`

### Prüfstand

- **+52 Tests** (31 CAMT, 12 Stripe, 9 Rate-Limit)
- Typecheck: **0 Fehler** · vitest: **4498/4498** · `test:unit`: **794/794**

### Offen

| Prio | Punkt |
|---|---|
| P1 | 28 kritische Module ohne Tests |
| P1 | CAMT-Pfad ist in Produktion nie gelaufen (alle betroffenen Tabellen 0 Zeilen) |
| P2 | `tsconfig` excludiert `hooks/**` — dort liegt Client-Code |
| P2 | 58 Env-Variablen ohne zentrale Validierung |

---

## 3. Delta-Check ChairMatch

Commits: `25e08b0`, `554fa0e`, `050adb0`, `6776def`

### P0 — Live tote Funktionen

- **Postfach komplett tot:** Code las `conversations.updated_at`, live existiert `last_message_at`
- **Newsletter-Anmeldung 500:** Schema-Drift `is_active` vs. `status`
- **Besucherstatistik komplett leer:** fehlende Spalten in `visit_logs`, Fehler wurden verworfen
- **Analytics 500:** `PGRST205` wurde nicht erkannt
- **Bild-Upload, Dokumente, Behördenpaket:** fehlende Spalten

### P1

- Konto-Orakel im Passwort-Reset geschlossen
- Rate-Limit für 96 von 97 Routen ergänzt
- `promote-admin`: `timingSafeEqual` + Limit + Mindestlänge
- Resend-Webhook ohne Secret → fail-closed

### P2 — bewusst nicht migriert

`protect_pricing` / `compliance_plans` bleiben unvollständig. Eine Migration hätte Preise erfinden müssen; das ist keine Schema-Reparatur, sondern eine Geschäftsentscheidung.

### Prüfstand

Tests **463 → 487**, Typecheck sauber.

---

## 4. Resend E2E

Commits: `26cad64`, `ffb969f`

- API-Key gültig, Domain verifiziert, Test-Mail an `delivered@resend.dev` erfolgreich zugestellt
- **5 Routen** mit unkontrolliertem Resend-SDK-Aufruf gefixt (meldeten Erfolg ohne Versand)
- **Doppelversand** in Drip- und Bewertungs-Cron behoben
- **Berechtigungsfehler:** Mahnversand verlangte `abrechnung.lesen` → jetzt `abrechnung.schreiben`. Eine reine Lese-Rolle konnte Mahnungen an Kunden auslösen.
- **Regressionstest** scannt `app/` und `lib/` auf unkontrollierte SDK-Aufrufe

### EXTERN_BLOCKIERT — nur durch Yusuf lösbar

| Blocker | Ort | Folge |
|---|---|---|
| `RECHNUNGSVERSAND_AUTOMATISCH` nicht gesetzt | Vercel | Rechnungen gehen nicht automatisch raus |
| `MAHNVERSAND_AUTOMATISCH` nicht gesetzt | Vercel | Mahnlauf versendet nicht |
| `CRON_SECRET` fehlt | GitHub Repo Secrets | Retry-Workflow feuert nie |

---

## 5. Commits & CI

**Alltagsengel** (nach Phase-4-Bericht): `45d0179`, `26cad64`, `1182850`, `ffb969f`, `45f7364`
Phase 4: `77070b4`, `0059962`, `bb035eb`, `d553159`, `059f0b9`, `722e0a3`

**ChairMatch** (nach Phase 4): `25e08b0`, `554fa0e`, `050adb0`, `6776def`
Phase 4: `fa6a838`, `1c9fd8d`

**CI:** Alltagsengel Workflow `CI` auf `45f7364` = success. ChairMatch hat **keinen Test-Workflow** — dort ist nur `pages-build-deployment` grün (`6776def`); die 487 Tests laufen lokal, nicht in CI.

---

## 6. Externe Kanäle

**Search Console:** 0 neue Meldungen in 4 Tagen. Die alte Warnung (fehlender `postalCode`) ist im Code bereits behoben und wartet auf Recrawl.

**Strato-Postfach:** Bewerbung (Mohammad Imran), Qonto-Überweisung, Revolut 100 €, SCHUFA-Score geändert. **Phishing erkannt und nicht angefasst:** gefälschte STRATO- und OTTO-Mails. **Offene Leads:** Wiebke Erbach, ibisch, Vita Dranga.

---

## 7. GO / NO-GO

### Alltagsengel — TECHNISCH GO, mit Vorbehalt

- CAMT-Zahlungseingang ist gehärtet, aber **nie produktiv gelaufen** — erster Echtlauf gehört begleitet
- Mail-Automatik ist **deaktiviert** (zwei Vercel-Flags, siehe Abschnitt 4)
- §45a-Bescheid und Kassentarife bleiben extern blockiert

### ChairMatch — TECHNISCH GO, mit Vorbehalt

- `protect_pricing`-Schema bleibt unvollständig (bewusst)
- Service-Role-Key tot

---

*Erstellt 24.08.2026, 14:00 — Alltagsengel*
