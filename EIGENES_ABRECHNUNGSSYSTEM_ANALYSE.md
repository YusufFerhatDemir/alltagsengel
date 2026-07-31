# Eigenes Kassenabrechnungs-Übertragungssystem — Vollanalyse

**Projekt-Codename: "Engel DTA" (Arbeitstitel)**
Stand: 31.07.2026 · Grundlage für Investorengespräche
Autor: Analyse-Agent für Alltagsengel UG (IK 460629986)

---

## Executive Summary

Der Markt für elektronische Kassenabrechnung in der ambulanten Pflege ist technologisch **15–20 Jahre hinter dem Stand der Technik**: Das dominierende Übertragungswerkzeug **dakota.le** ist eine Windows-Desktop-Software von 2006, Abrechnungszentren wie DMRZ/Optica/Noventi kassieren **0,5–5 % vom Umsatz** — und genau jetzt öffnet sich ein historisches Zeitfenster: **Ab Dezember 2026 wird die SGB-XI-Abrechnung verpflichtend auf die Telematikinfrastruktur (KIM) umgestellt, ab Oktober 2027 läuft sie ausschließlich vollelektronisch über die TI.** Der klassische Übertragungsweg, auf dem Dakota basiert, stirbt. Alle ~18.000 ambulanten Pflegedienste in Deutschland müssen ihre Abrechnungsstrecke in den nächsten 14 Monaten umbauen.

**Kernbefund:** Es gibt **keine formale Zulassungspflicht** für Abrechnungssoftware nach §302 SGB V / §105 SGB XI. Wer die Technischen Anlagen des GKV-Spitzenverbands korrekt implementiert (EDIFACT-Nachrichten, SECON-Verschlüsselung, Erprobungsverfahren pro Kasse), darf abrechnen. Die Verschlüsselung ist als **Open-Source-Referenzimplementierung** verfügbar (secon-tool der Techniker Krankenkasse, Apache-2.0-Lizenz). Alltagsengel besitzt bereits ein **eigenes IK (460629986)** — die wichtigste Eintrittskarte.

**Empfehlung:** In 4–8 Wochen ein internes MVP bauen (eigene Abrechnung ohne Dakota/DMRZ), parallel Erprobungsverfahren mit den relevanten Datenannahmestellen durchlaufen, dann als **API-first, KIM-natives Abrechnungs-SaaS** vermarkten — positioniert als "das Stripe der Pflegeabrechnung". Konservatives Umsatzpotenzial bei 1 % Marktanteil: ~320.000 € ARR; bei 5 %: ~1,6 Mio. € ARR — allein mit dem Übertragungsmodul, ohne Zusatzmodule.

---

# Teil 1: Ist-Analyse

## 1.1 Rechtlicher Rahmen

| Norm | Regelt | Relevanz für Alltagsengel |
|---|---|---|
| **§302 SGB V** | Abrechnung "sonstiger Leistungserbringer" mit den **Krankenkassen** (häusliche Krankenpflege/HKP nach §37 SGB V, Haushaltshilfe etc.) | Ja — HKP-Leistungen |
| **§105 SGB XI** | Abrechnung mit den **Pflegekassen** (Pflegesachleistungen, Verhinderungspflege, Entlastungsbetrag §45b usw.) | Ja — Kerngeschäft |
| **§303 SGB V / §105 Abs. 2 SGB XI** | Kassen dürfen bei Nicht-Teilnahme am elektronischen Verfahren die Vergütung um **bis zu 5 % kürzen** | Wirtschaftlicher Zwang zum DTA |
| **§360 SGB XI** | TI-Anbindungspflicht für Pflegeeinrichtungen (seit 01.07.2025) | Pflicht, zugleich Marktchance |
| **§35 SGB I, DSGVO** | Sozialgeheimnis, Sozialdaten-Schutz | Architektur-Anforderung (Hosting DE, Verschlüsselung) |

Beide Verfahren (§302 und §105) sind in **Richtlinien + Technischen Anlagen** des GKV-Spitzenverbands spezifiziert und öffentlich auf **gkv-datenaustausch.de** dokumentiert — inklusive aller Satzbeschreibungen, Schlüsselverzeichnisse und Fehlercodes. Es ist ein offener Standard, kein Geheimwissen.

## 1.2 Wie das Verfahren technisch funktioniert (Ende-zu-Ende)

```
Pflegedienst                                    Krankenkasse/Pflegekasse
    │                                                    ▲
    │ 1. Leistungsdaten erfassen                         │ 7. Zahlung / Rückweisung
    ▼                                                    │
Abrechnungssoftware                                      │
    │ 2. EDIFACT-Nachrichten erzeugen                    │
    │    §105: PLGA (Gesamtaufstellung)                  │
    │           + PLAA (Einzelfall-Abrechnungsdaten)     │
    │    §302: SLGA + SLLA                               │
    ▼                                                    │
Nutzdatendatei + Auftragsdatei                           │
    │ 3. Verschlüsselung nach SECON                      │
    │    (Anlage 16 „Security Schnittstelle“:            │
    │     CMS/PKCS#7, X.509-Zertifikate vom              │
    │     ITSG-Trust-Center, AES-256, RSA/ECC,           │
    │     elektronische Signatur des Absenders)          │
    ▼                                                    │
Übertragung an die DATENANNAHMESTELLE der Kasse ─────────┘
    heute:  E-Mail-Anhang / DFÜ (das macht Dakota)
    ab 12/2026: KIM-Nachricht innerhalb der TI (Pflicht SGB XI)
    + Papier-Urbelege (Leistungsnachweise) per Post,
      bis 09/2027 zulässig, danach vollelektronisch (eLNW)
```

