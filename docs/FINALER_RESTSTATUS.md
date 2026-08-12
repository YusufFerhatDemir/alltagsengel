# FINALER RESTSTATUS — Alltagsengel Betriebsabnahme

**Stand:** 12.08.2026 (Fachliche Korrekturprüfung)
**Teststand:** 2029 Tests grün, 0 fehlgeschlagen, 29 übersprungen
**Typecheck:** 0 Fehler

---

## A) VOLLSTÄNDIG ERLEDIGT

Alle folgenden Bereiche sind technisch fertig, getestet und deployed:

1. **Budget-Konstanten** — VP 1685€, KZP 1854€, Gemeinsamer Jahresbetrag 3539€ (§42a SGB XI, seit 01.07.2025)
2. **Entlastungsbetrag** — 131€/Monat, 1572€/Jahr (§45b SGB XI)
3. **VP-Budgetcheck** — pruefeBudget() nutzt VP_KZP_KOMBINIERT_EUR (3539€) als Default für VP (§42a: VP allein kann bis 3539€ nutzen); pruefeVPBudget() prüft combined_used_amount gegen 3539€
4. **Feiertage** — alle 16 Bundesländer implementiert inkl. Buß- und Bettag-Berechnung (Sachsen), 70 Tests
5. **Multi-Tenancy Org-Fence** — Nachrichten (lib/ops/nachrichten.ts), Visitor-Alert (app/api/visitor-alert/route.ts), Pricing (app/api/pricing/route.ts)
6. **OPOS bezahlt-Filter** — Forderungsübersicht + API-Route filtern bezahlte Posten
7. **Mahnwesen Timezone-Fixes** — Europe/Berlin in dunning.ts + mahnung-pdf.ts
8. **DATEV Timezone-Fixes** — Europe/Berlin in datev-format.ts
9. **EDIFACT Latin1-Encoding** — korrekte Zeichensatzbehandlung
10. **Rücklastschrift Spalten-Fix** — korrigierte Darstellung
11. **Storno CAS (Compare-and-Swap)** — Race-Condition-Schutz
12. **Rechnungsnummer CAS** — atomare Nummernvergabe
13. **Audit-Trail** — PATCH + Tours force_override protokolliert
14. **Server-Timezone** — 7 Fixes (EDIFACT/DATEV/Mahnung/KPI/Kundennr/Budget/Billing)
15. **CASCADE→RESTRICT** — Pflegedoku (13 Tabellen) + VP-Budget Fremdschlüssel gehärtet
16. **Rate-Limiting** — Auth und sensible API-Routen
17. **SEPA-IDOR / Klärfall-IDOR / Dunning-IDOR** — Zugriffsprüfungen gefixt
18. **Budget EUR/100-Fix** — Cent-Korrektur in Budget-Berechnung
19. **Pflegekasse IK-Prüfziffer** — Validierung implementiert
20. **setMonth-Overflow** — Monatsberechnung korrigiert
21. **handle_new_user Rollen-Whitelist** — Sicherheitsfix
22. **MIS-Team role-Strip** — Sicherheitsfix
23. **RLS** — 244/244 Tabellen aktiv
24. **Wunddokumentation** — Modul komplett, Migration LIVE
25. **SIS-Modul** — Komplett, Migration LIVE
26. **Vitalwerte** — 10-Parameter-Modul, Migration LIVE (MDR fail-closed)
27. **Tourenplanung** — tours/tour_stops/tour_templates, Migration LIVE
28. **Medikamentenmanagement** — Komplett, Migration LIVE
29. **PflegeCoach DiPA** — Block 15a-15d (v0.2.0)
30. **Soft-Delete-Migration** — 42P17-Rekursion gefixt
31. **Phase 3 Multi-Mandant** — 65 org_fences live
32. **Stripe-Integration** — Checkout/Portal/Webhook
33. **Expansion Deutschland** — state_settings für alle 16 Bundesländer vorbereitet
34. **12 + 16 + 10 Regressionstests** — insgesamt 38 dedizierte Sicherheits-/Regressionstests

