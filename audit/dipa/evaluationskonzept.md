# Evaluationskonzept (Rahmen) — „Digitaler PflegeCoach"

**Stand:** 2026-08-09 · **Basis:** `audit/DIPA_REGULATORIK_2026-08-09.md` (Teil 6.8)
**Zweck:** Rahmen für das wissenschaftliche Evaluationskonzept, das dem Antrag auf
**vorläufige Aufnahme (Aufnahme zur Erprobung) nach § 78a Abs. 6a SGB XI i. V. m. § 16 DiPAV**
beizulegen ist.

> **Verbindlichkeitshinweis:** Dieses Dokument ist ein Herstellerrahmen, KEIN einreichungsreifes
> Konzept. Finalisierung erst nach (a) BfArM-Beratung (Fragen 14–17 des Fragenkatalogs),
> (b) Volltextauswertung DiPA-Leitfaden V1.3, (c) Beauftragung des wissenschaftlichen Partners.
> Methodische Mindestanforderungen sind ORF-10 (offen).

---

## 1. Nutzenhypothesen (getrennt je Nutzenkategorie)

- **H1 (Pflegebedürftige, § 40a SGB XI):** Die strukturierte Nutzung des PflegeCoach
  (Assessment, Ziele, Wochenstruktur, Mobilitätsübungen) mindert Beeinträchtigungen der
  Selbständigkeit bzw. wirkt einer Verschlimmerung entgegen — operationalisiert u. a. über
  Sturzangst (FES-I Kurzform) und Selbständigkeits-Selbsteinschätzung.
- **H2 (pflegende Angehörige, Nutzenkategorie der 1. DiPAV-ÄndV):** Die Nutzung entlastet
  pflegende Angehörige und stabilisiert die häusliche Versorgung — operationalisiert über
  ein validiertes Belastungsinstrument (Ziel: HPS/BSFC-s, Lizenzklärung offen) und die
  Inanspruchnahme von Entlastungsleistungen.

Kein medizinischer Outcome wird behauptet oder gemessen (keine Sturzreduktions-Behauptung,
keine Krankheits-Endpunkte) — Anti-Marketing-Regel der Regulatorik-Analyse (2.2).

## 2. Design-Vorschlag (vorbehaltlich ORF-10)

- Prospektive, **einarmige Interventionsstudie mit Prä-Post-Vergleich** über den
  Erprobungszeitraum (bis 12 Monate der vorläufigen Aufnahme).
- Fallzahlplanung aus den Pilotdaten (`pilotdesign.md`); Vorregistrierung (z. B. DRKS).
- Durchführung durch eine **unabhängige wissenschaftliche Einrichtung**
  (Pflegewissenschaft) — noch zu beauftragen. **Ethikvotum** einholen.
- Falls das BfArM eine Vergleichsgruppe verlangt (Frage 14): Eskalationsoption
  Warteliste-Kontrollgruppe — Entscheidung erst nach Beratung.

## 3. Endpunkte und Instrumente (Vorschlag, final mit Partner)

| Ebene | Instrument | Messzeitpunkte |
|---|---|---|
| Sturzangst (H1) | FES-I Kurzform | T0 / T1 / T2 (/T3) |
| Selbständigkeit (H1) | Selbsteinschätzung 5 Lebensbereiche (produktintern, `coach_assessments`) + ggf. vom Partner benanntes validiertes Instrument | T0 / T1 / T2 |
| Belastung (H2) | HPS/BSFC-s (Lizenz offen; produktintern bis dahin `belastung_kurz` nur als Verlaufsanzeige, NICHT als Studienendpunkt) | T0 / T1 / T2 (/T3) |
| Inanspruchnahme Entlastungsleistungen (H2) | Fragebogen (Eigenentwicklung mit Partner) | T0 / T2 |
| Usability | System Usability Scale (SUS) | T1 / T2 |
| Nutzung/Adhärenz | produktinterne Kennzahlen (aktive Tage/Woche, Erledigungsquote, Retention) | laufend |

Technische Grundlage im Produkt: `coach_measurements` (Instrumente + Messzeitpunkte t0–t3),
`coach_activity_log` (Adhärenz), Self-Service-Export.

## 4. Datenschutz der Evaluation

- Separate, freiwillige, getrennt widerrufliche Einwilligung (`wissenschaftliche_auswertung`,
  serverseitig versioniert in `coach_consents`) — implementiert.
