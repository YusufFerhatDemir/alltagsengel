# Retargeting-Plan — Alltagsengel

## 1. Pixel & Tag Setup

### Facebook Pixel

**Pixel-ID:** (nach Erstellung im Facebook Business Manager eintragen)

**Installation:**
- Facebook Pixel Basiscode im `<head>` aller Seiten auf alltagsengel.care einbinden
- Server-seitiges Tracking via Conversions API (CAPI) für höhere Datenqualität
- Consent Mode: Pixel erst nach Cookie-Consent feuern (DSGVO-konform)

**Standard-Events konfigurieren:**

| Event | Auslöser | Seite/Aktion |
|---|---|---|
| `PageView` | Automatisch | Alle Seiten |
| `ViewContent` | Seitenaufruf | /leistungen, /entlastungsbetrag, /preise |
| `Lead` | Formular-Submit | Kontaktformular abgesendet |
| `Contact` | Klick | Telefon-Link, E-Mail-Link |
| `CompleteRegistration` | Weiterleitung | App-Store-Weiterleitung |
| `InitiateCheckout` | Interaktion | Preisrechner genutzt |
| `Search` | Seitenaufruf | Interne Suche genutzt |
| `Schedule` | Formular-Submit | Beratungstermin gebucht |

**Custom Events:**

| Event | Auslöser | Parameter |
|---|---|---|
| `ScrollDepth75` | Scroll > 75 % | `{ page: URL }` |
| `TimeOnPage60` | 60 Sek. auf Seite | `{ page: URL }` |
| `FAQClick` | FAQ-Element geöffnet | `{ question: Frage-Text }` |
| `BlogRead` | Blog-Artikel > 50 % gelesen | `{ article: Titel }` |
| `VideoView50` | Eingebettetes Video 50 % gesehen | `{ video: Titel }` |

---

### Google Remarketing Tag

**Google Ads Remarketing-Tag:**
- Im Google Tag Manager (GTM) einrichten
- Auf allen Seiten von alltagsengel.care feuern
- Enhanced Conversions aktivieren (E-Mail, Telefon hashen)

**Google Analytics 4 (GA4) Audiences:**
- GA4-Property mit alltagsengel.care verknüpfen
- Audience-Definitionen in GA4 erstellen, automatisch in Google Ads verfügbar

**Remarketing-Listen in Google Ads:**

| Audience | Regel | Laufzeit |
|---|---|---|
| Alle Besucher | URL enthält alltagsengel.care | 540 Tage |
| Leistungsseiten-Besucher | URL enthält /leistungen ODER /alltagsbegleitung | 30 Tage |
| Entlastungsbetrag-Interessenten | URL enthält /entlastungsbetrag | 30 Tage |
| Preisseiten-Besucher | URL enthält /preise | 14 Tage |
| Kontaktseite ohne Conversion | URL enthält /kontakt UND kein Lead-Event | 14 Tage |
| Konvertierte Leads | Lead-Event ausgelöst | 180 Tage |
| App-Interessenten | URL enthält /app ODER Store-Klick | 30 Tage |
| Blog-Leser | URL enthält /blog | 60 Tage |

---

### Tag-Manager-Struktur (Google Tag Manager)

```
GTM Container: alltagsengel.care
│
├── Tags
│   ├── Facebook Pixel — Basiscode (All Pages, nach Consent)
│   ├── Facebook Pixel — ViewContent (Leistungsseiten)
│   ├── Facebook Pixel — Lead (Formular-Submit)
│   ├── Facebook Pixel — Contact (Tel/Mail-Klick)
│   ├── Google Ads Remarketing (All Pages, nach Consent)
│   ├── Google Ads Conversion — Lead (Formular-Submit)
│   ├── Google Ads Conversion — Contact (Tel/Mail-Klick)
│   ├── GA4 Config Tag (All Pages)
│   ├── GA4 Event — Scroll Depth (75 %)
│   ├── GA4 Event — Time on Page (60 Sek.)
│   └── GA4 Event — FAQ Click
│
├── Trigger
│   ├── All Pages (Page View)
│   ├── Leistungsseiten (URL Match)
│   ├── Kontaktformular Submit (Form Submission)
│   ├── Tel-Klick (Click — tel:)
│   ├── Mail-Klick (Click — mailto:)
│   ├── Scroll 75 % (Scroll Depth)
│   ├── Timer 60 Sek. (Timer)
│   └── FAQ-Klick (Click — CSS-Selektor .faq-item)
│
├── Variables
│   ├── Page URL
│   ├── Page Path
│   ├── Click URL
│   ├── Form ID
│   └── Consent State (Cookie-Banner)
│
└── Consent Mode v2
    ├── Default: denied (analytics + ad_storage)
    └── Update: granted (nach User-Consent)
```

