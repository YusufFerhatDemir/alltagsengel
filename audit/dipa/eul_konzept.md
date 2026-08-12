# Ergänzende Unterstützungsleistungen (eUL) — Konzept

**Stand:** 2026-08-12 · **Block:** 15d
**Umsetzung:** `lib/coach/eul.ts`, Migration `20260826010000` (`eul_erbringungen`,
`eul_qualifikationen`), `app/api/eul/*`, `/admin/eul`

---

## 1. Der Zielkonflikt — und wie er aufgelöst wird

Hier stoßen zwei Anforderungen aufeinander, und das muss offen benannt werden:

**Auf der einen Seite** sind ergänzende Unterstützungsleistungen — die persönliche
Begleitung rund um die Nutzung einer digitalen Pflegeanwendung — fachlich genau das, was
Alltagsengel ohnehin tut. Die Verknüpfung liegt betriebswirtschaftlich nahe.

**Auf der anderen Seite** hält die Regulatorik-Analyse ausdrücklich fest, dass die
Vermittlung und Bewerbung von Alltagsengel-Dienstleistungen **nicht** Teil des
DiPA-Produkts sein darf: Anforderungen zu Verbraucherschutz und Werbefreiheit der
Kernfunktion sowie die Gefahr eines Interessenkonflikts sprechen dagegen
(`audit/DIPA_REGULATORIK_2026-08-09.md` §2.4, ORF-5).

Wer beides ignoriert und einen „Jetzt Begleitung buchen"-Knopf in den PflegeCoach setzt,
riskiert die Zulassungsfähigkeit des gesamten Produkts.

### Die Auflösung: die Brücke ist einbahnig

```
   PflegeCoach (DiPA)                      Betrieb (Leistungserbringer)
   /pflegecoach                            /admin/eul
   ┌──────────────────┐                    ┌──────────────────────┐
   │ Assessment       │                    │ eUL-Nachweis erfassen│
   │ Ziele            │      KEIN Weg      │ Qualifikation prüfen │
   │ Wochenplan       │ ─────╳──────────►  │ an Buchung hängen    │
   │                  │                    │                      │
   │ keine Werbung    │  ◄─── pseudonym ── │ optionaler Bezug     │
   │ kein Angebot     │       (nicht        │ auf DiPA-Nutzung    │
   │ kein Buchungsweg │        auflösbar)   │                     │
   └──────────────────┘                    └──────────────────────┘
```

**Konkret heißt das:**

1. eUL-Daten leben in `eul_*` — Betriebsdaten mit `org_fence` und Admin-Zugriff, **nicht**
   im DiPA-Datenraum.
2. Im PflegeCoach gibt es keinen Hinweis auf buchbare Leistungen, keinen Preis, kein
   Angebot, keinen Link in den Buchungsprozess. Der Produktpfad bleibt werbe- und
   trackerfrei (technisch erzwungen).
3. Der Bezug zwischen einer eUL und einer DiPA-Nutzung ist **optional und pseudonym**
   (`eul_erbringungen.coach_pseudonym`). Aus einem eUL-Datensatz lässt sich keine
   Gesundheitsakte öffnen — der Weg ist mathematisch versperrt, nicht nur per Konvention.
4. Der Anstoß kommt vom Nutzer oder aus der bestehenden Betreuungsbeziehung — nicht aus
   der App.

> **Wer diese Trennung aufweicht, gefährdet die Zulassungsfähigkeit.** Das gilt auch für
> vermeintlich harmlose Varianten: ein „Wussten Sie schon"-Kasten, ein Hinweis in einer
> Systemnachricht oder ein Logo mit Verlinkung sind Werbung im Produktpfad.

## 2. Was eUL sind

Persönliche Leistungen **mit direktem Bezug zur Nutzung der digitalen Anwendung**:

| Leistungsart | Inhalt | Richtdauer |
|---|---|---|
| Erstinstallation und Einweisung | Zugang einrichten, Bedienung erklären, Darstellung anpassen | 60 Min. |
| Technische Unterstützung | Hilfe bei Anmeldung, Gerät, Verbindung, Bedienproblemen | 30 Min. |
| Begleitete Nutzung | Gemeinsames Durcharbeiten von Inhalten oder Übungen | 45 Min. |
| Schulung pflegender Angehöriger | Anleitung zur Nutzung und Umsetzung im Pflegealltag | 60 Min. |
| Auswertungsgespräch | Verlauf durchsehen, Ziele anpassen, Fragen klären | 45 Min. |

