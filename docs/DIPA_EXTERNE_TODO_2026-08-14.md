# DiPA / PflegeCoach — Externe To-do-Liste

**Stand:** 14.08.2026 (Phase 4+5 Reverify) · **Vorheriger Stand:** 574fd19, CI #220 PASS

**Geschäftsmodell:** PflegeCoach ist dauerhaft kostenlos für Endnutzer. Monetarisierung
ausschließlich über Pflegekassen-Erstattung nach tatsächlicher DiPA-Zulassung.

**Wichtig:** Keine DiPA-Zulassung liegt vor. Keine ist beantragt. Diese Liste enthält keine
erfundenen Genehmigungen, Preise oder Rechtsbehauptungen. Alle Aussagen zu Pflichten sind
gegen Primärquellen geprüft (DiPAV-Volltext, Anlagen 1+2, BfArM-DiPA-Leitfaden v1.3,
MDR, BSI) — siehe `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md` für die vollständige
48-Punkte-Tabelle mit Fundstellen.

**Was sich seit dem letzten Stand geändert hat (Phase 4, 14.08.2026):**
- BSI TR-03161 und Penetrationstest sind **kein zwei getrennte Beschaffungsvorgänge**
  mehr — das TR-03161-Zertifikat deckt den Pentest laut BfArM-Leitfaden i. d. R. mit ab.
- ISMS nach ISO 27001 ist laut BfArM-Leitfaden **zwingend bei Antragstellung**, kein "o. ä."
- Der BITV-Test-Punkt war auf die falsche Norm gezielt — DiPAV verlangt **DIN EN ISO
  9241-171**, nicht WCAG/EN 301 549/BITV. Punkt entsprechend korrigiert.
- BfArM-Beratung ist **nachweislich freiwillig** (DiPAV §22: "auf Anfrage"), bleibt aber
  aus Effizienzgründen der empfohlene erste Schritt.
- Freischaltcode-Frage (REG-02) ist **geklärt**: DiPA läuft über Kostenerstattung nach
  Bewilligung der Pflegekasse, nicht über ein DiGA-artiges Code-Verfahren — Punkt entfällt
  als offener externer Blocker.
- Neuer interner Punkt gefunden: 24-Stunden-Antwortzusage für den Support ist in Anlage 2
  DiPAV konkret gefordert und bei uns nicht dokumentiert (VS-02) — das ist eine
  Geschäftsführungs-Entscheidung, kein externer Blocker, aber ein echter Gap.

---

## Zusammenfassung

| Kategorie | Anzahl | Status |
|---|---|---|
| Intern erfüllt (Rohquote) | 31/48 | Code + Tests + Doku vorhanden |
| Davon textlich geprüft (belastbar) | 36/48 (44 %) | Gegen Originaldokumente gehalten |
| Extern erforderlich | 16/48 | Siehe Tabelle unten |
| Davon P0-Blocker | 3 | Ohne diese kaum sinnvoller Fortschritt zum Antrag |
| Davon P1-wichtig | 7 | Für Zulassungsfähigkeit erforderlich |
| Davon P2-Vorbereitung | 6 | Optimierung / nach BfArM-Beratung |

---

## P0 — höchste Hebelwirkung

### 1. BSI TR-03161-Zertifikat **und zugehöriger Penetrationstest in einem Mandat** (SEC-01, SEC-04)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Datensicherheitszertifikat nach BSI TR-03161 bei akkreditierter Prüfstelle beauftragen |
| **Zweck** | Nachweispflicht nach DiPAV §5 Abs. 2 Nr. 1 i. V. m. §78a Abs. 7 SGB XI; deckt laut BfArM-Leitfaden (Kap. 3.4) i. d. R. auch die Penetrationstest-Anforderung nach §8 Abs. 3 DiPAV vollständig ab |
| **Benötigter Nachweis** | TR-03161-Prüfbericht/Zertifikat (inkl. Pentest, Code-Review, Whitebox-Test) |
| **Zuständige Stelle** | BSI-akkreditierte IT-Sicherheitsprüfstelle |
| **Abhängigkeiten** | Keine — kann sofort beauftragt werden |
| **Priorität** | **P0** — längste Vorlaufzeit (Monate) |
| **Status** | ⬜ OFFEN (Selbsteinschätzung liegt vor) |
| **Vorbereitet** | `audit/dipa/tr03161_checkliste.md`, `audit/dipa/pentest_beauftragung_scope.md` (als Grundlage für die Prüfstelle, NICHT als separates Pentest-Mandat) |
| **Nächste Aktion** | Prüfstelle beauftragen — **nicht** zusätzlich unabhängig einen Pentest-Dienstleister anfragen, bevor klar ist, ob die Prüfstelle das mit abdeckt |

