# Offene Aufgaben — Status-Bericht 04. Juli 2026

---

## 1. Verbund Pflegehilfe — ABGESCHLOSSEN / KEIN HANDLUNGSBEDARF

**Hintergrund:** Verbund Pflegehilfe (VP Verbund Pflegehilfe GmbH) hatte ein Lead-Paket angeboten (299€/Monat × 6 Monate = 1.794€ Vorauszahlung, ~30 Leads/Woche).

**Status:** Die Verhandlung wurde am 14. Mai 2026 mit klaren Konditionen beantwortet (Probemonat, Lead-Garantie, Bad-Lead-Mechanismus, keine Exklusivität). Es kam **keine Einigung** — das Angebot war zu teuer (CPL ~12-15€ vs. eigene 7,43€).

**Fazit:** ❌ **Kostenpflichtiges Modell** — widerspricht der aktuellen Strategie "nur kostenlose Maßnahmen". Kein Follow-up nötig.

---

## 2. PROCARE — FOLLOW-UP DRINGEND

**Hintergrund:** Gespräch mit Marco Jürgens (Account Manager, PROCARE Deutschland GmbH) am 02.07.2026 über Partnerschaft:
- 10% Provision auf vermittelte Pflegehilfsmittel/Pflegeboxen (mündlich mit Timo vereinbart)
- Gegenseitige Landing-Page-Präsenz
- Erweiterung auf saugende Inkontinenzprodukte

**Status:** Das Gespräch war am 02.07. — das ist 2 Tage her. Die Gesprächsvorlage liegt vor, aber **kein Ergebnisprotokoll** vorhanden. Die vorbereitete Follow-up-Mail (`procare-antwort-marco-juergens.md`) schlägt Termine am 06./07./08.07. vor.

**Aktion erforderlich:**
- ☐ Klären ob das Gespräch am 02.07. stattgefunden hat
- ☐ Falls ja: Ergebnisse dokumentieren, Follow-up-Mail versenden
- ☐ Falls nein: Die vorbereitete Mail mit Terminvorschlägen über **info@alltagsengel.care** versenden

**Entwurf Follow-up-Mail liegt bereit:** `procare-antwort-marco-juergens.md` — Termine Mo 06.07., Di 07.07., Mi 08.07. vorgeschlagen. Absender: Alltagsengel, keine persönlichen Namen.

---

## 3. 131€ Entlastungsbetrag Fix — ✅ CODE KORREKT, 1 MIGRATION OFFEN

**Was erledigt ist:**
- Alle UI-Texte korrekt auf 131€/Monat (1.572€/Jahr) aktualisiert
- Historische 125€-Referenzen korrekt als "veraltet" markiert (SEO-relevant für alte Suchbegriffe)
- Budget-Seite `/admin/budgets` liest `monthly_amount` dynamisch aus der DB
- Betriebssystem mit 3 Testklienten, 28 Leistungsnachweisen, Budgets mit Ampelsystem

**Was noch offen ist:**
- ⚠️ **Migration `20260702_fix_service_records_check_constraints.sql` muss im Supabase SQL-Editor ausgeführt werden**
  - Problem: Die CHECK-Constraints auf `service_records` erlauben nur `('draft','paid','disputed')`, die App schreibt aber `draft/incomplete/complete/signed/invoiced`
  - Ohne diese Migration kann das Leistungsnachweis-Formular Status `signed`/`complete` nicht speichern
  - Die Migration ist fertig geschrieben und getestet — nur die Ausführung fehlt

---

## 4. Branchenverzeichnisse — UMFANGREICHE LISTE VORHANDEN, EINTRAGUNG LÄUFT

**Fertige Deliverables:**
- `marketing/branchenverzeichnisse-status-juli-2026.md` — 31 Verzeichnisse mit Wochenplan
- `marketing/kostenlos-2026/branchenverzeichnisse/eintraege-fertig.md` — Copy-Paste-Texte
- `marketing/branchenverzeichnisse-vorlage.md` — NAP-Daten

**Status der wichtigsten Verzeichnisse:**

| Verzeichnis | Status | Notiz |
|------------|--------|-------|
| Google Business Profil | ⚠️ Erstellt, NICHT VERIFIZIERT | Video-Verifizierung vom Büro nötig |
| 11880.com | ⚠️ 4 Anfragen (Barbara Dalchow), Kontaktdaten nicht freigeschaltet | PRIORITÄT! |
| Gelbe Seiten | ⬜ Offen | Vorsicht: nach 3 Monaten kostenpflichtig |
| Das Örtliche | ⬜ Offen | Über DTM eintragen |
| Bing Places | ⬜ Offen | |
| Apple Business | ⬜ Offen | |
| Yelp | ⬜ Offen | DA ~90, sehr wertvoll |
| meinestadt.de | ⬜ Offen | DA ~70 |
| Deutsches Seniorenportal | ⬜ Offen | Reichweitenstärkstes Seniorenportal |
| Familienratgeber (Aktion Mensch) | ⬜ Offen | |