**Schlüsselkomponenten im Detail:**

1. **IK (Institutionskennzeichen):** 9-stellige ID jedes Leistungserbringers und jeder Kasse, vergeben von der ARGE·IK. Absender- und Empfänger-Adressierung im gesamten Verfahren. **Alltagsengel hat bereits IK 460629986.**

2. **EDIFACT (UN/EDIFACT, Zeichensatz UNOC):** Textbasiertes Nachrichtenformat. Für die Pflege (§105) sind die Nachrichtentypen **PLGA** (Gesamtaufstellung der Abrechnung, entspricht der Rechnungssummen-Ebene) und **PLAA** (versichertenbezogene Einzeldaten: Leistungskomplexe, Zeiten, Punktwerte/Beträge, Pflegegrad) definiert; für §302 analog **SLGA/SLLA**. Segmente wie UNB/UNH…UNT/UNZ mit fachlichen Segmenten (z. B. INV für Versicherte, ELS/ELP für Leistungen). Die vollständigen Satzbeschreibungen stehen in der **Technischen Anlage 1** (aktuell Version 6.4.0, Stand 07.07.2025, für §105).

3. **Schlüsselverzeichnisse (Anlage 3):** Kodierlisten, die jede Abrechnung steuern:
   - **Abrechnungscode** (Art des Leistungserbringers, z. B. ambulante Pflege)
   - **Tarifkennzeichen** (Stellen 3–5: welcher Vergütungsvertrag/Landestarif)
   - **Leistungskomplex-Schlüssel** (bundeslandspezifisch!)
   - Verarbeitungskennzeichen, Fehlercodes, Entgeltarten usw.

4. **Kostenträgerdatei:** Maschinenlesbare Datei (von den Kassen quartalsweise publiziert), die für jedes Kassen-IK festlegt, **welche Datenannahmestelle** zuständig ist, welche Übertragungswege akzeptiert werden und wohin Papierbelege gehen. Muss von der Software automatisch eingelesen und aktualisiert werden — eine der häufigsten Fehlerquellen bei Wettbewerbern.

5. **Datenannahmestellen:** Wenige zentrale Rechenzentren bündeln die Annahme für die Kassenarten — u. a. **BITMARCK Service GmbH** (Knappschaft, SVLFG, viele BKKn/IKKn), die AOK-Rechenzentren, DAVASO/vdek-Annahmestellen für Ersatzkassen. Es sind **keine 90+ Einzelanbindungen** nötig, sondern real ca. 6–10 Annahmestellen.