### 2. Pflegefachliche Inhaltsfreigabe (QI-01)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Pflegefachkraft prüft alle 12 PflegeCoach-Inhaltsmodule auf fachliche Korrektheit |
| **Zweck** | Höchstes Produktrisiko (R1.4 im Risikoregister); betrifft auch den bereits live nutzbaren PflegeCoach (Produkt A), nicht nur die DiPA-Aufnahme |
| **Benötigter Nachweis** | Unterschriebene fachliche Freigabe je Modul |
| **Zuständige Stelle** | Pflegefachkraft (Pflegewissenschaft, mind. 3 Jahre Berufserfahrung) |
| **Abhängigkeiten** | Keine |
| **Priorität** | **P0** |
| **Status** | ⬜ OFFEN |
| **Vorbereitet** | `audit/dipa/inhalte_pruefdossier.md` |

### 3. Datenschutzpaket (DS-02, DS-04, PROD-02, VS-04)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | DSFA erstellen lassen + AVVs schließen + MDR-Negativabgrenzung und Selbstzahler-AGB juristisch schlussprüfen |
| **Zweck** | Vier BfArM-relevante Anlagen in einem Mandat — PROD-02 (MDR-Abgrenzung) ist jetzt intern textlich vollständig durchgeprüft (Art. 2 Nr. 1 MDR gegen alle 4 Zweckbestimmungs-Alternativen), braucht aber weiterhin eine juristische Schlussabnahme vor Antragstellung |
| **Benötigter Nachweis** | Unterschriebene DSFA, AVVs, geprüfte MDR-Abgrenzung, geprüfte Nutzungsbedingungen |
| **Zuständige Stelle** | Kanzlei mit Gesundheitswesen-/DiGA-/DiPA-/Medizinprodukterecht-Erfahrung |
| **Abhängigkeiten** | Keine |
| **Priorität** | **P0** |
| **Status** | ⬜ OFFEN |
| **Vorbereitet** | `audit/dipa/dsfa_pflegecoach.md`, `audit/dipa/avv_dossier_pflegecoach.md`, `audit/dipa/mdr_negativabgrenzung.md`, `audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md` |

---

## P1 — wichtig für Zulassungsfähigkeit

### 4. ISMS-Zertifizierung nach ISO 27001 (SEC-05)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | ISMS nach ISO 27001 (ggf. auf Basis IT-Grundschutz) durch DAkkS-akkreditierte Stelle zertifizieren lassen |
| **Zweck** | Laut BfArM-Leitfaden (Kap. 3.4.1, S. 50) **zwingender** Bestandteil der Antragstellung — keine Kann-Bestimmung, wie zuvor angenommen |
| **Benötigter Nachweis** | ISO-27001-Zertifikat |
| **Zuständige Stelle** | DAkkS-akkreditierte Zertifizierungsstelle |
| **Abhängigkeiten** | Geltungsbereich (nur Produkt vs. Gesamtbetrieb) vorab festlegen — idealerweise mit BfArM-Beratung abgestimmt |
| **Priorität** | **P1**, mit langer Vorlaufzeit — real eher P0-Kandidat sobald Kapazität vorhanden |
| **Status** | ⬜ OFFEN |
| **Vorbereitet** | `audit/dipa/isms_scope_vorbereitung.md` |

### 5. Konformitätsprüfung DIN EN ISO 9241-171 + Usability-Test (BF-01, BF-02)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Konformität gegen **DIN EN ISO 9241-171** (nicht BITV/WCAG/EN 301 549) prüfen lassen; formative UND summative Nutzertests mit 5 Testpersonen aus der Zielgruppe |
| **Zweck** | DiPAV §6 Abs. 6 + Anlage 2 Themenfeld 4 + BfArM-Leitfaden Kap. 3.6.3.1/3.6.3.2 verlangen beides ausdrücklich; unser bisheriger axe-core/WCAG-Ansatz deckt die tatsächlich einschlägige Norm nicht ab |
| **Benötigter Nachweis** | Konformitätsprüfbericht DIN EN ISO 9241-171 + Usability-Testbericht (formativ + summativ) |
| **Zuständige Stelle** | Usability-/Accessibility-Prüfstelle mit Erfahrung in DIN EN ISO 9241; Testleitung für Nutzertests |
| **Abhängigkeiten** | Durchführungsplan liegt vor, deckt bisher nur eine summative Runde ab — vor Beauftragung um eine formative Runde ergänzen |
| **Priorität** | **P1** |
| **Status** | ⬜ OFFEN |
| **Vorbereitet** | `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md`, `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md` |

