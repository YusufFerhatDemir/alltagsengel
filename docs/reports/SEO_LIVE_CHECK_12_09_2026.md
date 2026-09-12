# SEO Live-Check — https://alltagsengel.care

**Datum:** 12.09.2026
**Methode:** Live-Abruf per `curl` (User-Agent `Mozilla/5.0 (compatible; SEOCheck/1.0)`), kein Code-Rückschluss.
Abgerufen wurden **alle 182 Sitemap-URLs** (nicht nur eine Stichprobe) plus 4 nicht gelistete Frankfurt-Routen = **186 HTML-Dokumente**.
Auswertung per `python3` (`json.loads` für JSON-LD, Regex für Head-Tags, `difflib` für Textähnlichkeit).

---

## 1. Zusammenfassung

### Gesund (gemessen, nicht vermutet)

| Prüfpunkt | Messwert |
|---|---|
| Sitemap-URLs erreichbar | **182 / 182 = HTTP 200**, keine einzige Weiterleitung, kein 404, kein 5xx |
| Canonical vorhanden | **186 / 186** Seiten haben `<link rel="canonical">` |
| Canonical selbstreferenziell | **182 / 182** Sitemap-Seiten zeigen exakt auf die aufgerufene URL |
| Frankfurt-Konsolidierung | 4 / 4 Frankfurt-Unterseiten kanonisieren korrekt auf die Root-Strecke |
| `noindex` | **0 Treffer** im HTML, **0** `X-Robots-Tag`-Header |
| `<meta name="robots">` | **186 / 186** = `index, follow` |
| `<html lang>` | **186 / 186** = `de` |
| Viewport-Meta | **186 / 186** vorhanden |
| `<h1>` | **186 / 186** genau eine `h1` — keine Seite ohne, keine mit mehreren |
| JSON-LD gültig | **186 / 186** Seiten, **0 Parse-Fehler** über alle Blöcke |
| Titel vorhanden | 182 / 182 |
| Description vorhanden | 182 / 182 |
| **Exakte Dubletten Titel** | **0** |
| **Exakte Dubletten Description** | **0** |
| HTTP→HTTPS / www→non-www / Trailing-Slash | je **308**-Redirect auf die kanonische Form |
| `og:image` | 185 / 186, Datei liefert HTTP 200 (41.857 B, `image/png`) |

### Kaputt bzw. wirkungsrelevant

1. **`/leistungen` ist praktisch verwaist** — genau **1** von 186 Seiten verlinkt sie (`/seitenuebersicht`).
2. **`/haushaltshilfe` fehlt in Navigation und Footer** — die Startseite enthält das Wort „haushaltshilfe" **0 ×**; der gesamte 26-Seiten-Silo hängt an einer Seite ohne globale Verlinkung.
3. **Near-Duplicate-Descriptions bei 3 Strecken** — `/krankenfahrten`, `/hygienebox` und `/engel-werden` haben je nur **4–5 Textskelette für 25 bzw. 15 Stadtseiten**; die Texte unterscheiden sich ausschließlich im Städtenamen.
4. **76 von 182 Titeln > 60 Zeichen**, davon 47 > 65 Zeichen (Abschneide-Risiko im SERP).
5. **26 Sitemap-Einträge ohne `<lastmod>`** — exakt der `/haushaltshilfe`-Silo plus `/leistungen`.

---

## 2. Sitemap (`/sitemap.xml`)

**HTTP 200**, `application/xml`, 31.128 B, Wurzel `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`.

**182 `<loc>`-Einträge**, Verteilung:

| Bereich | URLs | davon Stadtseiten |
|---|---|---|
| `/blog/*` | 40 | – |
| `/alltagsbegleitung` | 27 | 26 |
| `/hygienebox` | 26 | 25 |
| `/krankenfahrten` | 26 | 25 |
| `/haushaltshilfe` | 26 | 25 |
| `/engel-werden` | 16 | 15 |
| Startseite | 1 | – |
| Einzelseiten (Rechner, rechtlich, Konversion) | 20 | – |

### 2.1 Statuscheck aller 182 URLs

```
$ while read u; do curl -s -o /dev/null -w "%{http_code} $u\n" "$u"; sleep 0.25; done < urls.txt
→ 182 × 200, 0 × abweichend
```

**Kein Status != 200.** Zusatzprobe: `/nicht-existierende-seite-xyz` → **404** (Fehlerbehandlung funktioniert, die 200er sind also echt).

### 2.2 Stichprobe von 25 URLs quer durch alle Typen

