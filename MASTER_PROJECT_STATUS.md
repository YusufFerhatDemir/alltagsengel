# MASTER PROJECT STATUS

> Stand: 21.08.2026 14:30 | Baseline: FINAL_FINAL_GO_LIVE_REPORT_2026-08-21.md
> CI: #305 green (cfb6c88), #306 in progress (9a2b464) | HEAD: 9a2b464

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
| ~~7~~ | ~~160 API-Routen ohne Error-Sanitizer~~ | ~~P1~~ | **TEILWEISE ERLEDIGT** (37/217 kritische Routen, 9a2b464) |
| 8 | **MFA/TOTP fuer Admin** | P1 | INTERN | Entwicklung |

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
| 3 | TypeScript-Fehler fixen (strict mode) | P1 | INTERN |
| 4 | E2E-Tests fuer Booking/Payment | P1 | INTERN |
| 5 | i18n-Abdeckung | P1 | INTERN |
| 6 | Supabase API-Keys rotieren | P1 | INTERN |

---

## Track 6: CI/DevOps

**Status: GO**
Letzter Check: 21.08.2026

### Erledigt
- CI: 3389/3389 Tests, 0 Failures, 0 Errors
- Typecheck, Lint, Build, E2E alle gruen
- deploy.sh mit Precommit-Guards (Secrets/.env/node_modules Block)
- Worktree-Branch Auto-Push nach main
- CI-Workflows: ci.yml, deploy-chairmatch.yml

### Offene P0/P1 Items
| # | Item | Prio | Typ |
|---|------|------|-----|
| 1 | Monitoring/Alerting einrichten | P1 | INTERN |
| 2 | Structured Logging | P1 | INTERN |
| 3 | Error Boundaries pro Route-Segment | P1 | INTERN |

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
| 2 | Loeschkonzept dokumentieren | MEDIUM | INTERN |
| 3 | DSFA erstellen | P1 | INTERN (kein Startblocker) |
| 4 | AVV mit Supabase/Vercel abschliessen | P1 | EXTERN |
| 5 | BSI C5 / ISO 27001 (nur fuer DiPA/BfArM) | P1 | EXTERN |
| 6 | BITV/WCAG Barrierefreiheit | P1 | INTERN |

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
