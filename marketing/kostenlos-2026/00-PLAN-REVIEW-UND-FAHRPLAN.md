# Marketing-Plan Alltagsengel — Review, Lücken-Analyse & Fahrplan (kostenlos)

> **Stand:** 02.07.2026 · Nur kostenlose Maßnahmen (keine Ads, keine bezahlten Leads)
> **Region:** Frankfurt am Main + 30 km Umkreis · **Website:** alltagsengel.care
> **Kontakt:** info@alltagsengel.care · 0178 338 28 25 · WhatsApp +49 155 104 455 17

---

## 1. Was bereits vorhanden ist (Bestand)

| Bereich | Status | Datei |
|---------|--------|-------|
| 4-Wochen-Launch-Kampagne | ✅ vorhanden | `marketing/kampanya/KAMPANYA-STRATEGIE.md` |
| Social-Media-Content-Kalender Jul–Sep | ✅ vorhanden (mit Fehlern, s. u.) | `marketing/social-media/content-kalender.md` |
| Branchenverzeichnis-Vorlage + Status | ✅ vorhanden | `marketing/branchenverzeichnisse-vorlage.md` |
| Liste kostenloser Kanäle (10 Kategorien) | ✅ sehr gut | `marketing/ads/kostenlose-kanaele.md` |
| Google-My-Business-Guide (HTML) | ✅ vorhanden (veraltete Daten, s. u.) | `marketing/ads/google-my-business.html` |
| Blog auf Website (23 Artikel live) | ✅ stark | `app/blog/*`, `lib/blog-posts.ts` |
| Blog-Artikel-Ideen (25 Themen) | ✅ vorhanden (1 Fehler: „131 Euro") | `marketing/content/blog-artikel-ideen.md` |
| Social-Grafiken + Reels | ✅ umfangreich | `marketing/social-media-grafiken/` |

**Fazit:** Die Strategie-Grundlage ist stark. Es fehlt vor allem an **fertig ausformulierten, sofort einsetzbaren Texten** für die kostenlosen Kanäle — und es gibt **Konsistenz-Fehler**, die vor dem Ausrollen korrigiert werden müssen.

---

## 2. Gefundene Fehler / Inkonsistenzen (KRITISCH — vor Ausrollen fixen)

| # | Fehler | Wo | Korrekt | Status |
|---|--------|-----|---------|--------|
| 1 | **„131€"** statt **131€** Entlastungsbetrag | `content-kalender.md` (3×), `blog-artikel-ideen.md` (1×) | **131 €/Monat** | ✅ in diesem Durchlauf korrigiert |
| 2 | **„131€ Eigenanteil"** — Widerspruch (131€ ist der Zuschuss, NICHT der Eigenanteil) | `content-kalender.md` (Z. 54, 161) | Entlastungsbetrag = 131€ Zuschuss → **0€ Eigenanteil** | ✅ korrigiert |
| 3 | **§45a** statt **§45b** durchgängig | `content-kalender.md`, div. Social-Vorlagen | Kundenkommunikation: **§45b SGB XI** (Entlastungsbetrag). Rechtlicher Hinweis s. u. | ✅ im Kalender korrigiert |
| 4 | Branding **„Grün/Weiß"** | `content-kalender.md` (Z. 221) | **Gold #C9963C / Coal #1A1612 / Creme #F5F0E8** | ✅ korrigiert |
| 5 | Website **alltagsengel.com** + Städte Darmstadt/Wiesbaden/Mainz | `google-my-business.html` | **alltagsengel.care** + Frankfurt + 30 km | ⚠️ HTML-Guide ist Alt-Asset — neue GBP-Texte liegen in `google-business/` |
| 6 | Telefon-Inkonsistenz (`+49 155 10445517` als „Telefon") | `google-my-business.html` | **Telefon 0178 338 28 25**, **WhatsApp +49 155 104 455 17** | ✅ in neuen Dateien konsistent |

> **Hinweis §45a vs. §45b:** Juristisch ist Alltagsbegleitung ein „Angebot zur Unterstützung im Alltag" nach **§45a** SGB XI, finanziert über den **Entlastungsbetrag nach §45b** SGB XI. Für die **Kundenkommunikation** verwenden wir einheitlich **§45b** (die Leistung, die 131€ bringt) — konsistent mit Website & Brand. Das ist fachlich korrekt und für Angehörige verständlicher.

---

## 3. Was noch fehlte — und jetzt neu erstellt wurde

Alle neuen Deliverables liegen unter `marketing/kostenlos-2026/`:

| Ordner / Datei | Inhalt | Für welchen Kanal |
|----------------|--------|-------------------|
| `google-business/gbp-beschreibungen.md` | Kurz/Mittel/Lang-Beschreibungen (.care, 131€) | Google Business Profil |
| `google-business/gbp-posts.md` | 12 fertige Google-Posts (2/Woche, 6 Wochen) | Google Business Profil |
| `google-business/gbp-faq-qa.md` | 12 Q&A zum Selbst-Einstellen (Self-Seeding) | Google Business Profil |
| `google-business/gbp-dienstleistungen.md` | 8 Services mit Beschreibungstexten | Google Business Profil |
| `branchenverzeichnisse/eintraege-fertig.md` | Copy-Paste-Texte pro Verzeichnis (11880, Gelbe Seiten, GoLocal, KennstDuEinen, Das Örtliche, Cylex, nebenan.de, pflegemarkt, ProvenExpert) | Branchenverzeichnisse |
| `artikel/01-alltagsbegleitung-frankfurt.md` | Voller SEO-Artikel (~1.400 W.) | Website-Blog / Medium / LinkedIn |
| `artikel/02-entlastungsbetrag-131-euro.md` | Voller SEO-Artikel (~1.500 W.) | Website-Blog / Medium / LinkedIn |
| `artikel/03-paragraph-45b-leistungen.md` | Voller SEO-Artikel (~1.400 W.) | Website-Blog / Medium / LinkedIn |
| `kooperationen/anschreiben-pflegestuetzpunkte.md` | Brief + E-Mail-Vorlage | Pflegestützpunkte |
| `kooperationen/anschreiben-krankenhaus-sozialdienst.md` | Brief + E-Mail-Vorlage | Kliniken / Entlassmanagement |
| `kooperationen/anschreiben-sozialdienste-verbaende.md` | Brief + E-Mail-Vorlage | Wohlfahrt / Ärzte / Apotheken |
| `kooperationen/partner-liste-frankfurt.md` | Konkrete Kontaktliste Raum FFM | Alle Kooperationen |
| `newsletter/newsletter-template.md` | Wiederverwendbares Newsletter-Gerüst | E-Mail-Marketing |
| `newsletter/ausgabe-01-juli-2026.md` | Fertige erste Ausgabe | E-Mail-Marketing |

Zusätzlich **korrigiert im Bestand:** `marketing/social-media/content-kalender.md` (Fehler 1–4 + Oktober-Wochen ergänzt).

---

## 4. Priorisierter Fahrplan (nächste 6 Wochen, 0 € Budget)

### Woche 1 — Fundament & NAP-Konsistenz
- [ ] **Google Business Profil** anlegen/vervollständigen → Beschreibung, 8 Services, Öffnungszeiten (Texte: `google-business/`)
- [ ] Erste 2 Google-Posts + 5 Q&A self-seeden
- [ ] Alle offenen Branchenverzeichnisse abschließen (`branchenverzeichnisse/eintraege-fertig.md`) — **identische NAP-Daten überall!**

### Woche 2 — Vertrauen & Reichweite
- [ ] `Das Örtliche`, `nebenan.de`-Gewerbeprofil, `ProvenExpert`-Basisprofil anlegen
- [ ] Pflege-Portale: `pflegemarkt.com`, `pflegelotse.de` (AOK), `pflegenavigator.de` (Barmer)
- [ ] Ersten Blog-Artikel veröffentlichen + auf Medium/LinkedIn zweitverwerten

### Woche 3 — Kooperationen (stärkster kostenloser Kanal)
- [ ] 3 Pflegestützpunkte Frankfurt persönlich/schriftlich kontaktieren (`kooperationen/`)
- [ ] 2 Klinik-Sozialdienste (Entlassmanagement) anschreiben
- [ ] Hausärzte/Apotheken im Stadtteil: Flyer + Empfehlungskarten hinterlegen

### Woche 4 — Bewertungen & E-Mail
- [ ] Google-Bewertungs-Kurzlink erstellen → an zufriedene Kunden per WhatsApp
- [ ] Newsletter Ausgabe 1 versenden (Mailchimp Free / Strato-SMTP, `info@alltagsengel.care`)
- [ ] 2. Blog-Artikel + Zweitverwertung

### Woche 5–6 — Skalieren
- [ ] Wöchentlich 1 Google-Post, 3 Social-Posts (Kalender), auf alle Bewertungen antworten
- [ ] 3. Blog-Artikel, Kooperations-Follow-ups
- [ ] Facebook-Gruppen „Pflegende Angehörige Frankfurt" — hilfreich präsent sein (keine plumpe Werbung)

---

## 5. Kanäle nach Aufwand/Wirkung (kostenlos)

| Priorität | Kanal | Aufwand | Wirkung | Deliverable |
|-----------|-------|---------|---------|-------------|
| 1 | Google Business Profil | Mittel | Sehr hoch | ✅ `google-business/` |
| 2 | Empfehlung / Kooperationen | Gering | Sehr hoch | ✅ `kooperationen/` |
| 3 | Pflege-Portale | Gering | Hoch | Doku: `ads/kostenlose-kanaele.md` |
| 4 | Branchenverzeichnisse | Gering | Mittel-Hoch | ✅ `branchenverzeichnisse/` |
| 5 | SEO-Blog + Zweitverwertung | Mittel | Hoch (langfristig) | ✅ `artikel/` |
| 6 | Bewertungsportale | Gering | Hoch | Doku vorhanden |
| 7 | Social Media (organisch) | Mittel | Mittel | ✅ Kalender korrigiert |
| 8 | Newsletter | Mittel | Hoch (Bestand) | ✅ `newsletter/` |

---

## 6. Kommunikations-Regeln (für ALLE Texte — Checkliste)

- ✅ Absender/Unterschrift **immer „Alltagsengel"** — NIE persönliche Namen
- ✅ Anrede: „Hallo Frau/Herr [Nachname]," · Grußformel: „Herzliche Grüße, Ihr Team von Alltagsengel"
- ✅ E-Mail **immer** `info@alltagsengel.care` (Strato) — **nie Gmail**
- ✅ Entlastungsbetrag = **131 €/Monat** (1.572 €/Jahr) — **nie 125€**
- ✅ **§45b SGB XI** in Kundenkommunikation
- ✅ Alltagsbegleitung ist **KEINE Pflege** — Abgrenzung immer klar
- ✅ Zielgruppe: **alle mit Pflegegrad** (Kinder, Erwachsene, Senioren)
- ✅ Farben: Gold #C9963C / Coal #1A1612 / Creme #F5F0E8 · Schrift: Jost
- ✅ Büro: Neue Mainzer Straße 66-68, 60311 Frankfurt am Main

---

*Erstellt für Alltagsengel — kostenlose Marketing-Umsetzung. Stand: 02.07.2026.*