---

## 2. Audience-Segmentierung

### Segment 1: Kalt — Allgemeine Website-Besucher

| Eigenschaft | Wert |
|---|---|
| Definition | Alle Besucher, die keine Leistungs-/Preis-/Kontaktseite besucht haben |
| Zeitfenster | Letzte 30 Tage |
| Plattform | Google Display + Facebook/Instagram |
| Geschätzte Größe | 60–70 % aller Besucher |
| Funnel-Stufe | Awareness |

### Segment 2: Warm — Leistungsseiten-Besucher

| Eigenschaft | Wert |
|---|---|
| Definition | Besucher von /leistungen, /alltagsbegleitung, /entlastungsbetrag |
| Zeitfenster | Letzte 30 Tage |
| Plattform | Google Display + Search RLSA + Facebook/Instagram |
| Geschätzte Größe | 20–30 % aller Besucher |
| Funnel-Stufe | Consideration |

### Segment 3: Heiß — Preisseite / Kontaktseite besucht

| Eigenschaft | Wert |
|---|---|
| Definition | Besucher von /preise oder /kontakt, OHNE Lead-Event |
| Zeitfenster | Letzte 14 Tage |
| Plattform | Alle Kanäle — höchste Priorität |
| Geschätzte Größe | 5–10 % aller Besucher |
| Funnel-Stufe | Decision |

### Segment 4: Formular-Abbrecher

| Eigenschaft | Wert |
|---|---|
| Definition | Kontaktformular begonnen, aber nicht abgesendet |
| Zeitfenster | Letzte 7 Tage |
| Plattform | Google Display + Facebook/Instagram |
| Geschätzte Größe | 2–5 % aller Besucher |
| Funnel-Stufe | Decision (höchste Conversion-Wahrscheinlichkeit) |

### Segment 5: Blog-Leser

| Eigenschaft | Wert |
|---|---|
| Definition | Besucher von /blog-Seiten, Scroll > 50 % |
| Zeitfenster | Letzte 60 Tage |
| Plattform | Google Display + Facebook/Instagram |
| Geschätzte Größe | 10–15 % aller Besucher |
| Funnel-Stufe | Interest / Education |

### Segment 6: Video-Zuschauer

| Eigenschaft | Wert |
|---|---|
| Definition | Nutzer, die ein eingebettetes Video > 50 % gesehen haben |
| Zeitfenster | Letzte 60 Tage |
| Plattform | Facebook/Instagram (YouTube-Zuschauer separat in Google) |
| Geschätzte Größe | 5–10 % aller Besucher |
| Funnel-Stufe | Consideration |

### Segment 7: Konvertierte Leads (Ausschluss oder Upsell)

| Eigenschaft | Wert |
|---|---|
| Definition | Nutzer, die ein Lead-Event oder Contact-Event ausgelöst haben |
| Zeitfenster | Letzte 180 Tage |
| Plattform | Alle Kanäle |
| Verwendung | Ausschluss aus Akquise-Kampagnen ODER Upsell-Kampagne |

---

## 3. Retargeting-Funnel

### Stufe 1: Awareness (Top of Funnel)

**Zielgruppe:** Segment 1 (kalte Website-Besucher) + Segment 5 (Blog-Leser)

**Ziel:** Markenbekanntheit stärken, Vertrauen aufbauen

