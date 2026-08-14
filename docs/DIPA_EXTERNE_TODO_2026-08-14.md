# DiPA / PflegeCoach — Externe To-do-Liste

**Stand:** 14.08.2026 · **Commit:** 574fd19 · **CI:** #220 PASS

**Geschäftsmodell:** PflegeCoach ist dauerhaft kostenlos für Endnutzer. Monetarisierung
ausschließlich über Pflegekassen-Erstattung nach tatsächlicher DiPA-Zulassung.

**Wichtig:** Keine DiPA-Zulassung liegt vor. Keine ist beantragt. Diese Liste enthält keine
erfundenen Genehmigungen, Preise oder Rechtsbehauptungen.

---

## Zusammenfassung

| Kategorie | Anzahl | Status |
|---|---|---|
| Intern erfüllt (Kategorie A) | 30/48 | ✅ Code + Tests + Doku vorhanden |
| Extern erforderlich (Kategorie B) | 18/48 | ⬜ Siehe Tabelle unten |
| Davon P0-Blocker | 4 | ⬜ Ohne diese keine BfArM-Einreichung |
| Davon P1-wichtig | 8 | ⬜ Für Zulassungsfähigkeit erforderlich |
| Davon P2-Vorbereitung | 6 | ⬜ Optimierung / nach BfArM-Beratung |

---

## P0 — Blocker (ohne diese geht NICHTS weiter)

### 1. BfArM-Beratungstermin beantragen

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Beratungsgespräch beim BfArM-Innovationsbüro beantragen |
| **Zweck** | Klärt 6+ offene Abhängigkeiten auf einmal: FHIR-Verbindlichkeit (INT-02), Freischaltcode-Pflicht (REG-02), eUL-Kriterien (REG-03), TR-03161-Scope (SEC-01), ISMS-Scope (SEC-05), Evaluationsdesign (NN-01) |
| **Benötigter Nachweis** | Beratungsprotokoll (wird zum Pflichtdokument im Antrag) |
| **Zuständige Stelle** | BfArM-Innovationsbüro (online/telefonisch) |
| **Abhängigkeiten** | Keine — kann sofort beantragt werden |
| **Priorität** | **P0** — höchste Hebelwirkung, da 6+ andere Punkte davon abhängen |
| **Status** | ⬜ OFFEN |
| **Vorbereitet** | `audit/dipa/bfarm_fragenkatalog.md` — 20 konkrete Fragen, versandfertig |
| **Nächste Aktion** | BfArM-Innovationsbüro kontaktieren, Fragenkatalog mitschicken |

### 2. Pflegefachliche Inhaltsfreigabe (QI-01)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Pflegefachkraft prüft alle 12 PflegeCoach-Inhaltsmodule auf fachliche Korrektheit |
| **Zweck** | Höchstes Produktrisiko (R1.4 im Risikoregister). Pflichtanlage für BfArM-Antrag |
| **Benötigter Nachweis** | Unterschriebene fachliche Freigabe je Modul |
| **Zuständige Stelle** | Pflegefachkraft (Pflegewissenschaft, mind. 3 Jahre Berufserfahrung) |
| **Abhängigkeiten** | Keine — kann sofort beauftragt werden |
| **Priorität** | **P0** — betrifft auch den bereits live nutzbaren PflegeCoach, nicht nur DiPA |
| **Status** | ⬜ OFFEN |
| **Vorbereitet** | `audit/dipa/inhalte_pruefdossier.md` — versandfertig |
| **Nächste Aktion** | Pflegefachkraft finden (Netzwerk, Hochschulen, ggf. über Yusufs Frau) |

### 3. BSI TR-03161 Sicherheitszertifikat (SEC-01)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Unabhängige Sicherheitsprüfung nach TR-03161 durch BSI-akkreditierte Prüfstelle |
| **Zweck** | Nachweis der IT-Sicherheit für DiPA-Antrag |
| **Benötigter Nachweis** | TR-03161-Prüfbericht / Zertifikat |
| **Zuständige Stelle** | BSI-akkreditierte IT-Sicherheitsprüfstelle |
| **Abhängigkeiten** | Scope-Klärung idealerweise nach BfArM-Beratung — ob TR-03161 für DiPA (vs. DiGA) überhaupt bindend ist |
| **Priorität** | **P0** — längste Vorlaufzeit (Monate), sollte parallel zu #1 initiiert werden |
| **Status** | ⬜ OFFEN (Selbsteinschätzung liegt vor) |
| **Vorbereitet** | Selbsteinschätzung gegen TR-03161-Anforderungen abgeschlossen |
| **Nächste Aktion** | Nach BfArM-Beratung: Prüfstelle beauftragen |
| **Hinweis** | UNVERIFIED — ob TR-03161 für DiPA zwingend ist, klärt das BfArM-Gespräch |

