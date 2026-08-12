# Produktionsprüfung & Live-Tarif-Verifikation

**Datum:** 12.08.2026
**Supabase-Projekt:** nnwyktkqibdjxgimjyuq
**IK-Nummer:** 460629986
**Stamm-Org:** 00000000-0000-4000-8000-000460629986

---

## Teil 1: Live-Tarife

### 1.1 billing_tariffs (23 aktive Einträge)

#### §39 SGB XI — Verhinderungspflege

| Leistungsart | Preis/h | Vergütungsart | Status | Bewertung |
|---|---|---|---|---|
| alltagsbegleitung | 35,00 € | zeit_stunde | MANUELL_FREIGEGEBEN | PLAUSIBEL — §39 VP unterliegt nicht der PfluV; marktüblich für zugelassene Pflegedienste |
| betreuung_45a | 35,00 € | zeit_stunde | MANUELL_FREIGEGEBEN | PLAUSIBEL — s.o. |
| demenzbetreuung | 35,00 € | zeit_stunde | MANUELL_FREIGEGEBEN | PLAUSIBEL — s.o. |
| hauswirtschaft | 35,00 € | zeit_stunde | MANUELL_FREIGEGEBEN | PLAUSIBEL — s.o. |

**Quelle:** VP-Budget 1.685 €/Jahr (PUEG ab 01.01.2025). Stundensätze sind Dienstleister-eigene Preise, keine gesetzliche Obergrenze.

#### §45b SGB XI — Entlastungsbetrag

| Leistungsart | Preis/h | Vergütungsart | Status | Bewertung |
|---|---|---|---|---|
| alltagsbegleitung | 35,00 € | zeit_stunde | MANUELL_FREIGEGEBEN | VERIFIZIERUNGSBEDARF ¹ |
| begleitservice | 35,00 € | zeit_stunde | MANUELL_FREIGEGEBEN | VERIFIZIERUNGSBEDARF ¹ |
| betreuung_45a | 35,00 € | zeit_stunde | MANUELL_FREIGEGEBEN | VERIFIZIERUNGSBEDARF ¹ |
| demenzbetreuung | 35,00 € | zeit_stunde | MANUELL_FREIGEGEBEN | VERIFIZIERUNGSBEDARF ¹ |
| einkaufsservice | 35,00 € | zeit_stunde | MANUELL_FREIGEGEBEN | VERIFIZIERUNGSBEDARF ¹ |
| hauswirtschaft | 35,00 € | zeit_stunde | MANUELL_FREIGEGEBEN | VERIFIZIERUNGSBEDARF ¹ |
| nachtbetreuung | 35,00 € | zeit_stunde | MANUELL_FREIGEGEBEN | VERIFIZIERUNGSBEDARF ¹ |
| wochenendbetreuung | 35,00 € | zeit_stunde | MANUELL_FREIGEGEBEN | VERIFIZIERUNGSBEDARF ¹ |
| wegepauschale | 5,00 € | wegepauschale | MANUELL_FREIGEGEBEN | PLAUSIBEL — marktüblich |

¹ **VERIFIZIERUNGSBEDARF:** PfluV Hessen schreibt Obergrenzen vor:
- Betreuungsangebote (§45a Nr. 1+2): max 30 €/h inkl. USt
- Entlastung im Alltag (§45a Nr. 3): max 25 €/h inkl. USt

**ABER:** Zugelassene Pflegedienste nach §72 SGB XI sind von der PfluV ausgenommen.
Alltagsengel hat IK 460629986 und LK-Tarife (Leistungskomplexe) in der Datenbank,
was auf eine §72-Zulassung hindeutet. Falls §72-zugelassen: 35 €/h ist legal und marktüblich.

**HANDLUNGSEMPFEHLUNG:** Yusuf muss bestätigen, ob die §72-Zulassung vorliegt.
Falls JA: Tarife sind korrekt. Falls NEIN: Tarife müssen auf 30/25 €/h gesenkt werden.

#### Privat-Tarife