| # | URL | HTTP | Canonical == URL | Titel-Länge | Desc-Länge |
|---|---|---|---|---|---|
| 1 | `/` | 200 | ja | 55 | 163 |
| 2 | `/leistungen` | 200 | ja | **74** | **191** |
| 3 | `/alltagsbegleitung` | 200 | ja | **77** | 163 |
| 4 | `/alltagsbegleitung/frankfurt` | 200 | ja | 50 | 154 |
| 5 | `/alltagsbegleitung/koeln` | 200 | ja | 37 | 141 |
| 6 | `/haushaltshilfe` | 200 | ja | **79** | **213** |
| 7 | `/haushaltshilfe/offenbach` | 200 | ja | **76** | **203** |
| 8 | `/haushaltshilfe/bonn` | 200 | ja | 63 | **196** |
| 9 | `/krankenfahrten` | 200 | ja | 59 | 154 |
| 10 | `/krankenfahrten/wiesbaden` | 200 | ja | **29** | 131 |
| 11 | `/krankenfahrten/koeln` | 200 | ja | **24** | 126 |
| 12 | `/hygienebox` | 200 | ja | 58 | 148 |
| 13 | `/hygienebox/darmstadt` | 200 | ja | 50 | 149 |
| 14 | `/engel-werden` | 200 | ja | **91** | **217** |
| 15 | `/engel-werden/hanau` | 200 | ja | **72** | 166 |
| 16 | `/blog` | 200 | ja | 63 | 147 |
| 17 | `/blog/entlastungsbetrag-45b` | 200 | ja | 57 | **187** |
| 18 | `/blog/pflegereform-2027` | 200 | ja | 56 | 147 |
| 19 | `/faq` | 200 | ja | **69** | 150 |
| 20 | `/kontakt` | 200 | ja | 60 | 160 |
| 21 | `/einzugsgebiet` | 200 | ja | 60 | 159 |
| 22 | `/budgetrechner` | 200 | ja | 58 | 145 |
| 23 | `/impressum` | 200 | ja | **24** | **103** |
| 24 | `/datenschutz` | 200 | ja | 35 | 125 |
| 25 | `/agb` | 200 | ja | 52 | 121 |

Fett = außerhalb der Zielkorridore (Titel ≤ 60, Description 120–160).

### 2.3 Sitemap-Metadaten

| Feld | Befund |
|---|---|
| `<lastmod>` | nur **156 / 182** — **26 Einträge ohne** |
| `<changefreq>` | `weekly` 133, `monthly` 45, `yearly` 3, `daily` 1 |
| `<priority>` | `0.85` 101, `0.8` 57, `0.9` 17, `0.3` 3, `0.7` 2, `1.0` 1, `0.5` 1 |

**Die 26 Einträge ohne `lastmod`:** `/leistungen` und alle 25 `/haushaltshilfe/*`-Stadtseiten. Genau die beiden jüngsten Bereiche werden also ohne Änderungsdatum ausgeliefert.

---

## 3. `robots.txt`

**HTTP 200.** Vollständiger Inhalt:

```
User-Agent: *
Allow: /
Allow: /fahrer/register
Allow: /auth/register
Disallow: /admin/
Disallow: /mis/
Disallow: /api/
Disallow: /engel/
Disallow: /kunde/
Disallow: /fahrer/
Disallow: /auth/
Disallow: /investor/
Disallow: /notfall/

Sitemap: https://alltagsengel.care/sitemap.xml
```

**Bewertung:**
- Sitemap-Verweis vorhanden und korrekt (absolut, HTTPS, liefert 200).
- Alle Disallow-Regeln betreffen eingeloggte/interne Bereiche. **Keine Sitemap-URL wird von einer Disallow-Regel getroffen** — geprüft: kein Sitemap-Pfad beginnt mit `/admin/`, `/mis/`, `/api/`, `/engel/`, `/kunde/`, `/fahrer/`, `/auth/`, `/investor/`, `/notfall/`.
- Achtung auf die Präfix-Semantik: `Disallow: /engel/` sperrt **nicht** `/engel-werden` (kein Slash-Match) — die 16 Bewerber-Seiten sind korrekt crawlbar. Bestätigt: `/engel-werden/hanau` liefert 200 und `index, follow`.

---

## 4. Canonicals

Geprüft auf allen 186 abgerufenen Dokumenten.

- **186 / 186** haben ein `<link rel="canonical">`. Keine fehlende.
- **182 / 182** Sitemap-URLs sind selbstreferenziell (Canonical == aufgerufene URL).
- **0 unbeabsichtigte Abweichungen.**

### 4.1 Die beabsichtigten Frankfurt-Konsolidierungen

Alle vier verhalten sich exakt wie vorgesehen — Seite liefert 200, ist **nicht** in der Sitemap, und kanonisiert auf die Root-Strecke:

| Aufgerufene URL | HTTP | Canonical | In Sitemap? |
|---|---|---|---|
| `/haushaltshilfe/frankfurt` | 200 | `https://alltagsengel.care/haushaltshilfe` | nein |
| `/krankenfahrten/frankfurt` | 200 | `https://alltagsengel.care/krankenfahrten` | nein |
| `/hygienebox/frankfurt` | 200 | `https://alltagsengel.care/hygienebox` | nein |
| `/engel-werden/frankfurt` | 200 | `https://alltagsengel.care/engel-werden` | nein |