**Anzeigen-Inhalte:**
- Erklärvideos: „Was ist Alltagsbegleitung?"
- Infografiken: „5 Vorteile der Alltagsbegleitung"
- Testimonials: „Warum Familien uns vertrauen"
- Blog-Artikel-Promotion: „Entlastungsbetrag — alles was Sie wissen müssen"

**Frequenz:** Max. 3 Impressions pro Nutzer pro Woche

**Zeitfenster:** Tag 1–30 nach Erstbesuch

**Plattform:** Facebook/Instagram Feed + Google Display (Managed Placements)

**Budget-Anteil:** 20 % des Retargeting-Budgets

---

### Stufe 2: Consideration (Middle of Funnel)

**Zielgruppe:** Segment 2 (Leistungsseiten-Besucher) + Segment 6 (Video-Zuschauer)

**Ziel:** Tiefere Information, Vergleich ermöglichen, Vertrauen vertiefen

**Anzeigen-Inhalte:**
- Detaillierte Leistungsübersicht (Carousel: Einkauf, Arzt, Spaziergang, Gesellschaft, Behörden)
- Preistransparenz: „125 € zahlt die Pflegekasse — nur 131 € Eigenanteil"
- Vertrauenselemente: §45a-Zertifizierung, Erfahrungsberichte
- Vergleich: „Alltagsbegleitung vs. Pflegedienst — was passt zu Ihnen?"
- FAQ-Beantwortung: „Die 5 häufigsten Fragen zur Alltagsbegleitung"

**Frequenz:** Max. 5 Impressions pro Nutzer pro Woche

**Zeitfenster:** Tag 1–21 nach Leistungsseiten-Besuch

**Plattform:** Facebook/Instagram Feed + Google Search (RLSA) + Google Display

**Budget-Anteil:** 35 % des Retargeting-Budgets

---

### Stufe 3: Conversion (Bottom of Funnel)

**Zielgruppe:** Segment 3 (heiße Leads) + Segment 4 (Formular-Abbrecher)

**Ziel:** Konversion auslösen, letzte Hürden beseitigen

**Anzeigen-Inhalte:**
- Direkte CTAs: „Jetzt kostenlose Beratung anfordern"
- Dringlichkeit: „Ihr Entlastungsbetrag wartet — jetzt einlösen"
- Social Proof: Kundenstimmen mit konkreten Aussagen
- Einfachheit betonen: „In 3 Schritten zur Alltagsbegleitung"
- Sondeangebote: „Kostenlose Erstberatung — wir melden uns in 24 Stunden"
- Formular-Abbrecher: „Sie waren fast soweit — nur noch ein Schritt"

**Frequenz:** Max. 7 Impressions pro Nutzer pro Woche

**Zeitfenster:** Tag 1–14 nach Preis-/Kontaktseiten-Besuch

**Plattform:** Facebook/Instagram Feed + Google Search (RLSA) + Google Display + Messenger

**Budget-Anteil:** 45 % des Retargeting-Budgets

---

## 4. Frequenz-Capping

### Globale Frequenzgrenzen

| Plattform | Kanal | Max. Impressions / Nutzer / Woche | Max. Impressions / Nutzer / Monat |
|---|---|---|---|
| Facebook/Instagram | Feed | 5 | 18 |
| Facebook/Instagram | Stories | 3 | 12 |
| Google Display | Banner | 4 | 15 |
| Google Search | RLSA | Unbegrenzt (suchanfragebasiert) | — |
| YouTube | In-Stream | 2 | 8 |

### Funnel-spezifische Frequenzen

| Funnel-Stufe | Max. pro Woche | Max. pro Monat |
|---|---|---|
| Awareness | 3 | 10 |
| Consideration | 5 | 18 |
| Conversion | 7 | 25 |

### Frequency-Monitoring

- Wöchentlich: Frequency-Reports in Facebook Ads Manager und Google Ads prüfen
- Schwellenwert: Wenn Frequency > 8/Woche bei sinkender CTR → Creative wechseln
- Negatives Signal: Wenn „Ad hidden" / „Negative Feedback" > 1 % → Frequenz senken oder Audience ausschließen

