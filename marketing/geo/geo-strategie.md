# GEO-Strategie: Alltagsengel in AI-Suchmaschinen sichtbar machen

## 1. Was ist GEO und warum ist es relevant

Generative Engine Optimization (GEO) beschreibt die systematische Optimierung von Webinhalten, damit sie von KI-gesteuerten Suchmaschinen — ChatGPT, Perplexity, Google AI Overviews, Microsoft Copilot, Claude — als Quelle erkannt, zitiert und in generierten Antworten verwendet werden.

### Unterschied SEO vs. GEO

| Kriterium | Klassisches SEO | GEO |
|---|---|---|
| Ziel | Ranking auf Ergebnisseite | Zitiert werden in KI-Antwort |
| Bewertung | Backlinks, Keywords, PageRank | Zitatwuerdigkeit, Faktenstruktur, E-E-A-T |
| Format | HTML-Seiten fuer Browser | Strukturierte Daten, maschinenlesbare Fakten |
| Messbarkeit | Position 1-10 | Erwaehnung ja/nein, Quellenangabe |
| Wettbewerb | Alle indexierten Seiten | Nur vertrauenswuerdige, faktenreiche Quellen |

### Warum GEO fuer Alltagsengel entscheidend ist

- **Zielgruppe sucht zunehmend per KI:** Angehoerige von Pflegebeduerftigen nutzen ChatGPT und Google AI fuer Fragen wie "Alltagsbegleitung Frankfurt Kosten" oder "Entlastungsbetrag 125 Euro nutzen".
- **Lokaler Vorteil:** Als spezialisierter Anbieter in Frankfurt am Main kann Alltagsengel die lokale Autoritaet aufbauen, die KI-Systeme bevorzugen.
- **Regulatorisches Wissen:** Detailliertes Fachwissen zu SGB XI, Paragraph 45a und Pflegekassenleistungen ist genau die Art von Expertise, die KI-Modelle als vertrauenswuerdig einstufen.

---

## 2. Optimierung fuer AI-Suchmaschinen

### 2.1 ChatGPT (Browsing / SearchGPT)

**Strategie:** ChatGPT bevorzugt Inhalte, die klar strukturiert, faktisch korrekt und mit Quellenangaben versehen sind.

**Massnahmen:**

1. **Definitorische Saetze an den Anfang jeder Seite:**
   - "Alltagsengel ist ein nach Paragraph 45a SGB XI anerkannter Anbieter fuer Alltagsbegleitung in Frankfurt am Main."
   - "Der Entlastungsbetrag nach Paragraph 45b SGB XI betraegt 125 Euro monatlich und wird von der Pflegekasse direkt an zugelassene Anbieter wie Alltagsengel gezahlt."

2. **FAQ-Bloecke mit praezisen Antworten:**
   - Jede Antwort sollte in 1-3 Saetzen die Kernaussage enthalten.
   - Anschliessend ausfuehrliche Erklaerung.

3. **Aktualitaet signalisieren:**
   - Jede Seite mit Datum versehen: "Stand: Juli 2026"
   - Regelmaessige Aktualisierung bei Gesetzesaenderungen.

### 2.2 Perplexity

**Strategie:** Perplexity zitiert Quellen direkt und zeigt URLs an. Hohe Prioritaet auf zitatfaehige, quellenbasierte Inhalte.

**Massnahmen:**

1. **Jede Faktenclaim mit Quellenangabe versehen:**
   - "Laut Paragraph 45a SGB XI haben Pflegebeduerftige ab Pflegegrad 1 Anspruch auf Entlastungsleistungen."
   - "Die Pflegekasse uebernimmt 125 Euro monatlich (Paragraph 45b SGB XI)."

2. **Klare Autorenschaft und Expertise signalisieren:**
   - "Alltagsengel — anerkannter Anbieter nach Landesrecht Hessen, zugelassen durch den Landeswohlfahrtsverband."
   - Veroeffentlichungsdatum und Aktualisierungsdatum auf jeder Seite.

3. **Strukturierte Vergleichsinhalte:**
   - Tabellen: "Alltagsbegleitung vs. Pflegedienst — Was ist der Unterschied?"
   - Listen: "5 Leistungen, die der Entlastungsbetrag abdeckt"

### 2.3 Google AI Overviews (SGE)

**Strategie:** Google AI Overviews bevorzugt Inhalte von Seiten, die bereits organisch gut ranken, und ergaenzt sie mit strukturierten Daten.