`/alltagsbegleitung/frankfurt` ist die Ausnahme und korrekt so: sie **ist** in der Sitemap und kanonisiert auf sich selbst (`https://alltagsengel.care/alltagsbegleitung/frankfurt`) — die Flaggschiff-Stadtseite.

### 4.2 HTTP-Ebene

| Aufruf | Erste Antwort | Ziel |
|---|---|---|
| `http://alltagsengel.care/` | **308** | `https://alltagsengel.care/` |
| `https://www.alltagsengel.care/` | **308** | `https://alltagsengel.care/` |
| `https://alltagsengel.care/faq/` | **308** | `https://alltagsengel.care/faq` |
| `https://alltagsengel.care/FAQ` | **404** | — (Groß-/Kleinschreibung erzeugt keine Dublette) |

Jeweils genau **1** Redirect-Hop, keine Ketten.

---

## 5. Schema.org / JSON-LD

**Parse-Ergebnis: 186 / 186 Seiten valide, 0 kaputte Blöcke, 0 Seiten ohne JSON-LD.** (Blöcke einzeln durch `json.loads` geschickt, inkl. HTML-Entity-Entschlüsselung.)

### 5.1 Zehn repräsentative Seiten mit @type-Liste

| Seite | LD-Blöcke | @types (dedupliziert, verschachtelt aufgelöst) |
|---|---|---|
| `/` | 5 | Organization, ImageObject, PostalAddress, GeoCoordinates, ContactPoint, City, AdministrativeArea, State, PropertyValue, LocalBusiness, OpeningHoursSpecification, MobileApplication, Offer, WebSite, SearchAction, Service, FAQPage, Question, Answer |
| `/leistungen` | 3 | … + **OfferCatalog**, Service, FAQPage, **BreadcrumbList**, ListItem |
| `/alltagsbegleitung` | 5 | … + BreadcrumbList, WebPage, SpeakableSpecification, **HowTo**, HowToStep, Service, FAQPage |
| `/alltagsbegleitung/frankfurt` | 4 | … + Service, FAQPage, WebPage, SpeakableSpecification, BreadcrumbList |
| `/haushaltshilfe/offenbach` | 3 | … + Service, FAQPage, BreadcrumbList |
| `/krankenfahrten/wiesbaden` | 3 | … + WebPage, HowTo, HowToStep, Service, **UnitPriceSpecification**, FAQPage, BreadcrumbList |
| `/hygienebox/darmstadt` | 4 | … + **Product**, Brand, **MerchantReturnPolicy**, **OfferShippingDetails**, MonetaryAmount, DefinedRegion, ShippingDeliveryTime, FAQPage, BreadcrumbList |
| `/engel-werden/hanau` | 3 | … + **JobPosting**, Place, MonetaryAmount, QuantitativeValue, FAQPage, BreadcrumbList |
| `/blog` | 3 | … + **CollectionPage**, **ItemList**, ListItem, BreadcrumbList |
| `/blog/entlastungsbetrag-45b` | 3 | … + **Article**, BreadcrumbList, ListItem |

### 5.2 Abdeckung über alle 186 Seiten

| @type | Seiten |
|---|---|
| Organization / LocalBusiness / WebSite / SearchAction / PostalAddress / GeoCoordinates | **186** |
| BreadcrumbList + ListItem | **185** |
| FAQPage + Question + Answer | 161 |
| Service | 113 |
| WebPage + SpeakableSpecification | 89 |
| HowTo + HowToStep | 39 |
| Article | 39 |
| Product (+ Brand, MerchantReturnPolicy, OfferShippingDetails) | 28 |
| JobPosting + Place | 18 |
| WebApplication | 2 (`/budgetrechner`, `/pflegegrad-check`) |

**Einzige Seite ohne `BreadcrumbList`: `/`** — auf der Startseite ist das korrekt (kein Pfad oberhalb der Wurzel).

**25 Seiten ohne `FAQPage`:** `/agb`, `/bewertungen`, `/blog`, `/datenschutz`, `/impressum`, `/jobs`, `/kontakt`, `/seitenuebersicht`, `/team`, `/termin`, `/ueber-uns` und 14 Blog-Artikel. Für rechtliche Seiten, Index- und Kontaktseiten ist das sachgerecht; bei den 14 Blog-Artikeln (u. a. `/blog/entlastungsbetrag-45b`, `/blog/pflegereform-2027`, `/blog/seniorenbetreuung-frankfurt`) fehlt sie dort, wo die übrigen 26 Artikel sie führen — inkonsistent, aber kein Fehler.