| Leistungsart | Preis/h | Status | Bewertung |
|---|---|---|---|
| alltagsbegleitung | 40,00 € | PRIVATE_PREISLISTE | NICHT RELEVANT FÜR §45b — frei wählbar |
| begleitservice | 40,00 € | PRIVATE_PREISLISTE | NICHT RELEVANT FÜR §45b |
| betreuung_45a | 40,00 € | PRIVATE_PREISLISTE | NICHT RELEVANT FÜR §45b |
| demenzbetreuung | 40,00 € | PRIVATE_PREISLISTE | NICHT RELEVANT FÜR §45b |
| einkaufsservice | 40,00 € | PRIVATE_PREISLISTE | NICHT RELEVANT FÜR §45b |
| hauswirtschaft | 38,00 € | PRIVATE_PREISLISTE | NICHT RELEVANT FÜR §45b |
| nachtbetreuung | 45,00 € | PRIVATE_PREISLISTE | NICHT RELEVANT FÜR §45b |
| sonstige | 40,00 € | PRIVATE_PREISLISTE | NICHT RELEVANT FÜR §45b |
| wegepauschale | 5,00 € | PRIVATE_PREISLISTE | NICHT RELEVANT FÜR §45b |
| wochenendbetreuung | 40,00 € | PRIVATE_PREISLISTE | NICHT RELEVANT FÜR §45b |

### 1.2 leistungspreise (24 Einträge, Hessen)

#### Leistungskomplexe (LK1–LK18)

Punktwert: 0,0803 €/Punkt (konsistent über alle Positionen).

| LK | Beschreibung | Punkte | Preis | Bewertung |
|---|---|---|---|---|
| LK1 | kleine_koerperpflege | 400 | 32,14 € | PLAUSIBEL — Punktwert 0,08035 |
| LK2 | grosse_koerperpflege | 510 | 40,97 € | PLAUSIBEL — Punktwert 0,08033 |
| LK3 | grosse_erw_koerperpflege | 610 | 49,01 € | PLAUSIBEL — Punktwert 0,08034 |
| LK4 | lagerung | 100 | 8,03 € | PLAUSIBEL — Punktwert 0,0803 |
| LK5 | ausscheidung_umfangreich | 150 | 12,05 € | PLAUSIBEL — Punktwert 0,08033 |
| LK6 | nahrung_einfach | 100 | 8,03 € | PLAUSIBEL — Punktwert 0,0803 |
| LK7 | nahrung_umfangreich | 250 | 20,09 € | PLAUSIBEL — Punktwert 0,08036 |
| LK8 | sondenkost | 150 | 12,05 € | PLAUSIBEL — Punktwert 0,08033 |
| LK9 | aufstehen_zubett | 100 | 8,03 € | PLAUSIBEL — Punktwert 0,0803 |
| LK10 | verlassen_wohnung | 120 | 9,64 € | PLAUSIBEL — Punktwert 0,08033 |
| LK11 | mobilisation | 120 | 9,64 € | PLAUSIBEL — Punktwert 0,08033 |
| LK12 | begleitung_aktivitaeten | 150 | 12,05 € | PLAUSIBEL — Punktwert 0,08033 |
| LK13 | haushaltsfuehrung_grundwert | 150 | 12,05 € | PLAUSIBEL — Punktwert 0,08033 |
| LK14 | betreuung_grundwert | 300 | 24,10 € | PLAUSIBEL — Punktwert 0,08033 |
| LK15 | anleitung_grundwert | 150 | 12,05 € | PLAUSIBEL — Punktwert 0,08033 |
| LK16 | erstgespraech | 900 | 72,31 € | PLAUSIBEL — Punktwert 0,08034 |
| LK17 | folgegespraech | 300 | 24,10 € | PLAUSIBEL — Punktwert 0,08033 |
| LK18 | beratungseinsatz_37_3 | — | 75,00 € | VERIFIZIERT — §37 Abs. 3 SGB XI ab PG2: 23 €, PG4/5: 33 €. 75 € gilt bei PG3 nach PfluV? NICHT VERIFIZIERT — Standard-Beratungseinsatz § 37.3 lt. BMG: 23–33 €. 75 € wäre nur bei erweitertem Einsatz plausibel. |

