# ChairMatch Landing — i18n

Leichtgewichtige Mehrsprachigkeit für die statische Landing-Site.
Kein Build-Schritt, keine Abhängigkeiten, keine Framework-Bindung.

**Standardsprache ist Deutsch.** Die HTML-Dateien enthalten weiterhin den
deutschen Text im Markup — das Modul ersetzt ihn nur, wenn eine andere
Sprache aktiv ist. Für deutsche Besucher und für Crawler ändert sich damit
nichts, auch wenn JavaScript blockiert ist.

## Dateien

| Datei | Zweck |
|---|---|
| `i18n.js` | Laufzeit: Spracherkennung, DOM-Ersetzung, Intl-Formatierung, Umschalter |
| `de.json` | Deutscher Katalog (Quelle der Wahrheit für die Key-Struktur) |
| `en.json` | Englischer Katalog — gleicher Key-Satz wie `de.json` |

Einbinden (steht bereits in allen instrumentierten Seiten):

```html
<script src="/i18n/i18n.js" defer></script>
```

## Markup-API

```html
<h1 data-i18n="home.hero.title"></h1>                 <!-- textContent -->
<p  data-i18n-html="home.donate.subtitle"></p>        <!-- innerHTML, nur eigene Texte -->
<input data-i18n-attr="placeholder:form.field.name">  <!-- Attribute, mehrere per ";" -->
<time data-i18n-date="2026-06-06" data-i18n-date-style="long"></time>
<span data-i18n="blog.readTime" data-i18n-count="8"></span>   <!-- Plural -->
<div data-i18n-switcher></div>                        <!-- Sprachumschalter -->
```

### Variablen

`data-i18n-vars` gilt für das Element und alle Nachfahren:

```html
<body data-i18n-vars='{"city":"@city.local.koeln.city"}'>
```

Ein Wert mit führendem `@` wird aus dem Katalog gelesen und wechselt damit
die Sprache mit — im Beispiel „Köln“ / „Cologne“. Ohne `@` ist der Wert ein
Literal.

### Platzhalter, die zur Laufzeit gesetzt werden

Elemente mit `data-i18n-runtime` bekommen ihren Text aus JavaScript
(z. B. die Fehlermeldung im Lead-Formular, deren Key von der Fehlerart
abhängt). Der Abdeckungsbericht ignoriert sie deshalb.

## JS-API

```js
ChairMatchI18n.t('form.error.network')
ChairMatchI18n.getLocale()               // 'de' | 'en'
ChairMatchI18n.setLocale('en')           // schreibt Cookie + localStorage, rendert neu
ChairMatchI18n.formatDate(value, opts)   // Intl.DateTimeFormat, Zeitzone Europe/Berlin
ChairMatchI18n.formatDateTime(value, opts)
ChairMatchI18n.formatNumber(value, opts)
ChairMatchI18n.formatCurrency(1234.5)    // "1.234,50 €" / "€1,234.50"
ChairMatchI18n.formatPriceRange(30, 60)  // "30–60 €" / "€30 – €60"
```

Nach jedem Rendern feuert auf `document` das Ereignis `chairmatch:i18n`
mit `detail.locale`.

## Spracherkennung

Erste Fundstelle gewinnt:

1. `?lang=en` in der URL
2. Cookie `NEXT_LOCALE`
3. `localStorage['cm_locale']`
4. `navigator.languages`
5. Fallback **`de`**

Das Cookie heißt bewusst `NEXT_LOCALE` — genauso wie in der Next.js-App
unter `chairmatch.de`. Die Sprachwahl überlebt damit den Wechsel zwischen
Landing-Site und App.

Fehlt ein Key in der aktiven Sprache, greift automatisch der deutsche
Eintrag; fehlt auch der, wird der Key selbst ausgegeben und eine Warnung
in die Konsole geschrieben.

## Neue Sprache hinzufügen

1. `de.json` kopieren nach `<locale>.json` und übersetzen.
2. In `i18n.js` die Konstanten `LOCALES` und `LOCALE_META` ergänzen
   (`intl` steuert die Zahlen-/Datumsformate, `htmlLang` das `lang`-Attribut).
   RTL-Sprachen zusätzlich in `RTL_LOCALES` eintragen — `dir="rtl"` wird
   dann automatisch gesetzt.
3. `node scripts/chairmatch-i18n-check.mjs` — meldet fehlende oder überzählige Keys.
4. hreflang in den `<head>`-Blöcken ergänzen (siehe unten).

## Skripte

```bash
node scripts/chairmatch-i18n-check.mjs      # Keys + deutsche Texte gegen das Markup prüfen
node scripts/chairmatch-i18n-coverage.mjs   # Welche deutschen Texte sind noch nicht erfasst?
```

Dieselben Läufe stehen als `npm run chairmatch:i18n:check` bzw.
`… :coverage` bereit, sobald die zugehörige `package.json`-Änderung
committet ist.

`check` bricht mit Exit-Code 1 ab, wenn ein Key fehlt oder der deutsche
Katalogtext vom Text im Markup abweicht. Das ist die wichtigste Schranke:
Weicht der Katalog ab, würde die Seite beim Laden ihren eigenen Inhalt
überschreiben — ein stiller SEO-Schaden.

Neu erzeugte Seiten instrumentieren:

```bash
node scripts/chairmatch-i18n-extract-cities.mjs      # Stadttexte -> de.json
node scripts/chairmatch-i18n-instrument.mjs          # Stadtseiten
node scripts/chairmatch-i18n-instrument-pages.mjs    # index / faq / blog-Index
node scripts/chairmatch-i18n-instrument-articles.mjs # Blogartikel-Rahmen
```

Alle vier sind idempotent und schreiben eine Datei nur, wenn jede
Ersetzung exakt einmal greift.

## hreflang

Jede übersetzte Seite trägt im `<head>`:

```html
<link rel="alternate" hreflang="de" href="https://chairmatch.de/faq">
<link rel="alternate" hreflang="en" href="https://chairmatch.de/faq?lang=en">
<link rel="alternate" hreflang="x-default" href="https://chairmatch.de/faq">
```

**Blogartikel bekommen kein `hreflang="en"`.** Ihr Fließtext ist bewusst
nur auf Deutsch übersetzt (Rahmen ja, Inhalt nein); ein englisches
Alternate wäre ein falsches Signal an Suchmaschinen. Stattdessen blendet
das Modul dort einen Hinweis ein (`.cm-de-only`), sobald eine andere
Sprache aktiv ist.

## Bekannte Grenze

Die englische Fassung entsteht clientseitig. Google indexiert die
deutschen Quelldateien; die `?lang=en`-Varianten werden nicht zuverlässig
als eigenständige Seiten gewertet. Wenn Englisch wirklich ranken soll,
braucht es vorgerenderte `/en/`-Dateien — dafür ließe sich ein
Build-Schritt ergänzen, der die Kataloge vor dem Deploy in Kopien der
HTML-Dateien einsetzt.