---

## 5. Creative-Rotation

### Rotationsplan

| Woche | Awareness-Creative | Consideration-Creative | Conversion-Creative |
|---|---|---|---|
| 1–2 | Video: Was ist Alltagsbegleitung? | Carousel: 5 Leistungen | Testimonial: Kundenstimme A |
| 3–4 | Infografik: 5 Vorteile | Preistransparenz-Grafik | Dringlichkeit: Entlastungsbetrag |
| 5–6 | Testimonial-Video | FAQ-Beantwortung | 3-Schritte-Grafik |
| 7–8 | Blog-Promotion | Vergleich: Begleitung vs. Pflege | Social Proof: Bewertungen |
| 9–10 | Neues Video (saisonal) | Aktualisierte Carousel | Neues Testimonial B |
| 11–12 | Refresh Zyklus 1 | Refresh Zyklus 1 | Refresh Zyklus 1 |

### Regeln für Creative-Wechsel

1. **Performance-basiert:** Wenn CTR eines Creatives > 30 % unter Kampagnendurchschnitt fällt → sofort wechseln
2. **Zeitbasiert:** Spätestens alle 4 Wochen neues Creative einführen (Ad Fatigue vermeiden)
3. **Frequency-basiert:** Wenn Frequency > 6 und CTR sinkt → neues Creative aktivieren
4. **Saisonale Anpassung:** Vor dem 30.06. (Verfallfrist Entlastungsbetrag) → Dringlichkeits-Creatives verstärken
5. **Feiertage:** Weihnachten, Ostern, Muttertag → emotionale Creatives (Familie, Zusammensein)

### Creative-Bibliothek (vorbereiten)

| Typ | Anzahl | Status |
|---|---|---|
| Einzelbild-Anzeigen (1080×1080) | 8 Varianten | Erstellen |
| Story-Anzeigen (1080×1920) | 5 Varianten | Erstellen |
| Video-Anzeigen (15 Sek.) | 4 Varianten | Erstellen |
| Video-Anzeigen (30 Sek.) | 3 Varianten | Erstellen |
| Carousel-Anzeigen | 4 Sets (je 3–5 Karten) | Erstellen |
| Google Display Banner | 6 Größen × 3 Varianten = 18 | Erstellen |

### Google Display Banner-Größen

| Größe | Format | Platzierung |
|---|---|---|
| 300 × 250 | Medium Rectangle | Häufigste Platzierung |
| 336 × 280 | Large Rectangle | Content-Seiten |
| 728 × 90 | Leaderboard | Header-Bereich |
| 160 × 600 | Wide Skyscraper | Sidebar |
| 320 × 50 | Mobile Banner | Mobil |
| 300 × 600 | Half Page | Premium-Platzierung |

---

## 6. Cross-Platform Retargeting

### Strategie: Nutzer plattformübergreifend ansprechen

```
Nutzer besucht alltagsengel.care (Desktop)
    │
    ├──► Facebook Pixel feuert → Retargeting auf Facebook/Instagram (Mobil)
    │
    ├──► Google Remarketing Tag feuert → Retargeting auf Google Display (Desktop/Mobil)
    │
    └──► GA4 Audience → Google Search RLSA (wenn Nutzer erneut sucht)
```

### Plattform-Koordination

| Szenario | Facebook/Instagram | Google Ads |
|---|---|---|
| Erstbesuch (kalt) | Awareness-Video | Display-Banner (allgemein) |
| Leistungsseite besucht | Consideration-Carousel | RLSA mit erhöhtem Gebot (+50 %) |
| Kontaktseite besucht | Conversion-Testimonial | RLSA mit erhöhtem Gebot (+100 %) + Display-Banner (CTA) |
| Formular abgebrochen | Conversion-Reminder | Display-Banner (Dringlichkeit) |
| Lead konvertiert | Ausschluss (oder Empfehlungs-Kampagne) | Ausschluss (oder Empfehlungs-Kampagne) |

### Deduplizierung

