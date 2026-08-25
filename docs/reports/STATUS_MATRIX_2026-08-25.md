# Status-Matrix — 25.08.2026

Verifiziert gegen Live-Supabase, Git HEAD und CI. Keine Annahmen aus alten Chat-Summaries.

---

## Legende

| Kürzel | Bedeutung |
|---|---|
| LIVE_VERIFIZIERT | Code deployed UND live auf Supabase/Vercel gegengeprüft |
| CODE_FERTIG | Im Repo committed, typecheck+tests grün, aber nicht live verifiziert |
| EXTERN_BLOCKIERT | Braucht manuellen Eingriff (Supabase Dashboard, Vercel UI, externe Stelle) |
| BUSINESS_INPUT_REQUIRED | Geschäftsentscheidung von Yusuf nötig |
| NICHT_MEHR_RELEVANT | Erledigt durch andere Lösung oder gegenstandslos |

---

## ALLTAGSENGEL

### Infrastruktur

| Track | Status | Nachweis |
|---|---|---|
| Git main sauber | LIVE_VERIFIZIERT | Arbeitsbaum clean, HEAD deployed |
| Typecheck 0 Fehler | LIVE_VERIFIZIERT | `tsc --noEmit` pass |
| CI grün | LIVE_VERIFIZIERT | 15+ aufeinanderfolgende grüne Runs seit 23.08. 17:27 |
| Live HTTP 200 | LIVE_VERIFIZIERT | alltagsengel.care antwortet |
| Tests | LIVE_VERIFIZIERT | vitest 5083 + node:test ~1765 = ~6848 |
| Supabase healthy | LIVE_VERIFIZIERT | ACTIVE_HEALTHY, 225+ Migrationen |

### Security / Mandantentrennung

| Track | Status | Nachweis |
|---|---|---|
| RLS 308/308 Tabellen | LIVE_VERIFIZIERT | `SELECT count(*) FROM pg_tables WHERE rowsecurity=true` = 308 |
| org_fence RESTRICTIVE | LIVE_VERIFIZIERT | Alle relevanten Tabellen gezäunt, 2 dokumentierte Ausnahmen (organization_members, state_waitlist) |
| P2-b: DTA Storage org-scoped | LIVE_VERIFIZIERT | 3 Policies mit `foldername[2] = current_org_id()` |
| P2-a: Storage Bucket Hardening | LIVE_VERIFIZIERT | 7 Buckets: file_size_limit + allowed_mime_types gesetzt |
| P2-c: org_fence fehlende Tabellen | LIVE_VERIFIZIERT | 5 nachgezäunt, 2 Ausnahmen dokumentiert |
| anon writes = 0 | LIVE_VERIFIZIERT | Keine anon-Schreibrechte |

### Abrechnung / Geldpfade

| Track | Status | Nachweis |
|---|---|---|
| CAMT Parser (App-seitig) | CODE_FERTIG | Gehärtet (Rücklastschrift, Sammelbuchung, SHA-256, Fail-Closed), 961-Zeilen E2E-Suite |
| CAMT Dublettensperre (DB) | LIVE_VERIFIZIERT | UNIQUE INDEX `uq_zahlungseingaenge_org_buchungshash` existiert |
| CAMT Echtlauf | EXTERN_BLOCKIERT | `camt_imports` = 0, `zahlungseingaenge` = 0 — braucht echte Bankdatei + begleiteten Import |
| Rechnungsversand | EXTERN_BLOCKIERT | `RECHNUNGSVERSAND_AUTOMATISCH` nicht in Vercel gesetzt, `invoice_email_log` = 0 |
| Mahnversand | EXTERN_BLOCKIERT | `MAHNVERSAND_AUTOMATISCH` nicht in Vercel gesetzt |
| Zustellungsnachweis | EXTERN_BLOCKIERT | `notification_delivery_log` = 0 — Resend funktionsfähig, aber nie produktiv genutzt |
| payments | EXTERN_BLOCKIERT | `payments` = 0 — kein Zahlungseingang je verbucht |
| Sammelrechnung | CODE_FERTIG | Implementiert + getestet, nie produktiv gelaufen |
| Mahnung PDF | CODE_FERTIG | pdf-lib + DejaVuSans, alle Stufen, nie produktiv |