**Kein Befund:** keine Seite mit gebrochenem JSON-LD, keine Seite ohne JSON-LD.

---

## 6. Titel und Meta-Description

Grundgesamtheit: die 182 indexierbaren (selbstkanonisierenden) Seiten.

| Kennzahl | Titel | Description |
|---|---|---|
| Minimum | 24 Zeichen | 103 Zeichen |
| Maximum | **91 Zeichen** | **217 Zeichen** |
| Durchschnitt | 55,1 | 158,3 |

### 6.1 Dubletten — der wichtigste Prüfpunkt

| Prüfung | Ergebnis |
|---|---|
| Seiten mit **identischem Titel** | **0** |
| Seiten mit **identischer Description** | **0** |

**Exakte Dubletten existieren nicht.** Die Near-Duplicate-Auswertung steht in Abschnitt 9 — dort liegt das eigentliche Risiko.

### 6.2 Titel-Ausreißer

**76 / 182 Titel > 60 Zeichen, davon 47 > 65 Zeichen.**

Verteilung der Titel > 65 Zeichen:

| Bereich | betroffen / gesamt |
|---|---|
| `/engel-werden*` | **16 / 16** |
| `/haushaltshilfe*` | **17 / 26** |
| `/blog/*` | 9 / 40 |
| Einzelseiten | 4 / 21 |
| `/alltagsbegleitung*` | 1 / 27 |
| `/hygienebox*` | 0 / 26 |
| `/krankenfahrten*` | 0 / 26 |

Die längsten:

| Zeichen | URL | Titel |
|---|---|---|
| **91** | `/engel-werden` | `Alltagsbegleiter/in werden (m/w/d) — Nebenjob & Minijob \| 20€/Std. Frankfurt \| Alltagsengel` |
| 87 | `/engel-werden/friedberg-wetterau` | `Alltagsbegleiter Job Friedberg (Wetterau) — 20 €/Std. Nebenjob & Minijob \| Alltagsengel` |
| 84 | `/engel-werden/main-taunus` | `Alltagsbegleiter Job Main-Taunus-Kreis — 20 €/Std. Nebenjob & Minijob \| Alltagsengel` |
| 84 | `/engel-werden/offenbach` | `Alltagsbegleiter Job Offenbach am Main — 20 €/Std. Nebenjob & Minijob \| Alltagsengel` |
| 80 | `/jobs` | `Jobs — Werde Teil des Alltagsengel-Teams \| Frankfurt & Rhein-Main \| Alltagsengel` |
| 79 | `/haushaltshilfe` | `Haushaltshilfe im Rhein-Main-Gebiet — Reinigung, Wäsche, Einkauf \| Alltagsengel` |
| 77 | `/alltagsbegleitung` | `Alltagsbegleitung — Frankfurt & Rhein-Main \| Entlastungsbetrag \| Alltagsengel` |
| 74 | `/leistungen` | `Leistungen — Alltagsbegleitung, Haushaltshilfe & Entlastung \| Alltagsengel` |

`/engel-werden` (91 Zeichen) trägt die Marke **doppelt**: `20€/Std. Frankfurt | Alltagsengel` nach `Nebenjob & Minijob |`.

**Am kurzen Ende:** alle 15 `/krankenfahrten/*`-Stadttitel unter 30 Zeichen — und sie sind die **einzigen** Seiten der Site **ohne Markensuffix „| Alltagsengel"**:

| Zeichen | URL | Titel |
|---|---|---|
| 24 | `/krankenfahrten/koeln` | `Krankenfahrt Köln buchen` |
| 24 | `/krankenfahrten/bonn` | `Krankenfahrt Bonn buchen` |
| 25 | `/krankenfahrten/essen` | `Krankenfahrt Essen buchen` |
| 29 | `/krankenfahrten/wiesbaden` | `Krankenfahrt Wiesbaden buchen` |

(Zum Vergleich: `/krankenfahrten` selbst = `Krankenfahrten Frankfurt & Rhein-Main buchen | Alltagsengel`.)

### 6.3 Description-Ausreißer

| Korridor | Seiten |
|---|---|
| < 120 Zeichen | **1** |
| 120–160 Zeichen | 126 |
| > 160 Zeichen | **55** (davon > 170: **43**) |

Zu kurz: `/impressum` mit **103** Zeichen — `Impressum der Alltagsengel UG (haftungsbeschränkt), Neue Mainzer Straße 66-68, 60311 Frankfurt am Main.`

Zu lang (> 170), Verteilung: `/haushaltshilfe*` **26**, `/engel-werden*` **9**, `/blog/*` 2, sowie `/entlastungsbetrag`, `/finanzierung`, `/leistungen`, `/ueber-uns`, `/verhinderungspflege`, `/warteliste` je 1.

Längste:

| Zeichen | URL |
|---|---|
| **217** | `/engel-werden` |
| 216 | `/haushaltshilfe/main-taunus` |
| 213 | `/haushaltshilfe` |
| 213 | `/warteliste` |
| 211 | `/haushaltshilfe/eschborn` |

Der komplette `/haushaltshilfe`-Silo liegt systematisch über dem Korridor, weil das Textmuster vier Aussagen aneinanderreiht (Ortsteile + Leistungen + §45b-Betrag + CTA).

### 6.4 Sonstiges im Head

| Prüfung | Ergebnis |
|---|---|
| `og:image` | 185 / 186 gesetzt, alle auf `https://alltagsengel.care/og-image.png` (HTTP 200, 41.857 B). **Fehlt auf `/warteliste`.** |
| `og:title` | auf allen geprüften Seiten vorhanden |

---

## 7. hreflang, `lang`, Viewport, Indexierbarkeit

| Prüfung | Ergebnis | Bewertung |
|---|---|---|
| `<html lang="…">` | **186 / 186 = `de`** | korrekt, einheitlich |
| `hreflang`-Links | **0 Seiten** | korrekt — die Site ist einsprachig, es gibt keine Sprachvarianten, die annotiert werden müssten |
| `<meta name="viewport">` | **186 / 186** vorhanden | korrekt |
| `noindex` im HTML | **0 Vorkommen** (`grep -ril "noindex" html/` → leer) | kein versehentliches Deindexieren |
| `<meta name="robots">` | **186 / 186 = `index, follow`** | einheitlich |
| `X-Robots-Tag`-Header | **0** (geprüft auf `/`, `/leistungen`, `/blog/pflegereform-2027`) | keine Header-Sperre |
| `X-Content-Type-Options` | `nosniff` | – |

**Kein `noindex` an falscher Stelle. Auch keines an richtiger Stelle** — d. h. auch Seiten, bei denen man ein `noindex` erwarten könnte, sind indexierbar; das ist hier unkritisch, weil `/admin`, `/kunde` etc. gar nicht erst ausgeliefert bzw. per robots.txt gesperrt sind.

---

## 8. Interne Verlinkung von `/leistungen`

Gemessen per `grep -l 'href="/leistungen"' html/*.html` über alle 186 gerenderten Dokumente. Auch Varianten mit Query oder Anker (`href="/leistungen…`) wurden geprüft — gleiches Ergebnis.

> **`/leistungen` wird von genau 1 von 186 Seiten verlinkt.**

Die einzige Quelle ist `/seitenuebersicht`:

```html
<li><a href="/leistungen">→ Alle Leistungen im Überblick</a></li>
```

Zum Vergleich — interne Linkquellen der übrigen Hauptseiten (Anzahl Seiten, die verlinken, von 186):

| Ziel | Verlinkende Seiten |
|---|---|
| `/`, `/alltagsbegleitung`, `/krankenfahrten`, `/hygienebox`, `/engel-werden`, `/blog`, `/faq`, `/kontakt`, `/einzugsgebiet`, `/entlastungsbetrag`, `/verhinderungspflege`, `/budgetrechner`, `/pflegegrad-check`, `/bewertungen`, `/termin`, `/finanzierung`, `/jobs`, `/team`, `/ueber-uns`, `/seitenuebersicht` | **186** (global in Nav/Footer) |
| `/pflegebox` | 32 |
| `/choose` (HTTP 200, nicht in Sitemap) | 32 |
| `/haushaltshilfe` | **28** |
| `/warteliste` | 28 |
| **`/leistungen`** | **1** |

`/leistungen` trägt vollständiges Markup (`OfferCatalog`, `Service`, `FAQPage`, `BreadcrumbList`), einen sauberen `h1` (`Leistungen`) und einen Sitemap-Eintrag — aber keine Linkkraft. Sie ist der am schlechtesten verlinkte Inhalt der gesamten Site.

### 8.1 Zweitbefund: `/haushaltshilfe` fehlt in Nav und Footer

Die Startseite enthält das Wort „haushaltshilfe" **0-mal** (`grep -c 'haushaltshilfe' html/_.html` → `0`). Im globalen Footer/Nav der Startseite tauchen `/alltagsbegleitung`, `/krankenfahrten`, `/hygienebox` je 2-mal auf — `/haushaltshilfe` gar nicht.

Die 28 verlinkenden Seiten sind praktisch nur der Silo selbst: 25 eigene Stadtseiten, `/alltagsbegleitung/frankfurt`, `/haushaltshilfe/frankfurt` — und `/leistungen`, die ihrerseits nur einen einzigen eingehenden Link hat.

Die Folge auf Seitenebene, gemessen an eingehenden internen Links:

