# DiPA-Regulatorik-Analyse: „Digitaler PflegeCoach"

**Datum:** 2026-08-09
**Erstellt von:** DiPA/BfArM-Regulatory-Agent (automatisierte Analyse)
**Firma:** Alltagsengel UG (haftungsbeschränkt), Neue Mainzer Straße 66-68, 60311 Frankfurt am Main
**IK-Nummer:** 460629986
**Geprüfte Codebases:** `/Users/work/alltagsengel` (Next.js + Supabase), `/Users/work/efy-care` (Expo/React Native + Supabase)

> **Methodischer Hinweis:** Alle regulatorischen Aussagen basieren auf öffentlich zugänglichen offiziellen Quellen (BfArM, GKV-Spitzenverband, BSI, Gesetzestexte), Stand der Recherche 09.08.2026. Aussagen, die nicht direkt aus einer offiziellen Quelle verifiziert werden konnten, sind als **OFFENE REGULATORISCHE FRAGE (ORF)** markiert. Dieses Dokument ist keine Rechtsberatung. Vor der Antragstellung ist eine BfArM-Beratung (Teil 5) und ggf. eine spezialisierte Kanzlei einzubinden.

---

## TEIL 1 — REGULATORISCHE GRUNDLAGEN

### 1.1 Rechtsrahmen im Überblick

| Norm | Inhalt | Relevanz für PflegeCoach |
|---|---|---|
| **§ 40a SGB XI** | Definition DiPA: Anwendungen, die wesentlich auf digitalen Technologien beruhen und von Pflegebedürftigen oder in Interaktion von Pflegebedürftigen, Angehörigen und zugelassenen ambulanten Pflegeeinrichtungen genutzt werden, um Beeinträchtigungen der Selbständigkeit oder der Fähigkeiten zu mindern oder einer Verschlimmerung der Pflegebedürftigkeit entgegenzuwirken | Kerndefinition — Zweckbestimmung muss hierauf einzahlen |
| **§ 40b SGB XI** | Leistungsanspruch: **53 € monatlich gesamt** (seit 01/2025; davor 50 €). Davon: Erstattung für DiPA nach § 40a **bis 40 €/Monat**, ergänzende Unterstützungsleistungen nach § 39a **bis 30 €/Monat** — gemeinsame Obergrenze 53 € | Definiert Preis-Obergrenze des Geschäftsmodells |
| **§ 39a SGB XI** | Ergänzende Unterstützungsleistungen bei Nutzung von DiPA durch ambulante Pflegeeinrichtungen | Potenzielle Zusatzrolle für Alltagsengel als Leistungserbringer (siehe ORF-1) |
| **§ 78a SGB XI** | Verträge über DiPA, DiPA-Verzeichnis beim BfArM, Verordnungsermächtigung; Abs. 2: Rahmenvereinbarung; Abs. 6a: **vorläufige Aufnahme**; Abs. 7: Datensicherheitsnachweis (BSI TR-03161) | Verfahrensgrundlage |
| **DiPAV** (verkündet 06.10.2022) | Verfahren der Erstattungsfähigkeitsprüfung; Anlage 1 (Sicherheit/Datenschutz-Fragebogen), Anlage 2 (Qualitätsanforderungen inkl. Interoperabilität) | Detailanforderungen für den Antrag |
| **1. DiPAV-ÄndV** (in Kraft **01.07.2026**) | Wesentliche Neuerungen: (a) DiPA können auch **Angehörige und sonstige ehrenamtlich Pflegende** unterstützen — Nutzen wie Stabilisierung der häuslichen Versorgung oder Entlastung bei Pflegeaufgaben, **ohne zwingenden direkten Effektnachweis beim Pflegebedürftigen**; (b) **vorläufige Aufnahme** ins Verzeichnis für bis zu **12 Monate** mit wissenschaftlichem Evaluationskonzept | Strategisch zentral: Erprobungspfad + erweiterte Zielgruppe |
| **BfArM DiPA-Leitfaden** | Aktuelle Version **1.3 vom 15.07.2026** (PDF, bfarm.de) — berücksichtigt die 1. DiPAV-ÄndV | Maßgebliches Auslegungsdokument |
| **Rahmenvereinbarung nach § 78a Abs. 2 SGB XI** | Durch Schiedsstelle festgesetzt, in Kraft seit **22.06.2023** (GKV-Spitzenverband); regelt Maßstäbe für Vergütungsvereinbarungen und technisch-vertragliche Rahmenbedingungen | Grundlage der späteren Preisverhandlung mit dem GKV-SV |
| **§ 78a Abs. 7 SGB XI / § 139e Abs. 10 SGB V analog** | Seit **01.01.2025**: Zertifikat über Erfüllung der **BSI TR-03161** ist Voraussetzung für Neuaufnahme ins DiPA-Verzeichnis | Harte technische Zulassungsvoraussetzung |
| **BSI TR-03161** | „Sicherheitsanforderungen an Anwendungen im Gesundheitswesen", 3 Teile (Mobile Apps / Backend / Hintergrundsysteme); Zertifizierung über akkreditierte Prüfstellen | Pflicht-Zertifikat |
| **BFSG** (Barrierefreiheitsstärkungsgesetz) | Seit **28.06.2025** in Kraft; Umsetzung des European Accessibility Act; verpflichtet Verbraucher-Apps/-Websites zur Barrierefreiheit nach **EN 301 549** | Gilt für die App unabhängig von der DiPA-Listung |
| **BITV 2.0 / EN 301 549 (V3.2.1) / WCAG 2.1 AA** | EN 301 549 referenziert WCAG 2.1 Level AA für Web und Apps; BITV 2.0 verweist auf EN 301 549 | Technischer Barrierefreiheits-Maßstab |
| **DSGVO Art. 9** | Gesundheitsdaten = besondere Kategorie; ausdrückliche Einwilligung erforderlich | Datenschutz-Grundlage |

### 1.2 Verfahren beim BfArM (Ist-Stand)

- Antragstellung erfolgt über das **elektronische DiGA-/DiPA-Antragsportal** des BfArM.
- Das BfArM bietet über das **Innovationsbüro** kostenpflichtige Beratungen zu DiPA an (Themen laut BfArM: technische Anforderungen, Datenschutz/Datensicherheit, Verfahrensfragen, Nachweis des pflegerischen Nutzens). **Empfehlung: Kick-off-Beratung VOR Antragstellung** — das Fragenpaket dafür steht in Teil 5.
- Für DiPA, die **keine Medizinprodukte** sind, verlangt Anlage 1 DiPAV eine **Begründung, warum kein Medizinprodukt vorliegt**; die Sicherheitsanforderungen orientieren sich an den MDR-Anforderungen für **Klasse-I-Produkte** (QMS, Risikomanagement, Produktlebenszyklus-Prozesse).
- Laut Prüfstellen-/Fachquellen werden für DiPA-Hersteller ein **ISMS-Zertifikat (ISO 27001)** und ein **Penetrationstest** zum Antragszeitpunkt erwartet. **ORF-2:** Ob für die Alltagsengel UG als Kleinsthersteller das ISO-27001-Zertifikat bereits zum Zeitpunkt der *vorläufigen* Aufnahme (§ 78a Abs. 6a) vorliegen muss oder Übergangsfristen greifen → in BfArM-Beratung klären (Leitfaden V1.3 im Original prüfen).
- **Vergütung:** Nach Aufnahme verhandelt der Hersteller mit dem GKV-Spitzenverband einen Vergütungsbetrag (§ 78a Abs. 1 SGB XI); Maßstäbe ergeben sich aus der Rahmenvereinbarung. Erstattungsdeckel für Versicherte: 40 €/Monat (DiPA-Anteil) innerhalb des 53-€-Budgets nach § 40b.

