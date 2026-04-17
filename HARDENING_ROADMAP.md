# AlltagsEngel — Hardening-Roadmap zum Enterprise-Niveau

**Datum:** 17. April 2026
**Autor:** Claude (X High Audit)
**Ziel:** Die App systematisch von „solider MVP" auf das Niveau eines erfahrenen Top-Dev-Teams heben.

---

## Executive Summary

Die App hat nach den letzten Security-Sweeps (Migrations 1–3, Commit `92c582c`, `a14be96`) eine saubere RLS-Basis, korrekte Schema-Code-Konsistenz und keine offenen Spam-/Audit-Vektoren mehr. **Das ist die Bremsanlage.** Was fehlt, sind Airbag, ABS, Crash-Tests und Notrufsystem — alles, was eine Plattform brauchst, sobald sie ernsthaftem Traffic, echten DSGVO-Auditoren oder einem Penetration-Tester ausgesetzt wird.

Diese Roadmap ist in **5 Phasen** organisiert. Jede Phase baut auf der vorherigen auf — ohne Phase 1 (Sichtbarkeit) ist Phase 5 (Pentest) Geldverbrennung, weil du Findings nicht reproduzieren oder beheben kannst.

**Gesamtaufwand:** ca. 35–55 Personentage (parallel/iterativ über 3–4 Monate machbar).

---

## Status Quo — Was bereits erledigt ist

- Schema/Code-Drift behoben (`latitude`/`longitude` zurück, `angels.user_id` raus)
- RLS auf `notifications`, `kf_pricing_audit`, `mis_auth_log` gehärtet (`auth.uid() = user_id` bzw. `actor_id`)
- Cross-User-Inserts laufen über `service_role` Admin-Client
- Duplizierte Policies bereinigt
- Brute-Force-Schutz, Rate-Limit auf Login, RLS auf `conversions`, sichere `cleanup_old_rate_limits` (Commit `c563c0c`)
- Notifications-System (in-app + E-Mail) funktioniert

**Restliche Advisor-Warnings:** 3 permissive Policies auf `page_views`, `visitors`, `visitor_locations` — bewusst offen für Anonymous-Tracking, dokumentiert.

---

## Phase 1 — Sichtbarkeit (Observability & Monitoring)

**Warum zuerst:** Du kannst nichts beheben, was du nicht siehst. Ohne Phase 1 ist jede weitere Phase Blindflug.

**Analogie:** Bevor du das Cockpit-Display kaufst, brauchst du erstmal die Sensoren am Motor. Sentry & Logs sind die Sensoren.

### Was

| Baustein | Tool-Empfehlung | Aufwand |
|---|---|---|
| Error-Tracking (Frontend + Backend) | **Sentry** (oder Better Stack, Highlight) | 1 Tag |
| Strukturiertes Logging | **Pino** + Vercel Log Drains → Better Stack/Axiom | 1 Tag |
| Uptime-Monitoring + Status-Page | **Better Stack** (Upptime als kostenlose Alternative) | 0,5 Tage |
| Performance-Metriken (Core Web Vitals, API-Latenzen) | **Vercel Analytics** + Sentry Performance | 0,5 Tage |
| Alerting | Sentry → Slack/Discord/E-Mail | 0,5 Tage |
| Supabase-Monitoring | DB-Metriken + Slow-Query-Log einrichten | 0,5 Tage |

### Definition of Done

- Jeder uncaught Error im Code landet binnen 30 Sekunden in Sentry mit Stack-Trace + User-Kontext
- Jeder Server-Side 5xx generiert einen Slack-Alert
- Status-Page öffentlich erreichbar (z.B. `status.alltagsengel.de`)
- DB-Queries > 500ms werden geloggt
- Wöchentlicher Error-Trend-Report automatisch generiert

**Phase-Aufwand:** ~4 Tage

---

## Phase 2 — Stabilität (Tests & CI/CD)

**Warum:** Ohne Tests ist jeder Deploy ein Glücksspiel. Mit Tests kannst du in 6 Monaten noch refactoren, ohne 3 Stunden vorher Angstschweiß zu bekommen.

