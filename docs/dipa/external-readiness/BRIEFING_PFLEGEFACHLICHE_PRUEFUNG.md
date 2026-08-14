# Briefing für die Beauftragung: Pflegefachliche Inhaltsprüfung PflegeCoach

**Produkt:** Digitaler PflegeCoach (Alltagsengel)
**Hersteller:** Alltagsengel UG (haftungsbeschränkt)
**Version:** 0.5.0 · **Stand:** 2026-08-15
**Status dieses Dokuments:** Briefing für Beauftragung — noch keine Prüfperson beauftragt

---

## 1. Auftrag in einem Satz

Eine externe Pflegefachkraft soll alle 12 Inhaltsmodule des PflegeCoach
(4 Übungen, 1 Wohnraum-Checkliste, 5 Wissensmodule sowie — als Kontext für
die Bewertung — die zugrundeliegenden Pflegeprobleme und -ziele) auf
fachliche Richtigkeit, Sicherheit und Verständlichkeit prüfen und je Inhalt
freigeben, mit Änderung freigeben oder ablehnen.

---

## 2. Alle 12 Module im Überblick

| Gruppe | Titel | Fundstelle im Code |
|---|---|---|
| Übungen | Aufstehen vom Stuhl | `lib/coach/inhalte.ts` → `UEBUNGEN[0]` (`id: 'aufstehen-vom-stuhl'`) |
| Übungen | Fersen- und Zehenstand mit Festhalten | `lib/coach/inhalte.ts` → `UEBUNGEN[1]` (`id: 'fersen-zehenstand'`) |
| Übungen | Gehstrecke in der Wohnung | `lib/coach/inhalte.ts` → `UEBUNGEN[2]` (`id: 'gehen-in-der-wohnung'`) |
| Übungen | Schultern und Nacken lockern (im Sitzen) | `lib/coach/inhalte.ts` → `UEBUNGEN[3]` (`id: 'schulter-nacken-mobilisation'`) |
| Wohnraum-Checkliste | Wohnraum-Sicherheits-Check (8 Punkte) | `lib/coach/inhalte.ts` → `WOHNRAUM_CHECK` |
| Wissensmodule | Entlastungsangebote für pflegende Angehörige | `lib/coach/inhalte.ts` → `WISSEN_MODULE[0]` (`id: 'entlastungsleistungen'`) |
| Wissensmodule | Auf sich selbst achten | `lib/coach/inhalte.ts` → `WISSEN_MODULE[1]` (`id: 'selbstsorge'`) |
| Wissensmodule | Rückenschonend unterstützen | `lib/coach/inhalte.ts` → `WISSEN_MODULE[2]` (`id: 'rueckenschonend'`) |
| Wissensmodule | Selbstversorgung im Alltag erleichtern | `lib/coach/inhalte.ts` → `WISSEN_MODULE[3]` (`id: 'alltag-selbstversorgung'`) |
| Wissensmodule | Kontakte und Beschäftigung pflegen | `lib/coach/inhalte.ts` → `WISSEN_MODULE[4]` (`id: 'soziale-teilhabe'`) |

Die Wohnraum-Checkliste zählt als ein Prüfgegenstand mit 8 Einzelpunkten
(`WOHNRAUM_CHECK`, Array mit 8 Einträgen) — zusammen mit 4 Übungen und
5 Wissensmodulen ergeben sich die 12 Inhaltsmodule, die laut
Dateikopf von `lib/coach/inhalte.ts` alle `pruefstatus: 'entwurf'` tragen.

Alle Inhalte sind zusätzlich im laufenden Produkt unter
`/pflegecoach/mobilitaet`, `/pflegecoach/alltag`, `/pflegecoach/angehoerige`
und `/pflegecoach/belastung` sichtbar — die Prüfung sollte nach Möglichkeit
in der Oberfläche erfolgen, nicht nur am Text, da der Darstellungskontext
zur fachlichen Aussage gehört.

---

## 3. Prüfkriterien K1–K6

Diese Kriterien sind aus `audit/dipa/inhalte_pruefdossier.md` Abschnitt 3
übernommen (nicht neu definiert):