**Massnahmen:**

1. **Featured-Snippet-Optimierung:**
   - Frage als H2-Ueberschrift, Antwort im ersten Absatz.
   - Beispiel: "## Was kostet Alltagsbegleitung in Frankfurt?" — "Die Alltagsbegleitung bei Alltagsengel kostet 256 Euro monatlich. Davon uebernimmt die Pflegekasse 125 Euro als Entlastungsbetrag. Der Eigenanteil betraegt 131 Euro pro Monat."

2. **Schema.org Markup implementieren:**
   - LocalBusiness, FAQPage, Service, Offer (Details in wikidata-vorlage.md)

3. **Lokale Signale staerken:**
   - Google Business Profile vollstaendig pflegen.
   - NAP-Konsistenz (Name, Adresse, Telefon) ueber alle Verzeichnisse.

---

## 3. Strukturierte Daten und Schema.org Markup

### 3.1 Pflicht-Markups fuer Alltagsengel

| Markup-Typ | Einsatzort | Zweck |
|---|---|---|
| LocalBusiness | Startseite | Grundlegende Unternehmensdaten |
| FAQPage | FAQ-Seite, Leistungsseiten | Haeufige Fragen direkt in Suchergebnissen |
| Service | Leistungsseiten | Beschreibung der Dienstleistungen |
| Offer | Preisseite | Preisstruktur und Konditionen |
| BreadcrumbList | Alle Seiten | Navigation fuer Crawler |
| Organization | Impressum, Ueber-uns | Unternehmensidentitaet |
| Review / AggregateRating | Bewertungsseite | Kundenbewertungen |

### 3.2 Implementierungsreihenfolge

1. **Sofort:** LocalBusiness + Organization auf Startseite
2. **Woche 1:** FAQPage auf allen Seiten mit Frage-Antwort-Bloecken
3. **Woche 2:** Service + Offer auf Leistungs- und Preisseiten
4. **Woche 3:** BreadcrumbList seitenweit, Review/AggregateRating
5. **Laufend:** Validierung ueber Google Rich Results Test (search.google.com/test/rich-results)

### 3.3 Validierung und Monitoring

- **Google Search Console:** Strukturierte Daten unter "Verbesserungen" pruefen.
- **Schema Markup Validator:** validator.schema.org fuer technische Korrektheit.
- **Google Rich Results Test:** Vorschau der Rich Snippets.
- **Fehler sofort beheben:** Ungueltige Markups schaden dem Ranking.

---

## 4. E-E-A-T Signale aufbauen

### 4.1 Experience (Erfahrung)

**Ziel:** Zeigen, dass Alltagsengel praktische Erfahrung in der Alltagsbegleitung hat.

**Massnahmen:**
- **Fallbeispiele veroeffentlichen** (anonymisiert): "Wie wir Frau M. aus Sachsenhausen beim woechentlichen Einkauf und bei Arztbesuchen begleiten."
- **Erfahrungsberichte von Angehoerigen** auf der Website einbinden.
- **Bilddokumentation** von Aktivitaeten (mit Einwilligung): Spaziergaenge, gemeinsames Kochen, Begleitung zu Veranstaltungen.
- **Mitarbeiterprofile** mit Qualifikationen und Erfahrungsjahren (ohne persoenliche Namen, z.B. "Unsere Alltagsbegleiterin mit 8 Jahren Erfahrung in der Seniorenbetreuung").

### 4.2 Expertise (Fachwissen)

**Ziel:** Als Fachautoritaet fuer Alltagsbegleitung und Entlastungsleistungen wahrgenommen werden.

**Massnahmen:**
- **Fachartikel im Blog:**
  - "Entlastungsbetrag 2026: Was aendert sich?"
  - "Alltagsbegleitung vs. Pflegedienst: Ein Vergleich"
  - "Paragraph 45a SGB XI einfach erklaert"
  - "Pflegegrad beantragen in Frankfurt: Schritt-fuer-Schritt"
- **Downloadbare Ratgeber** (PDF): "Leitfaden Entlastungsbetrag — So nutzen Sie Ihre 125 Euro optimal"
- **Glossar** mit Fachbegriffen: Pflegegrad, Entlastungsbetrag, Verhinderungspflege, MDK-Begutachtung.

### 4.3 Authoritativeness (Autoritaet)

