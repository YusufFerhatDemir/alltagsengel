# SEO-Analyse: Keyword „Alltagsbegleitung"
**alltagsengel.care — Juli 2026**

---

## 1. Google-Ranking: Ist-Zustand

### „alltagsbegleitung" (generisch)
**alltagsengel.care ist NICHT in den Top 10.** Die ersten Plätze belegen:
- diealltagsbegleiter.de (Platz 1)
- hilfswerk.de
- seniorenlebenshilfe.de
- arbeitsagentur.de (BERUFENET)
- toll-betreuung.de

### „alltagsbegleitung app"
**alltagsengel.care ist NICHT in den Top 10.** Stattdessen ranken:
- alltagsbegleitung.software (Software für Betreuungsdienste)
- alltagshelfer.app
- pflegeberatung.software

### „alltagsbegleitung frankfurt"
**alltagsengel.care ist NICHT in den Top 10.** Es dominieren:
- diealltagsbegleiter.de/frankfurt (Platz 1)
- fwg-net.de
- my-homecare.de
- familienservice.de
- lwp-frankfurt.de

### „alltagsbegleiter"
**alltagsengel.care ist NICHT in den Top 10.** Wikipedia, Arbeitsagentur und diealltagsbegleiter.de belegen die vorderen Plätze.

### „alltagsengel app" (Marken-Keyword)
**alltagsengel.care rankt hier gut** — App Store Listing und die Website erscheinen.

---

## 2. Diagnose: Warum rankt ihr nicht?

### Was ihr GUT macht
- **Title-Tags** sind korrekt optimiert: „Alltagsbegleitung, Pflegebox & Krankenfahrten Frankfurt" (Homepage), „Alltagsbegleitung Frankfurt | Entlastungsbetrag | Alltagsengel" (Serviceseite)
- **Meta-Descriptions** enthalten „Alltagsbegleitung" auf allen relevanten Seiten
- **12 Stadt-Landingpages** existieren (Frankfurt, Offenbach, Wiesbaden, Darmstadt etc.) mit jeweils eigenem Content, FAQs und Stadtteil-Erwähnungen
- **Structured Data** ist vorbildlich: Organization, LocalBusiness, Service, FAQPage, HowTo, BreadcrumbList, Article — alles vorhanden
- **Sitemap** wird dynamisch generiert mit Git-basierten lastmod-Daten
- **19 Blog-Artikel** referenzieren „Alltagsbegleitung"

### Was FEHLT bzw. SCHWACH ist

#### Problem 1: Homepage H1 ist „ALLTAGSENGEL" statt „Alltagsbegleitung"
Die H1 der Homepage lautet `<h1>ALLTAGSENGEL</h1>` — das ist der Markenname. Google gewichtet die H1 als stärkstes On-Page-Signal. Für das Keyword „Alltagsbegleitung" ist das ein verschenktes Signal. „Alltagsbegleitung" steht nur im `<p>`-Tag darunter als Untertitel.

#### Problem 2: Root-Layout Keywords-Array enthält KEIN „Alltagsbegleitung"
Die globalen Keywords in `app/layout.tsx` listen nur Pflegebox- und Krankenfahrt-Begriffe auf:
```
'Pflegebox beantragen', 'Pflegehilfsmittel Box kostenlos', 'Pflegebox Frankfurt',
'Krankenfahrt buchen Frankfurt', 'Krankenfahrt Rhein-Main', ...
```
Kein einziges „Alltagsbegleitung"-Keyword ist im globalen Fallback enthalten.

#### Problem 3: Zu wenig Textmasse / Content-Tiefe
Die Konkurrenz (seniorenlebenshilfe.de, toll-betreuung.de, hilfswerk.de) hat auf ihren Alltagsbegleitung-Seiten 1.500–3.000 Wörter informationellen Content. Die /alltagsbegleitung-Seite auf alltagsengel.care ist vergleichsweise dünn — sie listet Leistungen und Preise auf, bietet aber wenig redaktionellen Erklär-Content.