| Stadtseite | eingehende interne Links |
|---|---|
| `/alltagsbegleitung/offenbach` | **186** (steht im globalen Footer) |
| `/krankenfahrten/offenbach` | 30 |
| `/hygienebox/koeln` | 29 |
| `/engel-werden/hanau` | 9 |
| `/haushaltshilfe/offenbach` | **7** |
| `/haushaltshilfe/bonn` | **3** |

---

## 9. Stadtseiten-Bestand und Thin-Content-Risiko

### 9.1 Bestand laut Sitemap

| Strecke | Stadtseiten in Sitemap | zzgl. Frankfurt-Seite außerhalb der Sitemap |
|---|---|---|
| `/alltagsbegleitung` | **26** (inkl. `frankfurt`, self-canonical) | – |
| `/haushaltshilfe` | **25** | 1 (kanonisiert auf Root) |
| `/krankenfahrten` | **25** | 1 (kanonisiert auf Root) |
| `/hygienebox` | **25** | 1 (kanonisiert auf Root) |
| `/engel-werden` | **15** | 1 (kanonisiert auf Root) |
| **Summe** | **116** | 4 |

### 9.2 Kernmessung: Wie viele *unterschiedliche* Textmuster stecken dahinter?

Methode: In Titel, Description und `h1` jeder Stadtseite wurde der Städtename durch `{STADT}` ersetzt; anschließend wurden die entstandenen Skelette gezählt. **Wenige Skelette bei vielen Seiten = die Seiten unterscheiden sich nur im Städtenamen.**

| Strecke | Seiten | **Desc-Skelette** | Titel-Skelette | H1-Skelette | Bewertung |
|---|---|---|---|---|---|
| `/haushaltshilfe` | 25 | **25** | 5 | 5 | differenziert |
| `/alltagsbegleitung` | 26 | **26** | 5 | 5 | differenziert |
| `/hygienebox` | 25 | **5** | 5 | 5 | **Near-Duplicate** |
| `/krankenfahrten` | 25 | **5** | 5 | 5 | **Near-Duplicate** |
| `/engel-werden` | 15 | **4** | 4 | 4 | **Near-Duplicate** |

### 9.3 Belege

**Differenziert** — `/alltagsbegleitung` und `/haushaltshilfe` binden je Stadt eigene Ortsteile ein, jede Description ist inhaltlich einmalig:

```
/haushaltshilfe/kassel
  Haushaltshilfe in Kassel — auch in Wehlheiden & Kirchditmold. Reinigung, Wäsche, …
/haushaltshilfe/marburg
  Haushaltshilfe in Marburg — auch in Wehrda & Cappel. Reinigung, Wäsche, …

/alltagsbegleitung/kassel
  Alltagsbegleitung in Kassel — auch in Wehlheiden & Kirchditmold. 131 €/Monat …
/alltagsbegleitung/marburg
  Alltagsbegleitung in Marburg — auch in Wehrda & Cappel. 131 €/Monat …
```

**Near-Duplicate** — bei den drei anderen Strecken ist der Städtename das einzige unterscheidende Token:

```
/krankenfahrten/kassel
  Krankenfahrt Kassel: Arzt-, Dialyse- & Klinikfahrten. Mit Verordnung zahlt die Kasse (§60 SGB V). Jetzt pünktliche Fahrt buchen!
/krankenfahrten/marburg
  Krankenfahrt Marburg: Arzt-, Dialyse- & Klinikfahrten. Mit Verordnung zahlt die Kasse (§60 SGB V). Jetzt pünktliche Fahrt buchen!
→ Differenz: 1 Wort

/hygienebox/kassel
  Kostenlose Pflegebox nach Kassel: Handschuhe, Desinfektion, Bettschutz (§40 SGB XI). Bis 42 €/Monat von der Kasse, 0 € Zuzahlung. Jetzt bestellen!
/hygienebox/marburg
  Kostenlose Pflegebox nach Marburg: Handschuhe, Desinfektion, Bettschutz (§40 SGB XI). Bis 42 €/Monat von der Kasse, 0 € Zuzahlung. Jetzt bestellen!
→ Differenz: 1 Wort

/engel-werden/maintal
  Alltagsbegleiter Job in Maintal: 20 €/Stunde, flexible Zeiten, keine Pflegeausbildung nötig. Stellenangebot als Betreuungskraft — Nebenjob oder Minijob. Jetzt bewerben!
/engel-werden/rodgau
  Alltagsbegleiter Job in Rodgau: 20 €/Stunde, flexible Zeiten, keine Pflegeausbildung nötig. Stellenangebot als Betreuungskraft — Nebenjob oder Minijob. Jetzt bewerben!
→ Differenz: 1 Wort
```

### 9.4 Ähnlichkeit des sichtbaren Seitentexts

Methode: HTML ohne `<script>`/`<style>` in Fließtext überführt, Wortfolgen je Strecke gegen die alphabetisch erste Stadtseite mit `difflib.SequenceMatcher` verglichen (inkl. Header/Footer, die auf allen Seiten identisch sind).