### 4. Datenschutzpaket (DS-02, DS-04, VS-04)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | DSFA erstellen lassen + AVVs schließen + Nutzungsbedingungen juristisch prüfen |
| **Zweck** | 3 BfArM-Pflichtanlagen in einem Engagement abdecken |
| **Benötigter Nachweis** | Unterschriebene DSFA, 4 unterschriebene AVVs, geprüfte Nutzungsbedingungen |
| **Zuständige Stelle** | Datenschutzkanzlei mit Gesundheitswesen-/DiGA-/DiPA-Erfahrung |
| **Abhängigkeiten** | Keine — kann sofort beauftragt werden |
| **Priorität** | **P0** |
| **Status** | ⬜ OFFEN |
| **Vorbereitet** | `audit/dipa/dsfa_pflegecoach.md` (99 Zeilen, `[zu bewerten]`-Felder markiert), `audit/dipa/avv_dossier_pflegecoach.md` (4 Anbieter analysiert), `audit/dipa/nutzungsbedingungen_entwurf_selbstzahler.md` (13-Absatz-Entwurf) |
| **Nächste Aktion** | Datenschutzkanzlei beauftragen, alle 3 Vorarbeiten mitgeben |

---

## P1 — Wichtig für Zulassungsfähigkeit

### 5. Unabhängiger Penetrationstest (SEC-04)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Pentest durch externe IT-Sicherheitsfirma |
| **Zweck** | Unabhängiger Sicherheitsnachweis |
| **Benötigter Nachweis** | Pentest-Bericht mit Findings und Bewertungen |
| **Zuständige Stelle** | IT-Sicherheitsfirma |
| **Abhängigkeiten** | Keine |
| **Priorität** | **P1** |
| **Status** | ⬜ OFFEN |
| **Vorbereitet** | `audit/dipa/pentest_beauftragung_scope.md` — 154 Zeilen, 17 API-Routen, 5 Testkonten, versandfertig |

### 6. BITV-Barrierefreiheitsprüfung (BF-01, BF-03)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Akkreditierte BITV-Prüfung + manueller Screenreader-Test |
| **Zweck** | BfArM-Pflichtanlage für Barrierefreiheitsnachweis |
| **Benötigter Nachweis** | BITV-Prüfbericht + Screenreader-Protokoll |
| **Zuständige Stelle** | BITV-Prüfstelle + Tester mit Assistenztechnologie |
| **Abhängigkeiten** | Keine (axe-core CI bereits clean, 4 manuelle Restpunkte definiert) |
| **Priorität** | **P1** |
| **Status** | ⬜ OFFEN |
| **Vorbereitet** | `docs/dipa/14_ACCESSIBILITY_GAP_LISTE.md`, axe-core 0 Violations in CI |

### 7. Usability-Test mit Zielgruppe (BF-02)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Gebrauchstauglichkeitstest mit 5 Personen aus der Zielgruppe (Senioren/pflegende Angehörige) |
| **Zweck** | BfArM-Pflichtanlage |
| **Benötigter Nachweis** | Usability-Testbericht |
| **Zuständige Stelle** | Usability-Labor oder qualifizierte Testleitung |
| **Abhängigkeiten** | Durchführungsplan fertig |
| **Priorität** | **P1** |
| **Status** | ⬜ OFFEN |
| **Vorbereitet** | `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md` |

### 8. Lizenzvereinbarungen für Erhebungsinstrumente (QI-02)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Nutzungsrechte für FES-I, HPS/BSFC-s, SUS klären und ggf. lizenzieren |
| **Zweck** | Rechtssichere Nutzung validierter Assessment-Instrumente |
| **Benötigter Nachweis** | Lizenzvereinbarungen oder Bestätigung der freien Nutzbarkeit |
| **Zuständige Stelle** | Jeweilige Rechteinhaber der Instrumente |
| **Abhängigkeiten** | BfArM-Beratung klärt, ob alle 3 zwingend nötig |
| **Priorität** | **P1** |
| **Status** | ⬜ OFFEN (Gap identifiziert) |

### 9. Wissenschaftlicher Partner / Evaluationskonzept (NN-01)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Wissenschaftlichen Partner (Universität/Institut) für Evaluationsstudie finden |
| **Zweck** | Nachweis des pflegerischen Nutzens — BfArM-Pflichtanlage |
| **Benötigter Nachweis** | Evaluationskonzept + Ethikvotum |
| **Zuständige Stelle** | Universität / Pflegewissenschaftliches Institut |
| **Abhängigkeiten** | BfArM-Beratung klärt Studiendesign-Anforderungen |
| **Priorität** | **P1** |
| **Status** | ⬜ OFFEN |
| **Vorbereitet** | `audit/dipa/evaluationskonzept.md` (Rahmenkonzept) |

### 10. ISMS-Dokumentation (SEC-05)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Informationssicherheits-Managementsystem dokumentieren (ISO 27001 Basis) |
| **Zweck** | Sicherheitsnachweis für DiPA-Antrag |
| **Benötigter Nachweis** | ISMS-Dokumentation / Zertifikat |
| **Zuständige Stelle** | ISMS-Berater |
| **Abhängigkeiten** | Scope-Klärung nach BfArM-Beratung |
| **Priorität** | **P1** |
| **Status** | ⬜ OFFEN |
| **Vorbereitet** | `audit/dipa/isms_scope_vorbereitung.md` |