### 6. Wissenschaftlicher Partner / Evaluationskonzept (NN-01)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Herstellerunabhängiges wissenschaftliches Institut für die Evaluationsstudie finden |
| **Zweck** | BfArM-Leitfaden Kap. 4.5.2 (S. 100ff.): "Das Evaluationskonzept muss von einem herstellerunabhängigen wissenschaftlichen Institut erstellt werden" — **zwingend**, nicht durch eigenes Personal ersetzbar |
| **Benötigter Nachweis** | Evaluationskonzept + Ethikvotum, erstellt von externem Institut |
| **Zuständige Stelle** | Universität / Pflegewissenschaftliches Institut |
| **Abhängigkeiten** | Idealerweise nach BfArM-Beratung (Studiendesign-Anforderungen abstimmen) |
| **Priorität** | **P1** |
| **Status** | ⬜ OFFEN |
| **Vorbereitet** | `audit/dipa/evaluationskonzept.md` |

### 7. Lizenzvereinbarungen für Erhebungsinstrumente (QI-02)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Nutzungsrechte für FES-I, HPS/BSFC-s, SUS klären; BfArM-Leitfaden (Kap. 4.5.1) verlangt grundsätzlich ein validiertes Messinstrument für den Nutzennachweis |
| **Zweck** | Rechtssichere Nutzung validierter Assessment-Instrumente |
| **Benötigter Nachweis** | Lizenzvereinbarungen oder Bestätigung der freien Nutzbarkeit |
| **Zuständige Stelle** | Jeweilige Rechteinhaber |
| **Abhängigkeiten** | Keine |
| **Priorität** | **P1** |
| **Status** | ⬜ OFFEN |

### 8. Datenschutzbeauftragter bestellen

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Externen DSB bestellen oder internen benennen |
| **Zweck** | Pflichtangabe im DiPA-Antrag und auf der Website |
| **Zuständige Stelle** | Geschäftsführung oder externer DSB-Anbieter |
| **Priorität** | **P1** |
| **Status** | ⬜ OFFEN |

### 9. Steuernummer / USt-IdNr. klären

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Steuernummer und ggf. USt-IdNr. beim Steuerberater klären |
| **Zweck** | Pflichtangabe auf Rechnungen (§14 Abs. 4 UStG), für spätere Kassenabrechnung |
| **Zuständige Stelle** | Steuerberater |
| **Priorität** | **P1** |
| **Status** | ⬜ OFFEN |

### 10. 24-Stunden-Support-SLA festlegen und umsetzen (VS-02) — intern, aber Geschäftsführungsentscheidung

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Anlage 2 DiPAV §6 Abs. 5 Punkt III.8 verlangt eine kostenlose deutschsprachige Anwenderbetreuung mit Antwort **spätestens innerhalb von 24 Stunden**. Diese Zusage existiert bislang nicht |
| **Zweck** | Konkrete, textlich geforderte Frist — kein Ermessensspielraum wie zuvor angenommen |
| **Benötigter Nachweis** | Dokumentierte Support-SLA + organisatorische Fähigkeit, sie einzuhalten (Personal/Vertretung) |
| **Zuständige Stelle** | Geschäftsführung (Ressourcenentscheidung), dann Umsetzung technisch/organisatorisch |
| **Abhängigkeiten** | Keine |
| **Priorität** | **P1** — kein externer Dienstleister nötig, aber eine echte Betriebszusage, kein reiner Code-Fix |
| **Status** | ⬜ OFFEN — GAP-SUPPORT-SLA |

---

## P2 — Vorbereitung / nach BfArM-Beratung

### 11. SEPA-Gläubiger-ID bei Bundesbank beantragen

| Feld | Inhalt |
|---|---|
| **Status** | ⬜ OFFEN (Platzhalter DE98ZZZ09999999999 im System) |
| **Priorität** | **P2** |

### 12. §45a-Anerkennung in Hessen beantragen

| Feld | Inhalt |
|---|---|
| **Zweck** | Voraussetzung für Kassenabrechnung von Entlastungsleistungen (§45b), unabhängig von DiPA |
| **Zuständige Stelle** | RP Gießen |
| **Status** | ⬜ OFFEN |
| **Priorität** | **P2** |

### 13. ITSG-Sicherheitsverfahren / DAKOTA-Adapter