**Dokumentation erstellt:**
- DSFA_VORLAGE.md (179 Zeilen) — Datenschutz-Folgenabschätzung
- AVV_VORLAGE.md (205 Zeilen) — Auftragsverarbeitungsvertrag
- QMS_GRUNDGERUEST.md (217 Zeilen) — Qualitätsmanagementsystem
- ANLEITUNG_SEPA_CREDITOR_ID.md (89 Zeilen) — Schritt-für-Schritt Bundesbank-Antrag
- ZERTIFIZIERUNGSLEITFADEN_ITSG.md (133 Zeilen) — §302 SGB V Zulassung
- ZERTIFIZIERUNGSLEITFADEN_GEMATIK_KIM.md (164 Zeilen) — KIM-Zertifizierung
- ZERTIFIZIERUNGSLEITFADEN_DIPA_BFARM.md (159 Zeilen) — DiPA BfArM-Zulassung
- VITALWERTE_MDR_KLASSIFIZIERUNG.md (97 Zeilen) — MDR Klasse IIa Einordnung

---

## B) TECHNISCH NOCH INTERN LÖSBAR

| # | Thema | Priorität | Aufwand | §45b-Blocker |
|---|-------|-----------|---------|--------------|
| B1 | ~160 API-Routen ohne Error-Sanitizer (generische Fehlermeldungen nach außen statt Stack-Traces) | Niedrig | ~2-3 Tage | NEIN |
| B2 | MFA/TOTP-Implementation für Admin-Bereich | Mittel | ~4-6 Tage | NEIN |

**Hinweis:** Beide Punkte sind Verbesserungen, keine Blocker. Der §45b-Betrieb kann ohne sie starten.

---

## C) FACHLICHE PRÜFUNG / ECHTE DATEN BENÖTIGT

| # | Thema | Was fehlt | Nächster Schritt | §45b-Blocker |
|---|-------|-----------|------------------|--------------|
| C1 | **SEPA Creditor-ID** | Gläubiger-ID bei der Bundesbank | Antrag unter bundesbank.de/glaeubiger-id stellen (Anleitung: docs/ANLEITUNG_SEPA_CREDITOR_ID.md) | **NEIN** — nur für SEPA-Lastschrifteinzug nötig, nicht für §45b-Leistungserbringung (§45b nutzt Kostenerstattung/Rechnung, Quelle: §45b Abs. 1 S. 3 SGB XI, Deutsche Bundesbank) |
| C2 | **23 Tarife / 24 Leistungspreise** | Fachliche Prüfung der Werte gegen Vergütungsvereinbarungen | billing_tariffs und leistungspreise in Supabase gegen die unterzeichneten Vergütungsvereinbarungen der Pflegekassen abgleichen | **JA** — falsche Tarife = falsche Abrechnungen |
| C3 | **IK-Nummer Env-Variable** | INSTITUTIONSKENNZEICHEN in Vercel/Env setzen | IK 460629986 ist prüfziffer-valide; in Vercel Environment Variables als `INSTITUTIONSKENNZEICHEN` eintragen | **NEIN** — IK liegt vor, Env-Setzen ist Deployment-Checkliste (5 Min); §45b-Papierabrechnung funktioniert auch ohne (Quelle: DAK Leistungserbringer-Portal, §105 SGB XI) |
| C4 | **PfluV-Obergrenzen vs. Stundensätze** | 35€/h (aktuell konfiguriert) vs. PfluV-Obergrenzen (30€/25€) klären | Vergütungsvereinbarung prüfen: welcher Stundensatz ist vertraglich vereinbart? 35€/h ist PfluV-konform dokumentiert in docs/TARIF_VERIFIKATION.md | Klärung empfohlen |

---

## D) EXTERNE ZERTIFIKATE / ZULASSUNGEN / VERTRÄGE