### 11. Datenschutzbeauftragter bestellen

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Externen DSB bestellen oder internen benennen |
| **Zweck** | Pflichtangabe im DiPA-Antrag und auf der Website |
| **Benötigter Nachweis** | Bestellungsurkunde + Kontaktdaten |
| **Zuständige Stelle** | Geschäftsführung (intern) oder externer DSB-Anbieter |
| **Abhängigkeiten** | Keine |
| **Priorität** | **P1** |
| **Status** | ⬜ OFFEN |

### 12. Steuernummer / USt-IdNr. klären

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Steuernummer und ggf. USt-IdNr. beim Steuerberater klären |
| **Zweck** | Pflichtangabe auf Rechnungen (§14 Abs. 4 UStG) und für spätere Kassenabrechnung |
| **Benötigter Nachweis** | Steuernummer oder USt-IdNr. |
| **Zuständige Stelle** | Steuerberater |
| **Abhängigkeiten** | Keine |
| **Priorität** | **P1** |
| **Status** | ⬜ OFFEN |

---

## P2 — Vorbereitung / nach BfArM-Beratung

### 13. SEPA-Gläubiger-ID bei Bundesbank beantragen

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Echte SEPA-Gläubiger-ID beantragen |
| **Zweck** | SEPA-Lastschriften für Kassenabrechnung |
| **Zuständige Stelle** | Deutsche Bundesbank (Online-Portal) |
| **Status** | ⬜ OFFEN (Platzhalter DE98ZZZ09999999999 im System) |
| **Priorität** | **P2** |

### 14. §45a-Anerkennung in Hessen beantragen

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Anerkennung als Alltagsbegleitungsanbieter nach §45a SGB XI in Hessen |
| **Zweck** | Voraussetzung für Kassenabrechnung von Entlastungsleistungen (§45b) |
| **Zuständige Stelle** | RP Gießen / zuständige Landesbehörde |
| **Status** | ⬜ OFFEN |
| **Priorität** | **P2** — unabhängig von DiPA, betrifft Alltagsbegleitung generell |

### 15. ITSG-Sicherheitsverfahren / DAKOTA-Adapter

| Feld | Inhalt |
|---|---|
| **Aufgabe** | ITSG-Zertifikat beantragen, DAKOTA-Adapter einrichten |
| **Zweck** | Elektronischer Datenaustausch (§302 SGB V) mit Pflegekassen |
| **Zuständige Stelle** | ITSG GmbH |
| **Status** | ⬜ OFFEN (Code-seitig vorbereitet, Pipeline + Tabellen vorhanden) |
| **Priorität** | **P2** — erst nach Versorgungsvertrag relevant |

### 16. Versorgungsvertrag (§72/§75 SGB XI)

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Versorgungsvertrag mit Landesverbänden der Pflegekassen schließen |
| **Zweck** | Voraussetzung für direkte Kassenabrechnung |
| **Zuständige Stelle** | Landesverbände der Pflegekassen in Hessen |
| **Status** | ⬜ OFFEN |
| **Priorität** | **P2** — mehrmonatiger Prozess |

### 17. Vergütungsvereinbarung

| Feld | Inhalt |
|---|---|
| **Aufgabe** | Vergütungssätze mit Kassen vereinbaren |
| **Zweck** | Festlegung der Abrechnungsbeträge |
| **Zuständige Stelle** | GKV-Spitzenverband (nach DiPA-Listung) |
| **Status** | ⬜ OFFEN |
| **Priorität** | **P2** — erst nach vorläufiger DiPA-Aufnahme möglich |

### 18. REG-01 — Anforderungstexte gegen Originalnormen

| Feld | Inhalt |
|---|---|
| **Aufgabe** | 48 Anforderungstexte im Katalog gegen DiPAV/BfArM-Leitfaden/WCAG abgleichen |
| **Zweck** | Sicherstellen, dass die implementierten Anforderungen den Originaltexten entsprechen |
| **Zuständige Stelle** | Intern (Quelltexte frei verfügbar) |
| **Status** | ⬜ ~6–15% geprüft |
| **Priorität** | **P1** (intern, aber in P2 hier weil es kein externer Blocker ist) |
| **Hinweis** | Einziger DiPA-Gap der rein intern geschlossen werden kann |

---

## Empfohlene Reihenfolge

1. **SOFORT (parallel):** BfArM-Beratung (#1) + Datenschutzkanzlei (#4) + Pflegefachkraft (#2)
2. **SOFORT parallel:** Pentest (#5) + BITV-Prüfstelle (#6)
3. **NACH BfArM-Beratung:** TR-03161 (#3) + ISMS (#10) + Evaluationspartner (#9)
4. **NACH allen Nachweisen:** BfArM-Antrag auf vorläufige Aufnahme
5. **NACH Aufnahme:** Vergütungsverhandlung (#17)

---

**BfArM-Einreichung heute möglich: NEIN**

Begründung: 18 extern zu erbringende Nachweise fehlen. Kein einziger dieser Punkte ist durch
interne Codearbeit schließbar. Der erste und wirkungsvollste Schritt ist die BfArM-Beratung (#1).