- Problem: Nutzer sieht sowohl Facebook- als auch Google-Retargeting → Überflutung
- Lösung 1: Auf Facebook Frequency Cap auf 3/Woche setzen, auf Google auf 4/Woche → Gesamt max. 7/Woche
- Lösung 2: UTM-Parameter nutzen, um Traffic-Quellen zu trennen und Conversion Attribution zu klären
- Lösung 3: In Google Ads → Facebook-Convertierer als negative Audience hochladen (und umgekehrt) — nur bei ausreichender Audience-Größe

### UTM-Parameter-Struktur

| Parameter | Facebook | Google Display | Google Search |
|---|---|---|---|
| utm_source | facebook | google | google |
| utm_medium | social | display | cpc |
| utm_campaign | ae_retargeting_{funnel_stufe} | ae_retargeting_{funnel_stufe} | ae_rlsa_{keyword_gruppe} |
| utm_content | {creative_name} | {banner_size}_{variant} | {anzeigentext_id} |
| utm_term | — | — | {keyword} |

---

## 7. Zeitfenster für verschiedene Audiences

### Übersicht der Retargeting-Fenster

| Audience | Aktives Retargeting | Reduziertes Retargeting | Pause | Löschung |
|---|---|---|---|---|
| Alle Website-Besucher | Tag 1–30 | Tag 31–60 (halbe Frequenz) | Tag 61–90 | Tag 91+ |
| Leistungsseiten-Besucher | Tag 1–21 | Tag 22–45 (halbe Frequenz) | Tag 46–60 | Tag 61+ |
| Preisseiten-Besucher | Tag 1–14 | Tag 15–30 (halbe Frequenz) | Tag 31–45 | Tag 46+ |
| Kontaktseite (nicht konvertiert) | Tag 1–7 (intensiv) | Tag 8–14 | Tag 15–21 | Tag 22+ |
| Formular-Abbrecher | Tag 1–3 (sofort) | Tag 4–7 | Tag 8–14 | Tag 15+ |
| Blog-Leser | Tag 1–60 | Tag 61–90 (halbe Frequenz) | — | Tag 91+ |
| Video-Zuschauer | Tag 1–30 | Tag 31–60 (halbe Frequenz) | — | Tag 61+ |

### Saisonale Anpassungen