| Nr. | Frage | Antwortform |
|---|---|---|
| K1 | Ist der Inhalt fachlich zutreffend? | ja / nein / mit Änderung |
| K2 | Ist er für Laien ohne Anleitung sicher ausführbar? | ja / nein / mit Änderung |
| K3 | Fehlt ein Sicherheitshinweis oder eine Gegenanzeige? | nein / ja: welche |
| K4 | Ist er für die Zielgruppe verständlich formuliert? | ja / nein / mit Änderung |
| K5 | Enthält er eine unzulässige Aussage (Heilversprechen, Diagnostik, individualisierte Therapie)? | nein / ja: welche |
| K6 | Ist die Quellenlage angemessen — oder wird eine Quellenangabe benötigt? | ja / Quelle nötig |

**Zu K5, wichtig:** Der PflegeCoach ist ausdrücklich kein Medizinprodukt
(`audit/dipa/mdr_negativabgrenzung.md`). Ein Inhalt, der eine individuelle
therapeutische Empfehlung ausspricht oder eine Wirkung verspricht, verletzt
diese Abgrenzung. Das ist kein Schönheitsfehler, sondern ein Ausschlussgrund
— bitte ausdrücklich markieren.

Einstufung je Inhalt (aus `inhalte_pruefdossier.md` Abschnitt 5): **freigegeben**
/ **freigegeben mit Änderung** / **nicht freigegeben**. Es gibt bewusst keine
Zwischenstufe „mit Bedenken" — ein Inhalt, der Bedenken auslöst, wird
geändert oder entfernt.

---

## 4. Checkliste pro Modul (zum Ausfüllen)

| Modul | K1 | K2 | K3 | K4 | K5 | K6 | Einstufung | Bemerkung |
|---|---|---|---|---|---|---|---|---|
| Aufstehen vom Stuhl | | | | | | | | |
| Fersen- und Zehenstand mit Festhalten | | | | | | | | |
| Gehstrecke in der Wohnung | | | | | | | | |
| Schultern und Nacken lockern (im Sitzen) | | | | | | | | |
| Wohnraum-Sicherheits-Check (8 Punkte) | | | | | | | | |
| Entlastungsangebote für pflegende Angehörige | | | | | | | | |
| Auf sich selbst achten | | | | | | | | |
| Rückenschonend unterstützen | | | | | | | | |
| Selbstversorgung im Alltag erleichtern | | | | | | | | |
| Kontakte und Beschäftigung pflegen | | | | | | | | |

Ergänzend, als fachliche Grundlage der Module (kein eigener Freigabegegenstand,
aber Teil der Prüfung laut `audit/dipa/pflegeprobleme_pflegeziele.md` Abschnitt 4):

| Gegenstand | Prüffrage | Bemerkung |
|---|---|---|
| Pflegeprobleme P1–P6 und Pflegeziele Z1–Z6 (`audit/dipa/pflegeprobleme_pflegeziele.md`) | Ist die fachliche Herleitung der Module aus den Pflegeproblemen nachvollziehbar? | |

---

## 5. Kritischer Prüfhinweis (bitte ausdrücklich mitbewerten)