**HINWEIS:** Der Punktwert 0,0803 €/Punkt ist intern konsistent. Ob dieser dem aktuellen hessischen Vergütungsvertrag entspricht, kann nur mit dem offiziellen Vertragsdokument bestätigt werden.

#### Sonderposten

| Leistungsart | Preis | Bewertung |
|---|---|---|
| alltagsbegleitung_45a | 25,00 €/h | VERIFIZIERT — entspricht PfluV Hessen §3 Nr. 3 Obergrenze (für Nicht-§72-Anbieter) |
| entlastung_45b | 131,00 € | VERIFIZIERT — monatlicher Entlastungsbetrag §45b SGB XI ab 01.01.2025 (PUEG-Erhöhung von 125 auf 131 €) |
| grosse_koerperpflege | 40,97 € | PLAUSIBEL — = LK2 (510 Punkte × 0,0803) |
| kleine_koerperpflege | 32,14 € | PLAUSIBEL — = LK1 (400 Punkte × 0,0803) |
| hauswirtschaft | 12,05 € | PLAUSIBEL — = LK13 (150 Punkte × 0,0803) |
| hilfe_ausscheiden | 12,05 € | PLAUSIBEL — = LK5 (150 Punkte × 0,0803) |

### 1.3 billing_gesetzliche_obergrenzen (2 Einträge)

| Bundesland | Angebotstyp | Obergrenze | Quelle | Status |
|---|---|---|---|---|
| hessen | betreuungsangebot | 30,00 €/h | PfluV Hessen §3 Nr. 1+2 | VERIFIZIERT |
| hessen | entlastungsangebot | 25,00 €/h | PfluV Hessen §3 Nr. 3 | VERIFIZIERT |

**HINWEIS:** Diese Obergrenzen werden im Code NICHT aktiv durchgesetzt (kein Enforcement in price-resolver.ts).
Sie sind rein informativ in der DB hinterlegt. Für §72-zugelassene Pflegedienste ist das korrekt (PfluV gilt nicht).
Für Nicht-§72-Anbieter wäre eine Code-seitige Enforcement-Prüfung empfehlenswert.

### 1.4 service_pricing (10 Einträge)

| Service-Type | Budget-Type | Preis/h | Status |
|---|---|---|---|
| alltagsbegleitung | entlastung | 35,00 € | Konsistent mit billing_tariffs |
| alltagsbegleitung | private | 40,00 € | Konsistent |
| alltagsbegleitung | verhinderung | 35,00 € | Konsistent |
| begleitservice | entlastung | 35,00 € | Konsistent |
| begleitservice | private | 40,00 € | Konsistent |
| betreuung_45a | entlastung | 35,00 € | Konsistent |
| betreuung_45a | verhinderung | 35,00 € | Konsistent |
| einkaufsservice | entlastung | 35,00 € | Konsistent |
| hauswirtschaft | entlastung | 35,00 € | Konsistent |
| hauswirtschaft | private | 38,00 € | Konsistent |

### 1.5 client_budgets (Stichprobe, 4 Einträge)

| Wert | Live | Soll | Status |
|---|---|---|---|
| monthly_amount | 131,00 € | 131 €/Monat (PUEG ab 01.01.2025) | VERIFIZIERT |
| annual_amount | 1.572,00 € | 131 × 12 = 1.572 € | VERIFIZIERT |
| combined_annual_amount (VP) | 3.539,00 € | VP 1.685 + KZP 1.854 = 3.539 € (§42a) | VERIFIZIERT |

---

## Teil 2: Produktionsprüfung

### 2.1 Auth & Rollen: OK

**Architektur:** Dreischichtiges Fail-Closed-Design.

1. **Middleware (proxy.ts):** Rollenmatrix (admin/superadmin → alle Bereiche), geschützte Pfade, Session-Validierung.
   - Rolle aus `app_metadata.role` (tamper-proof), Fallback auf DB `profiles.role`.
   - `user_metadata.role` wird bewusst NICHT verwendet.