| Zeitraum | Anpassung |
|---|---|
| Januar–März | Entlastungsbetrag-Reminder verstärken (Vorjahresbeträge nutzen) |
| April–Juni | Dringlichkeit erhöhen (Frist 30.06. für Vorjahres-Entlastungsbetrag) |
| Juli–September | Standard-Betrieb, neue Kunden-Akquise |
| Oktober–Dezember | Emotional (Weihnachten, „Schenken Sie Begleitung"), Jahresend-Push |

---

## 8. Budget-Aufteilung

### Gesamtbudget Retargeting: 200–400 €/Monat

| Kanal | Budget/Monat | Anteil |
|---|---|---|
| Facebook/Instagram Retargeting | 120–240 € | 60 % |
| Google Display Retargeting | 50–100 € | 25 % |
| Google Search RLSA (Gebotserhöhung) | 30–60 € | 15 % |
| **Gesamt** | **200–400 €** | **100 %** |

### Funnel-basierte Aufteilung (innerhalb jedes Kanals)

| Funnel-Stufe | Anteil | Begründung |
|---|---|---|
| Awareness (ToF) | 20 % | Breite Streuung, günstige CPMs |
| Consideration (MoF) | 35 % | Größte Audience, Information vertiefen |
| Conversion (BoF) | 45 % | Höchste Conversion-Wahrscheinlichkeit, höhere CPCs akzeptabel |

### Beispielbudget bei 300 €/Monat

| Kanal + Funnel | Budget |
|---|---|
| Facebook/Instagram — Awareness | 36 € |
| Facebook/Instagram — Consideration | 63 € |
| Facebook/Instagram — Conversion | 81 € |
| Google Display — Awareness | 15 € |
| Google Display — Consideration | 26 € |
| Google Display — Conversion | 34 € |
| Google Search RLSA | 45 € |
| **Gesamt** | **300 €** |

### Skalierungsplan

| Monat | Retargeting-Budget | Voraussetzung |
|---|---|---|
| Monat 1 | 200 € | Pixel/Tags installiert, Audiences aufbauen |
| Monat 2 | 250 € | Min. 100 Nutzer pro Audience |
| Monat 3 | 300 € | Erste Conversion-Daten vorhanden |
| Monat 4–6 | 350–400 € | Optimierung auf Basis der Daten |
| Ab Monat 7 | 400–600 € | Skalierung der Top-Performer |

---

## 9. KPIs und Erfolgsmessung

### Primäre KPIs

| KPI | Definition | Zielwert |
|---|---|---|
| ROAS (Return on Ad Spend) | Umsatz / Werbeausgaben | > 3,0 (ab Monat 6) |
| CPA (Cost per Acquisition) | Kosten pro Lead | < 25 € (Retargeting sollte günstiger sein als Kaltakquise) |
| Conversion Rate | Conversions / Klicks | > 5 % (Retargeting) vs. > 3 % (Kaltakquise) |
| CTR (Click-Through Rate) | Klicks / Impressions | > 1,5 % (Display), > 3 % (Facebook Feed) |
| Lead-to-Customer Rate | Kunden / Leads | > 15 % |

### Sekundäre KPIs

| KPI | Definition | Zielwert |
|---|---|---|
| CPM (Cost per 1.000 Impressions) | Kosten pro 1.000 Einblendungen | < 8 € (Facebook), < 3 € (Display) |
| CPC (Cost per Click) | Kosten pro Klick | < 1,50 € (Retargeting) |
| Frequency | Durchschnittliche Anzeigehäufigkeit pro Nutzer | 3–6 / Woche (je nach Funnel-Stufe) |
| Relevance Score / Quality Ranking | Facebook-Qualitätsbewertung | Oberes Drittel |
| Bounce Rate (Landing Page) | Absprungrate nach Klick | < 40 % |
| Time on Site | Verweildauer nach Klick | > 90 Sekunden |
| View-Through Conversions | Conversions nach Anzeigenkontakt ohne Klick | Tracking, kein fester Zielwert |

### Funnel-spezifische KPIs

| Funnel-Stufe | Haupt-KPI | Zielwert | Neben-KPIs |
|---|---|---|---|
| Awareness | CPM, Reach | CPM < 6 €, Reach > 5.000/Monat | Video Views (50 %+), Engagement Rate |
| Consideration | CTR, CPC | CTR > 2 %, CPC < 1,20 € | Seitenaufrufe, Scroll Depth, Time on Site |
| Conversion | CPA, Conversion Rate | CPA < 25 €, CR > 5 % | Lead-Qualität, Form Completions, Click-to-Call |

### Reporting-Rhythmus

**Wöchentlich (jeden Montag):**
- Impressions, Klicks, CTR pro Kampagne
- Ausgaben vs. Budget
- Conversions und CPA
- Frequency-Check
- Auffälligkeiten und Quick Fixes

**Monatlich (zum Monatsende):**
- Vollständige Performance-Analyse pro Funnel-Stufe
- Creative-Performance (CTR, CPA pro Creative)
- Audience-Performance (welche Segmente konvertieren am besten?)
- Budget-Reallokation für nächsten Monat
- A/B-Test-Ergebnisse auswerten
- Neue Negatives und Audience-Anpassungen
- Gesamt-CPA und ROAS berechnen

**Quartalsweise:**
- Strategische Review: Funktioniert der Funnel?
- Audience-Qualität: Konvertieren Retargeting-Leads zu Kunden?
- Customer Lifetime Value vs. Akquisekosten
- Plattform-Vergleich: Facebook vs. Google — wo ist der ROI besser?
- Budget-Empfehlung für nächstes Quartal

### Dashboards

**Empfohlene Tools:**
- Google Looker Studio (ehem. Data Studio) — kostenlos, verbindet Google Ads + GA4
- Facebook Ads Manager — für FB/IG-Kampagnen
- UTM-Tracking in GA4 — für kanalübergreifende Attribution

**Dashboard-Inhalte:**

1. Übersicht: Gesamt-Impressions, Klicks, Conversions, Kosten, CPA
2. Funnel-Ansicht: Awareness → Consideration → Conversion (Durchfluss)
3. Plattform-Vergleich: Facebook vs. Google (nebeneinander)
4. Creative-Performance: Top 5 und Bottom 5 Creatives
5. Audience-Performance: CPA pro Segment
6. Zeitverlauf: Wöchentliche Trends (Conversions, CPA, CTR)
7. Geo-Performance: Karte mit Conversions nach Stadtteil/PLZ

---

## 10. Datenschutz & DSGVO-Compliance

### Pflichtmaßnahmen

1. **Cookie-Banner:** Consent Management Platform (CMP) implementieren (Cookiebot, Usercentrics oder Consentmanager)
2. **Consent Mode v2:** Google Consent Mode v2 und Facebook Consent Mode aktiv
3. **Datenschutzerklärung:** Facebook Pixel und Google Remarketing Tag in der Datenschutzerklärung nennen, inkl. Opt-out-Möglichkeit
4. **Auftragsverarbeitungsvertrag (AVV):** Mit Meta (Facebook) und Google abschließen
5. **Datenminimierung:** Nur notwendige Events tracken, keine sensiblen Gesundheitsdaten im Pixel
6. **Opt-out:** Link zum Opt-out in Datenschutzerklärung und Cookie-Banner
7. **Löschkonzept:** Audiences nach max. 540 Tagen automatisch ablaufen lassen

### Besonderheit Gesundheitsbranche

- Facebook verbietet Targeting auf Basis sensibler Gesundheitsdaten
- Custom Audiences auf Basis von Pflegegrad-Informationen NICHT erstellen
- Stattdessen: Verhaltensbasiertes Retargeting (Seitenbesuche, nicht Gesundheitsdaten)
- Anzeigen dürfen keine direkten Gesundheitszustände benennen (z. B. nicht „Haben Sie Demenz?")
- Stattdessen allgemein formulieren: „Unterstützung im Alltag für Ihre Liebsten"

---

## 11. Checkliste für den Start

### Woche 1: Technisches Setup
- [ ] Google Tag Manager auf alltagsengel.care installieren
- [ ] Facebook Pixel einrichten und im GTM konfigurieren
- [ ] Google Ads Remarketing Tag im GTM einrichten
- [ ] GA4-Property erstellen und verknüpfen
- [ ] Consent Management Platform (CMP) installieren
- [ ] Consent Mode v2 konfigurieren
- [ ] Alle Events testen (Facebook Pixel Helper, Google Tag Assistant)
- [ ] Datenschutzerklärung aktualisieren

### Woche 2: Audiences aufbauen
- [ ] Facebook Custom Audiences erstellen (alle 7 Segmente)
- [ ] Google Remarketing-Listen erstellen
- [ ] GA4 Audiences definieren
- [ ] Lookalike Audiences vorbereiten (werden aktiv ab 100 Nutzern)
- [ ] Konvertierte Leads als Ausschluss-Audience hochladen

### Woche 3: Creatives erstellen
- [ ] 8 Einzelbild-Varianten erstellen
- [ ] 5 Story-Varianten erstellen
- [ ] 4 Kurzvideos produzieren (15 Sek.)
- [ ] 4 Carousel-Sets gestalten
- [ ] 18 Google Display Banner erstellen
- [ ] Alle Creatives in Markenfarben und mit Logo

### Woche 4: Kampagnen starten
- [ ] Facebook Retargeting-Kampagnen einrichten (3 Funnel-Stufen)
- [ ] Google Display Retargeting-Kampagnen einrichten
- [ ] Google Search RLSA konfigurieren
- [ ] Frequency Caps setzen
- [ ] Budget verteilen
- [ ] Conversion-Tracking testen (Testformular absenden)
- [ ] Reporting-Dashboard einrichten
- [ ] Wöchentlichen Reporting-Termin festlegen
