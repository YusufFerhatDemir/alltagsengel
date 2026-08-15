# Screenreader-Durchgang — Ergebnisprotokoll (Vorlage, ausfüllbar)

**Stand:** 2026-08-15 · **Deckt ab:** AK-BF-03 · **Status:** Vorlage, noch nicht ausgefüllt

> **Was diese Vorlage ist:** das Ausfüll-Formular für den in
> `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md` §5 beschriebenen manuellen
> Durchgang mit VoiceOver/NVDA. Der Fragenkatalog (S1–S8) existierte bereits — was fehlte,
> war eine Vorlage, in der ein Ergebnis tatsächlich festgehalten wird, statt dass die
> durchführende Person das Format selbst erfindet.
>
> **Was diese Vorlage NICHT ist:** ein bereits durchgeführter Test. Alle Ergebnisfelder
> unten sind leer. Ein ausgefülltes Protokoll ohne tatsächlich gelaufenen Screenreader
> wäre ein erfundener Nachweis (siehe Kopfnotiz in `e2e/pflegecoach-axe.spec.ts`) — genau
> das soll diese Vorlage verhindern, indem sie Leerfelder erzwingt statt Prosa.

---

## 1. Rahmendaten

| Feld | Eintrag |
|---|---|
| Datum | |
| Durchführende Person | |
| Screenreader + Version | ☐ VoiceOver (macOS) ☐ VoiceOver (iOS) ☐ NVDA (Windows) — Version: |
| Browser | |
| Getestete Produktversion (`lib/coach/version.ts`) | |

## 2. Geprüfte Seiten

Dieselben vier Seiten wie im automatisierten Lauf (`e2e/pflegecoach-axe.spec.ts`,
Block „Screenreader-Semantik"), damit maschineller und manueller Befund vergleichbar
bleiben — plus eine fünfte, dort bewusst ausgeschlossene Seite für S7:

1. `/pflegecoach/start`
2. `/pflegecoach/datenschutz`
3. `/pflegecoach/anfrage`
4. `/pflegecoach/interoperabilitaet`
5. Anmeldesicherheit / MFA-Einrichtung (angemeldeter Bereich, nur für S7 — im
   automatisierten Lauf bewusst ausgenommen, siehe dortige Kopfnotiz)

## 3. Ergebnis je Prüfpunkt

Bewertung je Zelle: **OK** / **MANGEL** / **N/A**. Bei MANGEL: kurze Beschreibung in der
Bemerkungsspalte, nicht nur ein Kreuz — sonst ist der Befund später nicht reproduzierbar.

| Prüfpunkt | Frage | Was der automatisierte Lauf schon abdeckt (nicht erneut prüfen) | Was hier zu beurteilen ist | S. 1 | S. 2 | S. 3 | S. 4 | Bemerkung |
|---|---|---|---|---|---|---|---|---|
| S1 | Wird der Seitentitel beim Wechsel angesagt? | eindeutiger `<title>` je Seite (strukturell geprüft) | **die tatsächliche Ansage** hören | | | | | |
| S2 | Ist die Sprungmarke zum Inhalt erreichbar und wirksam? | Zielelement existiert (strukturell geprüft) | Sprung mit Tastatur/Screenreader tatsächlich auslösen | | | | | |
| S3 | Sind Überschriftenebenen sinnvoll und sprungfähig? | keine übersprungene Ebene (strukturell geprüft) | mit Screenreader-Überschriftennavigation (VO: Ctrl+Opt+Cmd+H, NVDA: H) durchgehen — ist die Reihenfolge **inhaltlich** sinnvoll? | | | | | |
| S4 | Trägt jedes Formularfeld eine vorgelesene Beschriftung? | Label-Element vorhanden (strukturell geprüft) | Beschriftung beim Fokussieren **hören**, nicht nur prüfen ob eins existiert | | | | | |
| S5 | Werden Fehlermeldungen und Bestätigungen angesagt? | — (nicht abgedeckt) | absichtlich einen Validierungsfehler auf `/pflegecoach/anfrage` auslösen — wird er angesagt, und zu welchem Zeitpunkt? | | | | | |
| S6 | Sind Schaltflächen an ihrem Namen erkennbar? | zugänglicher Name vorhanden (strukturell geprüft) | ist der Name **treffend** („Erteilen" statt „Klicken")? | | | | | |
| S8 | Ist die Seite vollständig mit der Tastatur bedienbar, ohne Fokusfalle? | — (nicht abgedeckt) | komplett per Tab/Shift+Tab durchgehen — bleibt der Fokus je irgendwo hängen? | | | | | |

**S7 separat** (nur Seite 5, Anmeldesicherheit):

| Prüfpunkt | Frage | Ergebnis | Bemerkung |
|---|---|---|---|
| S7 | Ist der QR-Code der Anmeldesicherheit mit einem Alternativweg hinterlegt? | | |

## 4. Zusammenfassung

| Feld | Eintrag |
|---|---|
| Anzahl MANGEL gesamt | |
| Davon blockierend (Kernfunktion unbedienbar) | |
| Davon nicht blockierend (störend, aber umgehbar) | |
| Empfehlung: Nachbesserung vor DiPA-Antrag nötig? | ☐ ja ☐ nein |

## 5. Was danach zu tun ist

1. Gefundene MANGEL-Einträge als GitHub-Issues oder in `audit/dipa/CHANGELOG_pflegecoach.md`
   aufnehmen, mit Verweis auf diesen Durchgang.
2. `lib/coach/anforderungskatalog.ts` AK-BF-03 `stand` aktualisieren: `erfuellt`, wenn
   Zusammenfassung „nein" bei „Nachbesserung nötig" ergibt, sonst `in_arbeit` mit
   verlinktem Nachbesserungs-Ticket.
3. Diese ausgefüllte Datei (nicht die Vorlage) als Nachweisdatei in den Katalogeintrag
   eintragen.

---

*Diese Vorlage ersetzt nicht `audit/dipa/gebrauchstauglichkeit_durchfuehrungsplan.md` §5 —
dort steht die Methodik (welcher Screenreader, welcher Umfang, Abgrenzung zu BF-01), hier
nur das Ergebnis-Formular.*