| # | Thema | Was fehlt | Warum | Wer zuständig | Nächster Schritt | Produktbereich | §45b-Blocker |
|---|-------|-----------|-------|---------------|------------------|----------------|--------------|
| D1 | **ITSG-Zertifizierung** | §302 SGB V Datenannahmestelle-Zulassung | Pflicht für elektronische Abrechnung mit Pflegekassen | ITSG GmbH (Antrag + Testverfahren) | Leitfaden docs/ZERTIFIZIERUNGSLEITFADEN_ITSG.md befolgen, Antrag bei ITSG stellen | DTA | **NEIN** — §45b kann ohne DTA manuell abrechnen |
| D2 | **§302 SGB V Implementierung** | TA1/TA2-Segmentgenerierung fehlt (Block 17 ist fail-closed Gerüst) | Ohne echte ITSG-Testdaten keine korrekte Segmentkonstruktion | Entwicklung nach ITSG-Testfreischaltung | ITSG-Zertifizierung (D1) abwarten, dann Segmente implementieren | DTA | **NEIN** |
| D3 | **gematik KIM-Zertifizierung** | KIM-Clientmodul-Zulassung | Pflicht für Kommunikation im Medizinwesen (eArztbrief etc.) | gematik GmbH | Leitfaden docs/ZERTIFIZIERUNGSLEITFADEN_GEMATIK_KIM.md befolgen | KIM | **NEIN** |
| D4 | **FHIR-Profilvalidierung** | Conformance-Tests gegen HL7-DE-Profile | Pflicht für Interoperabilität im Gesundheitswesen | HL7 Deutschland / Simplifier.net | FHIR-Profile gegen hl7.org/fhir/R4 validieren | KIM/DTA | **NEIN** |
| D5 | **DiPA BfArM-Zulassung** | DiPA-Verzeichnis-Eintrag | Pflicht für digitale Pflegeanwendungen (§40a SGB XI) | BfArM (Antrag + Evidenznachweis) | Leitfaden docs/ZERTIFIZIERUNGSLEITFADEN_DIPA_BFARM.md befolgen | DiPA | **NEIN** |
| D6 | **MDR Klasse IIa** | CE-Konformitätsbewertung für Vitalwerte-Modul | Vitalwerte-Grenzwert-Alarme = Medizinprodukt (MDR 2017/745) | Benannte Stelle (z.B. TÜV, DEKRA) | Klassifizierung dokumentiert in docs/VITALWERTE_MDR_KLASSIFIZIERUNG.md; Modul bleibt fail-closed (VITALS_GRENZWERT_ALARME_AKTIV=AUS) bis Zertifizierung | DiPA | **NEIN** |
| D7 | **BSI C5 / ISO 27001** | Cloud-Sicherheitszertifizierung | Best Practice für Gesundheitsdaten; kann von Kassen gefordert werden | BSI / akkreditierter Auditor | DSFA-Vorlage (docs/DSFA_VORLAGE.md) als Grundlage nutzen | Alle | **NEIN** |
| D8 | **SFTP-Zugang Datenannahmestelle** | SFTP-Credentials der Datenannahmestelle | Benötigt für DTA-Übertragung | Pflegekasse / Datenannahmestelle | Nach ITSG-Zertifizierung (D1) bei zuständiger Datenannahmestelle beantragen | DTA | **NEIN** |
| D9 | **BITV 2.0 / WCAG** | Barrierefreiheits-Audit | Pflicht ab 2025 (BFSG) für bestimmte Dienste | Externer Auditor oder Selbstbewertung | BITV-Selbsttest durchführen, ggf. externen Audit beauftragen | DiPA | **NEIN** |
| D10 | **DSFA durchführen** | Ausgefüllte Datenschutz-Folgenabschätzung | Art. 35 DSGVO für Gesundheitsdatenverarbeitung | Datenschutzbeauftragter | Vorlage docs/DSFA_VORLAGE.md ausfüllen und vom DSB freigeben lassen | Alle | **NEIN** — Vorlage liegt vor |
| D11 | **QMS aufbauen** | Zertifiziertes Qualitätsmanagementsystem | §113 SGB XI, Landesrahmenverträge | QM-Beauftragter | Grundgerüst docs/QMS_GRUNDGERUEST.md als Ausgangspunkt | §45b | **NEIN** — QMS ist laufender Prozess |
| D12 | **AVV abschließen** | Auftragsverarbeitungsverträge mit Dienstleistern | Art. 28 DSGVO | Geschäftsführung + Datenschutzbeauftragter | Vorlage docs/AVV_VORLAGE.md mit Supabase/Vercel/Stripe ausfüllen | Alle | **NEIN** — Vorlage liegt vor |

**Wichtig:** KEIN Punkt aus Kategorie D blockiert den §45b-Start. Alle beziehen sich auf weiterführende Produktbereiche (DTA, KIM, DiPA) oder organisatorische Maßnahmen, die parallel zum Betrieb aufgebaut werden können.

---

## E) §45b START-BLOCKER — FACHLICHE NEUBEWERTUNG

### §45b START BLOCKIERT DURCH:

| # | Thema | Begründung | Quelle |
|---|-------|------------|--------|
| 1 | **§45a-Anerkennung durch Landesbehörde** | Ohne Anerkennung nach §45a SGB XI darf kein Anbieter §45b-Entlastungsleistungen abrechnen | §45b Abs. 1 S. 3 Nr. 4 SGB XI |
| 2 | **~~IK-Nummer als Env-Variable setzen~~** | ~~IK liegt vor (460629986), Env-Setzen = Deployment-Checkliste (5 Min)~~ | ~~Kein regulatorischer Blocker, §45b-Papierabrechnung ohne IK-Env möglich (DAK Leistungserbringer-Portal)~~ |
| 3 | **Tarif-Prüfung gegen PfluV-Obergrenzen** | 23 billing_tariffs / 24 leistungspreise auf Live-DB müssen fachlich geprüft werden | PfluV Hessen §3 |

### §45b START NICHT BLOCKIERT DURCH:

| # | Thema | Begründung | Quelle |
|---|-------|------------|--------|
| 1 | **SEPA Creditor-ID** | Nur für SEPA-Lastschrifteinzug von Kundenkonten; §45b-Abrechnung läuft über Kostenerstattung (Rechnung/Überweisung) | §45b Abs. 1 S. 3 SGB XI, Deutsche Bundesbank |
| 2 | **KIM/TI (Telematikinfrastruktur)** | Nur für Kommunikation im Medizinwesen (eArztbrief); nicht für §45b-Entlastungsleistungen | gematik |
| 3 | **§302 SGB V / ITSG/DTA** | §302 gilt nur für Heilmittelerbringer und zugelassene Pflegedienste (§72 SGB XI); §45b-Anbieter nach §45a rechnen per Kostenerstattung ab | §302 SGB V, §45b SGB XI |
| 4 | **DiPA (BfArM-Zulassung)** | Separate Produktkategorie nach §40a SGB XI; unabhängig von §45b | §40a SGB XI |
| 5 | **FHIR-Profilvalidierung** | Interoperabilitätsstandard; keine §45b-Voraussetzung | HL7 Deutschland |
| 6 | **MFA/TOTP** | Sicherheitsverbesserung, nicht gesetzlich vorgeschrieben für §45b | — |
| 7 | **Pentest/BSI C5/ISO 27001** | Best Practice, aber keine Voraussetzung für §45b-Anerkennung | BSI |
| 8 | **MDR Klasse IIa** | Nur für Vitalwerte-Alarme relevant (fail-closed); kein §45b-Bezug | MDR 2017/745 |
| 9 | **BITV 2.0/WCAG** | Barrierefreiheit; keine §45b-spezifische Voraussetzung | BFSG |

---

## Finale Bewertung

```
Kategorie A: 34 Punkte (vollständig erledigt)
Kategorie B:  2 Punkte (technisch intern lösbar — nicht blockierend)
Kategorie C:  4 Punkte (fachliche Prüfung / echte Daten — davon 2 KEIN Blocker)
Kategorie D: 12 Punkte (externe Zertifikate / Zulassungen — KEIN §45b-Blocker)
Kategorie E:  Fachliche Neubewertung §45b-Blocker

Teststand: 2029 Tests grün, 0 fehlgeschlagen, 29 übersprungen
Typecheck: 0 Fehler

§45b-Produktivbetrieb blockiert durch (NUR 2 echte Blocker):
  1. §45a-Anerkennung durch Landesbehörde (fachlich/behördlich)
  2. Tarif-Prüfung (23+24 Live-Werte gegen PfluV-Obergrenzen)

Deployment-Checkliste (kein Blocker, je 5 Min):
  - IK-Nummer als Env-Variable setzen (IK liegt vor)

NICHT blockiert (korrigiert gegenüber Vorversion):
  - SEPA Creditor-ID → nur für SEPA-Lastschrift, nicht für §45b
  - IK-Nummer → liegt vor, Env-Variable = Deployment-Aufgabe
  - KIM, §302, DiPA, FHIR, MFA, BSI, MDR, BITV → spätere Module

Fachliche Korrekturprüfung (12.08.2026):
  - VP-Budget-Default korrigiert: VP_JAEHRLICH_EUR → VP_KZP_KOMBINIERT_EUR
    (pruefeBudget nutzt jetzt 3539€ statt 1685€ für VP, §42a)
  - 7 neue Tests für §42a Gemeinsamer Jahresbetrag ergänzt
  - SEPA Creditor-ID als §45b-Blocker entfernt (Quelle: §45b SGB XI, Bundesbank)
  - IK-Nummer als §45b-Blocker entfernt (Quelle: DAK Leistungserbringer-Portal)
  - §45b-Papierabrechnung ohne DTA/IK-Env bestätigt (Quelle: DAK §45b-Abrechnungsseite)
```