| Strecke | Referenz (Wörter) | Ähnlichkeit max | median | min |
|---|---|---|---|---|
| `/haushaltshilfe` | aschaffenburg (991) | 91,4 % (darmstadt) | 90,4 % | 87,5 % (limburg) |
| `/alltagsbegleitung` | aschaffenburg (1408) | 94,4 % (rodgau) | 93,4 % | 90,1 % (limburg) |
| `/engel-werden` | aschaffenburg (877) | 94,6 % (rodgau) | 93,5 % | 91,6 % (frankfurt) |
| `/krankenfahrten` | aschaffenburg (1378) | 96,1 % (hanau) | 95,5 % | 92,6 % (limburg) |
| `/hygienebox` | aschaffenburg (1344) | **96,3 %** (wiesbaden) | 95,8 % | 93,1 % (limburg) |

Die Rangfolge deckt sich mit 9.2: `/hygienebox` und `/krankenfahrten` sind am stärksten schablonenhaft, `/haushaltshilfe` am wenigsten.

### 9.5 Zusatzbefund: Keyword-Kollision `/pflegebox` ↔ `/hygienebox`

Zwei getrennte, beide indexierbare Seiten besetzen dasselbe Hauptkeyword:

| | `/pflegebox` | `/hygienebox` |
|---|---|---|
| Titel | `Pflegebox bestellen — kostenlos ab Pflegegrad 1 \| Alltagsengel` | `Pflegebox Frankfurt — kostenlos, 42 €/Monat \| Alltagsengel` |
| `h1` | `Pflegebox bestellen` | **`Hygienebox`** |
| Canonical | self | self |
| Wörter | 945 | 1.957 |
| Text-Ähnlichkeit zueinander | **17,9 %** | |