### 1.3 Marktlage (unsicher — mit Vorsicht)

- **ORF-3:** Die genaue Zahl der aktuell im DiPA-Verzeichnis gelisteten Anwendungen konnte nicht aus einer offiziellen BfArM-Quelle verifiziert werden. Dritte Quellen (Stand 2026) nennen gelistete/erwartete Apps in den Bereichen Sturzprävention, Gedächtnistraining, Medikamentenmanagement, Ernährungsberatung und Mobilitätsförderung; erste Aufnahmen über den vorläufigen Pfad wurden für 2026 erwartet. **Vor der Positionierung: aktuelles Verzeichnis unter https://diga.bfarm.de bzw. dem DiPA-Verzeichnis des BfArM einsehen.**

### 1.4 Quellen (Teil 1)

- BfArM DiPA-Leitfaden V1.3 (15.07.2026): https://www.bfarm.de/SharedDocs/Downloads/DE/Medizinprodukte/dipa_leitfaden.html
- BfArM DiPA-Übersicht: https://www.bfarm.de/DE/Medizinprodukte/Aufgaben/DiGA-und-DiPA/DiPA/_node.html
- BfArM Wissenswertes zu DiPA: https://www.bfarm.de/DE/Medizinprodukte/Aufgaben/DiGA-und-DiPA/DiPA/Wissenswertes/_artikel.html
- BfArM Beratung DiGA/DiPA (Innovationsbüro): https://www.bfarm.de/DE/Das-BfArM/Aufgaben/Innovationsbuero/Beratungsformate/Beratung-DiGA-DiPA/_node.html
- DiPAV Volltext: https://www.gesetze-im-internet.de/dipav/BJNR156800022.html
- § 40a SGB XI: https://www.sozialgesetzbuch-sgb.de/sgbxi/40a.html — § 40b: https://www.sozialgesetzbuch-sgb.de/sgbxi/40b.html — § 78a: https://www.sozialgesetzbuch-sgb.de/sgbxi/78a.html
- GKV-SV DiPA-Seite: https://www.gkv-spitzenverband.de/pflegeversicherung/pv_digitalisierung/dipa.jsp
- Rahmenvereinbarung § 78a Abs. 2 SGB XI (PDF): https://www.gkv-spitzenverband.de/media/dokumente/pflegeversicherung/dipa/20230530_DiPA_Rahmenvereinbarung_nach_78a_Absatz_2_SGB_XI.pdf
- BSI TR-03161: https://www.bsi.bund.de/DE/Themen/Unternehmen-und-Organisationen/Standards-und-Zertifizierung/Technische-Richtlinien/TR-nach-Thema-sortiert/tr03161/tr-03161.html
- EN 301 549 / BITV: https://www.barrierefreiheit-dienstekonsolidierung.bund.de/Webs/PB/DE/gesetze-und-richtlinien/en301549/en301549-node.html
- Pharma Deutschland zu Leitfaden V1.3 / 1. DiPAV-ÄndV: https://www.pharmadeutschland.de/newsroom/news/aktualisierter-dipa-leitfaden-des-bfarm-veroeffentlicht/

---

## TEIL 2 — PRODUKTDEFINITION „Digitaler PflegeCoach"

### 2.1 Zielgruppe

**Primäre Nutzergruppen (Doppelzielgruppe, ermöglicht durch 1. DiPAV-ÄndV):**

1. **Pflegebedürftige der Pflegegrade 1–5** in häuslicher Versorgung, die kognitiv und sensorisch in der Lage sind, eine App (ggf. mit Unterstützung) zu bedienen. Schwerpunkt: **Pflegegrade 1–3** (höchste Selbständigkeitspotenziale, größte Zielgruppe für Erhalt von Fähigkeiten).
2. **Pflegende Angehörige und sonstige ehrenamtlich Pflegende** dieser Personen — seit der 1. DiPAV-ÄndV eigenständig adressierbar (Nutzenkategorien: Stabilisierung der häuslichen Versorgung, Entlastung bei Pflegeaufgaben).

**Nicht Zielgruppe:** Personen ohne Pflegegrad (kein Leistungsanspruch nach § 40b), stationär Versorgte, professionelle Pflegefachkräfte als Endnutzer (die efy-care-B2B-Funktionalität ist ausdrücklich NICHT Teil des Produkts, siehe 2.4).

**ORF-4:** Ob Pflegegrad 1 vom Anspruch nach § 40b vollständig erfasst ist (Leistungsausschlüsse bei PG 1 betreffen andere Leistungsarten), im Leitfaden V1.3 / bei der Pflegekasse verifizieren.

### 2.2 Pflegerischer Nutzen (konkret, messbar)

Der PflegeCoach adressiert zwei Nutzendimensionen gemäß § 40a SGB XI und DiPAV:

**A) Für Pflegebedürftige — „Minderung von Beeinträchtigungen der Selbständigkeit, Entgegenwirken einer Verschlimmerung":**
- Strukturierte **Sturzprävention** (angeleitete Übungsprogramme, Wohnraum-Checklisten) → messbar: Sturzangst (FES-I Kurzform), Mobilitätsselbsteinschätzung, Sturzereignisse (Selbstbericht)
- **Alltagsstrukturierung und Erinnerungsfunktionen** (Trinken, Bewegung, Medikamenteneinnahme-Erinnerung als Organisationshilfe) → messbar: Adhärenz zu selbst gesetzten Alltagszielen, Trink-/Bewegungsprotokoll
- **Anleitung zu Selbstversorgungs-Techniken** (Transfer, Körperpflege-Hilfsmittel, Energiemanagement) → messbar: Selbständigkeits-Selbsteinschätzung in Alltagsmodulen

**B) Für pflegende Angehörige — „Stabilisierung der häuslichen Versorgung, Entlastung":**
- **Mikro-Schulungen** zu Pflegetechniken (rückenschonender Transfer, Umgang mit herausforderndem Verhalten bei Demenz, Ernährung/Flüssigkeit) → messbar: Pflegekompetenz-Selbsteinschätzung, Handlungssicherheit
- **Entlastungs-Coaching** (Selbstsorge-Module, Wegweiser zu Entlastungsleistungen wie § 45b Entlastungsbetrag [131 €/Monat seit Pflegereform 2025], Verhinderungspflege) → messbar: subjektive Belastung (z. B. HPS/BSFC-s — validierte Häusliche-Pflege-Skala Kurzform), Inanspruchnahme von Entlastungsangeboten
- **Strukturiertes Pflege-Tagebuch** (gemeinsame Dokumentation Alltag/Auffälligkeiten, vorbereitend z. B. für MD-Begutachtung) → messbar: Nutzungsrate, wahrgenommene Vorbereitung/Kontrolle