#### Problem 4: Fehlende Backlinks / Domain-Autorität
Die rankenden Seiten sind etablierte Domains mit hoher Domain Authority (Arbeitsagentur, Hilfswerk, Wikipedia). alltagsengel.care ist eine relativ neue Domain ohne nennenswerte Backlinks von Autoritäts-Seiten.

#### Problem 5: Keyword-Kannibalisierung
`/alltagsbegleitung` und `/blog/alltagsbegleitung-frankfurt` konkurrieren beide um „Alltagsbegleitung Frankfurt". Google weiß nicht, welche Seite die Hauptseite ist.

#### Problem 6: Canonical-Problem bei Frankfurt-Stadtseite
`/alltagsbegleitung/frankfurt` hat als Canonical `/alltagsbegleitung` gesetzt — die Frankfurt-spezifische Seite wird also von Google zur generischen Seite zusammengelegt. Für Local SEO „Alltagsbegleitung Frankfurt" verliert ihr damit eine eigene rankbare URL.

---

## 3. Maßnahmenplan (nur kostenlose Maßnahmen)

### Priorität 1 — Sofort umsetzbar (Code-Änderungen)

#### 1.1 Homepage H1 ändern
**Datei:** `app/page.tsx` Zeile 170
```
VORHER:  <h1 className="sp-word">ALLTAGSENGEL</h1>
NACHHER: <h1 className="sp-word">Alltagsbegleitung Frankfurt<br/><span style={{fontSize:'0.6em'}}>von Alltagsengel</span></h1>
```
Oder alternativ die H1 als „Alltagsbegleitung, Pflegebox & Krankenfahrt" setzen und den Markennamen als Untertitel/Logo behalten. Das visuelle Design kann per CSS identisch bleiben.

#### 1.2 Root-Layout Keywords ergänzen
**Datei:** `app/layout.tsx` Zeile 28–40
Folgende Keywords zum Array hinzufügen:
```
'Alltagsbegleitung',
'Alltagsbegleitung Frankfurt',
'Alltagsbegleitung buchen',
'Alltagsbegleiter finden',
'Alltagsbegleitung Rhein-Main',
'Alltagsbegleitung Entlastungsbetrag',
'Alltagsbegleitung §45a',
'Alltagsbegleitung App',
```

#### 1.3 Canonical der Frankfurt-Stadtseite korrigieren
**Datei:** `app/alltagsbegleitung/[stadt]/page.tsx`
Frankfurt sollte eine **eigene Canonical-URL** haben (`/alltagsbegleitung/frankfurt`), nicht zur generischen Seite canonicalisieren. Sonst kann die Frankfurt-Seite nie eigenständig für „Alltagsbegleitung Frankfurt" ranken.

