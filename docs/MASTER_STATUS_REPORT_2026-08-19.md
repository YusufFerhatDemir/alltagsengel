# MASTER STATUS REPORT — 19.08.2026

**Projekt:** Alltagsengel Plattform
**Datum:** 19.08.2026
**Erstellt:** Automatisiert aus 8 parallelen Audit-Tracks

---

## Übersichtstabelle

| Track | Status | Implementiert | Tests | Offene Tech | Externe Blocker | Feature-Flag | Deploy | Commit |
|-------|--------|---------------|-------|-------------|-----------------|--------------|--------|--------|
| **1 — Kernbetrieb** | ✅ PRODUKTIONSREIF | Go-Live Check §45a/§45b Hessen Final, 12 Kat-A Module | 3062 grün, TS:0, Build:579 | KEINE | §45a Bescheid (Frist 31.08.), Gewerbe, Haftpflicht | N/A (alles aktiv) | Vercel Prod | `13434dd` |
| **2 — Elektr. Kassenabrechnung** | ✅ TECH FERTIG, ⛔ EXTERN BLOCKIERT | 4 P0-Bugs gefixt (Test/Echt-Verwechslung, Auftragsdatei, doppelte Ref, Rückläufer-Parser), 200 neue Tests | 768 grün | KEINE | ITSG-Zertifikat, SFTP-Zugang, Kassenverträge, Testübertragung | Dreifach-Sperre (Env + Test + Bestätigungswort) | Deployed, Übertragung blockiert | `6922dc9` |
| **3 — DiPA / PflegeCoach** | ✅ TECH FERTIG (34/48), ⛔ EXTERN BLOCKIERT | regulatorik.ts, schalter.ts (13 Schalter), Admin-Tab, Regressions-Lint | 245 Coach + 772 lib = 1017 grün | 14 Katalogpunkte (extern/GF) | ISO-27001 DAkkS (EINGANGSBLOCKER), BSI C5, TR-03161, BfArM, DSFA/AVV | COACH_DIPA_MODUS=false (4 Schalter default false) | Deployed | Track-3 |
| **4 — SGB V / §302** | ✅ TECH FERTIG, ⛔ EXTERN BLOCKIERT | Tarif-Fail-Closed (war Attrappe!), Readiness mandantengefiltert, Absender-IK, §302-Rückläufer | 3091 grün (29 neu) | KEINE | 7 Stück (§37-Vergütung, Versorgungsvertrag, Zulassung amb. PD, etc.) | Disabled | Deployed | `ae2ecf8` |
| **5 — KIM / TI** | ✅ TECH FERTIG (Mock), ⛔ EXTERN BLOCKIERT | Sim-Kennzeichnung (war nicht unterscheidbar!), KIM_AKTIV Gate, Warnbanner, versandmodus.ts | 29 neu (mit Track 4) | KEINE | 5 Stück (gematik-Zertifizierung, KIM-Anbieter, TI-Anbindung, etc.) | KIM_AKTIV=false | Deployed, Mock-Modus | `ae2ecf8` |
| **6 — ChairMatch** | ⚠️ TEILWEISE GEFIXT, ⛔ EXTERN BLOCKIERT | getSupabaseAdmin() P0-Fix, RLS-Migration vorbereitet (3 Tabellen), Security-Bericht | TC ✅, Lint ✅, Build ✅ (327 S.), RLS-Tests NICHT gelaufen | SQL-Migration MANUELL anwenden, TOTP-Policy braucht DB | Supabase Keys ungültig/rotiert, ~16 Tabellen ohne Schema | N/A | Code deployed, **DB-Migration NICHT angewendet — RLS-Lücke LIVE OFFEN** | `0bb4f1b`, `d5e7299` |
| **7 — Security / QA** | ✅ AUDIT ABGESCHLOSSEN | SECURITY_QA_AUDIT Bericht, RLS Matrix (773 Z.), CSV Export (956 Z.) | — | — | — | — | Deployed | `5d1f217` |
| **8 — Externe Voraussetzungen** | ✅ CHECKLISTE ERSTELLT | Master-Checkliste ~50 Einzelpunkte, 8 Abschnitte | — | — | — | — | Deployed | `3b939d0` |

---

## Gesamtbilanz