**Weitere kostenlose Verzeichnisse (noch nicht in der Liste):**

| Verzeichnis | URL | Kostenlos? | Warum relevant? |
|------------|-----|-----------|----------------|
| **pflegelotse.de** (AOK) | pflegelotse.de | Ja | Offizielles AOK-Verzeichnis, hohe Vertrauenswürdigkeit |
| **pflegenavigator.de** (Barmer) | pflegenavigator.de | Ja | Barmer-Verzeichnis |
| **pflegemarkt.com** | pflegemarkt.com | Ja (Basis) | Spezialisiertes Pflegemarkt-Portal |
| **nebenan.de** | nebenan.de | Ja (Gewerbeprofil) | Nachbarschafts-Netzwerk, lokale Reichweite |
| **ProvenExpert** | provenexpert.com | Ja (Basis) | Bewertungsportal, SEO-Signal |
| **WerKenntDenBesten.de** | werkenntdenbesten.de | Ja | Bewertungsportal |
| **Wer liefert was (wlw)** | wlw.de | Ja | B2B-Verzeichnis |

---

## 5. SEO/GEO — STATUS

### Was gebaut und live ist:
- ✅ Schema.org JSON-LD (LocalBusiness + FAQPage + Service)
- ✅ `llms.txt` für GEO/AI-Optimierung
- ✅ `robots.txt` + `sitemap.xml`
- ✅ OpenGraph + Twitter Cards
- ✅ **31 Blog-Artikel** (von alltagsbegleiter-werden bis wer-zahlt-alltagsbegleitung)
- ✅ Stadtseiten (Frankfurt + weitere Städte für Alltagsbegleitung/Krankenfahrten/Hygienebox)
- ✅ AI-Optimierungsguide (`marketing/geo/ai-optimierung.md`)
- ✅ Wikidata-Vorlage für Knowledge-Graph-Eintrag

### Google-Indexierung (Stand 02.07.):
- **Nur 4 Seiten** von Google indexiert → deutlich zu wenig
- Ziel: 15-20 indexierte Seiten innerhalb 3 Monate

### Ranking-Positionen (geschätzt):
- „Alltagsbegleitung Frankfurt" → noch NICHT Top 10
- „Entlastungsbetrag beantragen" → Position vorhanden, nicht Top 10
- „Krankenfahrt Frankfurt" → vermutlich Seite 2-3

### Sofort-Maßnahmen (SEO):
- ☐ `noindex` auf `/auth/*`, `/choose` (Funktionsseiten)
- ☐ Google Search Console einrichten/prüfen
- ☐ Google Business Profil verifizieren (Video-Verifizierung)
- ☐ Regelmäßig Google-Posts veröffentlichen (1×/Woche, Vorlagen liegen in `google-business/gbp-posts.md`)

---

## Zusammenfassung — Nächste Schritte (priorisiert)

| # | Aktion | Aufwand | Priorität |
|---|--------|---------|-----------|
| 1 | **PROCARE Follow-up versenden** (Mail liegt bereit) | 5 Min | 🔴 HEUTE |
| 2 | **11880.com Kontaktdaten freischalten** (Barbara Dalchow, 4 Anfragen!) | 10 Min | 🔴 HEUTE |
| 3 | **Google Business Profil Video-Verifizierung** | 15 Min | 🔴 Diese Woche |
| 4 | **Constraint-Migration ausführen** (Supabase SQL-Editor) | 5 Min | 🟡 Diese Woche |
| 5 | **Branchenverzeichnisse Woche 1** (Bing Places, Gelbe Seiten, Das Örtliche) | 1 Std | 🟡 Diese Woche |
| 6 | **Google Search Console prüfen** | 15 Min | 🟡 Diese Woche |
| 7 | **Branchenverzeichnisse Woche 2** (Seniorenportal, Pflegeportale, Yelp) | 1 Std | 🟢 KW 28 |
| 8 | **Pressemitteilung auf OpenPR/Fair-News** | 30 Min | 🟢 KW 28 |

---

*Erstellt automatisch — 04.07.2026*
