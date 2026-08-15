# DiPA — Regulatorik-Tiefenprüfung (15.08.2026)

> **Ergebnis:** Die bisherige Einordnung ist im Kern KORREKT — alle drei
> Eingangsblocker (SEC-01, SEC-05, NN-01) bestätigt. Zwei Korrekturen:
> (1) SEC-04 ist kein eigenständiger Beschaffungsvorgang, sondern in SEC-01
> aufgegangen — BfArM bestätigt explizit, dass TR-03161 den Pentest ersetzt.
> (2) NEUER Befund: weder Supabase noch Vercel besitzen ein BSI C5 Testat —
> SOC 2 Type II als „vergleichbares Zertifikat" im Sinne von TR-03161-3
> O.Org_2 ist eine OFFENE RISIKOFRAGE. Die Gesamtkostenschätzung wird auf
> **85.000–135.000 €** korrigiert (vorher 115.000–150.000 €).

---

## Methodik

Jede Behauptung wird gegen drei Quellebenen geprüft:

| Ebene | Verbindlichkeit | Beispiel |
|---|---|---|
| **Gesetz/Verordnung** | rechtsverbindlich | DiPAV, SGB XI, SGB V |
| **Technische Richtlinie** | verbindlich über Verweis | BSI TR-03161-1/2/3 |
| **Leitfaden** | Verwaltungspraxis (BfArM) | DiPA-Leitfaden v1.3 (15.07.2026) |

Bewertungsskala: **GESETZLICHE PFLICHT** → **VERWALTUNGSPRAXIS** → **EMPFEHLUNG** → **BEST PRACTICE**

Gelesene Primärquellen (Volltext, 15.08.2026):

| Quelle | Fassung / Zugriff |
|---|---|
| DiPAV | BJNR156800022, ber. Art. 1 VO v. 22.06.2026 (BGBl. 2026 I Nr. 190) |
| SGB XI §78a | aktuelle Fassung, gesetze-im-internet.de |
| SGB V §139e | aktuelle Fassung, gesetze-im-internet.de |
| BSI TR-03161-1/2/3 | aktuelle Versionen (3.0/2.0/2.0) |
| BfArM-DiPA-Leitfaden | Version 1.3, 15.07.2026 |
| BfArM-Datensicherheitskriterien | Webseite, Abruf 15.08.2026 |
| BSI TR-03161 FAQ | bsi.bund.de, Abruf 15.08.2026 |

---

## A) TR-03161 — Tiefenprüfung

### Behauptung: SEC-01 ist zwingend (Eingangsblocker)

### Prüfkette

```
DiPAV §5 Abs. 2 Nr. 1
  → „die nach §78a Absatz 7 des Elften Buches Sozialgesetzbuch
     vom Bundesamt für Sicherheit in der Informationstechnik
     festgelegten Anforderungen an die Datensicherheit erfüllen"
  → §78a Abs. 7 SGB XI
    → „Das Bundesamt für Sicherheit in der Informationstechnik legt
       [...] die von digitalen Pflegeanwendungen [...] zu gewährleistenden
       Anforderungen an die Datensicherheit fest."
    → §78a Abs. 7 Satz 2: „§139e Absatz 10 Satz 2 bis 4 des Fünften
       Buches gilt entsprechend."
      → §139e Abs. 10 Satz 2: BSI bietet ab 01.06.2024 Prüfverfahren an
      → §139e Abs. 10 Satz 3: Zertifikatsnachweis „spätestens ab dem
         1. Januar 2025"
```

### Was die DiPAV wörtlich sagt

**DiPAV §8 Abs. 3 Satz 1:** Der Hersteller weist die Datensicherheitsanforderungen
„ab dem in §139e Absatz 10 Satz 3 des Fünften Buches Sozialgesetzbuch genannten
Zeitpunkt" durch ein Zertifikat nach §78a Abs. 7 SGB XI nach.

**DiPAV §8 Abs. 3 Satz 4 (Übergangsregel):** „Bis zum Vorliegen der Verfahren
weist der Hersteller abweichend von Satz 1 die Erfüllung [...] durch eine Erklärung
nach §4 Absatz 6 Satz 2 der Digitale Gesundheitsanwendungen-Verordnung nach."

### Ist die Übergangsregel noch anwendbar?

**NEIN.** Die Erklärungsmöglichkeit greift nur, „bis zum Vorliegen der Verfahren."
Die Prüfverfahren liegen vor:

| Faktum | Beleg |
|---|---|
| BSI bietet Zertifizierung an | §139e Abs. 10 Satz 2: „ab dem 1. Juni 2024" |
| Prüfstellen am Markt aktiv | TÜVIT, secuvera, SRC — BSI-anerkannt |
| BfArM bestätigt Schluss | Leitfaden v1.3 Kap. 3.4 (S. 49): Zertifikat seit 01.07.2025 Voraussetzung für formale Vollständigkeit |

BfArM-Leitfaden v1.3, Kap. 3.4 (S. 49), wörtlich:

> „Seit dem 01.07.2025 ist die Vorlage eines entsprechenden Zertifikats
> Voraussetzung für die FORMALE VOLLSTÄNDIGKEIT DES ANTRAGS auf Aufnahme in
> das DiPA-Verzeichnis. Eine Aufnahme einer DiPA in das DiPA-Verzeichnis
> ohne Vorlage des Zertifikats ist nicht möglich."

### Welche TR-03161-Teile?

| Teil | Anwendung | Für PflegeCoach? |
|---|---|---|
| TR-03161-1 | Mobile Anwendungen | NEIN (Capacitor-WebView, kein nativer Code) |
| TR-03161-2 | Webanwendungen | JA |
| TR-03161-3 | Hintergrundsysteme (Backend) | JA |

### Muss die Prüfstelle akkreditiert sein?

**JA.** Die Prüfung erfolgt durch BSI-anerkannte Prüfstellen. Eine Selbstprüfung
oder Prüfung durch nicht-anerkannte Stellen genügt nicht.

### Bewertung

| Aspekt | Einordnung |
|---|---|
| Verbindlichkeit | **GESETZLICHE PFLICHT** (DiPAV §8 Abs. 3 i. V. m. §78a Abs. 7 SGB XI i. V. m. §139e Abs. 10 SGB V) |
| Zeitpunkt | Bei Antragstellung (seit 01.07.2025 Voraussetzung für formale Vollständigkeit) |
| Übergangsregel | **GESCHLOSSEN** seit 01.07.2025 |
| Bisherige Einordnung | **KORREKT** — keine Korrektur nötig |

---

## B) ISO 27001 — Tiefenprüfung

### Behauptung: SEC-05 ist Eingangsblocker (ISO 27001 DAkkS-akkreditiert bei Antragstellung)

### Prüfkette (drei Ebenen)

**Ebene 1 — Verordnung (DiPAV §8 Abs. 3 Satz 2):**
> „Das Bundesinstitut für Arzneimittel und Medizinprodukte **kann** ergänzend
> die Vorlage eines geeigneten Zertifikates oder Nachweises über ein
> Informationssicherheitsmanagementsystem verlangen."