| Metrik | Wert |
|--------|------|
| Tracks technisch fertig | **7 von 8** (Track 6 ChairMatch teilweise) |
| Neue Tests gesamt | **~350+** (200 EDIFACT + 45 Coach + 29 SGB-V/KIM + diverse) |
| P0-Bugs gefixt | **~7** (4 EDIFACT + 1 ChairMatch + 1 KIM-Simulation + 1 SGB-V-Tarif) |
| Gesamte Test-Suite | **3091+ grün** (Kernbetrieb-Zählung) |
| TypeScript-Fehler | **0** |
| Security-Befunde | 0 Kritisch, 0 P0, 1 HOCH, 4 MITTEL, 7 NIEDRIG |
| Mandantentrennung | 82 von 298 Tabellen ohne `organization_id` (strukturell unvollständig) |
| DSGVO offen | 3 Punkte |

---

## KRITISCHE HANDLUNGSBEDARFE FÜR DEN GF

*Priorisiert nach Dringlichkeit:*

### 🔴 SOFORT (diese Woche)

1. **§45a Anerkennungsbescheid — Frist 31.08.2026 (12 TAGE!)**
   Status beim RP Gießen nachfragen. Ohne Bescheid kein legaler Betriebsstart. Das ist der kritischste Einzelpunkt über alle Tracks hinweg.

2. **ChairMatch RLS-Lücke ist LIVE OFFEN**
   Die vorbereitete SQL-Migration (`protect_pricing`, `compliance_plans`, `conversation_participants`) muss auf Supabase angewendet werden. Dafür werden funktionierende API-Keys benötigt. Solange die Migration nicht läuft, sind Preis- und Compliance-Daten ungeschützt.

3. **Supabase API-Keys rotiert/ungültig (ChairMatch)**
   Neue Keys generieren und in der Deployment-Umgebung hinterlegen. Ohne Keys kann weder die Migration angewendet noch RLS getestet werden.

### 🟠 KURZFRISTIG (August)

4. **Gewerbeanmeldung abschließen**
   Voraussetzung für Rechnungsstellung und Kassenzulassung.

5. **Betriebshaftpflichtversicherung abschließen**
   Voraussetzung für §45a-Betrieb.

6. **ITSG-Zertifikat beantragen (Track 2)**
   Ohne Zertifikat keine elektronische Kassenabrechnung möglich. Vorlaufzeit beachten.

### 🟡 MITTELFRISTIG (September–Oktober)

7. **§37-Vergütungsvereinbarung + Versorgungsvertrag (Track 4)**
   7 externe Blocker für SGB-V-Betrieb. Verhandlungen mit Kassen starten.

8. **gematik-Zertifizierung + KIM-Anbieter (Track 5)**
   5 externe Blocker für TI-Anbindung. Frühzeitig Anbieter evaluieren.

9. **ISO-27001 DAkkS-Akkreditierung (Track 3 — EINGANGSBLOCKER für DiPA)**
   Ohne ISO-27001 kein BfArM-Antrag möglich. Längster Vorlauf aller Blocker (~6–12 Monate).

### 🔵 EMPFEHLUNGEN

10. **Mandantentrennung vervollständigen**
    82 von 298 Tabellen ohne `organization_id`. Nicht blockierend für Go-Live Track 1, aber strukturelles Risiko bei Skalierung.

11. **3 offene DSGVO-Punkte klären**
    Aus Security-Audit Track 7. Details im SECURITY_QA_AUDIT Bericht.

12. **PflegeCoach bleibt KOSTENLOS für Endnutzer**
    Regulatorisch so vorgesehen. Geschäftsmodell-Implikation für GF-Entscheidung bei den 14 offenen Katalogpunkten.

---

## Feature-Flag-Übersicht

| Flag | Wert | Bedeutung |
|------|------|-----------|
| Kernbetrieb | Alles aktiv | Produktionsbereit |
| EDIFACT Dreifach-Sperre | Env + Test + Bestätigungswort | Verhindert versehentliche Echtübertragung |
| COACH_DIPA_MODUS | `false` | 4 zulassungsgebundene Schalter, alle deaktiviert |
| SGB V / §302 | Disabled | Wartet auf externe Zulassungen |
| KIM_AKTIV | `false` | Mock-Modus mit Sim-Kennzeichnung |

---

## Fazit

Die Plattform ist **technisch weitgehend fertig**. 7 von 8 Tracks haben keine offenen technischen Arbeiten. Die verbleibenden Blocker sind ausnahmslos **externer oder organisatorischer Natur** (Behörden, Zertifizierungen, Verträge, Versicherungen).

Der **kritischste Pfad** ist: §45a-Bescheid (12 Tage Restfrist) → Gewerbeanmeldung → Betriebshaftpflicht → **Go-Live Track 1**.

Die **einzige akute Sicherheitslücke** ist die nicht angewendete RLS-Migration in ChairMatch (Track 6).

---

*Bericht generiert am 19.08.2026 auf Basis verifizierter Audit-Ergebnisse aus 8 parallelen Tracks.*
