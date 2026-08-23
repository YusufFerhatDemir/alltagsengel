# MASTER PROJECT STATUS

> Stand: 23.08.2026 | Baseline: FINAL_FINAL_GO_LIVE_REPORT_2026-08-21.md
> Basis-HEAD: `0bd61d1` | Vorlauf 22.08.: 11 Commits (f8ad0ae, 24e67e9, b3564d2,
> 6d148a5, ea67b5b, e588416, 8392730, de4623b, 79e7e0e, f4048df, 3c29b00)
> — dazu `ebf14e2` im separaten ChairMatch-Repo (`/Users/work/chairmatch`).
>
> **23.08.2026 — 6 von 8 Master-Tracks abgeschlossen.** Zwei Migrationen sind
> nicht mehr „wartet auf Apply", sondern **live angewendet und gegengeprueft**
> (ChairMatch-Persistenz, `invoice_email_log`). P6-Legacy geprueft, Buchungskette
> gegen Live-Daten gemessen. Details im CHANGELOG-Eintrag vom 23.08.
>
> **Offen als CEO-Aktion (nicht aus einer Session loesbar, braucht Dashboard-Login):**
> | # | Aktion | Wo |
> |---|--------|-----|
> | 1 | Signup deaktivieren (`disable_signup=true`) | Supabase-Dashboard, Projekt `vlrviyrgggzhayepfmop` (P6) |
> | 2 | `RESEND_API_KEY` setzen | Vercel Production — ohne ihn verlaesst keine Rechnung/Mahnung das System |
>
> **CI: GRUEN — auf GitHub verifiziert, nicht nur lokal.**
> Run [32569458523](https://github.com/YusufFerhatDemir/alltagsengel/actions/runs/32569458523)
> auf `3c29b00`, abgeschlossen 22.08.2026 13:14, Dauer 6m12s. Beide Jobs
> `success`: „Typecheck, Lint, Tests, Build" und „E2E — PflegeCoach (DiPA QS-05)
> + Barrierefreiheit (BITV B-13)".
> Der Vorlauf auf `f4048df` (32556332992) war **rot** — Ursache war der eine
> Track-5-Test, den `3c29b00` geschlossen hat. Details unter Track 6.

---

## Track 1: Alltagsengel Core (§45b Alltagsbegleitung)

**Status: GO (technisch) | BLOCKED (extern)**
Letzter Check: 21.08.2026

### Erledigt
- V6 Baseline produktionsreif, 3389 Tests gruen
- RLS: 0 Tabellen ohne RLS, 234 org_fence Policies, anon-Zugriff gesperrt
- Abrechnung: PfluV-Saetze (30/25 EUR), Entlastungsbetrag 131 EUR/Monat, VP/KZP 3539 EUR/Jahr
- IK-Nummer 460629986 vergeben (gueltig ab 16.07.2026)
- Erweitertes Fuehrungszeugnis eingetroffen (19.08.2026)
- Feiertagsberechnung alle 16 Bundeslaender
- Multi-Tenancy mit org-fence
- Wunddokumentation, SIS-Modul, Vitalzeichen, Tourenplanung, Medikamentenmanagement

### Offene P0/P1 Items
| # | Item | Prio | Typ | Verantwortlich |
|---|------|------|-----|----------------|
| 1 | **§45a Anerkennung Hessen** (Aktenzeichen 51.D24.12) | P0 | EXTERN | Leitstelle Aelterwerden, Frist 31.08.2026 |
| 2 | **Tarifverifizierung** gegen PfluV-Obergrenzen (23 Tarife, 24 Dienstleistungspreise) | P0 | INTERN | CEO/Fachberaterin |
| 3 | **Gewerbeanmeldung** Frankfurt | P0 | EXTERN | Gewerbeamt |
| 4 | **Haftpflichtversicherung** abschliessen | P0 | CEO | Versicherung |
| 5 | **Arbeitsvertrag Sabrina Martin** (4 Felder ausfuellen) | P1 | CEO | intern |
| 6 | **12 Unterschriften** auf Antragsunterlagen | P1 | CEO | intern |
| ~~7~~ | ~~API-Routen ohne Error-Sanitizer~~ | ~~P1~~ | **ERLEDIGT** (UserFacingError fail-closed, 195 Leak-Punkte behoben, 25 Tests, b344329) |
| ~~8~~ | ~~MFA/TOTP fuer Admin~~ | ~~P1~~ | **ERLEDIGT** (Enrollment, Verify, AAL2-Guards, 15 Tests, 6de1254) |

### Neue Befunde aus Funktionaler Lueckenanalyse (b3564d2)
Vollstaendige Analyse: `docs/FUNKTIONALE_LUECKENANALYSE.md` (690 Zeilen, 14 Bereiche)

| # | Item | Prio | Typ |
|---|------|------|-----|
| 9 | §45b-Tarife live `blocked` (8/9), VP/KZP 0/4 verifiziert | P1 | EXTERN (Bescheid) |
| ~~10~~ | ~~Buchung erzeugt keinen Einsatz/Leistungsnachweis (Kettenbruch)~~ | ~~P1~~ | **ERLEDIGT** (lib/bookings/einsatz-kette.ts, fail-closed, 20 Tests, de4623b) |
| ~~11~~ | ~~Mahnungen werden erzeugt aber nie versendet (`dunning_email_queue` ohne Konsument)~~ | ~~P1~~ | **ERLEDIGT** (lib/billing/dunning/mahn-versand.ts + POST /api/billing/dunning/versand, 8 Tests, 79e7e0e) |
| ~~12~~ | ~~Keine manuelle Zahlungserfassung in UI (nur CAMT-Import)~~ | ~~P1~~ | **ERLEDIGT** (components/admin/ZahlungErfassenDialog.tsx aus /admin/forderungen, 8 Tests, 79e7e0e) |
| ~~13~~ | ~~Rechnung wird nicht zugestellt (kein E-Mail-Versand, nur Portal-Download)~~ | ~~P1~~ | **ERLEDIGT** (lib/billing/versand/rechnung-versand.ts + POST /api/billing/invoices/[id]/versenden, 13 Tests, 79e7e0e) |
| 14 | Offline-Erfassung nur im nicht ausgelieferten Expo-Projekt | P1 | INTERN |
| 15 | Kundenstammdaten nach Anlage nur teilweise editierbar | P1 | INTERN |

> **ERLEDIGT 23.08.2026 — `invoice_email_log` ist LIVE_VERIFIED.** Die Migration
> ist auf `nnwyktkqibdjxgimjyuq` angewendet: Tabelle mit 15 Spalten, RLS aktiv mit
> beiden Policies — `invoice_email_log_admin` (PERMISSIVE, `is_admin()`) **und**
> `org_fence_invoice_email_log` (RESTRICTIVE, `organization_id = current_org_id()`).
> Der Dateiname im Repo war ein Tippfehler (`20260923` statt `20260823`) und ist
> auf `20260823000000_invoice_email_log.sql` korrigiert, Rollback als
> `20260823000001`; Referenzen in Code und Doku nachgezogen.
>
> **Versand ist ENV-gesteuert — und der Key fehlt noch:** ohne `RESEND_API_KEY`
> wird jeder Versuch als `uebersprungen` protokolliert und `sent_at` bleibt leer,
> damit nachversendet wird. Automatischer Versand bei Festschreibung nur mit
> `RECHNUNGSVERSAND_AUTOMATISCH='1'` — Standard ist manuell.
> **CEO_ACTION_REQUIRED: `RESEND_API_KEY` in Vercel Production setzen.** Bis dahin
> ist die Versandkette vollstaendig gebaut, aber ohne Zustellkanal.
>
> **Unveraendert blockiert:** §45b-Tarife bleiben `blocked`/`unverified`
> (Punkt 9). Die Versandkette aendert daran nichts; nicht verifizierte Tarife
> erzeugen weiterhin keine Rechnung.

### Buchungskette: Live-Delta-Check (23.08.2026) — **VERIFIZIERT**
Erste Messung der Kette aus `de4623b` an echten Zeilen statt an Testdaten.

| Stufe | Live-Bestand |
|-------|--------------|
| `assignments` | 5 aktiv |
| `service_records` | 30 — 2 `draft`, 13 `signed`, 15 `invoiced` |
| `invoice_items` | 15 |
| `invoices` | 3 — 1 `sent`, 1 `paid`, 1 `disputed` |
| `payments` | 0 (Zuordnung ueber `payment_allocations`) |

**Keine gebrochenen Verweise, keine verwaisten Datensaetze.** Die 13 signierten
Nachweise ohne Rechnung sind kein Defekt, sondern der normale Zwischenstand:
unterschrieben, noch nicht abgerechnet. `payments = 0` deckt sich mit dem
fehlenden `RESEND_API_KEY` — ohne Versand keine Zahlung.

---

## Track 2: Elektronische Abrechnung (§105 SGB XI)

**Status: BLOCKED (extern)**
Letzter Check: 19.08.2026

### Erledigt
- Technisch komplett, 200+ neue Tests, Triple-Lock-Safeguard
- 4 P0-Bugs gefixt, Tarif-Fail-Closed implementiert
- DAKOTA als Integrationskomponente (nicht Billing-Kern)
- IK nicht hardcodiert, mandantenspezifische Konfiguration

### Offene P0/P1 Items
| # | Item | Prio | Typ |
|---|------|------|-----|
| 1 | ITSG-Zertifikat beantragen | P0 | EXTERN |
| 2 | SFTP-Zugang einrichten | P0 | EXTERN |
| 3 | Kassenvertraege abschliessen | P0 | EXTERN |
| 4 | IK-Nummer als ENV-Variable setzen (Produktion) | P1 | INTERN |

---

## Track 3: DiPA/PflegeCoach

**Status: BLOCKED (extern) | COACH_DIPA_MODUS=false**
Letzter Check: 19.08.2026

### Erledigt
- 34/48 Features technisch komplett
- Feature-Flag COACH_DIPA_MODUS=false (kein Einfluss auf Core)

### Offene P0/P1 Items
| # | Item | Prio | Typ |
|---|------|------|-----|
| 1 | **ISO 27001** -- Eintrittsblocker fuer BfArM-Antrag | P0 | EXTERN |
| 2 | 14 verbleibende Features fertigstellen | P1 | INTERN |
| 3 | MDR Klasse IIa Pruefung (KI-Module) | P1 | EXTERN |
| 4 | AI-Act Risikoklass-Review pro Modul | P1 | INTERN |

---

## Track 4: SGB V / §302 + KIM/TI

**Status: BLOCKED (extern) | KIM_AKTIV=false**
Letzter Check: 19.08.2026

### Erledigt
- Technisch komplett (Mock-Modus)
- Tarif-Fail-Closed, Readiness nach Mandant gefiltert
- §105 und §302 sauber getrennt (TA1 v6.4.0 vs. TA1 v21)

### Offene P0/P1 Items
| # | Item | Prio | Typ |
|---|------|------|-----|
| 1 | gematik KIM-Zulassung | P0 | EXTERN |
| 2 | §302 Abrechnungs-Zulassung | P0 | EXTERN |
| 3 | FHIR-Konformitaet validieren | P1 | EXTERN |

---

## Track 5: ChairMatch

**Status: GO (technisch)**
Letzter Check: 21.08.2026
Supabase: pwdbjqfpgumyfktbfswg

### Erledigt
- getSupabaseAdmin() P0-Fix deployed
- RLS: alle 13 Tabellen verifiziert, anon-Zugriff gesperrt
- Audit-Logging implementiert
- Stripe-Integration aktiv
- Ausnahme: spatial_ref_sys (PostGIS, kein PII)

### Offene P0/P1 Items
| # | Item | Prio | Typ |
|---|------|------|-----|
| ~~1~~ | ~~`ignoreBuildErrors: true` entfernen~~ | ~~P0~~ | **ERLEDIGT** (bereits entfernt) |
| ~~2~~ | ~~Hardcodierter anon-Key Fallback entfernen~~ | ~~P0~~ | **ERLEDIGT** (cfb6c88, 30 Dateien) |
| ~~3~~ | ~~TypeScript-Fehler fixen (strict mode)~~ | ~~P1~~ | **NICHT ZUTREFFEND** (ChairMatch = statisches HTML, kein TS) |
| ~~4~~ | ~~E2E-Tests fuer Booking/Payment~~ | ~~P1~~ | **ERLEDIGT** (174 Tests, 3 Prod-Bugs gefixt: Statuswechsel, Rate-Limit, Rollen-Check, c0e6af6 in /chairmatch) |
| ~~5~~ | ~~i18n-Abdeckung~~ | ~~P1~~ | **ERLEDIGT** (de/en-Kataloge 479 Keys, 33 Seiten instrumentiert, Intl-Formatierung, c9d603a) |
| ~~6~~ | ~~Supabase API-Key Dependency Map~~ | ~~P1~~ | **ERLEDIGT** (docs/SUPABASE_KEY_DEPENDENCY_MAP.md, 6 Projekte kartiert, f8ad0ae) |
| 7 | Supabase API-Keys rotieren | P1 | **BLOCKED_BY_RISK / kein Handlungsbedarf bis Ende 2026** — Legacy-JWT-Modell, Rotation loggt alle Nutzer aus. Die Abstraktion steht (`scripts/lib/supabase-keys.mjs`, `f8ad0ae`), die Umstellung ist additiv vorbereitet. Rotiert wird erst zur Abkuendigung der Legacy-Keys (Ende 2026). Details in Dependency Map. |

### Neue Befunde aus ChairMatch Delta-Analyse (24e67e9)
Vollstaendige Analyse: `docs/CHAIRMATCH_DELTA_ANALYSE.md` · 231/231 Tests gruen

| # | Item | Prio | Typ |
|---|------|------|-----|
| ~~8~~ | ~~`MeinBereichSubPage` speichert in localStorage statt DB (9 Seiten)~~ | ~~P1~~ | **ERLEDIGT** (ebf14e2) |
| ~~9~~ | ~~Bild-Uploads verlassen den Browser nicht (Data-URLs in localStorage)~~ | ~~P1~~ | **ERLEDIGT** (ebf14e2) |
| ~~10~~ | ~~Mietanfrage wird nie zugestellt (kein Fetch/Mail)~~ | ~~P1~~ | **ERLEDIGT** (ebf14e2, In-App-Benachrichtigung — E-Mail siehe Einschraenkung) |
| ~~11~~ | ~~Gesamter Miet-Flow abgeklemmt (API 0 Aufrufer)~~ | ~~P1~~ | **ERLEDIGT** (ebf14e2) |
| ~~12~~ | ~~`rental_equipment` kein CRUD (Vermieter kann keinen Stuhl anlegen)~~ | ~~P1~~ | **ERLEDIGT** (ebf14e2) |
| ~~13~~ | ~~`createNotification()` 0 Aufrufer (Glocke strukturell leer)~~ | ~~P2~~ | **ERLEDIGT** (ebf14e2, 12 Aufrufstellen) |
| ~~14~~ | ~~Migration `20260821_persistence_uploads_rentals.sql` nicht angewendet~~ | ~~P0~~ | **ERLEDIGT / LIVE_VERIFIED** (23.08.2026 via Supabase-MCP als `20260823112716_persistence_uploads_rentals` angewendet) |
| 15 | Mietanfrage benachrichtigt nur in-App, keine E-Mail an den Vermieter | P2 | INTERN |

### Track 3 ChairMatch: Persistenz-Umbau (ebf14e2, separates Repo /Users/work/chairmatch)

**45 Dateien, +4172/-386.** Schliesst die Befunde 8-13 der Delta-Analyse in einem
Zug — die sechs Luecken waren dieselbe Ursache: der Browser war die
Speicherschicht.

- **localStorage → DB:** `MeinBereichSubPage.tsx` schreibt nicht mehr in
  `localStorage`, sondern gegen vier neue authentifizierte Routen —
  `/api/me/tenant-profile`, `/api/me/salon`, `/api/me/listing`,
  `/api/me/payout-account`. Betroffen: Mieter-Profil/-Radius, Salon-
  Beschreibung/-Zeiten, Inserat-Ausstattung/-Preise/-Verfuegbarkeit,
  Auszahlungskonten beider Rollen.
- **Uploads:** `UploadField.tsx` laedt ueber `/api/uploads` in Supabase Storage
  statt Data-URLs im Browser abzulegen (Galerie, Logo, Zertifikate, Fotos).
- **Miet-Flow angeschlossen:** `/inserat/[id]/anfragen` ruft jetzt
  `/api/rental-requests`; neu `/rentals/[id]/buchen` gegen
  `/api/rental-bookings`; Vermieter beantwortet Anfragen unter
  `/vermieter/mein-inserat/anfragen`.
- **`rental_equipment`-CRUD:** `/api/rental-equipment` (+ `[id]`) und die Seite
  `/vermieter/mein-inserat/inserate` — der Vermieter kann Stuehle anlegen,
  aendern und loeschen.
- **Benachrichtigungen:** `createNotification()` hat statt 0 jetzt 12
  Aufrufstellen (Buchungen, Mietanfragen, Mietbuchungen, Stripe-Webhook).
- **Zugriffsmodell unveraendert:** der Browser schreibt nie direkt. Jeder
  Schreibpfad laeuft ueber `getSupabaseAdmin()` in einer Route mit
  Auth-Pruefung; die neuen Policies erlauben `SELECT` nur auf die eigene Zeile
  und kein INSERT/UPDATE/DELETE fuer anon/authenticated.
- 4 Sprachkataloge (de/en/tr/ar) nachgezogen, `fake-supabase`-Harness erweitert.

> **~~BLOCKER~~ GELOEST 23.08.2026 — Migration ist LIVE_VERIFIED.**
> `supabase/migrations/20260821_persistence_uploads_rentals.sql` wurde via
> Supabase-MCP auf `pwdbjqfpgumyfktbfswg` angewendet (dort als
> `20260823112716_persistence_uploads_rentals` gefuehrt). Angelegt:
>
> - **4 Tabellen:** `tenant_profiles` (8 Spalten), `payout_accounts` (7),
>   `user_uploads` (12), `rental_requests` (15).
> - **7 neue Spalten auf `rental_equipment`:** `price_per_hour_cents`,
>   `price_per_week_cents`, `available_days`, `available_from`, `available_to`,
>   `features`, `updated_at`.
> - **Storage-Bucket `cm-uploads`**, private.
> - **IBAN-Spalte `REVOKED`** fuer `anon` und `authenticated` — Auszahlungsdaten
>   sind nur ueber den Server-Pfad lesbar, nicht ueber PostgREST.
> - **Alle RLS-Policies aktiv, SELECT-only** (defense in depth); geschrieben wird
>   weiterhin ausschliesslich ueber `getSupabaseAdmin()` in authentifizierten
>   Routen.
>
> Die neuen Routen antworten damit nicht mehr mit 500 — der Umbau aus `ebf14e2`
> ist ab jetzt funktionsfaehig.
>
> **Einschraenkung Befund 10:** die Mietanfrage wird zugestellt, aber als
> In-App-Benachrichtigung. Ein E-Mail-Versand an den Vermieter haengt nicht in
> `/api/rental-requests` (`src/lib/email.ts` wird dort nicht aufgerufen) — offen
> als neuer Punkt 14.

---

## Track 6: CI/DevOps

**Status: GRUEN**
Letzter Check: 22.08.2026 13:14 — **GitHub-Actions-Run 32569458523 auf `3c29b00`
abgeschlossen, beide Jobs `success`.** Zuvor lokal alle CI-Schritte einzeln
nachgefahren; der Remote-Lauf bestaetigt das Ergebnis.

### Erledigt
- Typecheck: 0 Fehler
- vitest: 3515/3553 gruen, 38 skipped, 0 rot (180 Dateien, 1 Datei skipped)
- node:test, `ci-secret-scan.sh`, `ci-ik-check.sh`, `lint:forbidden`: Exit 0
- Production-Build (`npm run build`, Turbopack, CI-Platzhalter-ENVs): Exit 0
- **Roter Test seit e588416 geschlossen.** Der Regressionsscan „scripts/*.mjs
  bauen PostgREST-Header nur ueber apiHeaders()" schlug auf
  `scripts/verify-publishable-key.mjs:85` an. Der Bearer-Header ist dort
  ABSICHT — das Diagnoseskript misst genau den Aufrufweg, den supabase-js ohne
  Session erzeugt; ohne den Header misst es nichts mehr. Das Skript steht jetzt
  neben `scripts/lib/supabase-keys.mjs` in einer benannten, im Code begruendeten
  Ausnahmeliste (`BEARER_AUSNAHMEN`). Ein zweiter Test haelt die Liste sauber:
  er faellt, sobald ein Eintrag auf eine nicht mehr existierende Datei zeigt —
  sonst wuerde eine tote Ausnahme spaeter still einen echten Treffer wegfiltern.
  Die Sperre selbst bleibt fuer alle anderen Skripte scharf.

### CI-Historie der Session
| Run | Commit | Ergebnis |
|-----|--------|----------|
| 32556214612 | 79e7e0e | cancelled (durch Folge-Push abgeloest) |
| 32556332992 | f4048df | **failure** — 1 roter Test (Track-5-Bearer-Scan) |
| 32569458523 | 3c29b00 | **success** — beide Jobs gruen, 6m12s |

### Offen
- deploy.sh mit Precommit-Guards (Secrets/.env/node_modules Block)
- Worktree-Branch Auto-Push nach main
- CI-Workflows: ci.yml, deploy-chairmatch.yml

### Offene P0/P1 Items
| # | Item | Prio | Typ |
|---|------|------|-----|
| ~~1~~ | ~~Monitoring/Alerting einrichten~~ | ~~P1~~ | **ERLEDIGT** (Health-Endpoint, Metrics, Uptime-Action, 0e0a1aa) |
| ~~2~~ | ~~Structured Logging~~ | ~~P1~~ | **ERLEDIGT** (lib/logger.ts, 7 Dateien migriert, 12 Tests, 193076e) |
| ~~3~~ | ~~Error Boundaries pro Route-Segment~~ | ~~P1~~ | **ERLEDIGT** (10 Segmente + Root, aa280e6) |
| ~~4~~ | ~~Type Safety: as-any Cleanup~~ | ~~P1~~ | **ERLEDIGT** (~90 Casts entfernt, join.ts Helfer, 49503a3) |
| ~~5~~ | ~~Structured Logger: Vollmigration~~ | ~~P1~~ | **ERLEDIGT** (234 Dateien migriert, 96f6632) |

---

## Track 7: Security/DSGVO

**Status: GO (fuer §45b Start)**
Letzter Check: 21.08.2026

### Erledigt
- 0 CRITICAL, 0 HIGH Findings (alle gefixt)
- 3/5 MEDIUM gefixt (velora-mockup JWT, Audit-Immutability, ChairMatch Audit)
- 38 Regressionstests
- RLS lueckenlos (Alltagsengel + ChairMatch)
- Public-Upload-URLs durch Signed URLs ersetzt

### Offene Items (kein §45b-Blocker)
| # | Item | Prio | Typ |
|---|------|------|-----|
| 1 | SEPA Creditor-ID Platzhalter | MEDIUM | EXTERN (Bankantrag) |
| ~~2~~ | ~~Loeschkonzept dokumentieren~~ | ~~MEDIUM~~ | **ERLEDIGT** (docs/LOESCHKONZEPT.md, 5e8ff5a) |
| ~~3~~ | ~~DSFA erstellen~~ | ~~P1~~ | **ERLEDIGT** (docs/DSFA_ALLTAGSENGEL.md, Selbstbewertung, 193076e) |
| 4 | AVV mit Supabase/Vercel abschliessen | P1 | EXTERN |
| 5 | BSI C5 / ISO 27001 (nur fuer DiPA/BfArM) | P1 | EXTERN |
| ~~6~~ | ~~BITV/WCAG Barrierefreiheit~~ | ~~P1~~ | **ERLEDIGT** (2 Durchgaenge: Kontrast/Labels/Landmarks + Fokus-Management 34 Dialoge, Tastatur 121→1, axe-core-Lauf, ad23806. Offen: Screenreader-Test mit NVDA/JAWS) |
| 7 | **P6-Legacy `vlrviyrgggzhayepfmop`: Signup deaktivieren** | P1 | **CEO_ACTION_REQUIRED** (Supabase-Dashboard) |

### P6 Legacy Security Check (23.08.2026) — **ANALYSIERT**
Tiefenpruefung des Legacy-Projekts `vlrviyrgggzhayepfmop` (Detailbericht:
`docs/P6_LEGACY_SECURITY_CHECK.md`). **Ergebnis: geringe reale Exposition** —
die Einstufung vom 22.08. wird damit praezisiert, nicht widerrufen.

- **RLS auf allen Tabellen aktiv**, keine Storage-Buckets, 10 E-Mail-Nutzer.
- **anon-SELECT nur auf Marktplatz-Katalogdaten** (`categories`, `services`,
  `reviews`, `rental_options`, `staff`) — by design fuer den oeffentlichen
  Marktplatz, kein PII. Der oeffentlich lesbare anon-Key aus `index_legacy.html`
  kommt damit nicht weiter als bis zu diesen Katalogzeilen.
- **Offen bleibt genau ein Hebel:** `disable_signup=false` +
  `mailer_autoconfirm=true` — jeder kann auf dem unbeobachteten Projekt ein
  sofort aktives Konto anlegen. **CEO_ACTION_REQUIRED** (Punkt 7 oben).
- Nach dem Abschalten des Signups ist P6 ein reiner `DECOMMISSION_CANDIDATE`
  ohne akute Live-Flaeche.

---

## Betriebssystem-Roadmap (13-Punkte-Plan)

**Status: WORKING | Phase 1 priorisiert**

| Phase | Inhalt | Status |
|-------|--------|--------|
| Phase 1 | Digitale Leistungsdoku (Unterschriften, GPS), Budget-Mgmt (131 EUR), Abrechnungsworkflow | Technisch fertig |
| Phase 2 | CRM Kooperationspartner, Management-Dashboard | Offen |
| Phase 3 | QM (Zufriedenheitsanrufe 7/30/90 Tage), Qualifikationsmonitoring, Digitale Personalakte | Offen |
| Phase 4 | Recruiting, Mitarbeiterbindung (Bonussystem), Ausfallmanagement | Offen |

---

## Zusammenfassung: Was blockiert den ersten zahlenden Kunden?

Nur **2 echte Blocker** fuer §45b-Start:
1. **§45a Anerkennung durch Landesbehoerde** (Frist 31.08.2026)
2. **Tarifverifizierung** gegen PfluV-Obergrenzen

Alles andere (ITSG, DAKOTA, KIM, DiPA, ISO 27001, BSI C5, SEPA) ist **NICHT erforderlich** fuer den Privatrechnungs-Weg (Kunde reicht selbst bei Kasse ein).
