# MDR-Negativabgrenzung — „Digitaler PflegeCoach"

**Stand:** 2026-08-12 · **Block:** 15c
**Zweck:** Begründung, warum der Digitale PflegeCoach **kein Medizinprodukt** ist.
**Grundlage:** `audit/DIPA_REGULATORIK_2026-08-09.md` §2.5; Zweckbestimmung in
`finale_zweckbestimmung.md`

> Maßgeblich ist die **Zweckbestimmung des Herstellers**. Diese Abgrenzung ist nur so viel
> wert wie ihre Konsistenz: Sobald Produkt, Marketing, Antrag oder Support eine Aussage
> treffen, die einem der MDR-Zwecke entspricht, kippt die Einordnung — unabhängig davon,
> was hier steht. Dieses Dokument ist deshalb auch eine **Betriebsanweisung**.

---

## 1. Die Abgrenzungsaussage

> Der Digitale PflegeCoach dient nicht der Erkennung, Verhütung, Überwachung, Vorhersage,
> Prognose, Behandlung oder Linderung von Krankheiten, Verletzungen oder Behinderungen und
> trifft keine diagnostischen oder therapeutischen Entscheidungen. Er ersetzt keine
> ärztliche oder pflegefachliche Beratung.

Dieser Satz steht wörtlich in der Zweckbestimmung, im Onboarding und sinngemäß in der
Fußzeile jeder Produktseite. **Er ist nicht verhandelbar und nicht zu kürzen.**

## 2. Was das Produkt tut — und warum das keinen MDR-Zweck erfüllt

| Funktion | Was sie tut | Warum kein MDR-Zweck |
|---|---|---|
| Assessment | Selbsteinschätzung der Selbständigkeit 0–4 in fünf Lebensbereichen | Selbstauskunft ohne Auswertung gegen eine Norm; kein Befund, keine Klassifikation, keine Diagnose |
| Ziele | Vom Nutzer selbst gesetzte Alltagsziele mit eigener Messgröße | Organisationshilfe; das Produkt schlägt keine Therapieziele vor und bewertet die Zielerreichung nicht medizinisch |
| Wochenplan, Erinnerungen | Zeitliche Struktur für selbst gewählte Aktivitäten | Kalenderfunktion; keine Dosierungs-, Wechselwirkungs- oder Einnahmelogik |
| Inhalte (Übungen, Wissen) | Allgemeine Alltags- und Bewegungsanleitungen | Nicht auf eine Person zugeschnitten, keine Indikationsstellung, keine Heilversprechen |
| Empfehlungs-Engine | Regelbasierte organisatorische Hinweise | Feste Regeln über Alltagsorganisation, mit Verbotsliste im Code; keine Lernverfahren, keine Symptombewertung |
| Belastungs-Selbsteinschätzung | 7 Items zur Selbstreflexion pflegender Angehöriger | Ausdrücklich als **nicht validiert** gekennzeichnet, kein Screening, keine Schwellenwert-Diagnostik |
| Verlauf und Berichte | Darstellung der eigenen Einträge über die Zeit | Dokumentation, keine Interpretation |

## 3. Was ausdrücklich NICHT gebaut wird

Diese Liste ist die eigentliche Schutzmauer. Jede dieser Funktionen würde die Einordnung
gefährden:

* Vitalparameter-Messung, Sensorik, Telemonitoring
* Medikamenten-Dosierungsempfehlungen, Wechselwirkungsprüfung
* Symptom-Checker, Triage, KI-gestützte Bewertung von Gesundheitszustand oder Risiko
* Automatische Grenzwert-Alarme mit Handlungsaufforderung
* Sturz**risiko**-Berechnung oder -Vorhersage (Sturz**angst** als Selbstauskunft ist zulässig)
* Notruf-/Alarmfunktionen mit Gefahrenabwehr-Anspruch
* Kommunikation mit Ärzten, Verordnungswesen

> **Hinweis auf ein verwandtes Modul:** Im Betriebsteil existiert eine Vitalwerte-Erfassung
> mit fail-closed abgeschalteten Grenzwert-Alarmen (`lib/vitals/config.ts`,
> `docs/VITALWERTE_REGULATORIK.md`). Sie gehört **nicht** zum PflegeCoach und darf nicht in
> den Produktpfad übernommen werden.

## 4. Sprachregeln (verbindlich für alle Texte)

| Nicht sagen | Stattdessen |
|---|---|
| „reduziert Stürze", „beugt Stürzen vor" | „unterstützt beim Erhalt von Beweglichkeit und Sicherheit im Alltag" |
| „erkennt Überlastung" | „hilft, die eigene Belastung regelmäßig einzuschätzen" |
| „Therapie", „Behandlung", „Diagnose" | „Anleitung", „Übung", „Selbsteinschätzung" |
| „verbessert die Pflegebedürftigkeit" | „unterstützt dabei, Selbständigkeit im Alltag zu erhalten" |
| „medizinisch geprüft" | „pflegefachlich geprüft" — und nur, wenn das belegt ist |

Gilt für: Produkt-UI, Antragsunterlagen, Website, Pressetexte, Support-Antworten,
Schulungsmaterial für eUL-Erbringer.

## 5. Technische Verankerung

| Maßnahme | Ort |
|---|---|
| Verbotsliste in der Empfehlungs-Engine | `lib/coach/empfehlungen.ts` (+ Tests) |
| Statischer Notfall-/Beratungshinweis in jeder Fußzeile | `app/pflegecoach/CoachShell.tsx` |
| Inhalte als statische Konstanten mit Prüfstatus | `lib/coach/inhalte.ts` |
| Kein automatischer Alarm, keine Schwellenwert-Bewertung | Datenmodell ohne Alarm-/Schwellenwerttabellen |
| Anspruchsprüfung ohne Ausschlussautomatik | `lib/coach/anspruch.ts` |

## 6. Auslösepunkte für eine Neubewertung

Die Einordnung ist **erneut zu prüfen**, sobald eines davon eintritt:

1. Eine Funktion wertet Eingaben gegen Grenz- oder Referenzwerte aus.
2. Ein Ergebnis wird als Risiko, Befund oder Empfehlung zu einer Gesundheitsfrage
   dargestellt.
3. Ein Lernverfahren erzeugt personenbezogene Hinweise.
4. Ein validiertes klinisches Instrument wird mit Auswertungslogik eingebunden
   (betrifft die noch offene Lizenzfrage, GAP-INSTRUMENTE).
5. Ein Sensor oder ein Messgerät wird angebunden.

Jede MAJOR-Änderung der Zweckbestimmung ist ohnehin regulatorisch zu bewerten
(`lib/coach/version.ts`).

## 7. Offene Punkte

| ID | Punkt |
|---|---|
| GAP-QS | Inhalte tragen `pruefstatus: 'entwurf'` — ohne fachliche Freigabe ist die Aussage „qualitätsgesichert" nicht belegbar |
| GAP-INSTRUMENTE | Bei Einbindung validierter Instrumente ist die Abgrenzung erneut zu prüfen |
| — | Die Begründung ist im Antragsverfahren in der dort geforderten Form einzureichen; das Format ist dem Originaldokument zu entnehmen |