Richtdauern sind Orientierung für die Erfassung, keine Vorgabe und keine Abrechnungsgröße.

## 3. Abgrenzung digital ↔ persönlich ↔ keines von beidem

| Tätigkeit | Einordnung | Begründung |
|---|---|---|
| Nutzer arbeitet allein mit der App | **DiPA** | Kernnutzung, keine Begleitperson anwesend |
| Zugang einrichten, Bedienung erklären | **eUL** | Persönliche Leistung mit direktem Bezug zur Nutzung |
| Gemeinsam App-Inhalte durcharbeiten | **eUL** | Persönliche Begleitung; die App-Nutzung selbst bleibt DiPA |
| Haushaltshilfe, Einkauf, Arztbegleitung | **weder noch** | Allgemeine Alltagsbegleitung ohne Bezug zur Anwendung |
| Pflegefachliche Beratung, Anleitung zu Pflegetechniken | **weder noch** | Eigenständige pflegerische Leistung — darf **nicht** als eUL erfasst werden |

Diese Tabelle steht maschinenlesbar in `lib/coach/eul.ts` (`ABGRENZUNG`) und wird im
Admin-Bereich angezeigt.

**Faustregel für Zweifelsfälle:** Was ohne die digitale Anwendung genauso stattfinden
würde, ist keine ergänzende Unterstützungsleistung.

## 4. Nachweisführung

Jede eUL wird als Nachweis erfasst (`/admin/eul`). Der Nachweis ist die Grundlage einer
späteren Abrechnung — deshalb prüft `pruefeNachweisVollstaendig()` mehr als das bloße
Vorhandensein einer Zeile:

| Pflichtangabe | Warum |
|---|---|
| Gültige Leistungsart | Abgrenzung muss eindeutig sein |
| Datum | Zuordnung zum Leistungszeitraum |
| Dauer 1–480 Minuten | Plausibilität |
| Inhaltliche Beschreibung, mind. 10 Zeichen | „erbracht" ist kein Nachweis |
| Name der erbringenden Person | Zurechenbarkeit |
| Bestätigte Qualifikation | siehe `eul_qualitaetsanforderungen.md` |

**Unveränderlichkeit nach Bestätigung:** Ein bestätigter Nachweis kann nicht mehr geändert
oder gelöscht werden. Sonst wäre er nachträglich manipulierbar und als Nachweis wertlos.
Vor der Bestätigung ist beides möglich.

## 5. Abrechnung

Wie beim DiPA-Teil gilt: **keine Beträge im System.** `eul_erbringungen.abrechnungsweg_key`
verweist auf einen konfigurierten Abrechnungsweg (`coach_abrechnungswege`), der erst
freigegeben ist, wenn eine Vergütungsvereinbarung hinterlegt wurde
(`istAbrechnungsbereit()`, fail-closed).

Ob und in welchem Verhältnis eUL neben der digitalen Anwendung erstattungsfähig sind, ist
Gegenstand des Zulassungs- und Vertragsverfahrens und wird hier nicht vorweggenommen
(siehe ORF-1 in der Regulatorik-Analyse).

## 6. Offene Punkte

| ID | Punkt |
|---|---|
| ORF-1 | Rolle von Alltagsengel als eUL-Leistungserbringer regulatorisch klären |
| ORF-5 | Genaue Anforderungen zur Werbefreiheit im Originaltext prüfen |
| — | Qualifikationsanforderungen an eUL-Erbringer sind derzeit **selbst gesetzt**, nicht regulatorisch abgeleitet — siehe `eul_qualitaetsanforderungen.md` |
| — | Verknüpfung zu einer konkreten Buchung erfolgt heute über die Eingabe einer Buchungs-ID; eine Auswahl aus der Buchungsliste wäre komfortabler, ändert aber nichts an der Trennung |