**Analogie:** Tests sind das Sicherungsnetz im Zirkus. Ohne springst du nicht doppelt — was bedeutet, dass die App nie wirklich besser wird.

### Was

| Baustein | Tool-Empfehlung | Aufwand |
|---|---|---|
| Unit-Tests (Lib-Funktionen, Utilities, Notification-Logic) | **Vitest** | 3–5 Tage |
| Integration-Tests (API-Routes mit Test-Supabase) | Vitest + Supabase Branch | 3 Tage |
| E2E-Tests (Booking-Flow, Registrierung, Chat) | **Playwright** | 4–6 Tage |
| Pre-Commit Hooks | **Husky** + `lint-staged` + `tsc --noEmit` | 0,5 Tage |
| GitHub Actions CI | Tests + TypeCheck + Lint + Build | 1 Tag |
| Branch-Protection auf `main` | GitHub-Settings | 0,5 Tage |
| Preview-Deployments mit eigener Test-DB | Supabase Branching + Vercel Preview | 1 Tag |

### Test-Coverage-Ziele

- Kritische Pfade (Booking, Payment, Auth): **80%+**
- Lib & Utilities: **90%+**
- UI-Pages: Smoke-Test über Playwright (kein Coverage-Ziel)

### Definition of Done

- `npm test` läuft lokal in < 60 Sekunden für Unit-Tests
- Playwright deckt: Registrierung Kunde + Engel, Buchung erstellen + akzeptieren, Chat senden, Profil ändern
- CI blockt PR-Merge bei Test-Fail oder TypeScript-Fehler
- Preview-Deployment für jeden PR mit eigener Branch-DB

**Phase-Aufwand:** ~13–17 Tage

---

## Phase 3 — Compliance (DSGVO & Accessibility)

**Warum:** Pflege-Plattform in Deutschland mit alten Nutzern. DSGVO-Verstoß = bis zu 4% Jahresumsatz Bußgeld. WCAG-Verstoß = Klagerisiko + Ausschluss von 15% deiner Zielgruppe (Sehbehinderte, Motorisch eingeschränkte).

**Analogie:** Das ist nicht Feuerlöscher kaufen, das ist die Brandschutzauflage für die Konzession. Ohne darfst du formal nicht einmal aufmachen.

### Was — DSGVO

| Baustein | Aufwand |
|---|---|
| Verzeichnis der Verarbeitungstätigkeiten (Art. 30 DSGVO) | 1 Tag |
| Datenschutz-Folgenabschätzung (DSFA) für Pflege-Daten + Geo-Tracking | 2 Tage |
| Auftragsverarbeitungs-Verträge (AVV) mit Supabase, Vercel, Resend, FCM, etc. — sammeln & dokumentieren | 1 Tag |
| Daten-Retention-Policies (alte Buchungen, Logs, Chat-Nachrichten — wann automatisch löschen?) | 2 Tage |
| Right-to-Erasure End-to-End testen (User löscht Account → ALLE Daten weg, auch in Backups-Policy dokumentiert) | 1 Tag |
| Einwilligungs-Management für Marketing-Mails, Tracking, Push-Notifications (granular, dokumentiert, widerrufbar) | 2 Tage |
| Cookie-Banner: TCF v2.2 oder konsenzbasierten ohne Tracking-Cookies (z.B. Klaro, Borlabs) | 1 Tag |
| Datenschutzerklärung von Anwalt prüfen lassen (extern!) | extern, ~800–1500 € |

### Was — Accessibility (WCAG 2.1 AA)

| Baustein | Aufwand |
|---|---|
| Audit mit **axe-core** + Lighthouse Accessibility | 1 Tag |
| Kontrast-Audit (alle Texte ≥ 4.5:1) | 1 Tag |
| Tastatur-Navigation testen (Tab-Reihenfolge, Focus-Indikatoren) | 1 Tag |
| Screen-Reader-Test (VoiceOver iOS, TalkBack Android) | 1 Tag |
| Schrift-Größe & Zoom (200% ohne Layout-Bruch) | 1 Tag |
| Form-Labels & ARIA-Attribute | 2 Tage |
| Reduced-Motion + High-Contrast Support | 0,5 Tage |