- Pseudonymisierung: Auswertungsdatensätze ohne Klarnamen/Kontaktdaten; Schlüsseltabelle
  ausschließlich beim Verantwortlichen (Alltagsengel UG), nicht beim Auswertungspartner.
- Keine Dritt-Tracker; Nutzungsdaten ausschließlich aus dem eigenen Backend.
- DSFA (Art. 35 DSGVO) vor Studienbeginn (siehe `dipav_gap_liste.md` GAP-DSFA).

## 4a. Datenerhebungs-Framework im Produkt (umgesetzt 2026-08-12, Block 15a)

Das in §6.5 als offen geführte pseudonymisierte Ereignis-Logging ist gebaut. Es liefert
die laufenden Nutzungs-/Adhärenz-Kennzahlen aus §3, ohne eine zweite Kopie der
Gesundheitsdaten anzulegen.

| Baustein | Umsetzung |
|---|---|
| Ereignistabelle | `coach_nutzungsereignisse` — Pseudonym, Ereignisart, Modul, Auswertungswoche, Anzahl |
| Pseudonymisierung | HMAC-SHA256 mit separatem, für niemanden lesbarem Schlüssel (`coach_pseudonym_key`) |
| Trennungskonzept | Der Schlüssel liegt beim Verantwortlichen; ein Auswertungspartner erhält nur Aggregate oder pseudonyme Rohdaten ohne Schlüssel |
| Kennzahlen-Auswertung | `lib/coach/nachweise.ts` (`werteNutzungAus`) — Teilnehmende, Ereignisse je Art und Modul, aktive Nutzer je Woche, Anteil regelmäßiger Nutzung (≥ 4 Wochen) |
| Zugang für den Betrieb | `/admin/dipa` → Nutzungsnachweise; **nur Aggregate**, nie Einzelzeilen, nie Pseudonyme |
| Nutzerrechte | eigene Ereignisse einsehbar (Art. 15) und löschbar (Art. 17) |

**Drei eingebaute Schranken, die für die Auswertungsplanung relevant sind:**

1. **Doppelte Freigabe:** Erfassung nur, wenn der Deployment-Schalter
   `COACH_NUTZUNGSNACHWEIS_AKTIV` gesetzt **und** die Einwilligung
   `wissenschaftliche_auswertung` erteilt ist. Vor Studienbeginn muss der Schalter
   bewusst aktiviert werden — sonst liegen keine Daten vor.
2. **Wochengranularität:** Es gibt keine Zeitstempel, nur Auswertungswochen. Analysen auf
   Tagesebene oder zur Tageszeit sind damit ausgeschlossen; der Analyseplan muss das
   berücksichtigen.
3. **Unterdrückung kleiner Gruppen:** Unter 5 Teilnehmenden werden keine Detailkennzahlen
   ausgegeben. In der Pilotphase ist deshalb mit leeren Auswertungen zu rechnen, bis die
   Gruppengröße erreicht ist.

Die Endpunkt-Instrumente (§3) bleiben davon unberührt — sie laufen weiter über
`coach_measurements` mit den Messzeitpunkten t0–t3.

## 5. Auswertung und Berichtslegung

- Statistischer Analyseplan vor Studienbeginn (Partner); Intention-to-treat-orientierte
  Darstellung inkl. Abbrecher-Analyse; Subgruppen nur explorativ (Pflegegrad, Rolle).
- Zwischenauswertung zu T1 als Steuerungssignal (Abbruchkriterien siehe `pilotdesign.md` §6).
- Endbericht als Grundlage für den Antrag auf endgültige Aufnahme.

## 6. Offene Punkte bis zur Einreichungsreife

1. ORF-10: methodische Mindestanforderungen (BfArM-Fragen 14, 17).
2. Wissenschaftlicher Partner + Ethikvotum.
3. Instrumenten-Lizenzen (FES-I, HPS/BSFC-s, SUS-Übersetzung).
4. Fallzahl aus Pilotdaten.
5. ~~Pseudonymisiertes Ereignis-Logging im Produkt (GAP-NUTZUNG).~~ **Umgesetzt am
   2026-08-12** — siehe §4a. Offen bleibt nur die Aktivierung
   (`COACH_NUTZUNGSNACHWEIS_AKTIV`) zum Studienbeginn.