2. **API-Guards:** 14 domänenspezifische Guard-Funktionen, alle nach gleichem Muster:
   - `requireOpsAdmin()` — Billing/Ops (lib/ops/api-auth.ts)
   - `requirePflegeAdmin()` — Pflegedoku (lib/pflege/api-auth.ts)
   - `requireAktenAdmin()` — Klientenakten (lib/akten/api-auth.ts)
   - `requirePersonalAdmin()` — Personal (lib/personal/api-auth.ts)
   - `requireWundenAdmin()` — Wunddoku (lib/wunden/api-auth.ts)
   - `requireMedAuth()` — Medikamente (lib/medikamente/api-auth.ts)
   - u.a.
   - Jeder Guard: JWT → profile.role → getActiveOrgId() → fail-closed bei fehlendem Profil/Org.

3. **DB-Ebene:** Trigger `trg_prevent_role_escalation` auf `profiles` verhindert Selbst-Eskalation.
   Nur `superadmin` darf Rollen ändern (app/api/admin/manage-role/route.ts).

### 2.2 RLS: 264/264 Tabellen

| Metrik | Wert |
|---|---|
| Tabellen gesamt (public) | 264 |
| rowsecurity = true | **264 (100%)** |
| forcerowsecurity = true | 15 |

**Quelle:** `audit_rls_all_status` RPC, Live-Abfrage 12.08.2026.

### 2.3 Mandantentrennung: OK

**Mechanismus:**
- `getActiveOrgId()` (lib/organizations/server.ts) — Cookie-basierter Org-Switcher, validiert gegen `organization_members`.
- 255+ Referenzen auf `organization_id` in API-Routen.
- Statischer Sicherheitstest (`lib/abrechnung/__tests__/admin-ui-security.test.ts`) prüft automatisch, dass alle DTA-Routen `getActiveOrgId()` oder equivalente Guards nutzen.
- DB-Level: `org_fence`-Policies auf Billing-Tabellen (Migration 20260819020000).

**Öffentliche Routen ohne Org-Scoping (korrekt):**
- Newsletter, Kontakt, Lead-Inquiry, Track, Google-Reviews, Beratung-Chat, WhatsApp-Webhook
- Cron-Endpoints (geschützt via CRON_SECRET)
- Pricing/Calculate (öffentlicher Buchungsrechner)

### 2.4 Race Conditions: OK

**Billing-Engine (lib/billing/core/invoice-engine.ts):**

| Operation | Schutz | Details |
|---|---|---|
| Rechnungsnummer-Vergabe | CAS | `.eq('last_number', seq.last_number)` — Konflikt-Erkennung bei parallelem Zugriff |
| Rechnung stornieren | CAS | `.neq('status', 'storniert')` — Doppel-Storno unmöglich |
| Rechnung korrigieren | FOR UPDATE (RPC) + CAS-Fallback | `validate_correction_atomic` sperrt Zeile; App-Layer CAS als Backup |
| Gutschrift erstellen | FOR UPDATE (RPC) + CAS | `create_credit_note_atomic`; Summenprüfung nach Insert mit Rollback |
| Abschreibung | CAS | `.eq('status', currentStatus)` auf Update |
| Rechnungsentwurf | Atomare RPC | `create_invoice_draft_atomic` |
| Buchungsantwort | Optimistic Lock | `.eq('status', 'pending')` — verhindert Accept-nach-Decline |
| Idempotenz | Key-basiert | `inv_{clientId}_{YYYY-MM}_{budgetType}_v{version}` |

### 2.5 Security: ÜBERWIEGEND OK

#### Rate Limiting: 3-Tier-System