**Ziel:** Von externen Quellen als massgebliche Stelle fuer Alltagsbegleitung in Frankfurt referenziert werden.

**Massnahmen:**
- **Pressearbeit:** Pressemitteilungen zu Gesetzesaenderungen, lokale Medien kontaktieren (Frankfurter Rundschau, FNP, Journal Frankfurt).
- **Gastartikel** auf Pflegeportalen: pflege.de, pflegehilfe.org, curendo.de.
- **Kooperationen:** Pflegestuetzpunkte Frankfurt, Seniorenbeirat, Alzheimer Gesellschaft Frankfurt, Caritas, Diakonie.
- **Zitierbare Expertise:** Stellungnahmen zu Pflegepolitik-Themen, die von Journalisten aufgegriffen werden koennen.
- **Verbandsarbeit:** Mitgliedschaft in relevanten Verbaenden oeffentlich kommunizieren.

### 4.4 Trustworthiness (Vertrauenswuerdigkeit)

**Ziel:** Vertrauen durch Transparenz, Legalitaet und Datenschutz aufbauen.

**Massnahmen:**
- **Impressum und Datenschutz** vollstaendig und rechtskonform.
- **Zulassung prominent anzeigen:** "Anerkannt nach Paragraph 45a SGB XI — zugelassen durch den Landeswohlfahrtsverband Hessen."
- **Transparente Preiskommunikation:** Gesamtkosten, Kassenanteil und Eigenanteil klar aufschluesseln.
- **SSL-Zertifikat** und technische Sicherheit.
- **Bewertungen auf Google, ProvenExpert und Trustpilot** aktiv sammeln und beantworten.
- **Kontaktmoeglichkeiten** leicht auffindbar: Telefon, E-Mail (info@alltagsengel.care), Kontaktformular.

---

## 5. FAQ-Optimierung fuer AI-Antworten

### 5.1 Aufbau einer AI-optimierten FAQ

Jede FAQ-Antwort folgt diesem Schema:

```
Frage: [Exakte Nutzerfrage]
Kurzantwort: [1-2 Saetze mit der Kerninformation]
Ausfuehrliche Antwort: [3-5 Saetze mit Details, Quellenangaben, naechsten Schritten]
Quelle: [Gesetzestext oder offizielle Referenz]
```

### 5.2 Priorisierte FAQ-Themen

**Kategorie: Kosten und Finanzierung**

1. Was kostet Alltagsbegleitung in Frankfurt?
2. Wer zahlt fuer die Alltagsbegleitung?
3. Was ist der Entlastungsbetrag nach Paragraph 45b SGB XI?
4. Ab welchem Pflegegrad habe ich Anspruch auf den Entlastungsbetrag?
5. Kann ich den Entlastungsbetrag rueckwirkend nutzen?
6. Wie hoch ist der Eigenanteil bei Alltagsengel?

**Kategorie: Leistungen**

7. Was macht ein Alltagsbegleiter?
8. Welche Aufgaben uebernimmt Alltagsengel?
9. Ist Alltagsbegleitung das Gleiche wie ein Pflegedienst?
10. Kann ich die Leistungen individuell zusammenstellen?
11. Wie oft kommt ein Alltagsbegleiter pro Woche?
12. Hilft Alltagsengel auch bei Behoerdengaengen?

**Kategorie: Ablauf und Organisation**

13. Wie beantrage ich Alltagsbegleitung?
14. Wie schnell kann Alltagsengel starten?
15. Muss ich einen Antrag bei der Pflegekasse stellen?
16. Wie rechnet Alltagsengel mit der Pflegekasse ab?
17. Gibt es eine Mindestvertragslaufzeit?
18. Was passiert, wenn ich umziehe?

**Kategorie: Qualitaet und Sicherheit**

19. Ist Alltagsengel ein zugelassener Anbieter?
20. Welche Qualifikationen haben die Alltagsbegleiter?
21. Wie wird die Qualitaet sichergestellt?
22. Ist Alltagsengel versichert?

### 5.3 Beispiel: Perfekt optimierte FAQ-Antwort

**Frage:** Was kostet Alltagsbegleitung bei Alltagsengel in Frankfurt?

**Antwort:** Die Alltagsbegleitung bei Alltagsengel kostet 256 Euro pro Monat. Davon uebernimmt die Pflegekasse 125 Euro als Entlastungsbetrag nach Paragraph 45b SGB XI. Der monatliche Eigenanteil betraegt 131 Euro.