**Wichtig (Anti-Marketing-Regel):** Es wird KEIN medizinischer Outcome behauptet (keine Sturz*reduktion* als Wirkversprechen, keine Krankheitsbesserung). Der Nutzen wird als **pflegerischer Nutzen** im Sinne der DiPAV formuliert und im Rahmen der Evaluation (Teil 6) erst nachgewiesen.

### 2.3 Zweckbestimmung (regulatorisch präzise, Entwurf)

> „Der Digitale PflegeCoach ist eine digitale Pflegeanwendung im Sinne des § 40a SGB XI. Er unterstützt Pflegebedürftige der Pflegegrade 1 bis 5 in häuslicher Versorgung sowie deren pflegende Angehörige und sonstige ehrenamtlich Pflegende durch strukturierte Anleitungs-, Schulungs-, Erinnerungs- und Dokumentationsfunktionen dabei, Beeinträchtigungen der Selbständigkeit oder der Fähigkeiten des Pflegebedürftigen zu mindern, einer Verschlimmerung der Pflegebedürftigkeit entgegenzuwirken und die häusliche Versorgung zu stabilisieren sowie pflegende Angehörige bei Pflegeaufgaben zu entlasten.
> Der Digitale PflegeCoach dient nicht der Erkennung, Verhütung, Überwachung, Vorhersage, Prognose, Behandlung oder Linderung von Krankheiten, Verletzungen oder Behinderungen und trifft keine diagnostischen oder therapeutischen Entscheidungen. Er ersetzt keine ärztliche oder pflegefachliche Beratung."

Der zweite Absatz ist die **Negativabgrenzung zur MDR** und muss in App, Begleitmaterial und Antrag konsistent verwendet werden.

### 2.4 Produktgrenze

**GEHÖRT ZUM PRODUKT (DiPA-Scope):**
- Kursmodule (Sturzprävention, Mobilität im Alltag, Pflegetechniken für Angehörige, Demenz-Alltagskompetenz, Ernährung/Flüssigkeit, Selbstsorge)
- Erinnerungs-/Routinenfunktion (Trinken, Bewegung, Medikamenten-Einnahmezeiten als **Organisationshilfe** ohne Dosier-/Wechselwirkungslogik)
- Pflege-Tagebuch und Checklisten (inkl. Wohnraum-Sicherheits-Check)
- Fortschritts-/Nutzungsübersicht für den Nutzer
- Datenexport (menschenlesbar als PDF + maschinenlesbar/interoperabel)
- Optionale geteilte Nutzung Pflegebedürftiger ↔ Angehöriger (Einwilligungsbasiert)

**GEHÖRT AUSDRÜCKLICH NICHT ZUM PRODUKT:**
- Alle B2B-/Betriebsfunktionen von Alltagsengel (Einsatzplanung, Abrechnung, DTA/Dakota, Personalverwaltung, MIS, Admin-Dashboard)
- Alle efy-care-Funktionen (Leistungserfassung, Prüfzentrale, EDIFACT-Abrechnung, OCR, Verordnungsverwaltung)
- Vermittlung/Buchung von Alltagsengel-Dienstleistungen (strikte Trennung — sonst Interessenkonflikt-/Werbe-Problematik im DiPA-Verzeichnis; Anlage 2 DiPAV enthält Anforderungen zum Verbraucherschutz/werbefreier Kernfunktion — **ORF-5:** exakte Werbefreiheits-Anforderungen der Anlage 2 im Originaltext prüfen)
- Vitalparameter-Messung, Sensorik, Telemonitoring
- Medikamenten-Dosierungsempfehlungen, Wechselwirkungsprüfung, Symptom-Checker, KI-Diagnostik (→ wären MDR-relevant)
- Notruf-/Alarmfunktionen mit Gefahrenabwehr-Anspruch
- Kommunikation mit Ärzten/Verordnungswesen

### 2.5 Medizinprodukt-Abgrenzung (warum KEIN Medizinprodukt)

Rechtslage: **Eine DiPA kann, muss aber kein Medizinprodukt sein.** Maßgeblich ist die **Zweckbestimmung des Herstellers** (Art. 2 Nr. 1, Nr. 12 MDR). Stimmt die Zweckbestimmung mit keinem der MDR-Zwecke überein (Diagnose, Verhütung, Überwachung, Vorhersage, Prognose, Behandlung oder Linderung von Krankheiten etc.), ist die DiPA Nicht-Medizinprodukt. Für Nicht-Medizinprodukte verlangt **Anlage 1 DiPAV** eine Begründung, warum kein Medizinprodukt vorliegt; die dortigen Sicherheitsanforderungen orientieren sich an MDR-Klasse-I-Niveau (QMS, Risikomanagement, Lebenszyklus).

**Begründungslinie für den PflegeCoach:**
1. Zweckbestimmung ist ausschließlich **pflegerisch-organisatorisch** (Selbständigkeit, Alltagskompetenz, Entlastung) — keine medizinische Zweckbestimmung.
2. Keine Verarbeitung von Daten zur **Erkennung oder Behandlung von Krankheiten**; das Tagebuch ist Gedächtnis-/Organisationsstütze des Nutzers, keine diagnostische Auswertung.
3. Erinnerungsfunktion für Medikamente ist reine **Kalender-/Organisationsfunktion** ohne pharmakologische Logik (keine Dosisberechnung, keine Wechselwirkungen, keine Einnahmeempfehlung) — vergleichbar einem Wecker.
4. Übungsprogramme sind **allgemeine Bewegungs- und Alltagsanleitungen**, keine individualisierte Therapie; keine algorithmische Anpassung anhand von Gesundheitszustandsdaten.