| Tier | Max/Min | Anwendung |
|---|---|---|
| STRICT | 5 | /api/auth/* |
| MEDIUM | 30 | Billing-Mutationen (Storno, SEPA, Mahnwesen) |
| STANDARD | 120 | Alle anderen /api-Routen |

- Middleware-Integration in proxy.ts
- IP-basiert (STRICT) oder User-ID-basiert (MEDIUM/STANDARD)
- Zusätzlich: formularspezifische Sliding-Window-Limits (Lead: 5/10min, Kontakt: 5/10min)
- DB-backed Rate-Limit für Login

#### CSRF: OK
- Origin-Check in proxy.ts für POST/PUT/PATCH/DELETE
- Erlaubt: *.alltagsengel.care, localhost:3000

#### File-Upload: OK
- MIME-Whitelist, Extension-Whitelist, Größenlimit
- Path-Traversal-Prevention (sanitizeFilename)

#### Webhook-Sicherheit: OK
- Stripe: Signaturverifikation via `stripe.webhooks.constructEvent()`
- Push: Service-Role-Key Header-Check
- Cron: CRON_SECRET Header

### 2.6 Fehlerfälle: VERBESSERUNGSBEDARF

#### Error-Sanitizer

| Metrik | Wert |
|---|---|
| Vorhandener Sanitizer | `lib/utils/api-error.ts` — safeErrorResponse() / safeDbError() |
| Routen mit Sanitizer | **3** |
| Routen mit rohem err.message | **172** |
| Stack-Trace-Exposures | 0 |

**PROBLEM:** 172 API-Routen geben rohe Fehlermeldungen zurück (`(err as Error).message`).
Postgres-Fehlermeldungen können Tabellennamen, Constraint-Namen und Schema-Details leaken.
Der Sanitizer existiert, wird aber fast nie verwendet.

**Betroffene Bereiche:** pflege/*, sis/*, wounds/*, vitals/*, personal/*, medikamente/*

**HANDLUNGSEMPFEHLUNG (P2):** Alle catch-Blocks auf `safeErrorResponse()` migrieren.
Kein akutes Sicherheitsrisiko (keine Stack-Traces, Auth-Grenzen sind korrekt), aber Informations-Leak möglich.

---

## Zusammenfassung

### Tarif-Gesamtbewertung

| Kategorie | Einträge | Status |
|---|---|---|
| §39 VP-Tarife | 4 | PLAUSIBEL (35 €/h, marktüblich, keine PfluV-Grenze) |
| §45b Entlastungs-Tarife | 9 | VERIFIZIERUNGSBEDARF (35 €/h, nur legal mit §72-Zulassung) |
| Privat-Tarife | 10 | OK (frei wählbar, nicht §45b-relevant) |
| LK-Tarife (Hessen) | 18 | PLAUSIBEL (Punktwert 0,0803 intern konsistent) |
| Obergrenzen | 2 | VERIFIZIERT (PfluV Hessen korrekt) |
| Entlastungsbetrag | — | VERIFIZIERT (131 €/Monat, PUEG) |
| VP-Budget | — | VERIFIZIERT (1.685 €/Jahr, PUEG) |
| KZP-Budget | — | VERIFIZIERT (1.854 €/Jahr, PUEG) |
| §42a Kombi-Budget | — | VERIFIZIERT (3.539 €, korrekt berechnet) |

### Produktionsprüfung Gesamtbewertung

| Bereich | Status | Details |
|---|---|---|
| Auth & Rollen | **OK** | Fail-closed, 14 Guard-Funktionen, DB-Eskalationsschutz |
| RLS | **264/264** | 100% Abdeckung |
| Mandantentrennung | **OK** | Dreischichtig (Guard + Query + RLS), statischer Test |
| Race Conditions | **OK** | CAS + FOR UPDATE RPCs + Idempotenz-Keys |
| Rate Limiting | **OK** | 3-Tier, Middleware-integriert |
| CSRF | **OK** | Origin-Check in proxy.ts |
| Error-Sanitizer | **VERBESSERUNG NÖTIG** | 3/172 Routen nutzen safeErrorResponse() |
| IDOR-Schutz | **OK** | organization_id aus Auth-Context, nie aus User-Input |

### Offene Handlungsempfehlungen

1. **§72-Zulassung bestätigen** — Entscheidet, ob §45b-Tarife von 35 €/h legal sind
2. **Error-Sanitizer rollout** — safeErrorResponse() auf restliche 172 Routen ausrollen (P2)
3. **LK18 Beratungseinsatz** — 75 € prüfen (§37.3 Standard: 23–33 €)
4. **PfluV-Enforcement** — Falls Nicht-§72-Anbieter angebunden werden: Code-seitige Preisobergrenzen-Prüfung einbauen