### Definition of Done

- VVT als lebende `.md` im Repo, alle Datenflüsse dokumentiert
- DSFA als formales PDF mit Restrisiko-Bewertung
- User-Delete löscht nachweislich aus: `auth.users`, `profiles`, `bookings`, `messages`, `notifications`, `payments`, `angels`, `care_recipients`, `fcm_tokens`, `push_subscriptions`, etc.
- Lighthouse Accessibility Score ≥ 95
- axe-core läuft im CI als Gate

**Phase-Aufwand:** ~12 Tage intern + extern Anwalt

---

## Phase 4 — Defense-in-Depth (E2E, WAF, Secrets, Headers)

**Warum:** Wenn ein Angreifer Phase 1–3 überlebt, soll er nicht alles auf einmal kompromittieren können. Mehrere Schichten.

**Analogie:** Ein Bankhaus hat nicht nur ein Schloss — sie haben Stahltür, Tresor, Kameras, Wächter, Alarmanlage. Falls eines ausfällt, halten die anderen.

### Was

| Baustein | Tool/Maßnahme | Aufwand |
|---|---|---|
| **E2E-Verschlüsselung Chat** | libsodium / Signal-Protocol; Keys im SecureStore (iOS) bzw. Keystore (Android) | 5–8 Tage (komplex!) |
| **CSP Headers** | `next.config.ts` Headers + `next/script` Hashes; Report-Only zuerst, dann Enforce | 2 Tage |
| **HSTS, X-Frame, Referrer-Policy, Permissions-Policy** | Headers konfigurieren | 0,5 Tage |
| **Globales Rate-Limiting** | **Upstash Redis** + Middleware oder Vercel Firewall | 1 Tag |
| **WAF / Bot-Protection** | Vercel Firewall (Pro Plan) oder Cloudflare | 1 Tag |
| **Input-Validation überall** | **Zod** Schemas in jedem API-Route | 2 Tage |
| **Secrets-Audit** | alle env-vars rotieren (Supabase Service-Role, Resend, FCM, Stripe), `.env*` in `.gitignore` verifizieren, GitHub Push-Protection an | 1 Tag |
| **Dependency-Hygiene** | **Dependabot** + **Renovate**; `npm audit` im CI als Gate | 0,5 Tage |
| **CSRF-Schutz** | Same-Site Cookies prüfen, Origin-Header-Validation in API-Routes | 1 Tag |
| **2FA für Admin-User** (`mis_auth_log` + TOTP) | Supabase Auth MFA aktivieren für `role='admin'` | 1 Tag |
| **Audit-Log auch für DELETE/UPDATE auf kritischen Tabellen** | Postgres Trigger → `audit_log` | 2 Tage |

### Definition of Done

- Chat-Nachrichten in der DB sind verschlüsselt; selbst ein DB-Admin kann sie nicht lesen
- CSP enforced ohne `unsafe-inline`, ohne `unsafe-eval`
- Rate-Limit: max 60 req/min/IP für unauthentifizierte Endpoints, 300 req/min/User für authentifizierte
- `mozilla-observatory` Score ≥ A+
- `securityheaders.com` Score A+
- npm audit liefert 0 critical/high
- Admin-Logins gehen nur mit 2FA
- Dependabot-PRs werden wöchentlich gemerged

**Phase-Aufwand:** ~17–20 Tage

---

## Phase 5 — Validierung (Pentest & Disaster Recovery)

**Warum zuletzt:** Ein Pentest gegen ein ungetestetes, unmonitortes System findet 50 Findings, von denen 40 schon durch Phase 1–4 verschwunden wären. Du verbrennst Geld und Zeit.

**Analogie:** Du buchst den TÜV erst, wenn das Auto repariert ist — nicht davor.

### Was