| Feld | Inhalt |
|---|---|
| **Zweck** | Elektronischer Datenaustausch (§302 SGB V) mit Pflegekassen, erst nach Versorgungsvertrag relevant |
| **Zuständige Stelle** | ITSG GmbH |
| **Status** | ⬜ OFFEN (Code-seitig vorbereitet) |
| **Priorität** | **P2** |

### 14. Versorgungsvertrag (§72/§75 SGB XI)

| Feld | Inhalt |
|---|---|
| **Zuständige Stelle** | Landesverbände der Pflegekassen in Hessen |
| **Status** | ⬜ OFFEN |
| **Priorität** | **P2** — mehrmonatiger Prozess |

### 15. Vergütungsvereinbarung / Abrechnungsweg (REG-04)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Vergütungssätze bzw. Abrechnungsanteil mit Kassen vereinbaren |
| **Neuer Kontext (Phase 4):** | DiPA-Erstattung ist laut BfArM-Leitfaden ein gesetzlicher Kostenerstattungs-**Höchstbetrag** von **bis zu 70 €/Monat** (DiPA-Aufwendungen + ergänzende Unterstützungsleistungen nach §39a SGB XI zusammen) — kein individuell verhandelter Herstellerpreis wie bei DiGA. Das ist der gesetzliche Rahmen, keine von uns festgelegte oder erfundene Zahl |
| **Zuständige Stelle** | GKV-Spitzenverband / Pflegekassen, erst nach DiPA-Listung |
| **Status** | ⬜ OFFEN — Rahmen bekannt, konkreter Anteil offen |
| **Priorität** | **P2** — erst nach vorläufiger DiPA-Aufnahme relevant |

### 16. REG-01 — Restliche 12 ungeprüfte Katalogeinträge

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Verbleibende 12 Einträge (PROD-06, DS-06, SEC-02/03/06/07/08, QI-01, NN-02/03, VS-03, REG-01 selbst) hängen an weiteren Primärquellen — größtenteils an der TR-03161-Vollversion (SEC-02/03/06/07/08), die uns nicht im Volltext vorliegt |
| **Zuständige Stelle** | Intern — Volltext frei beim BSI erhältlich, dann Lesezeit statt Beschaffung |
| **Status** | ⬜ 36/48 geprüft (44 % belastbar), siehe `docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md` |
| **Priorität** | **P2** intern, kein externer Blocker |

---

## Entfallen / geklärt (nicht mehr in dieser Liste)

- **Freischaltcode-Verfahren (REG-02):** BfArM-Leitfaden Kap. 1.1 klärt abschließend —
  DiPA läuft über Kostenerstattung nach SPV-Bewilligung, kein Code-Verfahren wie DiGA.
  Kein externer Klärungsbedarf mehr.
- **Qualifikation für eUL-Erbringer (REG-03):** BfArM-Leitfaden (S. 88) bestätigt, dass
  dies eine Herstellerentscheidung ist, kein regulatorisch vorgegebener Katalog. Unsere
  selbst gesetzten Kriterien sind der vorgesehene Weg.

---

## Empfohlene Reihenfolge

1. **SOFORT (parallel):** TR-03161-Prüfstelle (#1, deckt SEC-04 mit) + Datenschutz-/Rechtsmandat (#3) + Pflegefachkraft (#2)
2. **SOFORT parallel:** DIN-EN-ISO-9241-171-Prüfung + Usability-Tests (#5) + Support-SLA-Entscheidung (#10)
3. **PARALLEL, empfohlen aber nicht Pflicht:** BfArM-Beratung anfragen — klärt TR-03161-Scope, FHIR-Verbindlichkeit (INT-02), REG-04-Vergütungsanteil in einem Termin, ohne Antragsvoraussetzung zu sein
4. **NACH Scope-Klärung:** ISMS-Zertifizierung (#4) + Evaluationspartner (#6)
5. **NACH allen Nachweisen:** BfArM-Antrag auf vorläufige Aufnahme
6. **NACH Aufnahme:** Vergütungsanteil am 70€-Deckel klären (#15)

---

**BfArM-Einreichung heute möglich: NEIN**

Begründung: 16 extern zu erbringende Nachweise fehlen (davon 3 mit P0). Kein einziger
dieser Punkte ist durch interne Codearbeit allein schließbar. Der wirkungsvollste erste
Schritt bleibt, TR-03161-Prüfstelle, Rechtsmandat und Pflegefachkraft parallel zu
beauftragen — eine BfArM-Beratung ist dabei sinnvoll, aber nachweislich keine Pflicht.
