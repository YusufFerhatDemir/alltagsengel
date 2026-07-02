# Tracking-Setup-Anleitung -- Alltagsengel

## Uebersicht

Dieses Dokument beschreibt die vollstaendige Einrichtung des Web-Trackings fuer **alltagsengel.care**. Alle hier beschriebenen Tools und Dienste sind kostenlos nutzbar. Ziel ist eine lueckenlose Erfassung aller relevanten Nutzerinteraktionen -- von der ersten Google-Suche bis zur Kontaktaufnahme.

**Website:** alltagsengel.care
**Kontakt:** info@alltagsengel.care
**Branche:** Alltagsbegleitung nach Paragraph 45a SGB XI, Frankfurt am Main
**Budget:** Ausschliesslich kostenlose Tools

---

## 1. Google Analytics 4 (GA4) -- Einrichtung

### 1.1 Konto und Property erstellen

1. Unter [analytics.google.com](https://analytics.google.com) mit dem Firmen-Google-Konto anmelden.
2. Auf **Verwaltung** (Zahnrad unten links) klicken und **Konto erstellen** waehlen.
3. Kontoname: `Alltagsengel` eingeben.
4. Neue Property erstellen mit dem Namen `alltagsengel.care`.
5. Zeitzone: `Deutschland (Berlin)`, Waehrung: `Euro (EUR)` waehlen.

### 1.2 Datenstream einrichten

1. In der Property unter **Datenstreams** den Punkt **Web** auswaehlen.
2. Website-URL: `alltagsengel.care` eingeben, Streamname: `Alltagsengel Website`.
3. **Optimierte Analysen** aktivieren -- damit werden automatisch erfasst:
   - Seitenaufrufe (page_view)
   - Scrolls (scroll)
   - Ausgehende Klicks (click)
   - Website-Suche (view_search_results)
   - Videointeraktionen (video_start, video_progress, video_complete)
   - Dateidownloads (file_download)
4. Die **Mess-ID** (Format: `G-XXXXXXXXXX`) notieren -- diese wird im Google Tag Manager benoetigt.

### 1.3 Benutzerdefinierte Events fuer Alltagsbegleitung

Folgende benutzerdefinierte Events muessen eingerichtet werden, um die wichtigsten Nutzeraktionen zu erfassen:

| Event-Name | Ausloeser | Beschreibung |
|------------|-----------|--------------|
| `kontakt_formular_absenden` | Formular-Submit auf der Kontaktseite | Nutzer sendet eine Anfrage ueber das Kontaktformular |
| `telefon_klick` | Klick auf `tel:`-Link | Nutzer klickt auf die Telefonnummer |
| `email_klick` | Klick auf `mailto:`-Link | Nutzer klickt auf info@alltagsengel.care |
| `pdf_download` | Klick auf PDF-Link (z.B. Infobroschuere) | Nutzer laedt ein PDF-Dokument herunter |
| `cta_klick` | Klick auf einen Call-to-Action-Button | Nutzer klickt auf einen prominenten Handlungsaufruf |
| `rueckruf_angefordert` | Rueckruf-Formular abgesendet | Nutzer fordert einen Rueckruf an |

Die technische Umsetzung dieser Events erfolgt ueber den Google Tag Manager (siehe Abschnitt 4).

---

## 2. Google Search Console (GSC) -- Einrichtung

### 2.1 Property verifizieren

1. Unter [search.google.com/search-console](https://search.google.com/search-console) anmelden.
2. **Property hinzufuegen** und als Typ **Domain** waehlen: `alltagsengel.care`.
3. Verifizierungsmethode: **DNS-TXT-Eintrag** beim Domain-Hoster hinterlegen.
   - Alternativ bei URL-Praefix-Variante: HTML-Tag oder HTML-Datei hochladen.
4. Verifizierung abwarten (kann bis zu 48 Stunden dauern).

### 2.2 Sitemap einreichen

1. In der Search Console unter **Sitemaps** die URL der Sitemap eingeben: `https://alltagsengel.care/sitemap.xml`.
2. Auf **Senden** klicken und den Status pruefen.
3. Falls die Website mit einem CMS (z.B. WordPress) betrieben wird, sollte ein SEO-Plugin (z.B. Yoast SEO oder Rank Math) die Sitemap automatisch generieren.

### 2.3 Performance-Monitoring

Die Search Console liefert folgende Kennzahlen, die regelmaessig ueberprueft werden sollten:

- **Klicks:** Wie oft Nutzer von Google auf alltagsengel.care geklickt haben.
- **Impressionen:** Wie oft alltagsengel.care in den Suchergebnissen angezeigt wurde.
- **Durchschnittliche CTR:** Verhaeltnis von Klicks zu Impressionen (Zielwert: ueber 5%).
- **Durchschnittliche Position:** Mittlere Ranking-Position fuer alle Keywords.

Zusaetzlich unter **Seiten** und **Suchanfragen** filtern, um Keywords mit hohem Potenzial zu identifizieren (hohe Impressionen, niedrige CTR = Meta-Title und Meta-Description optimieren).

### 2.4 GSC mit GA4 verknuepfen

1. In GA4 unter **Verwaltung > Property-Einstellungen > Produktverknuepfungen > Search Console-Verknuepfung** waehlen.
2. Die verifizierte Search Console-Property auswaehlen und verknuepfen.
3. Dadurch erscheinen GSC-Daten direkt in GA4 unter **Berichte > Search Console**.

---

## 3. Conversion-Tracking -- Ziele definieren

### 3.1 Conversion-Definitionen

Fuer Alltagsengel sind folgende Conversions relevant:

| Conversion | Event-Name | Wert | Prioritaet |
|------------|-----------|------|------------|
| Kontaktformular abgesendet | `kontakt_formular_absenden` | Hoch (primaere Conversion) | 1 |
| Telefon-Klick (mobil) | `telefon_klick` | Hoch | 2 |
| E-Mail-Klick | `email_klick` | Mittel | 3 |
| PDF-Download (Infobroschuere) | `pdf_download` | Mittel | 4 |
| Rueckruf angefordert | `rueckruf_angefordert` | Hoch | 5 |
| CTA-Klick (allgemein) | `cta_klick` | Niedrig (Mikro-Conversion) | 6 |

### 3.2 Conversions in GA4 markieren

1. In GA4 unter **Verwaltung > Events** die oben definierten Events suchen.
2. Den Schalter **Als Conversion markieren** fuer die relevanten Events aktivieren.
3. Alternativ unter **Verwaltung > Conversions > Neues Conversion-Ereignis** den Event-Namen manuell eingeben.

### 3.3 Conversion-Funnel

Der typische Nutzerweg bei Alltagsengel sieht wie folgt aus:

```
Google-Suche → Landingpage → Leistungen-Seite → Kosten-Seite → Kontaktseite → Conversion
```

Diesen Funnel in GA4 unter **Entdecken > Trichteranalyse** abbilden, um Abbruchstellen zu identifizieren.

---

## 4. Google Tag Manager (GTM) -- Container-Setup

### 4.1 GTM-Konto und Container erstellen

1. Unter [tagmanager.google.com](https://tagmanager.google.com) anmelden.
2. Neues Konto erstellen: `Alltagsengel`.
3. Container erstellen: `alltagsengel.care`, Zielplattform: **Web**.
4. Den GTM-Container-Code auf jeder Seite von alltagsengel.care einbinden:

**Im `<head>`-Bereich (so weit oben wie moeglich):**

```html
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-XXXXXXX');</script>
<!-- End Google Tag Manager -->
```

**Direkt nach dem oeffnenden `<body>`-Tag:**

```html
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXXXX"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
```

Hinweis: `GTM-XXXXXXX` durch die tatsaechliche Container-ID ersetzen.

### 4.2 GA4-Konfigurations-Tag

1. Neuen Tag erstellen: **Google Analytics: GA4-Konfiguration**.
2. Mess-ID eingeben: `G-XXXXXXXXXX` (aus Abschnitt 1.2).
3. Trigger: **All Pages** (auf allen Seiten ausloesen).
4. Tag speichern.

### 4.3 Event-Tags fuer Conversions

#### Telefon-Klick-Tag

```
Tag-Typ: Google Analytics: GA4-Ereignis
Konfigurations-Tag: GA4-Konfiguration (siehe 4.2)
Ereignisname: telefon_klick

Trigger (neu erstellen):
  Trigger-Typ: Nur Links - Klick
  Bedingung: Click URL -- enthaelt -- tel:
```

#### E-Mail-Klick-Tag

```
Tag-Typ: Google Analytics: GA4-Ereignis
Konfigurations-Tag: GA4-Konfiguration
Ereignisname: email_klick

Trigger (neu erstellen):
  Trigger-Typ: Nur Links - Klick
  Bedingung: Click URL -- enthaelt -- mailto:
```

#### Kontaktformular-Tag

```
Tag-Typ: Google Analytics: GA4-Ereignis
Konfigurations-Tag: GA4-Konfiguration
Ereignisname: kontakt_formular_absenden

Trigger (neu erstellen):
  Trigger-Typ: Formularuebermittlung
  Bedingung: Page URL -- enthaelt -- /kontakt
  Auf Tag-Ausloesung warten: aktiviert (2000 ms)
```

Alternativ bei Single-Page-Applikationen oder benutzerdefinierten Formularen ein `dataLayer.push`-Event im Formular-Handler verwenden:

```javascript
// Im Formular-Submit-Handler einfuegen:
dataLayer.push({
  'event': 'kontakt_formular_absenden',
  'formular_typ': 'kontakt',
  'seite': window.location.pathname
});
```

#### PDF-Download-Tag

```
Tag-Typ: Google Analytics: GA4-Ereignis
Konfigurations-Tag: GA4-Konfiguration
Ereignisname: pdf_download
Event-Parameter:
  dateiname: {{Click URL}}

Trigger (neu erstellen):
  Trigger-Typ: Nur Links - Klick
  Bedingung: Click URL -- enthaelt -- .pdf
```

### 4.4 Wichtige Variablen im GTM

Folgende integrierte Variablen sollten aktiviert werden:

- **Click URL** -- fuer Link-Klick-Tracking
- **Click Text** -- fuer CTA-Tracking
- **Form ID** -- fuer Formular-Tracking
- **Page URL** -- fuer seitenspezifische Trigger
- **Page Path** -- fuer Pfad-basierte Bedingungen

### 4.5 GTM veroeffentlichen

1. Alle Tags, Trigger und Variablen konfigurieren.
2. Im **Vorschaumodus** die Website testen (ueber den Button **In Vorschau ansehen**).
3. Pruefen, ob alle Tags korrekt ausgeloest werden.
4. **Veroeffentlichen** klicken, Versionsname vergeben (z.B. `v1.0 -- Initiales Setup`), Beschreibung hinzufuegen.

---

## 5. Datenschutz und DSGVO

### 5.1 Cookie-Consent-Loesung

Fuer DSGVO-konformes Tracking ist ein Cookie-Consent-Banner **zwingend erforderlich**. Empfohlene kostenlose Loesungen:

- **Complianz** (WordPress-Plugin, kostenloser Grundplan) -- einfache Einrichtung, deutscher Support, automatische Cookie-Erkennung.
- **Cookiebot** (kostenlos bis 100 Unterseiten) -- umfangreiche Funktionen, automatischer Cookie-Scan, TCF-2.0-konform.

### 5.2 Consent Mode v2 in GTM

Google verlangt seit Maerz 2024 den **Consent Mode v2**. Einrichtung im GTM:

1. Unter **Verwaltung > Container-Einstellungen** die Option **Einwilligungsinitialisierung aktivieren** einschalten.
2. Fuer den GA4-Konfigurations-Tag die **Einwilligungseinstellungen** konfigurieren:
   - `analytics_storage`: Einwilligung erforderlich
   - `ad_storage`: Einwilligung erforderlich (auch wenn keine Ads geschaltet werden)
3. Das Cookie-Consent-Tool (z.B. Complianz) sendet die Einwilligungssignale automatisch an den GTM.

### 5.3 IP-Anonymisierung

In GA4 ist die IP-Anonymisierung standardmaessig aktiviert -- es ist keine zusaetzliche Konfiguration notwendig. GA4 speichert und verarbeitet keine vollstaendigen IP-Adressen. Dies sollte dennoch in der Datenschutzerklaerung erwaehnt werden.

### 5.4 Auftragsverarbeitungsvertrag (AVV)

Ein AVV mit Google ist Pflicht:

1. In der Google Analytics-Verwaltung unter **Konto > Kontoeinstellungen** den Link **Zusatz zur Datenverarbeitung** oeffnen.
2. Die erforderlichen Angaben (Firmenname, Ansprechpartner, Adresse) ausfuellen.
3. Den Zusatz akzeptieren und dokumentieren.

### 5.5 Datenschutzerklaerung

Die Datenschutzerklaerung auf alltagsengel.care muss folgende Punkte enthalten:

- Einsatz von Google Analytics 4 (Zweck, Rechtsgrundlage Art. 6 Abs. 1 lit. a DSGVO)
- Einsatz von Google Tag Manager
- Cookie-Informationen (Typ, Speicherdauer, Zweck)
- Hinweis auf IP-Anonymisierung
- Verweis auf den AVV mit Google
- Opt-Out-Moeglichkeit fuer Nutzer (z.B. Browser-Plugin oder Opt-Out-Link)
- Kontaktdaten des Verantwortlichen: info@alltagsengel.care

---

## 6. Dashboard und Reporting

### 6.1 Wichtige Metriken im Ueberblick

| Kategorie | Metrik | Zielwert |
|-----------|--------|----------|
| Traffic | Eindeutige Besucher pro Monat | Steigerung um 15% pro Monat |
| Traffic | Organischer Anteil | Mindestens 50% |
| Engagement | Durchschnittliche Verweildauer | Ueber 2:30 Minuten |
| Engagement | Absprungrate | Unter 45% |
| Conversions | Kontaktanfragen pro Monat | Mindestens 20 |
| Conversions | Telefon-Klicks pro Monat | Mindestens 30 |
| SEO | Keywords in Top 10 | Mindestens 5 |
| SEO | Durchschnittliche CTR | Ueber 5% |

### 6.2 Benutzerdefinierte Berichte in GA4

Unter **Entdecken** in GA4 folgende Berichte erstellen:

1. **Conversion-Bericht:** Alle Conversions nach Quelle/Medium aufgeschluesselt. Zeigt, welche Kanaele die meisten Anfragen generieren.
2. **Landingpage-Bericht:** Einstiegsseiten mit Conversion-Rate. Identifiziert die effektivsten Seiten.
3. **Geraete-Bericht:** Conversions nach Geraetetyp (Mobil vs. Desktop). Wichtig fuer die Optimierung der mobilen Nutzererfahrung.
4. **Trichteranalyse:** Nutzerweg von Landingpage bis Kontaktformular mit Abbruchstellen.

### 6.3 Monatliches Reporting

Der monatliche Report sollte folgende Abschnitte umfassen (siehe auch `reporting-template.md`):

1. **Executive Summary** -- Zusammenfassung der wichtigsten Ergebnisse
2. **Traffic-Analyse** -- Besucher, Quellen, Geraete
3. **SEO-Performance** -- Rankings, Impressionen, CTR
4. **Conversion-Analyse** -- Anzahl und Rate der Kontaktanfragen
5. **Handlungsempfehlungen** -- Konkrete naechste Schritte

---

## 7. UTM-Parameter -- Kampagnen-Tracking

### 7.1 UTM-Parameter-Struktur

Jeder externe Link auf alltagsengel.care sollte mit UTM-Parametern versehen werden, um die Herkunft der Besucher praezise zu erfassen.

| Parameter | Beschreibung | Beispiel |
|-----------|-------------|---------|
| `utm_source` | Herkunftsplattform | `google`, `facebook`, `newsletter`, `pflegestuetzpunkt` |
| `utm_medium` | Marketingkanal | `organic`, `social`, `email`, `referral`, `directory` |
| `utm_campaign` | Kampagnenname | `sommer2026`, `entlastungsbetrag_info`, `seniorenmesse` |
| `utm_content` | Inhaltsvariante (optional) | `banner_blau`, `cta_oben`, `posting_video` |
| `utm_term` | Suchbegriff (optional) | `alltagsbegleitung_frankfurt` |

### 7.2 UTM-Vorlagen fuer Alltagsengel

**Social-Media-Beitraege (Facebook):**
```
https://alltagsengel.care/leistungen?utm_source=facebook&utm_medium=social&utm_campaign=leistungen_2026&utm_content=posting_bild
```

**E-Mail-Newsletter:**
```
https://alltagsengel.care/blog/entlastungsbetrag?utm_source=newsletter&utm_medium=email&utm_campaign=newsletter_juli2026&utm_content=cta_button
```

**Branchenverzeichnisse (z.B. Pflegestuetzpunkt-Eintrag):**
```
https://alltagsengel.care?utm_source=pflegestuetzpunkt&utm_medium=directory&utm_campaign=verzeichnis_eintrag
```

**Google Business Profile:**
```
https://alltagsengel.care?utm_source=google&utm_medium=organic&utm_campaign=gbp_website_klick
```

### 7.3 UTM-Link-Generator

Den kostenlosen Google Campaign URL Builder verwenden: [ga-dev-tools.google/ga4/campaign-url-builder](https://ga-dev-tools.google/ga4/campaign-url-builder/)

**Wichtige Regeln:**
- Immer Kleinbuchstaben verwenden (Gross-/Kleinschreibung wird unterschieden).
- Keine Leerzeichen -- Unterstriche oder Bindestriche verwenden.
- Einheitliche Namenskonventionen dokumentieren und einhalten.
- UTM-Parameter in einer Tabelle (z.B. Google Sheets) zentral verwalten.

---

## 8. Monitoring-Tools (kostenlos)

### 8.1 Google PageSpeed Insights

- **URL:** [pagespeed.web.dev](https://pagespeed.web.dev/)
- **Zweck:** Core Web Vitals und Ladezeit-Analyse fuer alltagsengel.care.
- **Frequenz:** Monatlich fuer die wichtigsten Seiten (Startseite, Leistungen, Kontakt, Kosten).
- **Zielwerte:**
  - Largest Contentful Paint (LCP): unter 2,5 Sekunden
  - Interaction to Next Paint (INP): unter 200 Millisekunden
  - Cumulative Layout Shift (CLS): unter 0,1
  - Performance-Score: mindestens 90 (mobil und Desktop)

### 8.2 Google Lighthouse

- **Zugang:** In Google Chrome ueber Entwicklertools (F12) unter dem Tab **Lighthouse**.
- **Zweck:** Umfassende Analyse von Performance, Accessibility, Best Practices und SEO.
- **Frequenz:** Monatlich oder nach groesseren Website-Aenderungen.
- **Tipp:** Lighthouse im Inkognito-Modus ausfuehren, um Erweiterungen auszuschliessen, die das Ergebnis verfaelschen koennten.

### 8.3 Screaming Frog SEO Spider (kostenlose Version)

- **Download:** [screamingfrog.co.uk/seo-spider](https://www.screamingfrog.co.uk/seo-spider/)
- **Zweck:** Website-Crawl zur Erkennung technischer SEO-Probleme.
- **Kostenlose Version:** Bis zu 500 URLs crawlen -- fuer alltagsengel.care voellig ausreichend.
- **Pruefen auf:**
  - Fehlende oder doppelte Meta-Titles und Meta-Descriptions
  - Defekte Links (404-Fehler)
  - Fehlende Alt-Texte bei Bildern
  - Redirect-Ketten
  - Doppelte Inhalte (Duplicate Content)
  - H1-Struktur und Ueberschriftenhierarchie
- **Frequenz:** Monatlich oder nach groesseren Aenderungen an der Website.

### 8.4 Ubersuggest (kostenlose Version)

- **URL:** [neilpatel.com/ubersuggest](https://neilpatel.com/ubersuggest/)
- **Zweck:** Keyword-Recherche, Domain-Analyse und Content-Ideen.
- **Kostenlose Version:** Drei Suchen pro Tag, grundlegende Domain-Uebersicht.
- **Nutzung fuer Alltagsengel:**
  - Keyword-Ideen fuer neue Blog-Beitraege finden.
  - Wettbewerber-Domains analysieren (z.B. andere Alltagsbegleitungen in Frankfurt).
  - Backlink-Moeglichkeiten identifizieren.

### 8.5 Google Rich Results Test

- **URL:** [search.google.com/test/rich-results](https://search.google.com/test/rich-results)
- **Zweck:** Pruefen, ob die strukturierten Daten (Schema.org) auf alltagsengel.care korrekt implementiert sind.
- **Relevant fuer:** LocalBusiness-Markup, FAQ-Markup, Bewertungen.

---

## Checkliste -- Ersteinrichtung

| Schritt | Erledigt |
|---------|----------|
| Google-Konto fuer Alltagsengel erstellt | [ ] |
| GA4-Property und Datenstream eingerichtet | [ ] |
| GTM-Container erstellt und auf Website eingebunden | [ ] |
| GA4-Konfigurations-Tag im GTM angelegt | [ ] |
| Event-Tags fuer Conversions eingerichtet (Telefon, E-Mail, Formular, PDF) | [ ] |
| Conversions in GA4 markiert | [ ] |
| Google Search Console verifiziert und Sitemap eingereicht | [ ] |
| GSC mit GA4 verknuepft | [ ] |
| Cookie-Consent-Banner installiert und konfiguriert | [ ] |
| Consent Mode v2 im GTM aktiviert | [ ] |
| Auftragsverarbeitungsvertrag mit Google abgeschlossen | [ ] |
| Datenschutzerklaerung aktualisiert | [ ] |
| UTM-Parameter-Konventionen dokumentiert | [ ] |
| Erster Lighthouse-Test durchgefuehrt | [ ] |
| Erster Screaming-Frog-Crawl durchgefuehrt | [ ] |
| Monatlicher Reporting-Rhythmus festgelegt | [ ] |

---

**Letzte Aktualisierung:** Juli 2026
**Verantwortlich:** Marketing-Team Alltagsengel
**Kontakt:** info@alltagsengel.care