6. **SECON-Verschlüsselung (Anlage 16 "Security Schnittstelle"):**
   - Container: **CMS (Cryptographic Message Syntax, "PKCS#7")** — signiert UND verschlüsselt
   - Signatur mit dem eigenen ITSG-Zertifikat, Verschlüsselung mit dem öffentlichen Zertifikat der Annahmestelle
   - Symmetrisch AES-256, asymmetrisch RSA (mind. 4096 Bit) bzw. zunehmend ECC gemäß aktueller Kryptovorgaben
   - Zertifikate: X.509, ausgestellt vom **ITSG-Trust-Center** auf das IK, kostenpflichtig (~70–100 € je Zertifikat, Gültigkeit 3 Jahre)
   - **Referenzimplementierungen als Open Source:** [`DieTechniker/secon-tool`](https://github.com/DieTechniker/secon-tool) (Java, Apache-2.0, von der TK selbst), [`bitmarck-service/fs2-secon`](https://github.com/bitmarck-service/fs2-secon) (Scala, von BITMARCK!), [`loetifuss/kks-encryption`](https://github.com/loetifuss/kks-encryption). **Die Kryptographie ist also gelöst und frei nutzbar.**

7. **Erprobungsverfahren (statt Zertifizierung):** Es gibt **keine staatliche Software-Zulassung**. Der Ablauf pro Kasse/Annahmestelle:
   - **Testverfahren:** Annahmestellen prüfen eingereichte Testdateien kostenlos auf Struktur (Stufenprüfung 1–4: Übertragung → Syntax → Struktur → Fachinhalt)
   - **Erprobungsphase:** Echtdaten elektronisch + parallel Papierrechnung; Zahlung erfolgt zunächst auf Papierbasis
   - **Echtbetrieb:** Nach fehlerfreier Erprobung Freischaltung des IK für das DTA-Verfahren
   - Die ITSG-**Systemuntersuchung** (das, was viele mit "ITSG-Zertifizierung" meinen) gilt nur für **Entgeltabrechnungsprogramme der Arbeitgeber** — für Leistungserbringer-Abrechnung nach §302/§105 ist sie **nicht erforderlich**.

8. **Telematikinfrastruktur — der Game-Changer:**
   - Seit **01.07.2025**: TI-Anbindungspflicht für Pflegeeinrichtungen (§360 SGB XI)
   - Ab **Dezember 2026**: Übermittlung der SGB-XI-Abrechnungsdaten an die Pflegekassen **via KIM** (Kommunikation im Medizinwesen — sicherer E-Mail-Dienst der TI)
   - Übergangsfrist: Bis **30.09.2027** dürfen abrechnungsbegründende Unterlagen (Leistungsnachweise) noch auf Papier laufen
   - Ab **01.10.2027**: **ausschließlich vollelektronische Abrechnung in der TI** (inkl. elektronischer Leistungsnachweis eLNW)
   - Benötigt: **SMC-B Pflege** (Institutionsausweis, beantragt über das eGBR), TI-Zugang (heute meist "TI as a Service"/TI-Gateway statt eigener Konnektor-Hardware), KIM-Adresse bei einem zugelassenen KIM-Anbieter
   - **Konsequenz: Der gesamte Bestandsmarkt (Dakota-Installationen, alte DTA-Strecken) muss migrieren. Jeder Anbieter startet quasi bei null. Besseres Timing für einen Neueinstieg gibt es nicht.**

## 1.3 Was genau macht Dakota?

**dakota.le** ("Datenaustausch und Kommunikation auf der Basis Technischer Anlagen — Leistungserbringer") der ITSG GmbH ist **kein Abrechnungsprogramm**, sondern nur der **Verschlüsselungs- und Versandbaustein**:

- Nimmt fertige Nutzdatendateien (EDIFACT) von der Abrechnungssoftware entgegen
- Erzeugt die Auftragsdatei, verschlüsselt/signiert nach SECON mit dem ITSG-Zertifikat
- Versendet per E-Mail/DFÜ an die zuständigen Datenannahmestellen (Zuordnung über Kostenträgerdatei)
- Verwaltet Zertifikate (Beantragung, Verlängerung alle 3 Jahre)

**Technische Realität:**
- **Windows-Desktop-Software** (seit 2006), lokale Installation, ein Arbeitsplatz
- Keine API im modernen Sinn — Integration über Dateiablage/Aufruf; Softwarehersteller lizenzieren dakota als eingebettetes Modul
- Kein Echtzeit-Status, kein Dashboard, keine Fehlerprüfung der Fachinhalte (nur Transport)
- Zertifikatshandling manuell und fehleranfällig (bekanntestes Support-Thema)

**Preis:** ca. **200–278 € netto einmalig** (Erstlizenz inkl. 12 Monate Support), danach ca. **89 €/Jahr** Softwarepflege, zzgl. ITSG-Zertifikat (~70–100 € je 3 Jahre, ggf. mehrere Zertifikate).

## 1.4 Konkurrenzanalyse

| Anbieter | Typ | Preis (Pflege) | Stärken | Schwächen |
|---|---|---|---|---|
| **dakota.le (ITSG)** | Verschlüsselungs-/Versandmodul, Desktop | ~200–278 € einmalig + 89 €/Jahr + Zertifikate | Quasi-Standard, von Kassen getragen, günstig | Windows-Desktop von 2006, keine Cloud, keine echte API, kein Status-Tracking, keine Fachprüfung, manuelles Zertifikatsmanagement; **Geschäftsmodell durch KIM-Umstellung existenziell bedroht** |
| **DMRZ** | Cloud-Abrechnungsportal | Grundgebühr je Tarif + **0,5 % vom Abrechnungsvolumen** über Inklusivvolumen (Basic 10 T€, Plus 20 T€, Premium 30 T€/Monat inklusive; ab 60 T€ 0,1 %) | Cloud, kein Dakota nötig, schneller Einstieg, auch Software-Light enthalten | **Prozentmodell wird bei Wachstum teuer** (Pflegedienst mit 100 T€/Monat zahlt real mehrere hundert €/Monat), Web-Portal statt API-first, Daten-Lock-in, keine Whitelabel-/Integrationsstrategie |
| **Optica** | Klassisches Abrechnungszentrum (Factoring) | % vom Umsatz (branchenüblich ca. 0,5–3 % je nach Vorfinanzierung) | Vorfinanzierung/Auszahlung in 1–7 Tagen, Absetzungsmanagement, etabliert (Heilmittel-Fokus) | Teuer, Abhängigkeit, Pflegedienst gibt Forderungsmanagement + Kundendaten aus der Hand, kein Tech-Produkt |
| **Noventi / azh** | Abrechnungszentrum + Software | % vom Umsatz + Belegkosten (z. B. 2,49 € je Beleg bei Privatabrechnung), Vorfinanzierung gegen Gebühr | Marktführer-Konzern (Apotheken/Heilmittel), Full-Service inkl. Inkasso | Gleiches Modell wie Optica: teuer, intransparent, Konzernstruktur mit bekannten Finanzproblemen (Sanierung 2023/24), Innovationsarm |
| **MEDIFOX DAN (MD Ambulant)** | Voll-Pflegesoftware (Doku, Touren, Abrechnung) | Intransparent; Vollsystem-Anschaffung **mittlerer fünfstelliger Bereich** (Beispielangebot ~17.000 €), plus laufende Kosten | Marktführer Software ambulant, alles aus einer Hand, TI-Angebote | Teuer, On-Prem-Wurzeln, Lock-in, Abrechnung nur als Teil des Gesamtpakets — kein offenes Übertragungsmodul für Dritte |
| **Snap Ambulant (Euregon)** | Voll-Pflegesoftware | Intransparent; Hosting-Pakete ab ~110 €/Monat zzgl. Lizenzen | >2.000 Pflegedienste, solide Funktionalität | Klassische Client-Server-Architektur, Hosting nötig, kein API-Ökosystem |
| **MedKonzept, CuraSoft, euregon & Co.** | Nischen-Pflegesoftware | verschieden | Branchennähe | Alle nutzen intern dieselbe alte DTA-Strecke (oft eingebettetes dakota); keiner ist API-first |

**Strukturelle Schwäche des Gesamtmarkts:**
1. **Niemand bietet die Übertragungsstrecke als modernen, eigenständigen API-Service an** ("Billing-as-a-Service"). Entweder Desktop-Baustein (Dakota), geschlossenes Portal (DMRZ) oder Prozent-Factoring (Optica/Noventi).
2. **Fehler werden erst NACH Einreichung entdeckt** (Rückweisung durch die Annahmestelle Tage/Wochen später) → Liquiditätslücken, Absetzungen.
3. **Kein Echtzeit-Status:** "Ist meine Abrechnung angekommen/geprüft/bezahlt?" ist heute ein Blindflug.
4. **KIM-Migration:** Die Bestandsanbieter müssen ihre gewachsenen Systeme umbauen — ein Greenfield-Anbieter baut direkt KIM-nativ.

## 1.5 Was zahlt ein Pflegedienst heute real?

Beispielrechnung: durchschnittlicher ambulanter Dienst, ~128 Patienten, ~100.000 €/Monat GKV/PV-Umsatz:

| Weg | Kosten p. a. (realistisch) |
|---|---|
| Selbst abrechnen mit Pflegesoftware + dakota | Software-Anteil Abrechnung ~1.200–3.600 € + Dakota/Zertifikate ~150 € + **Personalaufwand** (0,25–0,5 Stelle Abrechnung ≈ 12.000–25.000 €) |
| DMRZ | Grundgebühr + 0,5 % über Inklusivvolumen ≈ 3.000–6.000 € |
| Abrechnungszentrum (Optica/Noventi) mit Vorfinanzierung | 1–3 % vom Umsatz ≈ **12.000–36.000 €** |

Die versteckte Hauptkostenposition ist überall der **manuelle Aufwand** (Leistungsnachweise abtippen/prüfen, Rückweisungen bearbeiten, Absetzungen klären). Genau hier liegt der Automatisierungshebel.

---

# Teil 2: Soll-Konzept — "Engel DTA"

## 2.1 Positionierung

> **"Das Stripe der Pflegeabrechnung":** Eine API + ein Dashboard, die aus Leistungsdaten fertige, validierte, verschlüsselte Kassenabrechnungen machen, sie über den richtigen Weg (KIM/DTA) an die richtige Annahmestelle senden und den Status bis zur Zahlung in Echtzeit verfolgen.

Zwei Produkte aus einer Codebasis:
1. **Intern:** Alltagsengel + efy care rechnen selbst ab — null Fremdkosten, voller Datenbesitz, Referenzkunde Nr. 1.
2. **Extern (SaaS):** Übertragungs- und Validierungsmodul für andere Pflegedienste und für **Softwarehersteller** (Embedded/API-Partner — die müssen bis 12/2026 alle KIM-fähig werden und kaufen lieber zu, als selbst zu bauen).

## 2.2 USPs gegenüber Dakota / DMRZ / Abrechnungszentren

| # | USP | Dakota | DMRZ | Optica/Noventi | **Engel DTA** |
|---|---|---|---|---|---|
| 1 | Cloud-native, kein Desktop, kein Windows | ✗ | ✓ | ✓ | ✓ |
| 2 | **API-first** (REST/JSON, Webhooks) — in jede App integrierbar | ✗ | ✗ | ✗ | ✓ |
| 3 | **Prüfung VOR Übermittlung** (Syntax + Fachlogik + Kassenregeln, wie die Stufenprüfung der Annahmestelle — nur vorab) | ✗ | teils | ✗ | ✓ |
| 4 | **Echtzeit-Status** je Abrechnung (eingereicht → angenommen → geprüft → bezahlt/abgesetzt) statt Blackbox | ✗ | teils | ✗ | ✓ |
| 5 | **KI-Fehlererkennung**: Anomalien in Leistungsdaten (Doppelabrechnung, unplausible Zeiten, falscher Leistungskomplex, Genehmigung fehlt/abgelaufen) vor Einreichung | ✗ | ✗ | ✗ | ✓ |
| 6 | **Automatische Leistungskomplex-Zuordnung** aus Doku-/Tourendaten (bundeslandspezifische LK-Kataloge hinterlegt) | ✗ | ✗ | ✗ | ✓ |
| 7 | Mobile-first (Leistungsnachweis-Erfassung + Unterschrift am Smartphone → eLNW-ready für 2027) | ✗ | ✗ | ✗ | ✓ |
| 8 | Multi-Mandant / Whitelabel für Softwarepartner | ✗ | ✗ | ✗ | ✓ |
| 9 | **KIM-nativ ab Tag 1** (Pflichtweg ab 12/2026) — kein Legacy-Ballast | Nachrüstung | Nachrüstung | Nachrüstung | ✓ |
| 10 | **Flat-Pricing statt Prozent vom Umsatz** — je größer der Dienst, desto größer unsere Ersparnis vs. DMRZ/Zentren | n/a | ✗ | ✗ | ✓ |
| 11 | Automatisches Zertifikats- & Kostenträgerdatei-Management (Renewal, Updates, Routing) unsichtbar im Hintergrund | manuell | intern | intern | ✓ |
| 12 | Absetzungs-Management: Rückweisungen werden automatisch geparst, korrigiert vorgeschlagen, neu eingereicht | ✗ | ✗ | Service, teuer | ✓ |

## 2.3 Technische Architektur

```
┌────────────────────────────────────────────────────────────────────┐
│  CLIENTS                                                           │
│  • Alltagsengel-App / efy care (Erstintegration)                   │
│  • Partner-Pflegesoftware (REST-API, Webhooks)                     │
│  • Web-Dashboard (Next.js) für Direktkunden                        │
│  • Mobile Leistungsnachweis + Unterschrift (Expo/RN)               │
└──────────────────────────┬─────────────────────────────────────────┘
                           │ REST/JSON + Webhooks (API-first)
┌──────────────────────────▼─────────────────────────────────────────┐
│  CORE (Multi-Tenant, Hosting Deutschland)                          │
│                                                                    │
│  1. Billing-API          Leistungsdaten rein → Abrechnungslauf     │
│  2. Validation Engine    3-stufig:                                 │
│     a) Schema/Syntax (EDIFACT-Regeln, Pflichtfelder)               │
│     b) Fachregeln (Schlüsselverzeichnisse Anlage 3, LK-Kataloge    │
│        je Bundesland, Vergütungsvereinbarungen, Genehmigungen,     │
│        Höchstbeträge Pflegegrad, §45b-Budget 131 €/Monat)          │
│     c) KI-Anomalie-Layer (Duplikate, Ausreißer, Musterbrüche)      │
│  3. EDIFACT Engine       Generator + Parser: PLGA/PLAA (§105),     │
│                          SLGA/SLLA (§302), Auftragsdatei;          │
│                          versionierte Templates (TA-Updates!)      │
│  4. Crypto Service       SECON/Anlage 16: CMS(PKCS#7)-Signatur +   │
│                          Verschlüsselung; Basis: secon-tool (Java, │
│                          Apache-2.0) als isolierter Microservice;  │
│                          HSM/KMS für private Schlüssel;            │
│                          Auto-Renewal ITSG-Zertifikate             │
│  5. Routing Service      Kostenträgerdatei-Sync (automatischer     │
│                          Import je Quartal) → IK der Kasse →       │
│                          zuständige Annahmestelle + erlaubter Weg  │
│  6. Transport Adapter    a) KIM-Adapter (KIM-Anbieter-API/Client-  │
│                             modul, SMC-B via eGBR) ← Zukunftsweg   │
│                          b) E-Mail/DFÜ-Adapter ← Bestandsweg §302  │
│  7. Status Tracker       Eingang/Quittung/Fehlernachricht parsen,  │
│                          Zahlungsabgleich (Bank/MT940-Import),     │
│                          Webhook-Events an Mandanten               │
│  8. Absetzungs-Modul     Rückweisungscodes → Klartext →            │
│                          Korrekturvorschlag → Wiedereinreichung    │
└────────────────────────────────────────────────────────────────────┘

Stack-Empfehlung (passend zu vorhandenen Skills):
• Supabase/Postgres (EU, RLS für Mandantentrennung) — eigenes Projekt,
  strikt getrennt von Alltagsengel/efy care/ChairMatch
• Node/TypeScript-Services (Next.js Dashboard, API)
• Crypto: JVM-Microservice mit secon-tool ODER TS-Port auf Basis
  node-forge/PKCS#7 — Start mit secon-tool (kampferprobt, von der TK)
• Queue für Abrechnungsläufe (pg-boss/Temporal), Audit-Log unveränderlich
• Verschlüsselung at rest, Schlüssel im KMS, ISO-27001-Roadmap
```

**Wichtige Architektur-Entscheidungen:**
- **Sozialdaten = höchste Schutzstufe:** Hosting ausschließlich Deutschland, Mandantentrennung per RLS + separaten Schlüsseln, Auftragsverarbeitungsverträge, Lösch-/Aufbewahrungskonzept.
- **TA-Versionierung als Kernkompetenz:** Die Technischen Anlagen ändern sich (TA1 ist aktuell bei 6.4.0). Die EDIFACT-Engine muss mehrere Versionen parallel können — das ist der eigentliche Burggraben, nicht die Kryptographie.
- **KIM von Anfang an als primärer Transport designen**, E-Mail/DFÜ nur als Bestands-Adapter.

## 2.4 Zulassungs-/Zertifizierungs-Roadmap (was ist wirklich Pflicht?)

| Schritt | Was | Kosten | Dauer | Status Alltagsengel |
|---|---|---|---|---|
| 1 | **IK** bei der ARGE·IK | kostenlos | — | ✅ vorhanden (460629986) |
| 2 | **ITSG-Trust-Center-Zertifikat** auf das IK beantragen (X.509 für SECON) | ~70–100 € / 3 Jahre | Tage | offen — sofort machbar |
| 3 | **Testverfahren** mit Datenannahmestellen (BITMARCK, AOK-RZ, vdek/DAVASO …): Testdateien einreichen, Stufenprüfung 1–4 bestehen | kostenlos | 2–6 Wochen je Stelle, parallelisierbar | offen |
| 4 | **Erprobungsverfahren** je Kassenart: Echtdaten elektronisch + Papier parallel | kostenlos | 1–3 Abrechnungsmonate | offen |
| 5 | **Echtbetrieb** DTA für eigenes IK | — | — | Ziel Q4/2026 |
| 6 | **TI-Ausstattung:** SMC-B Pflege über eGBR beantragen, KIM-Adresse bei zugelassenem Anbieter, TI-Gateway/TIaaS (Finanzierungspauschalen der Kassen nach §106b SGB XI nutzen!) | weitgehend refinanziert | 4–8 Wochen | offen — parallel starten |
| 7 | Für das SaaS-Geschäft: **keine Zulassung nötig**, aber je Endkunden-IK das Erprobungsverfahren (automatisierbar als Onboarding-Flow) + optional ISO 27001 / BSI C5 als Vertriebsargument | ISO ~15–30 T€ | 6–12 Monate | Phase 2 |

**Klarstellung für Investoren:** Der Markteintritt ist **nicht zulassungsbeschränkt**. Die Barriere ist Fleißarbeit (Spezifikationen korrekt implementieren, Erprobung je Annahmestelle) — genau die Art Barriere, die mit KI-gestützter Entwicklung heute in Wochen statt Jahren fällt, die aber Nachahmer trotzdem abschreckt.

---

# Teil 3: Business Case

## 3.1 Markt

- **17.900–18.000 ambulante Pflegedienste** in Deutschland (MD-Bericht 2025), **+4,7 % p. a.**, ~2,3 Mio. versorgte Patienten, Ø 128 Patienten je Dienst
- Dazu: ~12.000 stationäre/teilstationäre Einrichtungen (§105-Verfahren gilt auch dort), Heilmittelerbringer, Hilfsmittel, Krankentransport (§302) als spätere Expansionsstufen
- **Zwangs-Migrationsereignis 12/2026 (KIM)** — jeder der 18.000 Dienste muss handeln
- Ausgaben heute für Abrechnung (konservativ Ø 250 €/Monat über alle Wege gemittelt): **> 50 Mio. € p. a.** allein ambulant

## 3.2 Pricing-Modell (Flat statt Prozent — das Anti-DMRZ-Modell)

| Tarif | Zielgruppe | Preis/Monat | Inhalt |
|---|---|---|---|
| **Starter** | bis 50 Patienten | 99 € | DTA/KIM-Versand, Validierung, Status-Dashboard |
| **Pro** | bis 150 Patienten | 199 € | + KI-Prüfung, Absetzungs-Management, eLNW mobil |
| **Scale** | >150 Patienten / Verbünde | 349 € | + Multi-Standort, FiBu-Export, SLA |
| **API/Embedded** | Softwarehersteller | ab 0,99 €/Fall oder Volumenlizenz | Whitelabel-API, sie sparen sich die eigene KIM/EDIFACT-Entwicklung |

Verkaufsargument gegen DMRZ: Dienst mit 100 T€/Monat zahlt dort effektiv 400–600 €/Monat — bei uns 199 € fix. Gegen Abrechnungszentren (1–3 %): Ersparnis 10.000–30.000 €/Jahr.

## 3.3 Umsatzpotenzial (nur Übertragungsmodul, nur ambulant)

| Szenario | Kunden | Ø ARPU/Monat | ARR |
|---|---|---|---|
| Jahr 1 (Referenz + Frühadopter, KIM-Panik Q4/2026) | 50 | 180 € | 108 T€ |
| Jahr 2 (1 % Marktanteil) | 180 | 180 € | ~390 T€ |
| Jahr 3 (3 % + 2 Software-Partner) | 540 + Partner | 180 € + Lizenzen | ~1,4–1,8 Mio. € |
| Vision (5 % + §302-Verticals) | 900+ | — | > 2,5 Mio. € |

Kostenseite: Grenzkosten pro Mandant nahe null (Cloud, automatisiertes Onboarding). Kein Factoring = kein Kapitalbedarf für Vorfinanzierung (bewusster Verzicht; optional später mit Bankpartner als Upsell).

## 3.4 Wettbewerbsvorteil / Moat

1. **Timing:** KIM-Pflicht 12/2026 zwingt den gesamten Markt zur Migration — Greenfield schlägt Legacy.
2. **Eigener Referenzbetrieb:** Alltagsengel rechnet selbst darüber ab — Produkt wird im echten Pflegealltag gehärtet ("wir nutzen es selbst" ist im Pflegemarkt das stärkste Vertriebsargument).
3. **Branchenwissen:** 25 Jahre Alltagsbegleitungs-Expertise in der Familie (1.000-MA-Erfahrung) — Wettbewerber haben Entwickler ODER Pflegewissen, selten beides.
4. **Regulatorik als Burggraben:** TA-Versionspflege, Schlüsselverzeichnisse, 16 Bundesland-LK-Kataloge, Erprobungs-Know-how — langweilig genug, dass Tech-Startups es meiden, komplex genug, dass Pflegedienste es nicht selbst bauen.
5. **API-Ökosystem:** Als neutraler "Billing-Rail" für andere Softwarehersteller wird man Infrastruktur statt Konkurrent.

---

# Teil 4: MVP-Definition (4–8 Wochen) und Roadmap

## Phase 0 — sofort (Woche 1, parallel)
- [ ] ITSG-Trust-Center-Zertifikat für IK 460629986 beantragen
- [ ] SMC-B Pflege über eGBR + KIM-Adresse beantragen (Vorlauf!)
- [ ] Technische Anlagen herunterladen und fixieren: TA1 6.4.0 (§105), TA §302, Anlage 3 Schlüsselverzeichnisse, Anlage 16 SECON, aktuelle Kostenträgerdateien
- [ ] Hessen-Leistungskomplexkatalog + Vergütungsvereinbarung Alltagsengel als erste Fachdatenbasis

## Phase 1 — MVP "Selbst abrechnen" (Woche 2–8)
**Ziel: Eine echte Alltagsengel-Monatsabrechnung ohne Dakota/DMRZ elektronisch einreichen.**
- EDIFACT-Generator PLGA/PLAA (§105) für die tatsächlich erbrachten Leistungsarten (Sachleistung, §45b Entlastungsbetrag 131 €, Verhinderungspflege)
- SECON-Verschlüsselung via secon-tool-Microservice, Auftragsdatei-Erzeugung
- Kostenträgerdatei-Import + Routing auf die 2–4 relevanten Annahmestellen (AOK Hessen, vdek-Kassen, BKK/BITMARCK, Knappschaft)
- Versand-Adapter (E-Mail-DTA) + Eingangs-/Fehlerprotokoll-Parser
- Minimal-Dashboard: Abrechnungslauf, Validierungsreport, Sendestatus
- Testdateien bei den Annahmestellen einreichen → Stufenprüfung bestehen → Erprobungsverfahren starten
- **Definition of Done: erste Kasse zahlt auf elektronisch eingereichte Abrechnung**

## Phase 2 — Produktisierung (Monat 3–6)
- Multi-Mandanten-Fähigkeit + Onboarding-Automation (IK-Anlage, Zertifikat, Erprobung als geführter Flow)
- KIM-Transport-Adapter (rechtzeitig vor 12/2026!)
- Validation Engine v2: alle 16 Bundesland-LK-Kataloge, Genehmigungs-/Budgetprüfung, KI-Anomalie-Layer
- Absetzungs-Management, Zahlungsabgleich
- §302-Nachrichten (SLGA/SLLA) für HKP
- 5–10 Pilot-Pflegedienste (kostenlos/rabattiert) aus dem eigenen Netzwerk

## Phase 3 — Skalierung (Monat 6–18)
- Public Launch zum KIM-Stichtag Dezember 2026 ("Der Dakota-Ausstieg")
- Partner-API für Softwarehersteller, Whitelabel
- eLNW mobil (Unterschrift beim Patienten) — Pflichtfeature ab 10/2027
- ISO 27001, ggf. BSI C5
- Expansion §302-Verticals (Heilmittel, Hilfsmittel, Fahrdienste)

## Langfrist-Vision
**Die Abrechnungs-Infrastruktur der Sozialwirtschaft:** Jede Leistung, die irgendwo in Deutschland an eine Kranken- oder Pflegekasse abgerechnet wird, kann über eine einzige API laufen — validiert, verschlüsselt, TI-nativ, mit Echtzeit-Zahlungsstatus. Dakota war die Infrastruktur der Fax-Ära; Engel DTA ist die der TI-Ära. Exit-Optionen: strategischer Verkauf an Pflegesoftware-Konzern (MEDIFOX DAN/Hg Capital kauft aktiv zu) oder eigenständiges Wachstum als Infrastruktur-SaaS.

---

# Teil 5: Risiken & Gegenmaßnahmen

| Risiko | Bewertung | Gegenmaßnahme |
|---|---|---|
| TA-/Fristverschiebungen (KIM-Termin könnte rutschen) | mittel | Dual-Transport (E-Mail-DTA + KIM) — wir gewinnen in beiden Welten |
| Erprobungsverfahren zieht sich bei einzelnen Annahmestellen | mittel | Früh starten, parallelisieren, mit den 4 größten beginnen (deckt >80 % der Versicherten) |
| Sozialdaten-Vorfall | hoch (Impact) | Verschlüsselung Ende-zu-Ende, HSM, Audit, ISO-Roadmap, Pentest vor Launch |
| Wettbewerber (DMRZ) reagiert mit API | mittel | First-Mover bei KIM-nativ + Flat-Pricing + Embedded-Strategie |
| Unterschätzter Pflegeaufwand der Fachregeln (16 Bundesländer) | mittel | Start mit Hessen (Eigenbedarf), Bundesländer nach Kundennachfrage ausrollen |
| Konzentrationsrisiko Gründer | mittel | Doku-first-Entwicklung, Spezifikationen sind öffentlich, Code gehört der UG |

---

# Anhang: Zentrale Quellen

**Offizielle Spezifikationen (alles öffentlich!):**
- GKV-Datenaustausch, Bereich Pflege §105 SGB XI inkl. [Technische Anlage 1 v6.4.0](https://www.gkv-datenaustausch.de/media/dokumente/leistungserbringer_1/pflege/technische_anlagen_aktuell_2/TA1_6.4.0_20250707_oA.pdf) und [Info-Broschüre TP6 (04/2026)](https://www.gkv-datenaustausch.de/media/dokumente/leistungserbringer_1/pflege/20260424_Broschuere_TP6.pdf)
- [GKV-Datenaustausch: Sonstige Leistungserbringer §302](https://www.gkv-datenaustausch.de/leistungserbringer/sonstige_leistungserbringer/sonstige_leistungserbringer.jsp) inkl. [Broschüre TP5 (02/2026)](https://www.gkv-datenaustausch.de/media/dokumente/leistungserbringer_1/sonstige_leistungserbringer/20260203_Broschuere_TP5.pdf), [Anlage 3 Schlüsselverzeichnisse](https://www.gkv-datenaustausch.de/media/dokumente/leistungserbringer_1/sonstige_leistungserbringer/technische_anlagen_archiv_4/Anlage3_010705_54.pdf), [Kostenträgerdatei-Spez.](https://www.gkv-datenaustausch.de/media/dokumente/leistungserbringer_1/sonstige_leistungserbringer/technische_anlagen_archiv_4/Anhang_03_Anlage_1_TP5_20190405.pdf)
- [Wikipedia: Datenaustausch nach §302 SGB V](https://de.wikipedia.org/wiki/Datenaustausch_nach_%C2%A7_302_SGB_V) · [§302 SGB V Gesetzestext](https://www.gesetze-im-internet.de/sgb_5/__302.html)
- [KBS: Elektronische Abrechnung §302](https://www.kbs.de/DE/Services/FuerLeistungserbringer/Datenaustausch/302/datenaustausch_node) und [§105](https://www.kbs.de/DE/Services/FuerLeistungserbringer/Datenaustausch/105/datenaustausch_node) (Datenannahmestelle BITMARCK)
- [AOK Gesundheitspartner: Bundesweite DTA-Regelungen Pflege](https://www.aok.de/gp/abrechnung/pflegeeinrichtungen/bundesweite-regelungen)

**Verschlüsselung (Open Source):**
- [DieTechniker/secon-tool](https://github.com/DieTechniker/secon-tool) — SECON/Anlage-16-Referenz (Java, Apache-2.0)
- [bitmarck-service/fs2-secon](https://github.com/bitmarck-service/fs2-secon) · [loetifuss/kks-encryption](https://github.com/loetifuss/kks-encryption)

**Dakota / ITSG:**
- [ITSG: dakota.ag/dakota.le](https://www.itsg.de/produkte/dakota-ag-dakota-le/) · [dakota.le-Leistungsbeschreibung (PDF)](https://www.itsg.de/wp-content/uploads/2022/12/dakota.le-Leistungsbeschreibung-V1.3_.pdf) · [dakota-le.com Kauf/Preise](https://www.dakota-le.com/dakota-le-kaufen/) · [ITSG Trust-Center-Preisliste](https://www.itsg.de/wp-content/uploads/Trust-Center-Preisliste.pdf) · [Zertifikat beantragen](https://www.itsg.de/produkte/trust-center/zertifikat-beantragen/)

**Wettbewerb / Preise:**
- [DMRZ-Preisliste](https://www.dmrz.de/preisliste) · [DMRZ Preise](https://www.dmrz.de/preise) · [DMRZ Ratgeber ambulante Pflege](https://www.dmrz.de/wissen/ratgeber/abrechnung-ambulante-pflege)
- [NOVENTI azh Abrechnung](https://www.noventi.de/azh/abrechnung/) · [azh.de](https://www.azh.de/)
- [MEDIFOX DAN MD Ambulant](https://www.medifoxdan.de/software-ambulante-pflege) · [Preise/Erfahrungen MEDIFOX](https://www.ki-syndikat.de/tools/medifox-dan/) · [Snap/MediFox Hosting-Preise](https://pflegetech.de/hosting-pflegesoftware/)

**Markt & TI:**
- [Pflegemarkt.com: Marktanalyse ambulante Pflegedienste 2025](https://www.pflegemarkt.com/fachartikel/marktanalyse-zahlen-daten-fakten-analyse-ambulant-2019/) · [Pflegestatistik 2025](https://www.pflegemarkt.com/fachartikel/die-pflegestatistik-2025-analyse-der-altenpflege-in-deutschland/)
- [Parto: KIM-Pflicht Pflegeabrechnung ab 12/2026](https://www.goparto.com/artikel/kim-pflege-abrechnung-telematikinfrastruktur-2026) · [medisign: Pflege vollelektronisch via KIM](https://www.medisign.de/blog/pflegeleistungen-vollelektronisch-via-kim-abrechnen/) · [DMRZ: TI in der Pflege](https://www.dmrz.de/wissen/ratgeber/telematikinfrastruktur-in-der-pflege) · [akquinet: TI-Pflicht/Kosten](https://ehealthblog.akquinet.de/ehealth-blog/blogbeitrag-details/telematikinfrastruktur-in-der-pflege-pflicht-kosten-loesung)
