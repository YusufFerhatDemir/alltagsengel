# External-Readiness-Package — DiPA PflegeCoach

**Produkt:** Digitaler PflegeCoach
**Hersteller:** Alltagsengel UG (haftungsbeschränkt), Frankfurt am Main
**Stand:** 2026-08-15
**Status:** Beauftragungs-Briefings — noch keiner der sechs Aufträge vergeben

---

## Zweck dieses Ordners

`docs/DIPA_EXTERNE_TODO_2026-08-14.md` benennt 16 Anforderungen aus dem
48-Punkte-Katalog (`docs/dipa/18_PHASE4_REVERIFY_2026-08-14.md`), die **nicht**
durch Codearbeit erfüllbar sind, sondern externe Dienstleister, Prüfstellen
oder Institute brauchen. Jedes Dokument in diesem Ordner ist ein
eigenständiges Briefing, mit dem der jeweilige Auftrag direkt vergeben werden
kann — ohne dass Empfänger den restlichen Projektstand kennen müssen. Alle
Briefings sind aus den bestehenden `audit/dipa/`- und `docs/dipa/`-Dokumenten
verdichtet, nicht neu erfunden.

**Wichtig, für alle sechs Pakete gleichermaßen:**

- Es liegt **keine DiPA-Zulassung** vor, keine ist beantragt. Kein Briefing
  behauptet das Gegenteil.
- Der PflegeCoach ist **dauerhaft kostenlos** für Endnutzer. Monetarisierung
  ausschließlich über Kassenerstattung nach tatsächlicher DiPA-Zulassung.
- Keines der Dokumente nennt erfundene Preise oder Honorare. Wo ein
  gesetzlicher Rahmen zitiert wird (z. B. der 70 €/Monat-Erstattungsdeckel
  nach § 40a Abs. 1a SGB XI im BfArM-Beratungspaket), ist das ausdrücklich
  als Rechtsrahmen gekennzeichnet, nicht als eigener Preis.
- Ansprechpartner sind durchgehend Platzhalter — Absender bleibt
  „Alltagsengel", kein Personenname.

---

## Index aller Briefings

| Nr. | Datei | Adressat | Deckt ab |
|---|---|---|---|
| 1 | [BRIEFING_TR03161_PRUEFSTELLE.md](BRIEFING_TR03161_PRUEFSTELLE.md) | BSI-akkreditierte IT-Sicherheitsprüfstelle | SEC-01, SEC-04 (P0) |
| 2 | [BRIEFING_PFLEGEFACHLICHE_PRUEFUNG.md](BRIEFING_PFLEGEFACHLICHE_PRUEFUNG.md) | Pflegefachkraft (Pflegewissenschaft, ≥3 Jahre Berufserfahrung) | QI-01 (P0) |
| 3 | [BRIEFING_DATENSCHUTZ_KANZLEI.md](BRIEFING_DATENSCHUTZ_KANZLEI.md) | Kanzlei mit Gesundheitswesen-/DiGA-/DiPA-/Medizinprodukterecht-Erfahrung | DS-02, DS-04, PROD-02, VS-04 (P0) |
| 4 | [BRIEFING_BARRIEREFREIHEIT_USABILITY.md](BRIEFING_BARRIEREFREIHEIT_USABILITY.md) | Usability-/Accessibility-Prüfstelle (DIN EN ISO 9241-171) | BF-01, BF-02 (P1) |
| 5 | [BRIEFING_EVALUATION.md](BRIEFING_EVALUATION.md) | Herstellerunabhängiges wissenschaftliches Institut | NN-01 (P1) |
| 6 | [BFARM_BERATUNG_PAKET.md](BFARM_BERATUNG_PAKET.md) | BfArM (freiwilliger Beratungstermin, § 22 DiPAV) | REG-05 sowie Bündelung offener Grundsatzfragen |

