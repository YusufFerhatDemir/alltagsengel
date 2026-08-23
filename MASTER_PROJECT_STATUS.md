# MASTER PROJECT STATUS

> Stand: 23.08.2026 | Baseline: FINAL_FINAL_GO_LIVE_REPORT_2026-08-21.md
> Basis-HEAD: `0bd61d1` | Vorlauf 22.08.: 11 Commits (f8ad0ae, 24e67e9, b3564d2,
> 6d148a5, ea67b5b, e588416, 8392730, de4623b, 79e7e0e, f4048df, 3c29b00)
> — dazu `ebf14e2` im separaten ChairMatch-Repo (`/Users/work/chairmatch`).
>
> **23.08.2026 (Nachtrag, Master-Track 7 „P2/P3"): sechs P2/P3-Befunde der
> Funktionalen Lueckenanalyse geschlossen, vier weitere als bereits erledigt
> bzw. falsch erhoben korrigiert.** Reiner Anwendungscode — **keine Migration,
> kein Live-Apply noetig**. Details unter „Funktionale Lueckenanalyse: P2/P3"
> weiter unten und im CHANGELOG-Eintrag vom 23.08.
>
> **23.08.2026 — Master-Tracks 1-6.** Zwei Migrationen sind
> nicht mehr „wartet auf Apply", sondern **live angewendet und gegengeprueft**
> (ChairMatch-Persistenz, `invoice_email_log`). P6-Legacy geprueft, Buchungskette
> gegen Live-Daten gemessen. Details im CHANGELOG-Eintrag vom 23.08.
>
> **23.08.2026 — alle 8 Master-Tracks abgeschlossen.** Die beiden zuletzt
> offenen Punkte waren CEO-Aktionen im Browser; beide sind am 23.08. am
> Dashboard erledigt bzw. geprueft (siehe Tabelle). Damit steht kein
> Master-Track mehr offen — was bleibt, sind externe Bescheide und
> Stammdaten-Belege, keine Session-Arbeit.
>
> **Ehemals CEO-Aktion — Stand 23.08.2026:**
> | # | Aktion | Wo | Stand |
> |---|--------|-----|-------|
> | ~~1~~ | ~~Signup deaktivieren (`disable_signup=true`)~~ | Supabase-Dashboard, Projekt `vlrviyrgggzhayepfmop` (P6) | **ERLEDIGT 23.08.2026** — Toggle im Dashboard auf OFF, gespeichert. P6 ist damit reiner `DECOMMISSION_CANDIDATE`. |
> | 2 | `RESEND_API_KEY` | Vercel Production | **VORHANDEN, ABER UNGEPRUEFT** — Variable existiert (angelegt 19.03.), traegt im Vercel-Dashboard das Kennzeichen „Needs Attention". Ob der hinterlegte Schluessel gueltig ist, sagt das Dashboard nicht. Naechster Schritt: einen realen Rechnungsversand ausloesen und `invoice_email_log` lesen — bleibt der Eintrag auf `uebersprungen`/Fehler, ist der Schluessel unbrauchbar. |
>
> **Was der zweite Punkt NICHT bedeutet:** dass Rechnungen jetzt zugestellt
> werden. Das ist erst belegt, wenn ein Versand mit `sent_at` in
> `invoice_email_log` steht. Bis dahin gilt die Kette als gebaut, nicht als
> zustellend.
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
| ~~15~~ | ~~Kundenstammdaten nach Anlage nur teilweise editierbar~~ | ~~P1~~ | **ERLEDIGT** — war bereits in `8392730` geschlossen und im Statusbericht uebersehen: `ALLOWED_CLIENT_FIELDS` in `lib/clients/stammdaten.ts` deckt Name, Adresse, PLZ, Ort, Telefon, E-Mail, Geburtsdatum ab, `StammdatenEditor` in `app/admin/clients/[id]/page.tsx` bedient sie, `PATCH /api/admin/clients/[id]/status` deckt Deaktivierung/Beendigung ab. Tests: `__tests__/clients/stammdaten-status.test.ts` |

> **ERLEDIGT 23.08.2026 — `invoice_email_log` ist LIVE_VERIFIED.** Die Migration
> ist auf `nnwyktkqibdjxgimjyuq` angewendet: Tabelle mit 15 Spalten, RLS aktiv mit
> beiden Policies — `invoice_email_log_admin` (PERMISSIVE, `is_admin()`) **und**
> `org_fence_invoice_email_log` (RESTRICTIVE, `organization_id = current_org_id()`).
> Der Dateiname im Repo war ein Tippfehler (`20260923` statt `20260823`) und ist
> auf `20260823000000_invoice_email_log.sql` korrigiert, Rollback als
> `20260823000001`; Referenzen in Code und Doku nachgezogen.
>
> **Versand ist ENV-gesteuert — Key vorhanden, Gueltigkeit ungeprueft
> (Stand 23.08.2026):** ohne `RESEND_API_KEY`
> wird jeder Versuch als `uebersprungen` protokolliert und `sent_at` bleibt leer,
> damit nachversendet wird. Automatischer Versand bei Festschreibung nur mit
> `RECHNUNGSVERSAND_AUTOMATISCH='1'` — Standard ist manuell.
> Die Variable **existiert** in Vercel Production (angelegt 19.03.2026), traegt
> dort aber das Kennzeichen „Needs Attention"; ob der Wert ein gueltiger
> Resend-Schluessel ist, sagt das Dashboard nicht. **Belegt ist die Zustellung
> erst, wenn ein Versand mit gesetztem `sent_at` in `invoice_email_log` steht** —
> bis dahin gilt die Versandkette als gebaut, nicht als zustellend.
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
| ~~7~~ | ~~**P6-Legacy `vlrviyrgggzhayepfmop`: Signup deaktivieren**~~ | ~~P1~~ | **ERLEDIGT 23.08.2026** (Supabase-Dashboard, Toggle OFF + gespeichert) |

### P6 Legacy Security Check (23.08.2026) — **ANALYSIERT**
Tiefenpruefung des Legacy-Projekts `vlrviyrgggzhayepfmop` (Detailbericht:
`docs/P6_LEGACY_SECURITY_CHECK.md`). **Ergebnis: geringe reale Exposition** —
die Einstufung vom 22.08. wird damit praezisiert, nicht widerrufen.

- **RLS auf allen Tabellen aktiv**, keine Storage-Buckets, 10 E-Mail-Nutzer.
- **anon-SELECT nur auf Marktplatz-Katalogdaten** (`categories`, `services`,
  `reviews`, `rental_options`, `staff`) — by design fuer den oeffentlichen
  Marktplatz, kein PII. Der oeffentlich lesbare anon-Key aus `index_legacy.html`
  kommt damit nicht weiter als bis zu diesen Katalogzeilen.
- ~~**Offen bleibt genau ein Hebel:** `disable_signup=false` +
  `mailer_autoconfirm=true`~~ — **GESCHLOSSEN 23.08.2026.** Der Signup ist im
  Supabase-Dashboard des Projekts deaktiviert und gespeichert. Damit kann
  niemand mehr auf dem unbeobachteten Projekt ein sofort aktives Konto
  anlegen; `mailer_autoconfirm` ist ohne Signup wirkungslos.
- P6 ist damit ein reiner `DECOMMISSION_CANDIDATE` ohne akute Live-Flaeche.
  Die Abschaltung selbst steht weiterhin aus — sie ist kein Sicherheitspunkt
  mehr, sondern Aufraeumen.
- **Grenze der Pruefung:** verifiziert ist die Dashboard-Einstellung, nicht ein
  fehlgeschlagener Registrierungsversuch. Ein Gegentest gegen die Auth-API des
  Legacy-Projekts wurde nicht gefahren.

---

## Funktionale Lueckenanalyse: P2/P3-Durchgang (Track 7, 23.08.2026)

**Status: 6 geschlossen | 4 korrigiert | Rest begruendet offen**
Quelle: `docs/FUNKTIONALE_LUECKENANALYSE.md` (im Text markiert, Ursprungsfassung
nicht umgeschrieben). Auswahlkriterium: technisch aus der Session loesbar —
keine CEO-Aktion, kein externer Bescheid, kein DDL-Zugang.

### Geschlossen

| # | Befund | Bereich | Prio | Wo |
|---|--------|---------|------|-----|
| 1 | Angehoerigenportal serverseitig ungeschuetzt (`/angehoerige` nicht in Matcher/`PROTECTED_PREFIXES`) | 13 | P2 | `proxy.ts` |
| 2 | Login-Weiterleitung las manipulierbares `user_metadata.role` | 13 | P2 | `app/auth/login/page.tsx` |
| 3 | Leistungsnachweis-CRUD schrieb keinen Audit-Eintrag (5 Schreibpfade) | 14 | P2 | `app/api/leistungsnachweis/crud/route.ts` |
| 4 | `billing_feiertage` leer, kein Befuellungs-Job | 7 | P2 | `lib/automation/feiertage-pflege.ts` (neu, Kette 13) |
| 5 | Keine Terminerinnerung an Kunden/Angehoerige | 11 | P2 | `lib/automation/termin-erinnerung.ts` (neu, Kette 12) |
| 6 | `kombinations_abschlag_prozent` wurde nie gelesen | 7 | P3 | `lib/billing/core/price-resolver.ts` |

### Korrigiert — Bericht war veraltet oder falsch, nichts angefasst

| Befund | Tatsaechlicher Stand |
|---|---|
| Abwesenheitspruefung fehlt in der Einsatzplanung (B-03) | bereits geschlossen in `8392730` |
| Verfuegbarkeitsfenster ohne Wirkung in der Planung (B-03) | bereits geschlossen in `8392730` |
| Kein Wiedervorlage-/Statuswechsel-Workflow (B-01) | bereits geschlossen in `8392730` |
| Keine Erinnerung vor Ablauf einer Qualifikation (B-02) | **war nie offen** — Kette 2 warnt 30/14/7 Tage, Kette 3 eskaliert nach Ablauf |
| `ALLTAGSENGEL_IK` fehlt in `.env.example` (IK) | bereits geschlossen in `e588416` |

### Grenzen dieses Durchgangs — unveraendert

- **§45b-/VP-Tarife bleiben `blocked`/`unverified`**, 35 EUR/h bleibt gesperrt.
  Keine der sechs Aenderungen fasst einen Preis oder einen Tarifstatus an.
  Der gefuellte Feiertagskatalog aendert **keinen Rechnungsbetrag**, solange
  alle `zuschlag_feiertag_prozent` auf 0 stehen — und das tun sie, bis belegte
  Saetze aus einer Verguetungsvereinbarung vorliegen.
- **`COACH_DIPA_MODUS`** unveraendert `false`. **Entlastungsbetrag**
  unveraendert 131 EUR/Monat.
- **Die Terminerinnerung erreicht heute niemanden:** `clients.user_id` ist bei
  allen vier Live-Klienten NULL (Befund aus Bereich 3, P1, weiterhin offen).
  Die Kette meldet das als `ohneEmpfaenger` statt still nichts zu tun und
  erinnert ohne weitere Aenderung, sobald die Verknuepfung steht.
- **`billing_feiertage` ist erst nach dem naechsten Cron-Lauf gefuellt** — der
  einzige Punkt dieses Tracks, dessen Wirkung nicht sofort sichtbar ist.
  Nachpruefbar ueber die Kette `feiertage_katalog` in der Antwort von
  `/api/admin/automatisierung`.
- **Nicht angefangen** (kein „kleiner Fix", nicht halb hinterlassen):
  Feldhistorie im Audit-Trail, PDF-Export der Dokumentation, Rollen PDL/QM/
  Buchhaltung, Sammelrechnungslauf, Serientermin-Pflege, Kassenwechsel-Historie,
  gemeinsame Sicht ueber die vier Audit-Spuren, GPS in der ausgelieferten App.

### Nachweis

- **CODE:** 6 Dateien geaendert, 2 neu (`lib/automation/feiertage-pflege.ts`,
  `lib/automation/termin-erinnerung.ts`), 5 neue Testdateien.
- **CI/TEST (lokal vollstaendig nachgefahren):** `tsc --noEmit` 0 Fehler ·
  `vitest run` **3553 passed / 38 skipped / 0 rot** (vorher 3515, **+38 neue
  Tests**) · `test:unit` 794 passed / 0 fail · `lint:forbidden` 0 Treffer bei
  24 328 Dateien · `ci-secret-scan.sh` + `ci-ik-check.sh` Exit 0 ·
  `npm run build` (Turbopack) Exit 0.
- **LIVE:** keine Migration, kein Apply erforderlich.

---

## Funktionale Lueckenanalyse: zweiter P2-Durchgang (23.08.2026, nachmittags)

**Status: 2 geschlossen | 3 korrigiert | Rest begruendet offen**
Auswahlkriterium unveraendert: technisch aus der Session loesbar — keine
CEO-Aktion, kein externer Bescheid, kein DDL-Zugang. **Keine Migration.**

### Geschlossen

| # | Befund | Bereich | Prio | Wo |
|---|--------|---------|------|-----|
| 1 | Keine Konfliktanzeige — eine Ueberschneidung fiel erst als roher Datenbankfehler auf | 3 | P2 | `lib/einsatzplanung/konflikte.ts` (neu), `konflikte-server.ts` (neu), `app/api/einsatzplanung/route.ts`, `app/admin/kalender/page.tsx` |
| 2 | Vier Audit-Spuren ohne gemeinsame Sicht + kein Export fuer eine Pruefung | 14 | P2 | `lib/analytics/opsAudit.ts`, `app/api/admin/analytics/ops-audit/route.ts`, `app/admin/ops-audit/page.tsx` |

**Zu 1 — Konflikterkennung.** Der DB-Trigger `check_assignment_overlap`
(Migration 20260808200000) fing die Doppelbelegung einer Betreuungskraft schon
vorher ab, aber erst beim INSERT und mit einer Meldung voller UUIDs, die der
Fehler-Sanitizer zu Recht verschluckt — der Planende sah nur „Fehler beim
Speichern". Jetzt prueft dieselbe reine Funktion **vor** dem Schreiben und
liefert Klartext („Sabrina Martin hat am 01.09.2026 bereits einen Einsatz von
10:00–12:00 bei Herrn Meier"), und der Kalender markiert betroffene Einsaetze
samt Zaehler.
- **Bewusst nicht uebersteuerbar:** die Mitarbeiter-Doppelbelegung bietet
  *keinen* `force_override`-Weg an. Der Trigger blockiert sie ohnehin — ein
  angebotener Uebersteuerungsweg waere eine Zusage, die die Datenbank nicht
  einhaelt.
- **Neu erkannt, aber nur als Warnung:** zwei Kraefte gleichzeitig bei
  demselben Klienten. Der Trigger kennt den Fall nicht, und er ist fachlich
  nicht immer falsch (Doppelbesetzung beim Transfer).
- **Serien bleiben ungeprueft:** ein Einsatz ohne `assignment_date`
  (`weekday` + `recurrence_rule`) hat kein Datum, gegen das sich pruefen
  liesse. Das ist in der Antwort benannt, nicht stillschweigend uebergangen.

**Zu 2 — Audit-Gesamtsicht.** `/admin/ops-audit` fuehrte bisher nur zwei der
vier Spuren zusammen. Ergaenzt sind `mis_audit_log` (Administration, 436
Aufrufstellen) und `wf_audit_log` (Workflow); jede Quelle wird **einzeln** auf
`organization_id` gefenced. Dazu ein CSV-Export ueber `?format=csv` —
Semikolon-getrennt mit BOM (deutsche Excel-Locale), mit Entschaerfung von
Formel-Einleitungen (`=`, `+`, `-`, `@`) gegen CSV-Injection. Der Export
protokolliert sich selbst als `data_export`.
- **Grenze:** je Quelle werden 500 Zeilen geholt, dann gefiltert. Bei einem
  Live-Bestand von 9 + 6 + 78 Eintraegen ist das weit weg; bei wachsendem
  Bestand ist der Export **kein** vollstaendiger Jahresauszug.
- Die **Aufbewahrungsfrist** ist nicht neu erfunden: sie steht seit `5e8ff5a`
  im Loeschkonzept (10 Jahre, § 257 HGB / DSGVO Art. 30) und wird in der
  Oberflaeche nur noch zitiert.

### Korrigiert — Bericht war veraltet, nichts angefasst

| Befund | Tatsaechlicher Stand |
|---|---|
| Kundenstammdaten nach Anlage nur teilweise editierbar (Bereich 1, P1) | bereits in `8392730` geschlossen — `ALLOWED_CLIENT_FIELDS`, `StammdatenEditor`, Tests vorhanden |
| Keine Deaktivierung / Beendigung der Betreuung (Bereich 1, P1) | bereits in `8392730` geschlossen — `PATCH /api/admin/clients/[id]/status`, `lib/clients/status.ts` |
| Jahresuebertrag nur manuell, keine Oberflaeche, kein Cron (Bereich 5, P1) | bereits in `8392730` geschlossen — Knopf in `app/admin/budgets`, Cron `/api/cron/jahresuebertrag` am 01.01. (`vercel.json`) |
| Keine dokumentierte Aufbewahrungsfrist fuer die Audit-Spur (Bereich 14) | bereits in `5e8ff5a` geschlossen — `docs/LOESCHKONZEPT.md` Abschnitt 3.6 |

### Bewusst NICHT angefasst — mit Begruendung

- **6-/8-Wochen-Grenze fuer VP/KZP** (Bereich 6, P2). Waere Code, aber die
  Fristen sind Rechtsanwendung, keine Rechenlogik: Hoechstdauer, Vorpflegezeit
  und die Wirkung des gemeinsamen Jahresbetrags seit 01.07.2025 haengen
  zusammen. Eine hier gesetzte Zahl waere geraten — dieselbe Sorte
  Platzhalter, die bei den Tarifen bewusst gesperrt bleibt.
- **Sammelrechnungslauf ueber alle Kunden** (Bereich 5, P2). Ein Lauf, der
  massenhaft Rechnungen erzeugt, gehoert nicht in einen Durchgang ohne
  Live-Gegenprobe — bei 4 Kunden ist der Nutzen ausserdem null.
- **Benachrichtigungs-Log / Zustellkontrolle** (Bereich 11, P2). Braucht eine
  neue Tabelle, also eine Migration und einen Live-Apply — beides steht in
  dieser Session nicht zur Verfuegung.
- **Feldhistorie im Audit-Trail** (Bereich 14, P2), **Rollen PDL/QM/
  Buchhaltung** (Bereich 13, P2), **GPS in der ausgelieferten App**
  (Bereich 4/12, P1/P2), **Kassenwechsel-Historie** (Bereich 1, P2),
  **Serientermin-Pflege** (Bereich 3, P2): unveraendert offen, alle zu gross
  fuer einen „kleinen Fix" und nicht halb hinterlassen.

### Nachweis

- **CODE:** 2 neue Bibliotheken, 4 geaenderte Dateien, 2 neue Testdateien.
- **TEST:** `__tests__/einsatzplanung/konflikte.test.ts` (24) +
  `__tests__/analytics/audit-gesamtsicht.test.ts` (22) = **46 neue Tests**,
  alle gruen. `tsc --noEmit` 0 Fehler.
- **LIVE:** keine Migration, kein Apply erforderlich.

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