Der Inhalt ist verschieden (17,9 %), aber beide Titel führen „Pflegebox". Zusätzlich weicht auf `/hygienebox` der `h1` („Hygienebox") vom Titel („Pflegebox Frankfurt") ab — und alle 25 Unterseiten unter `/hygienebox/*` tragen `h1` und Titel „Pflegebox {Stadt}" bei URL-Pfad `/hygienebox/`.

---

## 10. Zu beheben, nach Wirkung sortiert

| # | Befund | Beleg (gemessen) | Wirkung |
|---|---|---|---|
| 1 | **`/leistungen` ist verwaist** — nur 1 interner Link | `grep -l 'href="/leistungen"' html/*.html` → 1 Treffer (`/seitenuebersicht`) von 186; alle anderen Hauptseiten: 186 Linkquellen | Hoch. Seite kann trotz Sitemap-Eintrag und vollständigem `OfferCatalog`-Markup kaum Ranking aufbauen. |
| 2 | **`/haushaltshilfe` fehlt in Nav/Footer** | Startseite: `grep -c 'haushaltshilfe' html/_.html` → **0**. Nur 28 Linkquellen; `/haushaltshilfe/bonn` hat **3** eingehende Links vs. 186 bei `/alltagsbegleitung/offenbach` | Hoch. 26-Seiten-Silo mit den *besten* differenzierten Texten der Site (25/25 eigene Descriptions) ist intern abgehängt. |
| 3 | **Near-Duplicate-Descriptions auf 65 Stadtseiten** | `/hygienebox` 5 Skelette / 25 Seiten, `/krankenfahrten` 5/25, `/engel-werden` 4/15; Textähnlichkeit bis **96,3 %** | Hoch. Keine exakte Dublette, aber Google bewertet Near-Duplicates nach Inhalt, nicht nach Zeichenvergleich. Muster für die Behebung ist bereits im Haus: `/haushaltshilfe` und `/alltagsbegleitung` erreichen 25/25 bzw. 26/26 eigene Descriptions über Ortsteil-Nennung. |
| 4 | **76 Titel > 60 Zeichen, 47 > 65** | `/engel-werden` **91** Zeichen (Marke doppelt: „20€/Std. Frankfurt \| Alltagsengel"); `/engel-werden/*` 16/16 betroffen, `/haushaltshilfe*` 17/26 | Mittel. Abschneiden im SERP kostet Klickrate. |
| 5 | **55 Descriptions > 160 Zeichen, davon 43 > 170** | `/engel-werden` **217**, `/haushaltshilfe/main-taunus` 216, `/haushaltshilfe` 213; kompletter `/haushaltshilfe`-Silo (26/26) betroffen | Mittel. |
| 6 | **Keyword-Kollision `/pflegebox` ↔ `/hygienebox`** | Beide Titel enthalten „Pflegebox", beide self-canonical, Textähnlichkeit nur 17,9 % → zwei eigenständige Seiten konkurrieren um dasselbe Keyword | Mittel. |
| 7 | **`h1`/Titel/URL-Bruch im `/hygienebox`-Silo** | `/hygienebox`: `h1` = „Hygienebox", Titel = „Pflegebox Frankfurt"; alle 25 Unterseiten: `h1`/Titel „Pflegebox {Stadt}" unter Pfad `/hygienebox/` | Niedrig–Mittel. |
| 8 | **15 `/krankenfahrten/*`-Titel ohne Markensuffix** | `Krankenfahrt Köln buchen` (24 Zeichen) — die einzigen Titel der Site ohne „\| Alltagsengel"; Root-Seite hat es (`Krankenfahrten Frankfurt & Rhein-Main buchen \| Alltagsengel`) | Niedrig. Inkonsistenz, ungenutzter Titelraum. |
| 9 | **26 Sitemap-Einträge ohne `<lastmod>`** | `/leistungen` + alle 25 `/haushaltshilfe/*` — 156/182 haben das Feld | Niedrig. Betrifft ausgerechnet die jüngsten Inhalte. |
| 10 | **`og:image` fehlt auf `/warteliste`** | 185/186 Seiten setzen `https://alltagsengel.care/og-image.png` (HTTP 200) | Niedrig. Betrifft Social-Sharing, nicht die Suche. |
| 11 | **`/impressum`-Description 103 Zeichen** | einzige Seite unter 120 | Sehr niedrig. |
| 12 | **14 Blog-Artikel ohne `FAQPage`** | 26 von 40 Artikeln führen es, 14 nicht (u. a. `/blog/entlastungsbetrag-45b`, `/blog/pflegereform-2027`) | Sehr niedrig. Inkonsistenz, kein Fehler. |

**Nicht zu beheben — ausdrücklich in Ordnung:**
Sitemap-Erreichbarkeit (182/182 × 200), Canonical-Abdeckung (186/186), Frankfurt-Konsolidierung (4/4 wie beabsichtigt), JSON-LD-Gültigkeit (186/186, 0 Parse-Fehler), `lang="de"` (186/186), Viewport (186/186), genau ein `h1` je Seite (186/186), Indexierbarkeit (0 `noindex`, 0 `X-Robots-Tag`), HTTP-Kanonisierung (je 1 × 308), robots.txt inkl. Sitemap-Verweis, **0 exakte Titel- oder Description-Dubletten**.

---

*Alle Werte am 12.09.2026 live gegen `https://alltagsengel.care` gemessen. Reiner Lesevorgang — keine Änderung an `app/`, `lib/` oder `components/`, kein Commit, kein Deploy.*

---

## 11. Nachtrag 12.09.2026 — Befund 1 und 2 behoben

Die beiden Hoch-Wirkung-Befunde sind noch am selben Tag geschlossen worden. Sie
brauchten **keine einzige neue Seite** — nur zwei Zeilen im Footer, der auf allen
Marketing-Seiten gerendert wird.

| Befund | Vorher | Nachher |
|---|---|---|
| `/leistungen` | 1 interne Linkquelle (`/seitenuebersicht`) | Footer-Eintrag „Alle Leistungen" → alle Marketing-Seiten |
| `/haushaltshilfe` | 0 Linkquellen ausserhalb des eigenen Silos | Footer-Eintrag „Haushaltshilfe" → alle Marketing-Seiten |

Zweiter Ordnung mitbehoben: `/warteliste` war ausschliesslich aus `/leistungen`
und der Haushaltshilfe-Strecke verlinkt — also aus zwei Seiten, die selbst
verwaist waren. Mit deren Anbindung haengt auch das Conversion-Ziel wieder am
Linkgraph.

**Damit es nicht wiederkommt:** `__tests__/seo/footer-linkgraph.test.ts` liest
`app/sitemap.ts` und verlangt, dass jede Top-Level-Route mit `priority >= 0.9`
entweder im gerenderten Footer verlinkt ist oder mit Begruendung in
`OHNE_FOOTER_LINK` steht — und dann nachweislich anderswo verlinkt ist. Eine
Seite als wichtig melden und intern nicht verlinken ist ab jetzt ein roter Test,
kein stiller Widerspruch. Gegenprobe gefahren: Footer-Zeile entfernt → 3 der 4
Faelle rot, Zeile zurueck → wieder gruen.

**Offen bleiben** die Befunde 3 bis 12. Der teuerste davon ist Nummer 3
(Near-Duplicate-Descriptions auf 65 Stadtseiten): er ist Textarbeit an 65
Seiten, keine Strukturaenderung, und das Muster dafuer steht bereits im Haus.
Befund 6 (`/pflegebox` ↔ `/hygienebox`) ist eine inhaltliche Entscheidung
darueber, welche Seite das Keyword fuehren soll — sie wird hier nicht still
getroffen, sondern im Test als benannte Ausnahme gefuehrt.