Die vollständige Priorisierung (P0/P1/P2) und alle 16 externen Punkte im
Detail stehen in `docs/DIPA_EXTERNE_TODO_2026-08-14.md`. Dieser Ordner deckt
die sechs Pakete ab, die einen konkreten externen Adressaten haben — nicht
die rein internen/organisatorischen Punkte (z. B. Support-SLA-Entscheidung,
Steuernummer, SEPA-Gläubiger-ID).

---

## Abhängigkeiten zwischen den Paketen

- **Pakete 1–3 (TR-03161, Pflegefachkraft, Datenschutzkanzlei) sind
  voneinander unabhängig.** Sie können sofort und parallel beauftragt werden
  — keines wartet auf ein Ergebnis der anderen.
- **Paket 6 (BfArM-Beratung) ist freiwillig** (§ 22 DiPAV, „auf Anfrage"),
  aber keine Voraussetzung für den Start der Pakete 1–5. Sie bündelt jedoch
  mehrere offene Grundsatzfragen (u. a. die Doppelzielgruppen-Frage, den
  Prüf-Scope von TR-03161, die Verbindlichkeit von FHIR/MIO, den späteren
  Vergütungsanteil), die sonst einzeln und mit Unsicherheit behaftet blieben.
  Deshalb ist sie aus Effizienzgründen als möglichst früher, aber nicht
  blockierender Schritt zu sehen.
- **Paket 4 (Barrierefreiheit/Usability) hat eine offene Vorbedingung:** Der
  bestehende Durchführungsplan deckt bislang nur eine summative Testrunde ab.
  Vor Beauftragung sollte er um eine formative Runde ergänzt werden — das
  steht so im Briefing selbst als offener Punkt.
- **Paket 5 (Evaluationspartner) ist idealerweise nach Paket 6 zu starten**,
  da das Institut Studiendesign-Anforderungen im Zweifel direkt mit dem
  BfArM abstimmen möchte — zwingend ist das nicht, verringert aber das
  Risiko einer methodischen Fehlplanung.
- **Keines der sechs Pakete ist Voraussetzung für ein anderes.** Die
  Reihenfolge unten ist eine Empfehlung zur Ressourcenschonung, kein
  technischer oder rechtlicher Zwang.

---

## Empfohlene Reihenfolge der Beauftragungen

1. **Sofort, parallel:** Paket 1 (TR-03161-Prüfstelle) + Paket 2
   (Pflegefachkraft) + Paket 3 (Datenschutzkanzlei) — die drei P0-Punkte mit
   der längsten Vorlaufzeit bzw. dem höchsten Produktrisiko.
2. **Sofort, parallel, empfohlen:** Paket 6 (BfArM-Beratungstermin anfragen)
   — klärt mehrere Grundsatzfragen in einem Termin, ohne die Pakete 1–5 zu
   blockieren.
3. **Nach Ergänzung des Durchführungsplans:** Paket 4
   (Barrierefreiheit/Usability).
4. **Nach Möglichkeit nach Paket 6:** Paket 5 (Evaluationspartner) — profitiert
   von vorab geklärten Studiendesign-Fragen, ist aber nicht davon abhängig.
5. **Nicht in diesem Ordner, aber parallel zu berücksichtigen:** ISO-27001-
   ISMS-Zertifizierung (SEC-05, P1) sowie die rein internen/organisatorischen
   Punkte aus `docs/DIPA_EXTERNE_TODO_2026-08-14.md` (Support-SLA-Entscheidung,
   Datenschutzbeauftragter, Steuernummer).

**Ausgangslage, ehrlich:** 36 von 48 Anforderungen sind aktuell textlich
geprüft (44 % belastbare Quote), 0 von 12 Inhaltsmodulen sind fachlich
freigegeben. Eine BfArM-Einreichung ist heute nicht möglich — dieser Ordner
bereitet die externen Nachweise vor, die dafür fehlen. Details:
`docs/DIPA_EXTERNE_TODO_2026-08-14.md`, Abschnitt „BfArM-Einreichung heute
möglich: NEIN".