Verbindlichkeit: **ERMESSEN** („kann"), nicht „muss". Die Verordnung allein
würde kein zwingendes ISMS-Zertifikat verlangen.

**Ebene 2 — BSI TR-03161-3 O.Org_1:**
> „Der Betreiber der Hintergrundsysteme **MUSS** eine Zertifizierung nach
> [ISO27001], auf der Basis von IT-Grundschutz [BSI27001] **oder einem
> vergleichbaren Standard** nachweisen."

Verbindlichkeit: **MUSS** (über DiPAV §5 Abs. 2 Nr. 1 → §78a Abs. 7 SGB XI
rechtsverbindlich). Die TR erlaubt drei Wege:
1. ISO 27001
2. ISO 27001 auf Basis IT-Grundschutz
3. Vergleichbarer Standard

**Ebene 3 — BfArM-Leitfaden v1.3, Kap. 3.4.1 (S. 50):**
> „Der Hersteller einer DiPA **muss bei der Antragstellung** ein Zertifikat
> über die Umsetzung eines ISMS nach ISO 27001 bzw. ISO 27001 auf Basis
> IT-Grundschutz vorweisen."

> „Die zertifizierende Stelle muss durch die **DAkkS oder eine entsprechende
> ausländische Stelle** für die Durchführung einer ISO 27001 Zertifizierung
> **akkreditiert sein**."

Verbindlichkeit: **VERWALTUNGSPRAXIS** — der Leitfaden verengt den Spielraum
der TR (die „vergleichbaren Standard" erlaubt) auf ISO 27001.

### Kritische Analyse: Ist „vergleichbarer Standard" ein Ausweg?

**Theoretisch ja, praktisch nein.**

Die TR-03161-3 O.Org_1 erlaubt „vergleichbaren Standard", aber:
- Der BfArM-Leitfaden nennt nur ISO 27001 und IT-Grundschutz
- Die TR-03161-Prüfstelle wird den Leitfaden berücksichtigen
- Ein Hersteller, der mit „vergleichbarem Standard" argumentiert, riskiert
  Rückfragen und Verzögerung ohne Gewissheit

**Empfehlung:** ISO 27001 bleibt der sichere Weg. Die Option „vergleichbarer
Standard" sollte als NOTFALL-ALTERNATIVE dokumentiert, aber nicht als
Planungsgrundlage verwendet werden.

### Muss es DAkkS-akkreditiert sein?

**JA** — laut Leitfaden Kap. 3.4.1 (S. 50). Die DiPAV selbst schreibt dies
nicht vor, aber die BfArM-Verwaltungspraxis verlangt es.

| Quelle | Aussage |
|---|---|
| DiPAV §8 Abs. 3 Satz 2 | „kann … Nachweis über ein ISMS verlangen" — keine DAkkS-Vorgabe |
| TR-03161-3 O.Org_1 | „MUSS … Zertifizierung nachweisen" — keine DAkkS-Spezifikation |
| Leitfaden Kap. 3.4.1 | „DAkkS oder entsprechende ausländische Stelle" — **konkrete Vorgabe** |

### Bewertung

| Aspekt | Einordnung |
|---|---|
| ISMS-Pflicht | **GESETZLICHE PFLICHT** (TR-03161-3 O.Org_1 MUSS, verbindlich über §78a) |
| ISO 27001 spezifisch | **VERWALTUNGSPRAXIS** (Leitfaden verengt; TR erlaubt „vergleichbar") |
| DAkkS-Akkreditierung | **VERWALTUNGSPRAXIS** (nur im Leitfaden, nicht in DiPAV oder TR) |
| Zeitpunkt | Bei Antragstellung (Leitfaden: „muss bei der Antragstellung … vorweisen") |
| Bisherige Einordnung | **KORREKT** — SEC-05 bleibt Eingangsblocker |

### Kosten ISO 27001 (Startup <10 MA, enger Scope)

| Posten | Minimum | Maximum | Empfohlen |
|---|---|---|---|
| ISMS-Aufbau (Beratung oder Plattform) | 5.000 € | 25.000 € | 10.000–15.000 € |
| Erstaudit (DAkkS-akkreditiert) | 4.000 € | 8.000 € | 5.000–6.000 € |
| **Erstjahr gesamt** | **9.000 €** | **33.000 €** | **15.000–21.000 €** |
| Jährl. Überwachung (ab Jahr 2) | 3.000 € | 5.000 € | 4.000 € |

Quellen: Secjur, ISB Dresden, TrustSpace, Blackfort Technology (Marktrecherche 15.08.2026)

**Korrektur:** Die bisherige Schätzung von 25.000–55.000 € (empfohlen 30.000–40.000 €)
war zu HOCH. Mit ISMS-Plattform-Ansatz (z. B. TrustSpace, Secjur, Vanta) statt
klassischer Vollberatung sind 15.000–25.000 € realistisch.

---

## C) Penetrationstest — Tiefenprüfung

### Behauptung: SEC-04 erfordert externen Pentest

### Prüfkette

**DiPAV §8 Abs. 3 Satz 5:**
> „Erfolgt der Nachweis der Erfüllung der Anforderungen an die Datensicherheit
> abweichend von Satz 1 **zunächst durch eine Erklärung nach Satz 4**, kann das
> Bundesinstitut [...] ergänzend die Vorlage von Berichten über die
> Durchführung von **Penetrationstests** oder die Vorlage von
> Sicherheitsgutachten [...] verlangen."

**ACHTUNG:** Satz 5 gilt NUR auf dem Erklärungsweg (Satz 4). Dieser ist seit
01.07.2025 geschlossen (siehe Abschnitt A). Die gesetzliche Grundlage für
einen eigenständigen Pentest-Nachweis ist damit ENTFALLEN.

**BfArM-Leitfaden v1.3, Kap. 3.4.2 (S. 51):**
> „Für die Produktversion, für die eine Aufnahme in das DiPA-Verzeichnis
> beantragt wird, **muss** für alle Komponenten (einschließlich aller
> Backend-Komponenten) ein Penetrationstest durchgeführt worden sein."

> „Der Test **soll** vorrangig von BSI zertifizierten Teststellen durchgeführt
> werden."

> „Verpflichtende Bestandteile der Penetrationstests sind manuelle Code Reviews
> und ein Whitebox-Test."

**ABER** im selben Kapitel:
> „Durch die Zertifizierung nach TR-03161 **entfällt die Notwendigkeit eines
> zusätzlichen Pen-Tests.**"

### Analyse

| Frage | Antwort | Quelle |
|---|---|---|
| Ist ein Pentest gesetzlich vorgeschrieben? | NEIN — §8 Abs. 3 Satz 5 gilt nur auf dem geschlossenen Erklärungsweg | DiPAV §8 Abs. 3 |
| Verlangt der Leitfaden einen Pentest? | JA — als Pflichtbestandteil | Leitfaden Kap. 3.4.2 |
| Braucht man ihn ZUSÄTZLICH zu TR-03161? | **NEIN** — TR-03161 deckt ihn ab | Leitfaden Kap. 3.4.2 |
| Muss die Teststelle BSI-zertifiziert sein? | SOLL, nicht MUSS — aber TR-03161-Prüfstelle ist BSI-anerkannt | Leitfaden Kap. 3.4.2 |
| Reicht ein interner Sicherheitstest? | NEIN — der Pentest geht in die TR-03161-Prüfung auf, die extern ist | Logische Folge |

### Bewertung

| Aspekt | Einordnung |
|---|---|
| Eigenständige Rechtsgrundlage | **ENTFALLEN** (§8 Abs. 3 Satz 5 nur auf Erklärungsweg) |
| Leitfaden-Anforderung | **VERWALTUNGSPRAXIS** — „muss durchgeführt worden sein" |
| Verhältnis zu TR-03161 | **ABSORBIERT** — TR-03161-Zertifizierung ersetzt separaten Pentest |
| Separate Beschaffung | **NICHT EMPFOHLEN** — BfArM bestätigt Absorption |
| Bisherige Einordnung | **TEILWEISE KORRIGIERT** — SEC-04 war bereits als „ein Beschaffungsvorgang mit SEC-01" markiert, aber die BfArM-Bestätigung der Absorption fehlte |

### Kosteneffekt

SEC-04 als separater Posten entfällt. Die Pentest-Kosten (8.000–15.000 €)
sind in den TR-03161-Kosten enthalten. Die bisherige Kostenschätzung hat
SEC-01+04 bereits zusammengefasst — hier keine Doppelzählung.

---

## D) Kostenvalidierung

### Bisherige Schätzung (GESAMTUEBERSICHT_EXTERNE_NACHWEISE.md)

| Paket | Empfohlen (bisher) |
|---|---|
| SEC-01+04 (TR-03161 + Pentest) | 30.000–40.000 € |
| SEC-05 (ISO 27001) | 30.000–40.000 € |
| DS-02+04+PROD-02+VS-04 (Datenschutzpaket) | 20.000–25.000 € |
| QI-01 (Pflegefachkraft) | 5.000 € |
| NN-01 (Evaluationskonzept) | 20.000–30.000 € |
| BF-01+02 (Barrierefreiheit) | 10.000 € |
| **Gesamt** | **115.000–150.000 €** |

### Korrigierte Schätzung (marktrecherchiert, 15.08.2026)

| Paket | Minimum | Maximum | Empfohlen | Korrektur |
|---|---|---|---|---|
| SEC-01+04 (TR-03161 inkl. Pentest) | 30.000 € | 60.000 € | 35.000–50.000 € | Etwas HÖHER — Marktpreise 2026 über bisheriger Schätzung |
| SEC-05 (ISO 27001) | 9.000 € | 33.000 € | 15.000–25.000 € | **NIEDRIGER** — ISMS-Plattform statt Vollberatung, <10 MA |
| DS-02+04 (Datenschutzpaket) | 8.000 € | 25.000 € | 12.000–18.000 € | **NIEDRIGER** — DSFA/VVT teilweise intern vorhanden |
| QI-01 (Pflegefachkraft) | 3.000 € | 8.000 € | 5.000 € | Unverändert |
| NN-01 (Evaluationskonzept) | 15.000 € | 40.000 € | 18.000–25.000 € | Leicht NIEDRIGER |
| BF-01+02 (Barrierefreiheit) | 0 € | 15.000 € | 0–5.000 € | **NIEDRIGER** — BF-01 geschlossen, summativ intern möglich |
| BfArM-Beratung | 0 € | 0 € | 0 € | Unverändert |
| **Gesamt** | **65.000 €** | **181.000 €** | **85.000–128.000 €** |

### Einzelkritik

**SEC-01+04 (TR-03161):** Die Marktpreise für BSI-anerkannte Prüfstellen
liegen bei 30.000–80.000 € für die Prüfung selbst, zuzüglich interner
Vorbereitung. Da der PflegeCoach nur zwei TR-Teile braucht (Web + Backend,
kein Mobile) und ein relativ schlankes Produkt ist, liegt 35.000–50.000 € im
realistischen Bereich. Die bisherige Schätzung von 30.000–40.000 € war am
unteren Rand.

**SEC-05 (ISO 27001):** Die bisherige Schätzung von 30.000–40.000 € basierte
offenbar auf klassischer Vollberatung. Für ein Startup mit <10 Mitarbeitern
und engem Scope (nur PflegeCoach, nicht Gesamtbetrieb) sind
ISMS-Plattform-Angebote (TrustSpace, Secjur, Vanta) erheblich günstiger:
10.000–15.000 € für ISMS-Aufbau, 5.000–6.000 € für das DAkkS-Erstaudit.
**Einsparung: 10.000–20.000 €.**

**Datenschutzpaket:** Die DSFA-Vorbereitung und das Verarbeitungsverzeichnis
sind intern bereits teilweise vorhanden. Externe Rechtsberatung ist für AVV-
Prüfung und DiPA-spezifische Datenschutzerklärung nötig, aber nicht für die
Grundlagenarbeit. **Einsparung: 5.000–10.000 €.**

**Barrierefreiheit:** BF-01 ist geschlossen. BF-02 (summative Nutzertests)
kann mit internen Mitteln durchgeführt werden, sofern die Testpersonen der
Zielgruppe entsprechen. **Einsparung: 5.000–10.000 €.**

### Was die Schätzung NICHT enthält (und auch bisher nicht)

| Posten | Geschätzte Kosten | Anmerkung |
|---|---|---|
| Evaluationsstudie (Durchführung) | 50.000–200.000 € | Erst nach Erprobungs-Genehmigung |
| Jährliche Folgekosten (Audits etc.) | 10.000–20.000 €/Jahr | Ab Jahr 2 |
| C5-Risiko (s. Abschnitt F) | 0–50.000 € | Falls Infrastruktur-Migration nötig |
| BSI-Gebühren | 1.000–5.000 € | Behördenseitig (BMI-Gebührenverordnung) |

---

## E) Nachreichbarkeit

### Was MUSS bei Antragstellung vorliegen?

| Nachweis | Quelle | Verbindlichkeit |
|---|---|---|
| TR-03161-Zertifikat | §78a Abs. 7 → §139e Abs. 10 Satz 3 SGB V; Leitfaden Kap. 3.4 | **GESETZLICHE PFLICHT** seit 01.01.2025; formale Vollständigkeit seit 01.07.2025 |
| ISO 27001-Zertifikat (DAkkS) | Leitfaden Kap. 3.4.1; TR-03161-3 O.Org_1 | **VERWALTUNGSPRAXIS** (Leitfaden) / **PFLICHT** (TR) |
| Datensicherheits-Selbsterklärung | — | ENTFALLEN — durch Zertifikatspflicht ersetzt |
| Datenschutz-Selbsterklärung | DiPAV §8 Abs. 4 Satz 2 (Übergangsregel) | **PFLICHT** — keine Zertifizierung verfügbar (s. u.) |
| Pflegerischer Nutzen ODER Erprobungs-Unterlagen | §78a Abs. 4 Nr. 3 / Abs. 6a | **GESETZLICHE PFLICHT** |
| Sicherheit, Funktionstauglichkeit, Qualität | §78a Abs. 4 Nr. 1 | **GESETZLICHE PFLICHT** |

### Was kann während des Prüfverfahrens nachgereicht werden?

**NUR auf Anforderung des BfArM** — eigeninitiative Ergänzung ist nicht
möglich (DiPAV §15 beschränkt Nachreichung auf BfArM-Aufforderung).

§78a Abs. 5 Satz 2 SGB XI: Bei unvollständigen Unterlagen fordert das BfArM
innerhalb von drei Monaten zur Ergänzung auf. Nach Ablauf der Frist: Ablehnung.

### Was muss erst vor Aufnahme ins Verzeichnis vorliegen?

Die Vergütungsvereinbarung (§78a Abs. 1) wird erst NACH der
Aufnahmeentscheidung verhandelt (innerhalb von drei Monaten). Sie ist keine
Voraussetzung für die Antragstellung.

### Sonderfall: Datenschutz-Zertifizierung

**STATUS: NICHT VERFÜGBAR.** Es gibt zum jetzigen Zeitpunkt keine
akkreditierten Zertifizierstellen für die Datenschutz-Zertifizierung nach
§78a Abs. 8 SGB XI (BfArM bestätigt dies auf seiner Webseite).

**Konsequenz:** Die Übergangsregel greift — Datenschutz wird weiterhin per
Selbsterklärung nach §4 Abs. 6 Satz 2 DiGAV nachgewiesen. Das BfArM wird
die Zertifizierungspflicht erst mit „hinreichendem zeitlichem Vorlauf"
einfordern, sobald es „technisch und organisatorisch möglich ist."

---

## F) NEUER BEFUND: C5-Attestation-Lücke

### TR-03161-3 O.Org_2 (wörtlich):

> „Ist das Hintergrundsystem ganz oder teilweise als Cloud-Lösung realisiert,
> **MUSS** der Cloud-Anbieter über ein **C5 Testat vom Typ 2 oder ein
> vergleichbares Testat oder Zertifikat** verfügen."

### Ist-Zustand unserer Cloud-Dienstleister

| Anbieter | SOC 2 Type II | ISO 27001 | BSI C5 | HIPAA |
|---|---|---|---|---|
| Supabase | JA | JA | **NEIN** | JA |
| Vercel | JA | JA | **NEIN** | JA |

Quellen: supabase.com/security, vercel.com/docs/security/compliance

### C5-Testat in Deutschland verfügbar bei:

Hetzner Cloud, IONOS Cloud, Microsoft Azure (DE-Regionen), AWS (Frankfurt),
SAP, T-Systems — **NICHT** bei Supabase, Vercel, Netlify, Railway, Render.

### Risikobewertung

Die Formulierung „**oder ein vergleichbares Testat oder Zertifikat**" öffnet
einen Argumentationsweg: SOC 2 Type II ist ein international anerkanntes
Sicherheitstestat mit vergleichbarem Prüfumfang. Beide Anbieter besitzen
zusätzlich ISO 27001.

**ABER:** Ob SOC 2 Type II als „vergleichbar" im Sinne von O.Org_2 akzeptiert
wird, entscheidet die TR-03161-Prüfstelle (und ggf. das BSI bei der
Zertifikatsbestätigung). Dies ist eine **offene Risikofrage**, die VOR der
Beauftragung der TR-03161-Prüfung geklärt werden muss.

### Szenarien

| Szenario | Kosten | Wahrscheinlichkeit |
|---|---|---|
| SOC 2 Type II wird als „vergleichbar" akzeptiert | 0 € | Mittel — argumentierbar, aber nicht gesichert |
| Supabase läuft auf AWS Frankfurt → AWS hat C5 → indirekte Abdeckung | 0–2.000 € (Dokumentation) | Möglich — hängt von Scope des AWS-C5-Testats ab |
| Migration auf C5-attested Infrastruktur nötig | 20.000–50.000 € | Gering — aber existentielles Risiko bei Ablehnung |

### Handlungsempfehlung

1. **Sofort:** Bei der BfArM-Beratung die Frage stellen, ob SOC 2 Type II
   für Cloud-Anbieter als „vergleichbares Testat" i. S. v. O.Org_2 akzeptiert wird
2. **Parallel:** Prüfen, ob das AWS-C5-Testat den von Supabase genutzten
   AWS-Frankfurt-Scope abdeckt
3. **Fallback:** Migrationskostenabschätzung für Hetzner Cloud / IONOS vorbereiten

### Bisheriger Fehler

Die GESAMTUEBERSICHT_EXTERNE_NACHWEISE.md (Zeile 271) listet „C5-Testate
anfragen | Supabase (O.Org_2) | Nicht begonnen | 1 Tag (Anfrage)" — das
suggeriert, C5-Testate seien bei Supabase einfach anforderbar. **Das ist
falsch:** Supabase besitzt kein C5-Testat und wird auf absehbare Zeit keines
haben.

---

## G) Zusammenfassung: Was war zu streng, was zu weich?

### Bestätigt — Einordnung KORREKT

| Punkt | Einordnung | Status |
|---|---|---|
| SEC-01 (TR-03161) | Eingangsblocker | KORREKT — gesetzliche Pflicht seit 01.07.2025 |
| SEC-05 (ISO 27001) | Eingangsblocker | KORREKT — VERWALTUNGSPRAXIS mit TR-Rückendeckung |
| NN-01 (Evaluationskonzept) | Eingangsblocker | KORREKT — §78a Abs. 6a verlangt unabhängiges Evaluationskonzept |
| SEC-01 Erklärungsweg geschlossen | Seit 01.07.2025 | KORREKT — Prüfverfahren verfügbar, Übergangsregel entfallen |
| Datenschutz-Zertifizierung Übergang | Unbefristet offen | KORREKT — keine akkreditierten Stellen vorhanden |

### Korrigiert — bisherige Einordnung zu STRENG

| Punkt | Bisher | Korrektur | Einsparung |
|---|---|---|---|
| SEC-05 Kosten | 30.000–40.000 € | 15.000–25.000 € (ISMS-Plattform) | 10.000–20.000 € |
| Datenschutzpaket Kosten | 20.000–25.000 € | 12.000–18.000 € (intern vorgearbeitet) | 5.000–10.000 € |
| BF-01+02 Kosten | 10.000 € | 0–5.000 € (BF-01 geschlossen, BF-02 intern) | 5.000–10.000 € |
| SEC-04 Eigenständigkeit | Separater Antragsblocker | In SEC-01 absorbiert (BfArM bestätigt) | Klarheit, kein Kosteneffekt (war schon zusammengefasst) |

### Korrigiert — bisherige Einordnung zu WEICH

| Punkt | Bisher | Korrektur |
|---|---|---|
| C5-Testate Supabase/Vercel | „1 Tag Anfrage" | **EXISTIEREN NICHT** — offene Risikofrage |
| SEC-01+04 Kosten | 30.000–40.000 € | 35.000–50.000 € (Marktpreise 2026) |

### Gesamtkostenkorrektur

| | Bisher | Korrigiert | Differenz |
|---|---|---|---|
| Minimum | 78.000 € | 65.000 € | -13.000 € |
| Maximum | 213.000 € | 181.000 € | -32.000 € |
| Empfohlen | 115.000–150.000 € | **85.000–128.000 €** | **-30.000 bis -22.000 €** |

Die Einsparung kommt primär aus:
- Realistischere ISO 27001-Kosten für ein Startup (-15.000 €)
- Intern vorhandene Datenschutz-Vorarbeit (-7.000 €)
- BF-01 bereits geschlossen (-5.000 €)

### Risiko-Aufschlag bei C5-Ablehnung

Falls SOC 2 Type II NICHT als „vergleichbares Testat" akzeptiert wird,
steigt die Gesamtschätzung um 20.000–50.000 € für Infrastruktur-Migration.
Das würde den Korridor auf 105.000–178.000 € verschieben.

---

## H) Offene Fragen für die BfArM-Beratung

1. **C5 vs. SOC 2:** Wird SOC 2 Type II als „vergleichbares Testat" i. S. v.
   TR-03161-3 O.Org_2 akzeptiert?
2. **ISO 27001 Scope:** Muss das Zertifikat den Gesamtbetrieb oder nur den
   DiPA-Scope abdecken? (Leitfaden: „auf den Hersteller der DiPA ausgestellt")
3. **Capacitor/WebView:** Zählt die Capacitor-basierte iOS-App als
   „Webanwendung" (TR-03161-2) oder als „Mobile Anwendung" (TR-03161-1)?
4. **Doppelzielgruppe:** Ist die Kombination Pflegebedürftige + Angehörige
   in einem Produkt zulässig (seit DiPAV-ÄndV 01.07.2026)?

---

*Erstellt: 15.08.2026. Nächste Aktualisierung: nach BfArM-Beratungstermin.*
