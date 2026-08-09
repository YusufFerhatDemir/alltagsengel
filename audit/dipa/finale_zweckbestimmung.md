# Finale Zweckbestimmung — „Digitaler PflegeCoach"

**Stand:** 2026-08-09 · **Hersteller:** Alltagsengel UG (haftungsbeschränkt), Frankfurt am Main
**Basis:** `audit/DIPA_REGULATORIK_2026-08-09.md` (Teil 2), umgesetzt im Modul `/pflegecoach` (Tabellen `coach_*`)
**Status:** Herstellerfassung für die BfArM-Beratung — vor Antragstellung durch BfArM-Beratung (Fragen 4–5 des Fragenkatalogs) validieren.

---

## 1. Zweckbestimmung (verbindlicher Wortlaut)

> Der Digitale PflegeCoach ist eine digitale Pflegeanwendung im Sinne des § 40a SGB XI.
> Er unterstützt Pflegebedürftige der Pflegegrade 1 bis 5 in häuslicher Versorgung sowie deren
> pflegende Angehörige und sonstige ehrenamtlich Pflegende durch strukturierte Anleitungs-,
> Schulungs-, Erinnerungs- und Dokumentationsfunktionen dabei, Beeinträchtigungen der
> Selbständigkeit oder der Fähigkeiten des Pflegebedürftigen zu mindern, einer Verschlimmerung
> der Pflegebedürftigkeit entgegenzuwirken und die häusliche Versorgung zu stabilisieren sowie
> pflegende Angehörige bei Pflegeaufgaben zu entlasten.
>
> Der Digitale PflegeCoach dient nicht der Erkennung, Verhütung, Überwachung, Vorhersage,
> Prognose, Behandlung oder Linderung von Krankheiten, Verletzungen oder Behinderungen und
> trifft keine diagnostischen oder therapeutischen Entscheidungen. Er ersetzt keine ärztliche
> oder pflegefachliche Beratung.

Der zweite Absatz ist die **Negativabgrenzung zur MDR** und wird konsistent verwendet in:
App-Onboarding (`app/pflegecoach/start/page.tsx`), Fußzeile jeder Produktseite
(`app/pflegecoach/CoachShell.tsx`), Empfehlungs-Disclaimer (`lib/coach/empfehlungen.ts`,
`EMPFEHLUNG_DISCLAIMER`), Begleitmaterial und Antrag.

## 2. Funktionsumfang, der auf die Zweckbestimmung einzahlt (implementierter MVP)

| Funktion | Umsetzung | Nutzendimension |
|---|---|---|
| Pflegeassessment (Selbsteinschätzung 5 Lebensbereiche, 0–4) | `coach_assessments`, `/pflegecoach/assessment` | Ausgangsbasis, Verlaufsmessung |
| Individuelle Pflegeziele (messbar + terminiert, Status/Anpassung) | `coach_goals`, `/pflegecoach/ziele` | Selbständigkeit erhalten |
| Tages-/Wochenstruktur (wiederkehrende Aktivitäten, Erledigungen) | `coach_activities` + `coach_activity_log`, `/pflegecoach/wochenplan` | Alltagsstrukturierung |
| Mobilität: allgemeine Übungen, Wohnraum-Sicherheits-Check, Sturz-Selbstbericht | `lib/coach/inhalte.ts`, `/pflegecoach/mobilitaet` | Sturzprävention (organisatorisch) |
| Selbstversorgung & Alltagsgestaltung (Wissensmodule) | `/pflegecoach/alltag` | ADL-Unterstützung, Teilhabe |
| Unterstützung pflegender Angehöriger (Entlastungsleistungen § 45b/§ 39/§ 7a/§ 45 SGB XI, Selbstsorge, rückenschonendes Arbeiten) | `/pflegecoach/angehoerige` | Entlastung (Nutzenkategorie 1. DiPAV-ÄndV) |
| Belastungs-Selbsteinschätzung (7 Items, eigenes Kurzinstrument) | `coach_measurements` (`belastung_kurz`), `/pflegecoach/belastung` | Entlastung, Verlaufsmessung |
| Verlaufsmessung (Baseline/Outcome, Messzeitpunkte t0–t3) | `coach_measurements`, `/pflegecoach/verlauf` | Nutzennachweis-Grundlage |
| Regelbasierte, organisatorische Anpassungs-Hinweise | `lib/coach/empfehlungen.ts`, `/api/coach/empfehlungen` | Anpassung von Maßnahmen |
| Exportierbare Verlaufsberichte (unveränderliche Snapshots) + Datenexport (JSON, Selbstservice) | `coach_reports`, `/pflegecoach/bericht`, `/api/coach/export` | Nachvollziehbarkeit, Art. 20 DSGVO |

## 3. Ausdrücklich NICHT Zweck des Produkts (rote Linien, technisch verankert)

- Keine Diagnostik, kein Risiko-Scoring, keine Auswertung mit Hinweischarakter („Anzeichen für …") —
  die Empfehlungs-Engine ist regelbasiert-organisatorisch, die Verbotsliste steht als bindender
  Kommentar in `lib/coach/empfehlungen.ts`.
- Keine Medikamenten-Dosierlogik; Erinnerungen sind reine Kalender-/Organisationsfunktion
  (Kategorie `erinnerung` in `coach_activities`).
- Keine individualisierte Übungsanpassung anhand erfasster Gesundheitsdaten; Übungen sind
  allgemeine Anleitungen mit statischen Sicherheitshinweisen.
- Keine Notruf-/Überwachungsfunktion; statische Verweise auf 112 / 116 117 / Pflegeberatung.
- Keine Vermittlung oder Bewerbung von Alltagsengel-Dienstleistungen im Produkt
  (Werbefreiheit, siehe `zielgruppendefinition.md` §4 und Tracker-Sperre in
  `components/ClientSideProviders.tsx` / `components/GoogleTagManager.tsx`).
- Keine generative KI im Produkt (der Alltagsengel-„Beratungs-Chat" ist im
  PflegeCoach-Bereich deaktiviert).

## 4. Medizinprodukt-Abgrenzung

Begründungslinie (Nicht-Medizinprodukt) gemäß Regulatorik-Analyse Abschnitt 2.5:
ausschließlich pflegerisch-organisatorische Zweckbestimmung; keine Verarbeitung zur Erkennung/
Behandlung von Krankheiten; Erinnerungen ohne pharmakologische Logik; Übungen als allgemeine
Anleitung. Für Nicht-Medizinprodukte verlangt Anlage 1 DiPAV eine Begründung, warum kein
Medizinprodukt vorliegt — dieses Dokument liefert die Grundlage.

**Offene Punkte:** ORF-6 (kognitive Trainingsmodule — im MVP nicht enthalten), ORF-7
(Fallback-Einstufung) — siehe `bfarm_fragenkatalog.md` Fragen 4, 6, 7.