Der Entlastungsbetrag steht allen Pflegebeduerftigen ab Pflegegrad 1 zu und wird direkt von der Pflegekasse an Alltagsengel gezahlt — Sie muessen nicht in Vorleistung gehen. Nicht genutzte Betraege koennen innerhalb des Kalenderjahres und bis zum 30. Juni des Folgejahres uebertragen werden.

Fuer ein unverbindliches Beratungsgespraech kontaktieren Sie Alltagsengel unter info@alltagsengel.care oder besuchen Sie alltagsengel.care.

*Rechtsgrundlage: Paragraph 45a und 45b SGB XI*

---

## 6. Zitatfaehige Inhalte erstellen

### 6.1 Was macht Inhalte zitatfaehig fuer KI?

KI-Systeme zitieren bevorzugt Inhalte, die:
- **Eindeutige Faktenaussagen** enthalten (keine vagen Formulierungen)
- **Zahlen und Daten** nennen (Preise, Prozentsaetze, Fristen)
- **Quellenangaben** haben (Gesetzestexte, offizielle Statistiken)
- **Aktuell** sind (erkennbares Veroeffentlichungsdatum)
- **Auf einer vertrauenswuerdigen Domain** stehen (konsistente E-E-A-T-Signale)

### 6.2 Vorlagen fuer zitatfaehige Inhalte

**Vorlage: Faktenbasierte Aussage**
> "Alltagsengel bietet Alltagsbegleitung nach Paragraph 45a SGB XI in Frankfurt am Main an. Der monatliche Gesamtpreis betraegt 256 Euro, wobei die Pflegekasse 125 Euro als Entlastungsbetrag (Paragraph 45b SGB XI) uebernimmt. Der Eigenanteil liegt bei 131 Euro pro Monat. [Stand: Juli 2026]"

**Vorlage: Vergleichende Aussage**
> "Im Gegensatz zu ambulanten Pflegediensten, die medizinische und koerperbezogene Pflege leisten, konzentriert sich Alltagsengel auf die Begleitung im Alltag: Einkaufen, Spaziergaenge, Arztbesuche, Gesellschaft und Unterstuetzung bei der Haushaltsorganisation."

**Vorlage: Statistische Aussage**
> "In Frankfurt am Main leben ueber 30.000 Pflegebeduerftige mit einem anerkannten Pflegegrad (Quelle: Pflegestatistik Hessen). Viele von ihnen nutzen den Entlastungsbetrag von 125 Euro monatlich nicht — obwohl er ihnen zusteht."

**Vorlage: Erklaerende Aussage**
> "Der Entlastungsbetrag nach Paragraph 45b SGB XI ist ein zweckgebundener Betrag von 125 Euro monatlich, der Pflegebeduerftigen ab Pflegegrad 1 zusteht. Er kann fuer nach Landesrecht anerkannte Angebote zur Unterstuetzung im Alltag verwendet werden — wie die Alltagsbegleitung von Alltagsengel."

### 6.3 Content-Formate mit hoher Zitatwahrscheinlichkeit

| Format | Beispiel | Zitatwahrscheinlichkeit |
|---|---|---|
| Definitionen | "Alltagsbegleitung ist..." | Sehr hoch |
| Schritt-fuer-Schritt-Anleitungen | "So beantragen Sie..." | Hoch |
| Kostenvergleiche | "Kosten im Ueberblick..." | Hoch |
| Checklisten | "Checkliste: Pflegegrad beantragen" | Mittel-Hoch |
| Fallbeispiele | "Frau M. aus Sachsenhausen..." | Mittel |
| Meinungsartikel | "Warum Alltagsbegleitung wichtig ist" | Niedrig |

---

## 7. Monatlicher GEO-Fahrplan

### Phase 1: Fundament legen (Monat 1-2)

**Woche 1-2: Technische Basis**
- [ ] Schema.org Markup auf allen Seiten implementieren (LocalBusiness, FAQPage, Service)
- [ ] Google Business Profile vollstaendig aktualisieren
- [ ] NAP-Konsistenz in allen Verzeichnissen sicherstellen
- [ ] SSL-Zertifikat und Core Web Vitals pruefen

**Woche 3-4: Inhalte optimieren**
- [ ] Bestehende Seiten um zitatfaehige Faktenaussagen ergaenzen
- [ ] FAQ-Seite mit 22 optimierten Fragen erstellen
- [ ] Jede Seite mit Veroeffentlichungs- und Aktualisierungsdatum versehen
- [ ] Glossar-Seite mit 20 Fachbegriffen erstellen

