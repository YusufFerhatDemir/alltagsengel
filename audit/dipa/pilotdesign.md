# Pilotdesign — „Digitaler PflegeCoach" (Erprobung vor Antragstellung)

**Stand:** 2026-08-09 · **Basis:** `audit/DIPA_REGULATORIK_2026-08-09.md` (Teil 6)
**Charakter:** Der Pilot läuft VOR der Listung als freiwilliges, kostenloses Angebot —
keine Kassenerstattung, keine Aussagen über Kassenleistungen gegenüber Teilnehmenden.
Ziel: Machbarkeit + Datengrundlage für das Evaluationskonzept der vorläufigen Aufnahme
(§ 78a Abs. 6a SGB XI — „Aufnahme zur Erprobung").

---

## 1. Einwilligung (zweistufig, implementiert)

1. **Produktbezogene Einwilligung** in die Verarbeitung von Pflege-/Gesundheitsdaten
   (Art. 9 Abs. 2 lit. a DSGVO) — erforderlich, im Onboarding.
2. **Separate Einwilligung** in die wissenschaftliche Auswertung pseudonymisierter Nutzungs-
   und Fragebogendaten — freiwillig, getrennt widerruflich.

Beide werden serverseitig versioniert protokolliert (`coach_consents`: Zeitstempel, Textversion,
Erteilung/Widerruf; Widerruf jederzeit in den Einstellungen). Bei geteilter Nutzung: eigene
Freigabe-Einwilligung (`datenfreigabe` + `coach_shares`), Einwilligungsfähigkeit bei kognitiven
Einschränkungen dokumentiert prüfen (Papier-Fallback im Pilotmaterial).

## 2. Zielgruppe und Rekrutierung

- n = 30–50 Dyaden (Pflegebedürftige/r + pflegende/r Angehörige/r) ODER Einzelnutzer einer der
  beiden Gruppen; Pflegegrade 1–3 bevorzugt; Region Frankfurt/Rhein-Main.
- Einschluss: häusliche Versorgung; Smartphone/Tablet vorhanden oder Leihgerät;
  Deutsch oder Türkisch (Produkt-UI bleibt Deutsch, Pilotmaterialien ggf. zweisprachig).
- Ausschluss: rein stationäre Versorgung; fehlende Einwilligungsfähigkeit ohne Vertreter.
- Rekrutierung NICHT ausschließlich aus dem Alltagsengel-Kundenstamm (Selektionsbias,
  Interessenkonflikt-Optik): zusätzlich Pflegestützpunkte, Angehörigengruppen.
  Keine Koppelung an Betreuungsverträge.

## 3. Baseline-Erhebung (T0)

- Demografie, Pflegegrad, Versorgungssituation, Technikvorerfahrung.
- Pflegebedürftige: FES-I Kurzform (Sturzangst), Selbständigkeits-Selbsteinschätzung
  (implementiert: 5-Bereiche-Assessment `coach_assessments`), Sturzereignisse letzte 3 Monate
  (Selbstbericht).
- Angehörige: Belastung (Ziel: HPS/BSFC-s — **Lizenz/Genehmigung vor Pilotstart klären**, bis
  dahin produktinternes 7-Item-Kurzinstrument `belastung_kurz` nur zur Verlaufsdarstellung),
  Pflegekompetenz-Selbsteinschätzung, Kenntnis/Inanspruchnahme von Entlastungsleistungen.
- Technisch: `coach_measurements` mit Messzeitpunkten `t0`–`t3` vorbereitet.
- Instrumentenauswahl final mit wissenschaftlichem Partner validieren (ORF-10).

## 4. Nutzungsmessung

- Ereignisbasiert, pseudonymisiert, im eigenen Backend — KEINE Dritt-Tracker (im
  `/pflegecoach`-Pfad sind GTM/Meta/TikTok technisch deaktiviert).
- Datenbasis im MVP: Erledigungen (`coach_activity_log`), Assessment-/Messungs-Zeitpunkte,
  Berichts-/Export-Erstellung. **GAP:** ein dediziertes pseudonymisiertes Ereignis-Log
  (Modul gestartet/abgeschlossen) ist noch nicht implementiert — siehe `dipav_gap_liste.md` GAP-NUTZUNG.
- Kennzahlen: aktive Tage/Woche, Erledigungsquote, Retention Woche 4/8/12.
- Adhärenz-Definition vorab festlegen, z. B. ≥ 2 aktive Tage/Woche über ≥ 8 von 12 Wochen.

## 5. Outcome-Messung

- Messzeitpunkte: T0 (Baseline), T1 (6 Wochen), T2 (12 Wochen = Pilotende), optional T3
  (Follow-up 12 Wochen nach Ende).
- Primär orientierende Endpunkte (Pilot = Machbarkeit + Effektschätzung, KEINE konfirmatorische
  Studie): Veränderung Sturzangst (FES-I), Veränderung Belastung, System Usability Scale ≥ 68.
- Sekundär: qualitative Interviews (10–15 Teilnehmende) zu Verständlichkeit, Barrierefreiheit,
  wahrgenommenem Nutzen.

## 6. Abbruchkriterien

- **Individuell:** jederzeitiger Widerruf ohne Nachteile; auf Wunsch vollständige Löschung
  (Art. 17), soweit nicht anonymisiert aggregiert.
- **Studienbezogen:** meldepflichtiges Datenschutzereignis (Art. 33), sicherheitsrelevanter
  Vorfall, Hinweise auf Gefährdung (Nutzer ersetzt erkennbar notwendige professionelle Hilfe
  durch die App), SUS < 50 bei T1-Zwischenauswertung mit gehäuften Bedienabbrüchen.
- **Eskalationsregel (MDR-Abgrenzung):** keine automatische Auswertung besorgniserregender
  Freitexte; stattdessen statische Hinweise auf Notruf/Hausarzt/Pflegeberatung (implementiert
  in Produkt-Fußzeile und Mobilitäts-/Empfehlungstexten). Transparent im Aufklärungsmaterial.

## 7. Datenexport im Piloten

- Self-Service-Export ab MVP verpflichtend — implementiert: JSON-Export (`/api/coach/export`)
  + druckbarer Verlaufsbericht (`/pflegecoach/bericht`); wird im Pilot auf Verständlichkeit getestet.
- Studien-Datenexport: pseudonymisierte Auswertungsdatensätze; Schlüsseltabelle verbleibt beim
  Verantwortlichen, nicht beim Auswertungspartner (Umsetzung vor Pilotstart, GAP-NUTZUNG).

## 8. Voraussetzungen für den Pilotstart (Go-Kriterien)

| # | Kriterium | Status |
|---|---|---|
| 1 | Migration `coach_*` live + verifiziert (`scripts/verify-pflegecoach-migration.mjs`) | OFFEN (Apply blockiert, siehe Task) |
| 2 | Pflegefachliche Freigabe aller Inhalte (`lib/coach/inhalte.ts`, Status `entwurf`) | OFFEN |
| 3 | Juristische Prüfung Datenschutzhinweise + Einwilligungstexte, DSFA | OFFEN |
| 4 | Instrumente lizenziert/validiert (FES-I, HPS/BSFC-s, SUS) | OFFEN |
| 5 | Wissenschaftlicher Partner beauftragt, Ethikvotum | OFFEN |
| 6 | BITV-/WCAG-Selbsttest des `/pflegecoach`-UI | OFFEN |
| 7 | BfArM-Beratung durchgeführt (`bfarm_fragenkatalog.md`) | OFFEN |