| Baustein | Aufwand / Kosten |
|---|---|
| Pentest-Vorbereitung: Scope-Doc, Test-Account, Read-Only Sentry-Zugang für Pentester | 1 Tag |
| **Externer Pentest** durch zertifiziertes Team (OSCP/CREST), 5–7 Tage Black/Grey Box | extern, **5.000–15.000 €** |
| Findings-Triage + Fix-Sprint | 5–10 Tage je nach Findings |
| **Disaster-Recovery-Drill**: produktive DB in einer Sandbox restoren, App dagegen booten, Datenintegrität prüfen | 2 Tage |
| **Backup-Test**: Monatlich automatisiert ein Restore-Test mit Hash-Vergleich | 1 Tag Setup |
| **Incident-Response-Playbook**: Wer macht was bei Datenleck, DDoS, Datenverlust? Telefonliste, Eskalationspfad, Behörden-Meldepflicht (LDI NRW innerhalb 72h!) | 2 Tage |
| **Post-Pentest Re-Test** | extern, 1–2 Tage |

### Definition of Done

- Pentest-Report mit 0 Critical, 0 High Findings nach Re-Test
- DR-Drill protokolliert, RTO ≤ 4h, RPO ≤ 1h dokumentiert
- Incident-Response-Playbook im Repo + ausgedruckt im Büro
- Cyber-Versicherung abgeschlossen (jetzt verhandelbar, weil Pentest-Report vorzeigbar)

**Phase-Aufwand:** ~10–15 Tage intern + 6.000–17.000 € extern

---

## Reihenfolge & Parallelisierung

```
Monat 1:  Phase 1 (Observability) ──┐
                                     ├── Quick Wins für sofortige Sicherheit
          Phase 4-Subset (Headers, ──┘
            Secrets, Dependabot)

Monat 2:  Phase 2 (Tests + CI/CD) ──── Stabilität gegen Regressionen

Monat 3:  Phase 3 (DSGVO + A11y)  ──── Compliance + Markterweiterung

Monat 4:  Phase 4 Rest (E2E-Chat, ──── Defense-in-Depth komplett
            WAF, 2FA, Audit-Trigger)

Monat 5:  Phase 5 (Pentest + DR)  ──── Externe Validierung
```

**Quick-Win-Reihenfolge** (falls Budget knapp): Phase 1 → Phase 4-Headers → Phase 3-DSGVO-Minimum → Phase 2 → Phase 4-Rest → Phase 5.

---

## Gesamtkosten-Übersicht

| Posten | Kosten |
|---|---|
| Interne Entwickler-Zeit | ~50 Tage à eigene Stundensatz |
| Sentry (Team-Plan) | ~26 €/Monat |
| Better Stack (Logs + Uptime) | ~30 €/Monat |
| Upstash Redis (Rate-Limit) | ~10 €/Monat |
| Vercel Pro (Firewall, Analytics) | ~20 €/Monat |
| Anwalt für Datenschutzerklärung + AVV-Review | 800–1.500 € einmalig |
| Pentest extern | 5.000–15.000 € einmalig |
| Re-Test | 1.500–3.000 € einmalig |
| **Laufend** | ~85 €/Monat |
| **Einmalig** | ~7.300–19.500 € |

---

## Was ich brauche von dir

1. **Budget-Rahmen** — ist 7–20k € extern realistisch? Falls nein, welche Phasen priorisieren wir, welche skippen wir?
2. **Zeit-Rahmen** — willst du den Sprint in 4 Monaten ziehen, oder verteilt über 12 Monate parallel zu Feature-Arbeit?
3. **Compliance-Dringlichkeit** — gibt's einen DSGVO-Druck (Anfrage einer Behörde, B2B-Kunde der AVV will, Investor-Due-Diligence)?
4. **Welche Phase starten wir morgen?** Meine Empfehlung: **Phase 1**, weil ohne Sichtbarkeit alles andere im Dunkeln bleibt.

---

*Dieses Dokument ist eine lebende Roadmap. Nach jeder abgeschlossenen Phase wird Status & ggf. Anpassung dokumentiert.*
