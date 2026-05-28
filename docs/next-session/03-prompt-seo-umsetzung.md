# Prompt 3 — SEO-Umsetzung: Ratgeber-Sektion bauen

**Zweck:** Komplett-Auftrag für die Code-Session. Baut die `/ratgeber`-Sektion
End-to-End. Yusuf muss nur EINEN Satz in den Chat schreiben (siehe unten), den
Rest erledigt der Assistent autonom inkl. Commit + Push.

---

## Der eine Satz für Yusuf (in die Code-Session kopieren)

```
Arbeite docs/next-session/03-prompt-seo-umsetzung.md vollständig und 
autonom ab. Committe und pushe selbst nach jedem Schritt. Frag nur bei 
echten Design-Entscheidungen.
```

Das war's. Alles Weitere steht hier drunter und wird vom Assistenten gelesen.

---

## Kontext

- **Projekt:** AlltagsEngel.care, Next.js 14 App Router, TypeScript, TailwindCSS.
- **Strategie-Hintergrund:** `docs/growth/SEO_GEO_STRATEGIE_2026.md` (komplett lesen).
- **Fertige Inhalte:** `docs/growth/seo-content/` — 4 Markdown-Dateien mit
  YAML-Frontmatter (SEO-Metadaten) und HTML-Kommentaren mit Entwickler-Hinweisen:
  - `R1-entlastungsbetrag-45b.md` → Pillar-Page
  - `R2-was-macht-ein-alltagsbegleiter.md`
  - `R3-wer-zahlt-alltagsbegleitung.md`
  - `E1-alltagsbegleiter-werden.md`
- **Projekt-Regeln** (`CLAUDE.md`): Git automatisch committen + pushen, UI-Texte
  Deutsch, Commit-Messages DE/TR, Pre-Commit-Hook `lint:forbidden` beachten.

## Ziel

Aus den 4 fertigen Markdown-Inhalten echte, indexierbare, SEO- und GEO-optimierte
Seiten in der App machen. Die Texte sind fertig — NICHT neu schreiben, nur einbauen.

---

## Aufgaben (der Reihe nach)

### Schritt 1 — Content-Infrastruktur

- Entscheide: MDX-Pipeline oder Content als TS-Objekte. Empfehlung: ein
  `lib/ratgeber/`-Modul mit typisierten Content-Objekten (kein zusätzliches
  MDX-Setup nötig, einfacher wartbar). Frontmatter → typisiertes Interface.
- Lege `lib/ratgeber/artikel.ts` an: Array aller Artikel mit Feldern aus dem
  Frontmatter (url, metaTitle, metaDescription, zielKeyword, schema, stand,
  interneLinks) plus dem Fließtext-Body.
- Body-Rendering: Markdown → HTML. Nutze eine schlanke, bereits im Projekt
  vorhandene Lösung; falls keine da ist, `react-markdown` o.ä. ergänzen.

### Schritt 2 — Routen & Seiten

- Ratgeber-Übersicht: `app/ratgeber/page.tsx` — listet R1, R2, R3 als Karten.
- Ratgeber-Detail: `app/ratgeber/[slug]/page.tsx` mit `generateStaticParams()`
  und `generateMetadata()`.
- Engel-Recruiting: `app/mitmachen/alltagsbegleiter-werden/page.tsx` (E1) —
  eigene Route gemäß Frontmatter-URL `/mitmachen/alltagsbegleiter-werden`.
- Slugs exakt aus dem Frontmatter-Feld `url` übernehmen.

### Schritt 3 — Metadaten & Schema

- `generateMetadata()`: title + description aus Frontmatter, dazu `canonical`,
  OpenGraph, Twitter-Card (Muster: bestehendes `app/layout.tsx`).
- JSON-LD je Seite gemäß Frontmatter-Feld `schema`:
  - `Article` — auf allen Ratgebern (datePublished/dateModified aus `stand`).
  - `FAQPage` — aus dem jeweiligen FAQ-Abschnitt (Q&A-Paare parsen).
  - `HowTo` — nur R1 (Abschnitt „Wie beantrage ich den Entlastungsbetrag?", 5 Schritte).
- Schema als `<script type="application/ld+json">` rendern.

### Schritt 4 — Verlinkung & CTA

- Interne Links: pro Artikel die im Frontmatter `interne_links` gelisteten Ziele
  als Inline-Links bzw. „Das könnte Sie auch interessieren"-Block einbauen.
  Hinweis: Manche Linkziele (R4, R5 etc.) existieren noch nicht — diese Links
  vorbereiten, aber nur rendern, wenn die Zielseite existiert (kein 404).
- CTA-Block am Artikelende:
  - Ratgeber R1-R3 → „Jetzt Alltagsengel finden" → Kunden-Registrierung.
  - E1 → „Jetzt als Engel registrieren" → `/choose` bzw. Engel-Registrierung.

### Schritt 5 — Indexierung

- `sitemap.ts` um die neuen URLs erweitern.
- Sicherstellen: `/auth/*` und `/choose` sind `noindex` (falls noch nicht — in
  deren Metadata `robots: { index: false }` setzen). Ratgeber-Seiten `index: true`.
- `llms.txt` im Projekt-Root anlegen: Liste der Ratgeber-URLs mit Kurzbeschreibung
  (für KI-Crawler / GEO).

### Schritt 6 — Einstieg sichtbar machen

- Im Footer (oder Haupt-Navigation) einen Link „Ratgeber" auf `/ratgeber` setzen.
- Optional: auf der Landing-Page einen kleinen „Ratgeber"-Teaser-Block, falls es
  sich ohne Layout-Bruch einfügt — sonst weglassen.

### Schritt 7 — Verifizieren

- `npm run lint`
- `npm run build` — muss fehlerfrei durchlaufen.
- Stichprobe: `/ratgeber`, `/ratgeber/entlastungsbetrag-45b`,
  `/mitmachen/alltagsbegleiter-werden` rendern; Meta-Tags und JSON-LD im
  generierten HTML prüfen.

---

## Definition of Done

- [ ] 4 Seiten live und gebaut (3 Ratgeber + 1 Engel-Seite) + Übersichtsseite
- [ ] Meta-Tags + JSON-LD (Article/FAQPage/HowTo) korrekt im HTML
- [ ] Interne Links + CTAs gesetzt, keine 404
- [ ] `sitemap.ts` erweitert, `llms.txt` angelegt, `/auth`+`/choose` `noindex`
- [ ] Footer-Link „Ratgeber" vorhanden
- [ ] `npm run lint` + `npm run build` grün
- [ ] Pro Schritt committed + gepusht

## Wichtig

- Die Texte NICHT verändern oder kürzen — sie sind fertig redigiert.
- Fachliche Inhalte (131 €, §45b, Fristen) NICHT „korrigieren" — sind geprüft.
- Bei Design-Fragen (Karten-Layout, Footer-Platzierung) gern kurz nachfragen,
  sonst autonom durcharbeiten.

## Danach

Nächste Content-Welle (R4, R5, Cluster-F-Fragen, lokale Stadt-Seiten) wird
separat geliefert — siehe `docs/growth/SEO_GEO_STRATEGIE_2026.md`, Teil 2.