Die interne Zulassungsstrategie-Analyse (`docs/dipa/19_ZULASSUNGSSTRATEGIE_ANALYSE.md`,
Abschnitt 4 „Pflegerischer Nutzen (behauptet)") hat zwei strukturelle Befunde
festgestellt, die der Prüfperson nicht vorenthalten werden, sondern
ausdrücklich zur fachlichen Bewertung vorgelegt werden sollen:

1. **Keine Pflegegrad-Differenzierung.** Die Zweckbestimmung des Produkts
   beansprucht einen Nutzen „nach Pflegegrad 1 bis 5". Der tatsächliche
   Inhalt liefert dafür keine Differenzierung: **Alle Nutzer erhalten
   dieselben vier Übungen unabhängig vom Schweregrad.** Für Pflegegrad 4/5
   (häufig weitgehend immobil, oft kognitiv stark eingeschränkt) sind
   Inhalte wie „Aufstehen vom Stuhl" oder „Gehstrecke in der Wohnung" als
   Nutzen-Nachweis-Grundlage fraglich. Die Prüfperson soll einschätzen, ob
   und für welche Pflegegrade die vorliegenden Übungen fachlich vertretbar
   und sicher sind — und ob eine fehlende Differenzierung selbst ein K1-
   oder K2-relevanter Mangel ist.

2. **Schwerpunkt auf Angehörige statt Pflegebedürftige.** Drei der fünf
   Wissensmodule (Entlastungsangebote, Auf sich selbst achten,
   Rückenschonend unterstützen) richten sich laut Code
   (`zielgruppe: 'angehoerig'` in `lib/coach/inhalte.ts`) an pflegende
   Angehörige, nicht an die pflegebedürftige Person selbst. Das nähert das
   Produkt an ein allgemeines Angehörigen-Coaching an. Die Prüfperson soll
   mitbewerten, ob dieser Schwerpunkt fachlich sachgerecht ist oder ob er
   im Verhältnis zur Zweckbestimmung („Beeinträchtigungen der
   Selbständigkeit des Pflegebedürftigen mindern") unausgewogen wirkt.

Beide Punkte sind bereits im höchstbewerteten Produktrisiko der Risikoakte
verankert: **R1.4 „Fachlich unzutreffende Inhalte"**
(`audit/dipa/risikoakte_pflegecoach.md`), aktuell mit „hoch" (G3) bewertet,
als „nicht technisch lösbar" gekennzeichnet und einzig durch diese externe
Freigabe minderbar.

---

## 6. Benötigte Qualifikation

**Pflegefachkraft (Pflegewissenschaft, mind. 3 Jahre Berufserfahrung)** —
so festgelegt in `docs/DIPA_EXTERNE_TODO_2026-08-14.md`, Abschnitt „Pflegefachliche
Inhaltsfreigabe (QI-01)". Eine Freigabe durch das Entwicklungsteam selbst wäre
keine Freigabe, sondern eine Selbstbestätigung, und im Prüfverfahren wertlos
(`audit/dipa/inhalte_pruefdossier.md` Abschnitt 0).

Zielgruppen-Kontext, den die Prüfperson kennen sollte
(`audit/dipa/zielgruppendefinition.md`): Pflegebedürftige der Pflegegrade
1–5 in häuslicher Versorgung sowie deren pflegende Angehörige. Personen
ohne Pflegegrad sind formal keine Zielgruppe, werden im Pilotbetrieb aber
technisch nicht ausgeschlossen.

---

## 7. Dokumentationsformat

Für die DiPA-Unterlagen wird je Inhalt folgendes Protokoll geführt
(übernommen aus `audit/dipa/inhalte_pruefdossier.md` Abschnitt 6):

| Feld | Inhalt |
|---|---|
| Inhalt | Kennung und Titel |
| Geprüft von | Name, Qualifikation, Registrierungs-/Berufsbezeichnung |
| Datum | Prüfdatum |
| Ergebnis | freigegeben / mit Änderung / nicht freigegeben |
| Änderungen | Wortlaut der geforderten Änderung |
| Grundlage | Leitlinie, Standard, Fachliteratur oder Berufserfahrung |

Das ausgefüllte Protokoll wird als eigenes Dokument in `audit/dipa/`
abgelegt und in der Anforderungsmatrix als Nachweis für QI-01 verlinkt.

---

## 8. Verweis auf das vollständige Prüfdossier

Dieses Briefing ersetzt nicht das vollständige Prüfdossier
**`audit/dipa/inhalte_pruefdossier.md`** — es fasst dessen wichtigste Punkte
für die Beauftragung zusammen und ergänzt den Prüfhinweis aus Abschnitt 5
dieses Dokuments. Die Prüfperson soll `inhalte_pruefdossier.md` parallel
nutzen; dort stehen zusätzlich:

- die Einzelbewertung jeder Übung mit spezifischen Prüffragen (Abschnitt 2),
- was das Produkt bewusst nicht tut (keine Wertdeutung, keine
  individualisierte Empfehlung, kein Ersatz für ärztliche/pflegerische
  Beratung, keine Notfallfunktion — Abschnitt 4),
- die technische Umsetzung nach erfolgter Freigabe (Abschnitt 7).

---

## Klarstellungen (verbindlich für jede Kommunikation zu diesem Auftrag)

- Eine DiPA-Zulassung liegt **nicht vor** und ist **nicht beantragt**. Diese
  Prüfung ist Teil der internen Vorbereitung, keine Aussage über einen
  laufenden oder bevorstehenden Zulassungsprozess.
- Der PflegeCoach ist für Endnutzer **dauerhaft kostenlos**. Diese Prüfung
  bezieht sich ausschließlich auf fachliche Inhalte, nicht auf Preise oder
  Erstattungsfragen — dazu werden hier keine Aussagen getroffen.
- Kommunikation zu diesem Auftrag erfolgt ausschließlich unter dem Absender
  „Alltagsengel", nicht unter persönlichem Namen.
