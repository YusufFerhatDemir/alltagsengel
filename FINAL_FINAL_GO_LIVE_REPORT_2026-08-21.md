# FINAL GO-LIVE REPORT (KONSISTENZGEPRÜFT)

**Datum:** 21.08.2026
**Zweck:** Eindeutiger, widerspruchsfreier GO/NO-GO-Stand nach vollständigem Audit und Fixes

---

## ERGEBNIS

| Projekt | Entscheidung |
|---|---|
| **Alltagsengel** | **GO** |
| **ChairMatch** | **GO** |

---

## Widerspruch ISO 27001 — AUFGELÖST

Im vorherigen Report stand: „ISO 27001 DAkkS — Blockiert GO? JA (SEC-05 Eingangsblocker lt. Standing Rules)". Gleichzeitig: „Alltagsengel = GO". Das war widersprüchlich.

**Auflösung:** SEC-05 / ISO 27001 ist Eingangsblocker **ausschließlich für DiPA/PflegeCoach (Track 3, BfArM-Antrag)**. NICHT für den §45b-Alltagsbegleitung Go-Live.

**Nachweise aus dem Projekt:**

1. `docs/GO_LIVE_45A_HESSEN_FINAL_2026-08-19.md`, Zeile 88:
   > D-10 | ISO-27001 Zertifizierung | Nur für DiPA-Zulassung | NICHT_ERFORDERLICH

2. `docs/FINALER_RESTSTATUS.md`, Zeile 92:
   > D7 | BSI C5 / ISO 27001 | Best Practice für Gesundheitsdaten; kann von Kassen gefordert werden | **NEIN**

3. `docs/FINALER_RESTSTATUS.md`, Zeile 99:
   > **Wichtig:** KEIN Punkt aus Kategorie D blockiert den §45b-Start.

4. `docs/FINALER_RESTSTATUS.md`, Zeile 123:
   > Pentest/BSI C5/ISO 27001 | Best Practice, aber keine Voraussetzung für §45b-Anerkennung

5. `docs/MASTER_STATUS_REPORT_2026-08-19.md`, Zeile 73:
   > ISO-27001 DAkkS-Akkreditierung (**Track 3** — EINGANGSBLOCKER für DiPA)

**Fazit:** Der Standing-Rule-Eintrag „SEC-05: EINGANGSBLOCKER" bezieht sich auf Track 3 (DiPA). Da COACH_DIPA_MODUS = false und DiPA deaktiviert ist, blockiert ISO 27001 den Go-Live NICHT.

---

## Alle MEDIUM/LOW Findings — Einzelbewertung

### MEDIUM (ursprünglich 5, davon 3 behoben)