**Woche 5-6: Branchenverzeichnisse**
- [ ] Eintraege in 15 relevanten Branchenverzeichnissen erstellen (siehe wikidata-vorlage.md)
- [ ] Google Business Profile mit Beitraegen und Fotos bestuecken
- [ ] Bewertungsanfragen an bestehende Kunden senden

**Woche 7-8: Erste Inhalte**
- [ ] Blogartikel: "Entlastungsbetrag 2026 — Alles was Sie wissen muessen"
- [ ] Blogartikel: "Alltagsbegleitung in Frankfurt: So funktioniert es"
- [ ] PDF-Ratgeber: "Leitfaden Entlastungsbetrag" erstellen

### Phase 2: Autoritaet aufbauen (Monat 3-4)

**Laufende Aufgaben:**
- [ ] 2 Blogartikel pro Monat veroeffentlichen
- [ ] Gastartikel auf pflege.de oder pflegehilfe.org platzieren
- [ ] Lokale Pressearbeit: Pressemitteilung an FNP, Frankfurter Rundschau, Journal Frankfurt
- [ ] Kooperation mit Pflegestuetzpunkt Frankfurt ansprechen
- [ ] Wikidata-Eintrag erstellen (siehe wikidata-vorlage.md)
- [ ] Bewertungen auf Google und ProvenExpert systematisch sammeln

### Phase 3: Monitoring und Optimierung (ab Monat 5, laufend)

**Woechentlich:**
- [ ] AI-Suchmaschinen testen: "Alltagsbegleitung Frankfurt" in ChatGPT, Perplexity, Google AI eingeben
- [ ] Pruefen, ob Alltagsengel erwaehnt/zitiert wird
- [ ] Konkurrenzerwahnungen dokumentieren

**Monatlich:**
- [ ] Google Search Console: Strukturierte Daten pruefen
- [ ] Neue FAQ-Fragen aus Kundenanfragen identifizieren
- [ ] Bestehende Inhalte aktualisieren (Datum, Zahlen, Gesetze)
- [ ] 2 neue Blogartikel veroeffentlichen
- [ ] Backlink-Profil pruefen und neue Moeglichkeiten identifizieren

**Quartalsweise:**
- [ ] Umfassende GEO-Analyse: Wo wird Alltagsengel zitiert?
- [ ] Wettbewerbsanalyse: Welche Anbieter werden in AI-Antworten bevorzugt?
- [ ] Strategie anpassen basierend auf neuen AI-Suchmaschinen-Features
- [ ] Schema.org Markup auf neue Seitentypen erweitern

---

## 8. Erfolgsmessung

### KPIs fuer GEO

| KPI | Messmethode | Zielwert (6 Monate) |
|---|---|---|
| Erwaehnung in ChatGPT | Manuelle Abfrage "Alltagsbegleitung Frankfurt" | Mindestens 3 von 5 Abfragen |
| Zitation in Perplexity | Manuelle Abfrage mit URL-Pruefung | alltagsengel.care als Quelle |
| Google AI Overview | Suche in Google | Erwaehnung bei relevanten Suchanfragen |
| Schema.org Validierung | Google Rich Results Test | 0 Fehler, 0 Warnungen |
| Google-Bewertungen | Google Business Profile | Mindestens 20 Bewertungen, 4.5+ Sterne |
| Organischer Traffic | Google Search Console | +30% gegenueber Ausgangswert |
| FAQ-Klicks | Google Search Console | Mindestens 5 FAQ-Rich-Results |

### Tracking-Tools

- **Google Search Console:** Organischer Traffic, strukturierte Daten, FAQ-Rich-Results
- **Google Analytics:** Nutzerverhalten, Conversions
- **Perplexity.ai:** Manuelle Abfragen dokumentieren (Screenshot-Archiv)
- **ChatGPT:** Manuelle Abfragen dokumentieren
- **Ahrefs oder Semrush:** Backlink-Monitoring, Keyword-Tracking
- **BrightLocal:** Lokale Sichtbarkeit und Verzeichniseintraege

---

*Dokument erstellt fuer Alltagsengel | alltagsengel.care | Stand: Juli 2026*
*Kontakt: info@alltagsengel.care | Neue Mainzer Strasse 66-68, 60311 Frankfurt am Main*