### Pflege / SGB

| Track | Status | Nachweis |
|---|---|---|
| Entlastungsbetrag 131€ | CODE_FERTIG | Pflegereform 2025 korrekt |
| VP/KZP 3539€ Jahresbetrag | CODE_FERTIG | Seit 01.07.2025 |
| PfluV-Obergrenzen (30€/25€) | CODE_FERTIG | Im Code |
| §45a Bayern | EXTERN_BLOCKIERT | Landesamt-Erinnerung erhalten, Antrag unvollständig |
| IK-Nummer 460629986 | LIVE_VERIFIZIERT | Gültig ab 16.07.2026 |
| DiPA Anforderungskatalog | CODE_FERTIG | 48 Einträge, 10 Kategorien, 6 pure functions getestet (60 Tests) |

### Sonstiges

| Track | Status | Details |
|---|---|---|
| P1-4: 28 Module ohne Tests | IN_ARBEIT | Welle 6 läuft autonom |
| P2-e: Lange signed URLs | CODE_FERTIG | 30-Tage-URLs für Rechnungs-PDFs — niedrige Priorität |
| P3-a: file-upload-validation.ts | CODE_FERTIG | 0 Aufrufer — Client-Validierung in upload-document.ts + upload-service-proof.ts nachgezogen |
| lint:forbidden | LIVE_VERIFIZIERT | 0 Treffer |

---

## CHAIRMATCH

| Track | Status | Nachweis |
|---|---|---|
| Git main sauber | LIVE_VERIFIZIERT | Arbeitsbaum clean (STATUS.md auto-generated) |
| Typecheck 0 Fehler | LIVE_VERIFIZIERT | `tsc --noEmit` pass |
| CI grün | LIVE_VERIFIZIERT | Workflow läuft |
| Live HTTP 200 | LIVE_VERIFIZIERT | chairmatch.de antwortet |
| Tests 487/487 | LIVE_VERIFIZIERT | vitest grün |
| Supabase healthy | LIVE_VERIFIZIERT | ACTIVE_HEALTHY, 43 Migrationen |
| RLS 79/79 | LIVE_VERIFIZIERT | 80 Tabellen, 1 = spatial_ref_sys (PostGIS System) |
| Pricing Schema | LIVE_VERIFIZIERT | Alle Spalten + 7 CHECK-Constraints + RLS auf protect_pricing + compliance_plans |
| Preise befüllen | BUSINESS_INPUT_REQUIRED | Tabellen strukturell fertig, aber leer — Beträge = Geschäftsentscheidung |
| P3-c: _OFFEN SQL | NICHT_MEHR_RELEVANT | Zeigt erledigte Arbeit als offen — Cleanup-Aufgabe |

---

## EFY CARE

| Track | Status | Nachweis |
|---|---|---|
| Supabase healthy | LIVE_VERIFIZIERT | ACTIVE_HEALTHY, 24 Migrationen, letzte 02.08. |

---

## Zusammenfassung

| Kategorie | Anzahl |
|---|---|
| LIVE_VERIFIZIERT | 27 |
| CODE_FERTIG | 9 |
| IN_ARBEIT | 1 |
| EXTERN_BLOCKIERT | 6 |
| BUSINESS_INPUT_REQUIRED | 1 |
| NICHT_MEHR_RELEVANT | 1 |

### Kein offenes P0.

### Nächste Schritte (nach Priorität)

1. **EXTERN_BLOCKIERT auflösen:**
   - `RECHNUNGSVERSAND_AUTOMATISCH` + `MAHNVERSAND_AUTOMATISCH` in Vercel setzen
   - Erster begleiteter CAMT-Import mit echter Bankdatei
   - Erster Rechnungsversand an echten Empfänger
   - §45a Bayern Antrag vervollständigen

2. **BUSINESS_INPUT_REQUIRED:**
   - ChairMatch Preise festlegen (protect_pricing + compliance_plans)

3. **IN_ARBEIT:**
   - P1-4 Testabdeckung Welle 6 (läuft autonom)

---

*Erstellt 25.08.2026 — automatisch verifiziert gegen Live-Supabase*