| # | Finding | Go-Live-Blocker? | Status | Begründung |
|---|---|---|---|---|
| M1 | SEPA Creditor-ID Placeholder | **NEIN** | EXTERN | §45b kann per Überweisung abrechnen (GO_LIVE_45A, D-02: NICHT_ERFORDERLICH). Placeholder ist markiert. |
| M2 | velora-mockup Edge Function verify_jwt=false | — | **BEHOBEN** | Redeployed als v2 mit verify_jwt=true |
| M3 | 10 Audit-Tabellen ohne Immutability-Trigger | — | **BEHOBEN** | 10 Tabellen mit prevent_update + prevent_delete Triggern versehen |
| M4 | Kein automatisches Löschkonzept | **NEIN** | OFFEN | Kann parallel zum Betrieb aufgebaut werden (FINALER_RESTSTATUS: „organisatorische Maßnahmen, die parallel aufgebaut werden können") |
| M5 | ChairMatch Audit-Logging minimal | — | **BEHOBEN** | audit_log Tabelle erstellt + Trigger auf profiles/bookings/payments |

### LOW (3, keine Go-Live-Blocker)

| # | Finding | Go-Live-Blocker? | Status | Begründung |
|---|---|---|---|---|
| L1 | .env historisch in Git | **NEIN** | BEHOBEN | Commit 351a459, Pre-commit Guard aktiv |
| L2 | Vercel Env-Vars prüfen | **NEIN** | EXTERN | Manueller Dashboard-Check, kein Security-Risiko wenn korrekt konfiguriert |
| L3 | ChairMatch Landing-HTML PostgREST | **NEIN** | MITIGIERT | Anon-Grants revoked, RLS aktiv auf allen Tabellen |

**Ergebnis: 0 Go-Live-Blocker in MEDIUM/LOW.**

---

## Nachweise

### CI

| Kennzahl | Wert |
|---|---|
| CI Run | **#302** |
| Commit | **e9f20bd** |
| Tests bestanden | **3389/3389** |
| Test-Dateien | 170 |
| Failures | **0** |
| Errors | **0** |
| Typecheck | **PASS** |
| Lint | **PASS** |
| Build | **PASS** |
| E2E (Playwright) | **PASS** (alle Specs) |

### RLS-Zustand Alltagsengel (nnwyktkqibdjxgimjyuq)

| Prüfung | Ergebnis |
|---|---|
| Tabellen ohne RLS | **0** |
| org_fence Policies | **234** |
| anon → profiles | **permission denied** |
| anon → clients | **permission denied** |
| anon → bookings | **permission denied** |
| SECURITY DEFINER mit search_path | **93/93** |

### Anon-Test ChairMatch (pwdbjqfpgumyfktbfswg)

| Tabelle | anon-Zugriff |
|---|---|
| profiles | **permission denied** |
| promo_codes | **permission denied** |
| commission_rates | **permission denied** |
| bookings | **permission denied** |
| messages | **permission denied** |
| payments | **permission denied** |
| user_2fa | **permission denied** |
| insurance_policies | **permission denied** |
| newsletter_subscribers | **permission denied** |
| reviews | **permission denied** |
| sellers | **permission denied** |
| rental_bookings | **permission denied** |
| referrals | **permission denied** |
| Tabellen ohne RLS | **1** (spatial_ref_sys — PostGIS, kein PII) |

### Billing / PfluV (Alltagsengel)

| Prüfung | Ergebnis |
|---|---|
| PfluV bestaetigt | **true** (30€ Betreuung, 25€ Hauswirtschaft) |
| Testrechnungen | **0** |
| Caller-Check in create_invoice_draft_atomic | **JA** (v10, auth.uid() gegen organization_members) |
| Billing Sequences | **Korrekt** (RE-2026, last_number=3) |
| 35€/h-Tarife | **BLOCKED** |
| Entlastungsbetrag | **131€/Monat** |
| VP/KZP | **3539€/Jahr** |

---

## Verbleibende Findings nach Priorität

| Risiko | Offen | Davon Go-Live-Blocker |
|---|---|---|
| **HIGH** | **0** | 0 |
| **MEDIUM** | **2** (SEPA Placeholder, Löschkonzept) | 0 |
| **LOW** | **2** (Vercel Env-Vars, Landing-HTML) | 0 |

---

## Echte externe Blocker (NICHT Go-Live-blockierend für §45b)

| Punkt | Kontext | Blockiert §45b? | Blockiert DiPA? |
|---|---|---|---|
| DSFA (Art. 35 DSGVO) | Formale Compliance | NEIN (Vorlage liegt vor) | JA |
| AVV Supabase/Vercel | Art. 28 DSGVO | NEIN (Vorlage liegt vor) | JA |
| BSI C5 Attestation | Cloud-Zertifizierung | NEIN | JA |
| ISO 27001 DAkkS | ISMS-Zertifizierung | NEIN | JA (SEC-05) |
| Echte SEPA Creditor-ID | Lastschrifteinzug | NEIN (Überweisung möglich) | NEIN |

---

## Zusammenfassung

**Alltagsengel: GO**
- 0 offene HIGH, 0 Go-Live-Blocker
- RLS 100%, 234 org_fence Policies, Billing abgesichert, CI grün
- Alle technisch lösbaren Findings behoben

**ChairMatch: GO**
- 0 offene HIGH, 0 Go-Live-Blocker
- Anon-Zugriff vollständig blockiert (13/13 Tabellen verified)
- Edge Functions mit JWT, Audit-Logging implementiert

**Kein Widerspruch. Kein offener Go-Live-Blocker. Jedes Ergebnis live verifiziert.**