#### 1.4 Blog-Artikel Canonical prüfen
`/blog/alltagsbegleitung-frankfurt` sollte auf `/alltagsbegleitung/frankfurt` verweisen oder umgekehrt den Blog-Artikel als Unterstützung der Serviceseite positionieren (interner Link mit Ankertext „Alltagsbegleitung Frankfurt").

### Priorität 2 — Content erweitern (1–2 Wochen)

#### 2.1 /alltagsbegleitung Seite massiv ausbauen
Die Seite braucht 1.500+ Wörter hochwertigen Content. Ergänzen:
- **Ausführliche Erklärung** was Alltagsbegleitung genau ist (Definition, Abgrenzung zur Pflege)
- **Wer hat Anspruch** — ausführlicher mit Beispielen
- **Typischer Ablauf** eines Alltagsbegleitung-Termins
- **Erfahrungsberichte** / Testimonials
- **Vergleichstabelle**: Alltagsbegleitung vs. Pflegedienst vs. Haushaltshilfe
- **Kosten-Rechner** / Verweis auf Budgetrechner

#### 2.2 Neue Blog-Artikel zu Long-Tail-Keywords
Ziel-Keywords die fehlen:
- „Alltagsbegleitung Kosten Vergleich 2026"
- „Alltagsbegleitung beantragen Schritt für Schritt"
- „Unterschied Alltagsbegleitung Pflegedienst"
- „Alltagsbegleitung Erfahrungen"
- „Alltagsbegleitung für Demenz"
- „Alltagsbegleitung Senioren Frankfurt Erfahrungsbericht"

#### 2.3 FAQ-Sektion auf /alltagsbegleitung erweitern
Aktuell keine FAQs direkt auf der Serviceseite (nur auf der Stadtseite). Ergänzen mit FAQPage-Schema für:
- „Was kostet Alltagsbegleitung?"
- „Wer bezahlt Alltagsbegleitung?"
- „Wie finde ich einen Alltagsbegleiter in meiner Nähe?"
- „Brauche ich einen Pflegegrad für Alltagsbegleitung?"
- „Was ist der Unterschied zwischen Alltagsbegleitung und Pflegedienst?"

### Priorität 3 — Backlinks & Off-Page (laufend)

#### 3.1 Google Business Profile optimieren
Kategorie auf „Alltagsbegleitung" oder „Betreuungsdienst" setzen. Beiträge mit dem Keyword „Alltagsbegleitung Frankfurt" posten.

#### 3.2 Lokale Verzeichnisse / Pflegeportale
Kostenlose Einträge auf:
- pflegesuche.de
- pflegix.de
- pflege.de
- wer-pflegt-wie.de
- Gelbe Seiten / Das Örtliche
Überall mit Link auf alltagsengel.care/alltagsbegleitung/frankfurt

#### 3.3 Gastbeiträge / Kooperationen
- Lokale Seniorenmagazine (Frankfurt-Tipps.de etc.)
- Pflegestützpunkte Frankfurt kontaktieren
- Ratgeber-Artikel für Pflegeportale schreiben (mit Backlink)

#### 3.4 Bewertungen pushen
Google-Bewertungen aktiv einsammeln mit Keyword-Bezug. Zufriedene Kunden bitten, „Alltagsbegleitung" in der Bewertung zu erwähnen.

### Priorität 4 — Technische Optimierungen

#### 4.1 Interne Verlinkung stärken
Jeder Blog-Artikel der „Alltagsbegleitung" erwähnt, sollte einen Link auf `/alltagsbegleitung` enthalten mit dem Ankertext „Alltagsbegleitung" (nicht „hier klicken" oder „mehr erfahren").

#### 4.2 Alt-Texte der Bilder
Prüfen ob Bilder auf der Homepage und Serviceseiten Alt-Texte mit „Alltagsbegleitung" haben.

#### 4.3 URL-Slugs prüfen
Die URL `/alltagsbegleitung` ist perfekt. Die Stadt-URLs `/alltagsbegleitung/frankfurt` ebenfalls. Keine Änderung nötig.

---

## 4. Zusammenfassung

| Bereich | Status | Handlungsbedarf |
|---|---|---|
| Title-Tags | ✅ Gut | Keywords-Array in Layout ergänzen |
| Meta-Descriptions | ✅ Gut | Keine Änderung nötig |
| H1-Überschriften | ❌ Schwach | Homepage H1 auf „Alltagsbegleitung" umstellen |
| Structured Data | ✅ Sehr gut | Keine Änderung nötig |
| Sitemap | ✅ Gut | Keine Änderung nötig |
| Content-Tiefe | ⚠️ Mittel | /alltagsbegleitung massiv ausbauen |
| Interne Verlinkung | ⚠️ Mittel | Mehr Keyword-Ankerlinks setzen |
| Backlinks | ❌ Schwach | Lokale Verzeichnisse + GBP optimieren |
| Canonical-Setup | ⚠️ Problem | Frankfurt Canonical korrigieren |
| Blog-Content | ✅ Gut | Long-Tail-Artikel ergänzen |

**Kernaussage:** Die technische SEO-Basis ist solide. Was fehlt, ist (a) die H1-Optimierung auf der Homepage, (b) deutlich mehr Textmasse auf der /alltagsbegleitung-Seite, (c) das Canonical-Problem bei der Frankfurt-Seite und (d) externe Backlinks von Pflege-Portalen und lokalen Verzeichnissen.