**Rote Linien (würden MDR auslösen):** individualisierte Übungsanpassung anhand erfasster Gesundheitsdaten, Sturz-*Risiko-Scoring*, Erinnerung mit Dosierlogik, Auswertung des Tagebuchs mit Hinweischarakter („Anzeichen für…"). Diese Features sind im Produkt gesperrt und in der Roadmap als „MDR-Trigger" markiert.

**ORF-6:** Grenzfall „kognitives Training/Gedächtnisübungen": je nach Ausgestaltung kann dies als Minderung krankheitsbedingter Beeinträchtigung (Demenz) MDR-nah interpretiert werden. Vor Aufnahme solcher Module: BfArM-Beratung (Frage 6 in Teil 5).

### 2.6 Risikoklasse

- **Als Nicht-Medizinprodukt: keine MDR-Risikoklasse.** Nachweisregime = Anlage 1 DiPAV (angelehnt an MDR-Klasse-I-Anforderungen) + Anlage 2 DiPAV + BSI TR-03161.
- **Fallback:** Sollte das BfArM die Zweckbestimmung als medizinisch einstufen, wäre der PflegeCoach voraussichtlich **MDR Klasse I** (Software ohne diagnostisch/therapeutische Entscheidungsfunktion; MDR Regel 11 würde bei Informationslieferung für Diagnose/Therapie Klasse IIa auslösen — genau das wird per Produktgrenze ausgeschlossen). **ORF-7:** Fallback-Einstufung ist eine Einschätzung, keine verifizierte Behördenaussage — in BfArM-Beratung absichern.
- **KI-Hinweis:** Der bestehende Alltagsengel-„Beratungs-Chat" (`app/api/beratung-chat/`, OpenAI) wird NICHT Teil des DiPA-Produkts. Generative KI im Produkt würde zusätzliche Fragen (AI Act, Transparenzpflichten, BfArM-Anforderungen an KI-Komponenten) auslösen — für MVP ausgeschlossen.

---

## TEIL 3 — ANFORDERUNGEN UND IST-STAND

Bewertungsgrundlage: Code-Inventar beider Codebases (Details siehe Anhang A) gegen die Anforderungskategorien der DiPAV. Da der PflegeCoach als Produkt **noch nicht existiert**, bewertet „Status" die vorhandene technische Basis, auf der er aufgebaut würde.

### 3.1 Datenschutz (DSGVO, Art.-9-Gesundheitsdaten) — **Status: TEILWEISE**

| Anforderung | Ist-Stand | Bewertung |
|---|---|---|
| Ausdrückliche Einwilligung Art. 9 Abs. 2 lit. a, nachweisbar (Art. 7 Abs. 1) | Alltagsengel: AGB-Consent persistiert (`profiles.agb_accepted_at`, Migration `20260808160000`); Cookie-Consent nur clientseitig (localStorage); MIS-Consent-Datenmodell vorhanden (`mis_privacy_consents`, `mis_privacy_audit_log`). efy-care: nur Hinweistext bei Registrierung, **kein Opt-in-Log** | TEILWEISE — serverseitiger, versionierter Einwilligungs-Record für Gesundheitsdaten fehlt als Produktfeature |
| Datenschutzerklärung produktspezifisch | Vorhanden für Web (Alltagsengel `app/datenschutz/page.tsx`); für PflegeCoach neu zu erstellen (DiPA-spezifische Zwecke, Empfänger, Speicherfristen) | OFFEN |
| Betroffenenrechte Art. 15–20 technisch umgesetzt | Löschung Art. 17: Alltagsengel vorhanden (`app/api/user/delete/`, Soft-Delete + Widerrufsfrist); efy-care: fehlt. Auskunft/Export Art. 15/20: kein Self-Service | TEILWEISE |
| AVV mit allen Auftragsverarbeitern (Supabase, Vercel, Push-Dienste) | AVV-Klausel für Alltagsbegleiter in AGB (§ 15) vorhanden; AVV-Dokumentation für Hosting-Kette nicht im Repo | UNKLAR — Verträge außerhalb Codebase, für Antrag zusammenstellen |
| Verarbeitung ausschließlich zu DiPAV-zulässigen Zwecken, keine Werbung mit Gesundheitsdaten | Alltagsengel-Website nutzt Meta/TikTok-Pixel, GTM — **im DiPA-Produkt unzulässig/riskant**; PflegeCoach muss tracker-frei konzipiert sein | OFFEN — harte Trennung erforderlich |
| Datenverarbeitung in EU/EWR | Supabase-Projekte: efy care in eu-west-1 dokumentiert; Alltagsengel-Region + Subprozessoren (Resend, OpenAI, Sentry) für DiPA-Scope prüfen | UNKLAR |
| Datenschutz-Folgenabschätzung (Art. 35) | Nicht vorhanden | OFFEN — für Art.-9-Verarbeitung praktisch obligatorisch |

**ORF-8:** Die exakten Datenschutz-Prüfkriterien für DiPA (analoges Instrument zu den DiGA-Datenschutzkriterien nach § 139e SGB V) — welcher Kriterienkatalog in welcher Version zum Antragszeitpunkt gilt — im Leitfaden V1.3 verifizieren.

### 3.2 Datensicherheit — **Status: TEILWEISE**

| Anforderung | Ist-Stand | Bewertung |
|---|---|---|
| **BSI TR-03161-Zertifikat (Pflicht seit 01.01.2025 für Neuaufnahmen)** | Nicht vorhanden; keine Vorbereitung erkennbar | **OFFEN — kritischster Einzelposten** (Prüfstelle beauftragen, Aufwand Monate) |
| ISMS (ISO 27001) | Nicht vorhanden | OFFEN (siehe ORF-2 zu Fristen) |
| Penetrationstest | Nicht dokumentiert | OFFEN |
| Transportverschlüsselung, Security-Header | Alltagsengel: stark (HSTS 2 Jahre + preload, CSP, X-Frame-Options DENY in `next.config.ts:141–175`). efy-care-Website: schwach (nur 2 Header, kein HSTS/CSP in `vercel.json`) | TEILWEISE |
| Authentifizierung inkl. **2. Faktor** | Beide Apps: nur E-Mail+Passwort. Alltagsengel: gute Passwort-Policy (zxcvbn, `lib/password-validation.ts`) + serverseitiges Rate-Limiting. efy-care: nur 6-Zeichen-Minimum, kein Reset-Flow. **MFA fehlt in beiden.** Achtung: Investor-Seite behauptet MFA (`app/investor/en/product-technology/page.tsx:186`) — Widerspruch beseitigen | OFFEN — TR-03161 verlangt für sensible Daten starke Authentifizierung; MFA einplanen |
| Datenbankzugriffsschutz (RLS) | Alltagsengel: 605 Policies, mehrfache Härtungsaudits (u. a. `audit/SECURITY-RELEASE-REPORT_2026-08-09.md`: P0=0, P1=0). efy-care: 185 Policies | ERFÜLLT (für bestehende Scopes; PflegeCoach-Tabellen neu mit RLS aufzusetzen) |
| Verschlüsselung at rest | Plattform-Level (Supabase); keine anwendungsseitige Feldverschlüsselung. efy-care: Session-Store AES-256-CTR — **ohne Integritätsschutz (kein GCM/HMAC), statischer Counter** (`app/src/lib/aesEnvelope.ts`) → für TR-03161 nachbessern (AEAD) | TEILWEISE |
| Revisionssicheres Audit-Logging | Alltagsengel: append-only `mis_audit_log` mit 10-Jahres-Retention (`supabase/migrations/20260417_admin_audit_log.sql`) | ERFÜLLT (Muster übertragbar) |

### 3.3 Interoperabilität — **Status: OFFEN**

- DiPAV-Anforderung (Anlage 2): DiPA müssen Daten **menschenlesbar/druckbar UND maschinenlesbar in interoperablem Format** bereitstellen können.
- Ist-Stand: PDF-Erzeugung vorhanden (Alltagsengel Rechnungs-/Leistungsnachweis-PDFs; efy-care `expo-print`), EDIFACT für Abrechnung — aber **kein FHIR, kein HL7, kein MIO** in beiden Codebases.
- **ORF-9:** Ob für DiPA konkret **FHIR-Profile oder MIOs** (medizinische Informationsobjekte der KBV/mio42) vorgeschrieben sind oder ein „offenes, dokumentiertes, maschinenlesbares Format" (z. B. strukturiertes JSON mit veröffentlichtem Schema) genügt, ist aus den recherchierten Sekundärquellen nicht abschließend verifizierbar. Für DiGA gelten §§ 5, 6 DiGAV mit Verweis auf im Interoperabilitätsverzeichnis (gematik/INA) gelistete Standards — ob die DiPAV-Anlage 2 identische Verbindlichkeit hat: **in BfArM-Beratung klären (Frage 9, Teil 5).** Bis dahin Planungsannahme: Export mindestens als PDF + strukturiertes, dokumentiertes JSON; FHIR-Mapping (z. B. Questionnaire/QuestionnaireResponse, CarePlan) als Architektur-Option vorsehen.

### 3.4 Barrierefreiheit (WCAG 2.1 AA / EN 301 549 / BITV 2.0) — **Status: OFFEN**

- Rechtslage: BFSG seit 28.06.2025 für Verbraucher-Apps; DiPAV Anlage 2 enthält Barrierefreiheits-/Nutzerfreundlichkeitsanforderungen (Zielgruppe Hochaltrige!). Maßstab: EN 301 549 V3.2.1 → WCAG 2.1 AA.
- Ist-Stand Alltagsengel: aria-Attribute in 38 Dateien, aber **keine Schriftgrößen-Einstellung, kein Kontrastmodus; Dark-Mode ist hart erzwungen und Nutzer-/OS-Anpassung wird aktiv blockiert** (`app/layout.tsx:106–136`, darkreader-lock) — für die Zielgruppe Senioren direkt anforderungswidrig.
- Ist-Stand efy-care: nur 13 accessibility-Props, feste Schriftgrößen ohne Dynamic-Type-Unterstützung (`app/src/theme/theme.ts`), kein Kontrastmodus.
- Konsequenz: Der PflegeCoach braucht ein **eigenes, von Grund auf barrierefreies UI** (Mindestschriftgröße, Skalierung bis 200 %, Kontrast ≥ 4,5:1, Screenreader-Support VoiceOver/TalkBack, Touch-Ziele ≥ 44 pt, einfache Sprache, BITV-Test vor Pilot).

### 3.5 Datenexport / Portabilität — **Status: OFFEN**

- Kein Self-Service-Export (Art. 20 DSGVO / DiPAV-Exportanforderung) in beiden Codebases; nur der Audit-Aktionstyp `data_export` (`lib/audit-log.ts:44`) und ein UI-Label existieren.
- Für den PflegeCoach als Produktanforderung: Export aller Nutzerdaten (Tagebuch, Kursfortschritt, Erinnerungshistorie) als PDF (menschenlesbar) + JSON (maschinenlesbar) direkt aus der App, ohne Support-Kontakt.

### 3.6 Nachweisführung / Evidenz (pflegerischer Nutzen) — **Status: OFFEN**

- Es existieren keine Studien, keine Evaluationsdaten, kein wissenschaftlicher Partner.
- Pfad: **vorläufige Aufnahme nach § 78a Abs. 6a SGB XI** (bis 12 Monate) mit wissenschaftlichem Evaluationskonzept → Nutzennachweis währenddessen erbringen. Konzeptgerüst: Teil 6.
- **ORF-10:** Anforderungen an Studiendesign für den endgültigen Nutzennachweis (Vergleichsgruppe? quantitative vergleichende Studie wie bei DiGA? oder niedrigschwelligere Methodik für DiPA?) — der DiPA-Leitfaden V1.3 konkretisiert dies; Original-PDF vor Konzeptfinalisierung auswerten (Frage 12, Teil 5).

### 3.7 Zusammenfassung Teil 3

| Kategorie | Status |
|---|---|
| Datenschutz | TEILWEISE |
| Datensicherheit | TEILWEISE (TR-03161-Zertifikat: OFFEN, kritisch) |
| Interoperabilität | OFFEN (+ ORF-9) |
| Barrierefreiheit | OFFEN |
| Datenexport | OFFEN |
| Evidenz | OFFEN |

---

## TEIL 4 — ARCHITEKTUR-BEWERTUNG

**Variante A:** EIN gemeinsames DiPA-Produkt (eigenständiges Modul/Deployment „PflegeCoach"), erreichbar aus der Alltagsengel-App und aus efy care (White-Label-Einstieg).
**Variante B:** ZWEI getrennte DiPA-Produkte (je Marke eines) auf gemeinsamer Codebasis.

| Kriterium | Variante A (ein Produkt) | Variante B (zwei Produkte) |
|---|---|---|
| **BfArM-Risiko** | Ein Antrag, eine Produktidentität. Risiko: BfArM könnte die Einbettung in zwei Marken-Apps als unklare Produktabgrenzung werten → sauber lösbar über eigenständige App/eigenes Deployment mit eigener Versionsnummer, die aus beiden Apps nur verlinkt/geöffnet wird | Zwei vollständige Verfahren; Risiko widersprüchlicher Bescheide; „identische App unter zwei Namen" kann Fragen zur Eigenständigkeit aufwerfen |
| **Studienaufwand** | 1 Evaluationskonzept, 1 Pilotkohorte, 1 Nutzennachweis | 2 Evaluationen ODER Übertragbarkeitsargumentation (regulatorisch ungesichert, ORF) — faktisch doppelter Aufwand |
| **Zulassungsaufwand** | 1× TR-03161-Zertifikat, 1× Anlage-1/2-Nachweise, 1× Vergütungsverhandlung | Alles doppelt (TR-03161-Zertifikate sind produktbezogen), doppelte Gebühren und Pflegemaßnahmen bei Änderungsanzeigen |
| **Versionskontrolle** | Eine versionierte Produkteinheit; Änderungsanzeigen nach DiPAV nur einmal | Zwei Release-Stränge synchron zu halten; jede wesentliche Änderung zweimal anzeigen |
| **Datenschutz** | Ein Verantwortlicher (Alltagsengel UG), ein Verarbeitungsverzeichnis, eine DSFA. Wichtig: Datentrennung vom B2B-Bestand (eigenes Supabase-Projekt empfohlen — NICHT nnwyktkqibdjxgimjyuq mitnutzen, keine Vermischung mit Betriebsdaten) | Zwei Verantwortlichkeits-Setups oder komplexe Joint-Controller-Konstruktion zwischen den Produkten |
| **Wartung** | Eine Codebase, ein Security-Patching-Strang, ein Pentest-Zyklus | Doppelte Pflege trotz gemeinsamer Basis (Zertifikate/Nachweise bleiben getrennt) |
| **Abrechnung** | Eine Vergütungsverhandlung mit GKV-SV, eine Preisposition im 40-€-Rahmen | Zwei Verhandlungen; Gefahr, sich selbst Preisanker zu setzen |
| **Nutzerführung** | Einheitliches, barrierefreies Produkt-UI unabhängig vom Einstiegspunkt; klare Produktidentität im Verzeichnis | Marken-konsistent je App, aber doppelte UX-Pflege und Verwechslungsgefahr im Verzeichnis |

**Empfehlung: Variante A** — ein eigenständiges DiPA-Produkt „Digitaler PflegeCoach" als **separates Deployment mit eigener Produktversion, eigenem Datenbestand (eigenes Supabase-Projekt) und eigener Datenschutzerklärung**. Die bestehenden Apps dienen nur als Einstiegspunkte (Deep-Link/SSO-Übergabe mit erneuter, produktbezogener Einwilligung). Begründung: halbierter Zulassungs-, Studien- und Wartungsaufwand bei beherrschbarem Abgrenzungsrisiko; die Produktgrenze (2.4) ist ohnehin Antragsvoraussetzung.

**Zusatz-Governance-Punkt:** efy care ist ein B2B-Werkzeug für Pflegedienste (Konkurrenzprodukt-Projekt). Wenn der PflegeCoach aus efy care heraus angeboten wird, ist vertraglich zu klären, wer Hersteller im Sinne der DiPAV ist (Alltagsengel UG als alleiniger Hersteller empfohlen; efy care nur Vertriebskanal). **ORF-11:** Zulässigkeit und Ausgestaltung von White-Label-/Mehrkanal-Vertrieb einer gelisteten DiPA → BfArM-Beratung (Frage 15).

---

## TEIL 5 — BfArM-FRAGENPAKET (für Beratung im Innovationsbüro)

**Verfahren & Zeitplan**
1. Ist der Pfad „vorläufige Aufnahme nach § 78a Abs. 6a SGB XI" für ein Produkt möglich, das zum Antragszeitpunkt als MVP existiert, aber noch keine Nutzungsdaten hat — und welche Mindestreife (Funktionsumfang, Nutzerzahlen) erwartet das BfArM?
2. Welche Fristen und Gebühren gelten aktuell für (a) Beratung, (b) Antrag auf vorläufige Aufnahme, (c) Antrag auf endgültige Aufnahme, (d) Änderungsanzeigen?
3. Kann die 12-Monats-Frist der vorläufigen Aufnahme verlängert werden, und was passiert mit Bestandsnutzern bei Nichtverlängerung/Streichung?

**Zweckbestimmung & Abgrenzung**
4. Trägt die vorgelegte Zweckbestimmung (Abschnitt 2.3) die Einordnung als Nicht-Medizinprodukt aus Sicht des BfArM, insbesondere die Medikamenten-Erinnerung als reine Organisationsfunktion?
5. Wird die Doppelzielgruppe „Pflegebedürftige + pflegende Angehörige" in EINEM Produkt akzeptiert, oder erwartet das BfArM getrennte Nutzenargumentationen je Nutzergruppe nach der 1. DiPAV-ÄndV?
6. Ab welcher Ausgestaltung stuft das BfArM kognitive Trainingsmodule (Zielgruppe u. a. Menschen mit Demenz) als medizinische Zweckbestimmung ein?
7. Ist die geplante strikte Trennung vom Betreuungsdienst-Geschäft der Alltagsengel UG ausreichend, oder bestehen Bedenken, wenn der DiPA-Hersteller zugleich zugelassener Leistungserbringer nach § 45a/§ 71 SGB XI ist (Interessenkonflikt, Werbeverbot)?

**Technik & Nachweise**
8. Welche Version der BSI TR-03161 und welches Prüfverfahren (Zertifikat welcher Stellen) wird zum voraussichtlichen Antragszeitpunkt (Q2–Q3 2027) akzeptiert — und gilt die Zertifikatspflicht uneingeschränkt auch für die vorläufige Aufnahme?
9. Welche konkreten Interoperabilitätsformate verlangt Anlage 2 DiPAV aktuell: genügt PDF + dokumentiertes strukturiertes JSON, oder sind FHIR-Profile/MIOs bzw. im Interoperabilitätsverzeichnis gelistete Standards verpflichtend?
10. Muss das ISO-27001-ISMS-Zertifikat bereits bei Antragstellung auf vorläufige Aufnahme vorliegen (Bezugnahme auf Übergangsregelungen), und akzeptiert das BfArM ein ISMS-Scope, das nur das DiPA-Produkt (nicht die gesamte UG) umfasst?
11. Welche Barrierefreiheits-Nachweise werden konkret verlangt (BITV-Test? Selbsterklärung nach EN 301 549? WCAG-2.1-AA-Audit durch Dritte?) und in welcher Prüftiefe?

**Evidenz & Evaluation**
12. Welche methodischen Mindestanforderungen gelten für den Nachweis des pflegerischen Nutzens nach der 1. DiPAV-ÄndV — ist eine prospektive einarmige Beobachtungsstudie mit Prä-Post-Vergleich ausreichend oder wird eine Vergleichsgruppe erwartet?
13. Werden die vorgesehenen Endpunkte akzeptiert: FES-I (Sturzangst), HPS/BSFC-s (Belastung pflegender Angehöriger), selbstberichtete Selbständigkeit — oder gibt es vom BfArM präferierte Instrumente für DiPA-Nutzenkategorien?
14. Genügt für die Nutzenkategorie „Entlastung pflegender Angehöriger" (neu seit 1. DiPAV-ÄndV) ein Nachweis ausschließlich bei Angehörigen, ohne Effektmessung beim Pflegebedürftigen?

**Vertrieb, Preis, Betrieb**
15. Ist der Vertrieb einer gelisteten DiPA über zwei Marken-Einstiegspunkte (Alltagsengel-App und eine Partner-App) zulässig, solange Produktname, Version und Datenhaltung identisch sind?
16. Wie läuft die Vergütungsverhandlung nach § 78a Abs. 1 SGB XI zeitlich zur vorläufigen Aufnahme — gibt es während der Erprobungsphase bereits Erstattung, und zu welchem Betrag?
17. Welche Änderungen gelten als „wesentliche Veränderung" mit Anzeigepflicht (neue Kursmodule? UI-Redesign? neue Push-Logik?)?
18. Bestehen Anforderungen an den technischen Support / Erreichbarkeit für Nutzer (Servicezeiten, Kanäle) aus Anlage 2 DiPAV, die eine UG mit kleiner Personaldecke einplanen muss?

---

## TEIL 6 — PILOTKONZEPT (Erprobung, vorbereitend für § 78a Abs. 6a)

> Ziel: pilotfähiger MVP + Datengrundlage für das wissenschaftliche Evaluationskonzept der vorläufigen Aufnahme. Der Pilot selbst läuft VOR der Listung als freiwilliges, kostenloses Angebot (keine Kassenerstattung, keine Kassenbehauptungen).

### 6.1 Einwilligung
- Zweistufig: (1) produktbezogene Einwilligung in Verarbeitung von Gesundheits-/Pflegedaten (Art. 9 Abs. 2 lit. a DSGVO), (2) separate Einwilligung in die wissenschaftliche Auswertung pseudonymisierter Nutzungs- und Fragebogendaten. Beide getrennt widerruflich.
- Serverseitig versioniert protokolliert (Zeitstempel, Textversion, Nutzer-ID) — Muster: `mis_privacy_consents`-Datenmodell, aber im PflegeCoach-eigenen Projekt.
- Bei geteilter Nutzung (Angehöriger sieht Tagebuch des Pflegebedürftigen): eigene Freigabe-Einwilligung des Pflegebedürftigen bzw. des rechtlichen Vertreters; Einwilligungsfähigkeit bei kognitiven Einschränkungen dokumentiert prüfen.
- Verständlichkeit: einfache Sprache, große Schrift, Vorlesefunktion; Papier-Fallback.

### 6.2 Zielgruppe des Piloten
- n = 30–50 Dyaden (Pflegebedürftiger + pflegender Angehöriger) ODER Einzelnutzer einer der beiden Gruppen; Pflegegrade 1–3 bevorzugt; Region Frankfurt/Rhein-Main.
- Einschluss: häusliche Versorgung, Smartphone/Tablet vorhanden oder Leihgerät, Deutsch oder Türkisch (i18n-Hinweis: UI-Texte des Produkts bleiben Deutsch; Pilot-Materialien ggf. zweisprachig).
- Ausschluss: rein stationäre Versorgung; fehlende Einwilligungsfähigkeit ohne Vertreter.
- Rekrutierung NICHT ausschließlich aus dem eigenen Kundenstamm (Selektionsbias, Interessenkonflikt-Optik) — zusätzlich über Pflegestützpunkte/Angehörigengruppen. Keine Koppelung an Betreuungsverträge.

### 6.3 Baseline-Erhebung (T0)
- Demografie, Pflegegrad, Versorgungssituation, Technikvorerfahrung.
- Pflegebedürftige: FES-I Kurzform (Sturzangst), Selbständigkeits-Selbsteinschätzung (alltagsmodulbezogen), Sturzereignisse letzte 3 Monate (Selbstbericht).
- Angehörige: HPS/BSFC-s (Belastung), Pflegekompetenz-Selbsteinschätzung, Kenntnis/Inanspruchnahme von Entlastungsleistungen.
- Instrumentenauswahl final mit wissenschaftlichem Partner validieren (**ORF-10**).

### 6.4 Nutzungsmessung
- Ereignisbasiertes, pseudonymisiertes Nutzungslogging im eigenen Backend (KEINE Dritt-Tracker, kein Meta/TikTok/GTM im Produkt): Modul gestartet/abgeschlossen, Erinnerung quittiert, Tagebucheintrag angelegt, Export genutzt.
- Kennzahlen: aktive Tage/Woche, Modul-Abschlussrate, Erinnerungs-Quittungsrate, Retention Woche 4/8/12.
- Mindestnutzungs-Definition („adhärenter Nutzer") vorab festlegen, z. B. ≥ 2 aktive Tage/Woche über ≥ 8 von 12 Wochen.

### 6.5 Outcome-Messung
- Messzeitpunkte: T0 (Baseline), T1 (6 Wochen), T2 (12 Wochen = Pilotende), optional T3 (Follow-up 12 Wochen nach Ende).
- Primär orientierende Endpunkte (Pilot = Machbarkeit + Effektschätzung, KEINE konfirmatorische Studie): Veränderung FES-I; Veränderung HPS/BSFC-s; System Usability Scale (SUS) ≥ 68 als Usability-Ziel.
- Sekundär: qualitative Interviews (10–15 Teilnehmende) zu Verständlichkeit, Barrierefreiheit, wahrgenommenem Nutzen.
- Ergebnisse fließen in Fallzahlplanung und Endpunktwahl des Evaluationskonzepts für die vorläufige Aufnahme ein.

### 6.6 Abbruchkriterien
- Individuell: jederzeitiger Widerruf ohne Nachteile; auf Wunsch vollständige Datenlöschung (Art. 17) inkl. Pilotdaten, soweit noch nicht anonymisiert aggregiert.
- Studienbezogen (Stopp des Piloten): meldepflichtiges Datenschutzereignis (Art. 33), sicherheitsrelevanter Vorfall in der App, Hinweise auf Gefährdung (z. B. Nutzer ersetzt notwendige professionelle Hilfe erkennbar durch die App), SUS < 50 bei Zwischenauswertung T1 mit gehäuften Bedienabbrüchen bei Hochaltrigen.
- Eskalationsregel: klinisch/pflegerisch besorgniserregende Freitexteinträge lösen KEINE automatische Auswertung aus (kein Monitoring-Anspruch!) — stattdessen statischer Hinweis in der App auf Notruf/Hausarzt/Pflegeberatung. Dies ist Teil der MDR-Abgrenzung und im Aufklärungsmaterial transparent zu machen.

### 6.7 Datenexport im Piloten
- Ab MVP verpflichtend: Nutzer-Self-Service-Export (PDF + JSON) aller eigenen Daten; wird zugleich als Erfüllung der DiPAV-Exportanforderung und Art. 20 DSGVO konzipiert und im Pilot auf Verständlichkeit getestet.
- Studien-Datenexport: pseudonymisierte Auswertungsdatensätze, Trennungskonzept (Schlüsseltabelle nur beim Verantwortlichen, nicht beim Auswertungspartner).

### 6.8 Evaluationskonzept (Rahmen für die spätere Einreichung)
- Design-Vorschlag für die vorläufige Aufnahme: prospektive, einarmige Interventionsstudie mit Prä-Post-Vergleich über 12 Monate Erprobungszeitraum; Fallzahl aus Pilotdaten; vorregistriert (z. B. DRKS).
- Durchführung durch **unabhängige wissenschaftliche Einrichtung** (Pflegewissenschaft-Lehrstuhl/Institut) — noch zu beauftragen. Ethikvotum einholen.
- Hypothesen getrennt je Nutzenkategorie: (H1) Minderung von Beeinträchtigungen der Selbständigkeit / Sturzangst bei Pflegebedürftigen; (H2) Entlastung pflegender Angehöriger (Nutzenkategorie der 1. DiPAV-ÄndV).
- **Hinweis:** Ob dieses Design den BfArM-Anforderungen genügt, ist ORF-10/Frage 12 — Konzept erst nach BfArM-Beratung und Leitfaden-V1.3-Volltextauswertung finalisieren.

---

## OFFENE REGULATORISCHE FRAGEN (Sammelliste)

| Nr. | Frage | Klärungsweg |
|---|---|---|
| ORF-1 | Kann Alltagsengel als Betreuungsdienst (§ 45a / § 71 Abs. 1a SGB XI) ergänzende Unterstützungsleistungen nach § 39a erbringen, oder ist dies zugelassenen ambulanten *Pflege*einrichtungen vorbehalten? | Pflegekasse/GKV-SV, Rahmenverträge; ggf. BfArM-Beratung Frage 7 |
| ORF-2 | ISO-27001-Pflicht zum Zeitpunkt der vorläufigen Aufnahme (Übergangsfristen)? | Leitfaden V1.3 Volltext + BfArM Frage 10 |
| ORF-3 | Aktueller Inhalt des DiPA-Verzeichnisses (Wettbewerb) | BfArM-Verzeichnis direkt einsehen |
| ORF-4 | § 40b-Anspruch bei Pflegegrad 1 vollumfänglich? | Gesetzestext/Leitfaden verifizieren |
| ORF-5 | Werbefreiheits-/Verbraucherschutzanforderungen der Anlage 2 im Detail | DiPAV-Anlage 2 Volltext |
| ORF-6 | MDR-Grenze bei kognitiven Trainingsmodulen | BfArM Frage 6 |
| ORF-7 | Fallback-Risikoklasse bei medizinischer Einstufung | BfArM Frage 4 |
| ORF-8 | Geltender Datenschutz-Kriterienkatalog für DiPA zum Antragszeitpunkt | Leitfaden V1.3 + BfArM |
| ORF-9 | Verbindlichkeit von FHIR/MIO für DiPA-Interoperabilität | BfArM Frage 9 |
| ORF-10 | Methodische Mindestanforderungen Nutzennachweis | Leitfaden V1.3 + BfArM Fragen 12–14 |
| ORF-11 | White-Label-/Mehrkanal-Vertrieb einer DiPA | BfArM Frage 15 |

---

## GATE-BEWERTUNG

| Gate | Gegenstand | Ergebnis | Begründung |
|---|---|---|---|
| **GATE B1** | Zweckbestimmung | **PASS** | Regulatorisch präzise Zweckbestimmung mit MDR-Negativabgrenzung liegt vor (2.3), konsistent mit § 40a SGB XI und den erweiterten Nutzenkategorien der 1. DiPAV-ÄndV. Vom BfArM zu validieren (Fragen 4–5). |
| **GATE B2** | Produktabgrenzung | **PASS** | Produktgrenze eindeutig definiert (2.4): DiPA-Scope vs. B2B-Funktionen beider Apps, MDR-Trigger-Liste, Empfehlung eigenes Deployment + eigener Datenbestand (Teil 4, Variante A). Restrisiken als ORF-5/-6/-11 markiert. |
| **GATE B3** | BfArM-Fragenpaket | **PASS** | 18 konkrete, priorisierte Fragen in 5 Themenblöcken (Teil 5), direkt für eine Innovationsbüro-Beratung verwendbar. |
| **GATE B4** | MVP technisch pilotfähig | **FAIL** | Der PflegeCoach existiert als Produkt nicht: keine Kurs-/Coaching-Features für Endnutzer in keiner der beiden Codebases (Alltagsengel: nur interne Personalschulung + Blog; efy care: reines B2B-Abrechnungswerkzeug; Medikamenten-Tracking nur Konzeptpapier). Zusätzlich fehlen pilotkritische Basisfähigkeiten: MFA, produktbezogener Einwilligungs-Record, Self-Service-Datenexport, barrierefreies UI (Dark-Mode-Zwang, keine Schriftskalierung), TR-03161-Vorbereitung. |
| **GATE B5** | Evaluationskonzept | **FAIL** | Ein tragfähiges Rahmenkonzept liegt vor (Teil 6), ist aber nicht einreichungsreif: kein wissenschaftlicher Partner beauftragt, Instrumente nicht final validiert, kein Ethikvotum, methodische BfArM-Mindestanforderungen ungeklärt (ORF-10). Nach BfArM-Beratung und Partnerauswahl auf PASS hebbar. |

**Kritischer Pfad zur Pilotfähigkeit (B4) und Einreichungsreife (B5):**
1. BfArM-Beratungstermin beantragen (Fragenpaket Teil 5) — parallel Leitfaden V1.3 im Volltext auswerten.
2. MVP-Bau als eigenständiges Produkt (eigenes Supabase-Projekt, barrierefreies UI, Consent-Record, Export, MFA) — Aufwandsklasse: mehrere Monate.
3. TR-03161-Prüfstelle und ISO-27001-Beratung anfragen (lange Vorlaufzeiten).
4. Wissenschaftlichen Partner (Pflegewissenschaft) für Evaluationskonzept gewinnen.
5. Pilot nach Teil 6 durchführen → Antrag auf vorläufige Aufnahme (§ 78a Abs. 6a).

---

## ANHANG A — Technisches Ist-Stand-Inventar (Kurzfassung)

| Fähigkeit | alltagsengel | efy-care |
|---|---|---|
| Auth (E-Mail+Passwort) | vorhanden, starke Policy + Rate-Limit | vorhanden, schwach (6 Zeichen, kein Reset) |
| MFA/2FA | fehlt (Investor-Seite behauptet MFA — korrigieren) | fehlt |
| RLS | 605 Policies, auditiert (P0=0/P1=0, 09.08.2026) | 185 Policies |
| Security-Header | stark (HSTS/CSP, `next.config.ts`) | schwach (Website: 2 Header) |
| At-rest-Verschlüsselung (App-seitig) | fehlt (Plattform-Vertrauen) | Session AES-256-CTR ohne Integritätsschutz |
| Consent-Record serverseitig | teilweise (AGB ja; Cookie nur localStorage; MIS-Modell vorhanden) | fehlt |
| Art.-9-Datenmodelle | umfangreich (Pflegedoku, Medikamentenplan, Notfallpass) | minimal (abrechnungszentriert) |
| Audit-Log | append-only, 10 J. Retention | einfach, ohne Append-only |
| Barrierefreiheit | schwach; Dark-Mode erzwungen | sehr schwach; keine Schriftskalierung |
| Self-Service-Datenexport | fehlt | fehlt |
| Löschung Art. 17 | vorhanden | fehlt |
| Endnutzer-Coaching/Kurse | fehlen | fehlen |
| Interop (FHIR/MIO) | fehlt | fehlt |

Belege (Auswahl): `/Users/work/alltagsengel/next.config.ts`, `/Users/work/alltagsengel/lib/password-validation.ts`, `/Users/work/alltagsengel/supabase/migrations/20260417_admin_audit_log.sql`, `/Users/work/alltagsengel/app/layout.tsx`, `/Users/work/alltagsengel/audit/SECURITY-RELEASE-REPORT_2026-08-09.md`, `/Users/work/efy-care/app/src/lib/aesEnvelope.ts`, `/Users/work/efy-care/app/src/app/(auth)/register.tsx`, `/Users/work/efy-care/konzept-medikamenten-tracking.md`.

*Ende des Berichts.*
