# DiPA-Nutzerflow End-to-End — „Digitaler PflegeCoach"

**Stand:** 2026-08-12
**Block:** 15a
**Umsetzung:** Migration `20260826010000_dipa_freischaltung_nachweise_eul.sql`,
`lib/coach/anspruch.ts`, `lib/coach/freischaltung.ts`, `lib/coach/nachweise.ts`,
`lib/coach/abrechnung.ts`, `app/api/coach/{anspruch,freischaltung,nutzung}`,
`app/api/dipa/*`, `/pflegecoach/{anspruch,freischaltung}`, `/admin/dipa`

> **Was dieses Dokument NICHT tut:** Es legt keine Preise, keine Vergütungshöhen und
> keine Zulassungsvoraussetzungen fest. Wo eine Aussage regulatorisch nicht belegt ist,
> steht sie hier als **offene Frage** und ist im Code als konfigurierbar abgebildet.
> Regulatorische Referenz: `audit/DIPA_REGULATORIK_2026-08-09.md`.

---

## Der Flow in sechs Schritten

| # | Schritt | Wer handelt | Systemseite | Umsetzung |
|---|---|---|---|---|
| 1 | Anspruchsprüfung | Nutzer (Selbstauskunft) | `coach_anspruchspruefungen` | `/pflegecoach/anspruch` |
| 2 | Genehmigung → Code | Pflegekasse, Hersteller stellt Code aus | `coach_freischaltcodes` | `/admin/dipa` |
| 3 | Aktivierung | Nutzer gibt Code ein | `coach_freischaltungen` | `/pflegecoach/freischaltung` |
| 4 | Nutzung | Nutzer | bestehende `coach_*`-Module | unverändert |
| 5 | Nachweise | System (einwilligungsbasiert) | `coach_nutzungsereignisse` | `/api/coach/nutzung`, `/admin/dipa` |
| 6 | Abrechnung | Betrieb | `coach_abrechnungswege` | `/admin/dipa` |

---

## Schritt 1 — Anspruchsprüfung

Eine kurze Selbstauskunft (Pflegegrad, häusliche Versorgung, wer nutzt) mit drei
möglichen Ergebnissen: `anspruch_moeglich`, `anspruch_unklar`, `kein_anspruch`.

**Grundhaltung:** im Zweifel `anspruch_unklar` mit Klärungshinweis — nie ein
automatischer Ausschluss auf Basis unsicherer Annahmen. Über den Anspruch entscheidet
allein die Pflegekasse; jedes Ergebnis sagt das ausdrücklich.

Die Kriterien stehen versioniert in `lib/coach/anspruch.ts` (`ANSPRUCH_KRITERIEN_VERSION`)
und werden mit jeder Prüfung gespeichert — so bleibt nachvollziehbar, welche Fassung
angewandt wurde. Jedes Kriterium trägt ein `verifiziert`-Flag:

* `verifiziert: true` — aus einer offiziellen Quelle belegt.
* `verifiziert: false` — noch extern zu prüfen. Solche Kriterien dürfen **nie** zum
  Ausschluss führen, sondern nur zu einem Hinweis „mit der Pflegekasse klären".
  Betrifft aktuell den Sonderfall Pflegegrad 1 (ORF-4).

## Schritt 2 — Genehmigung und Codeausgabe

Nach der Genehmigung durch die Pflegekasse wird ein Freischaltcode ausgestellt
(`/admin/dipa` → Freischaltcodes).

**Offene Frage ORF-DIPA-FLOW:** Ob für DiPA ein Code-/Rezeptverfahren verbindlich
vorgesehen ist, wer die Codes ausgibt (Kasse oder Hersteller) und in welchem Format,
ist nicht abschließend geklärt. Das System bildet deshalb nur den **Mechanismus** ab und
kennt drei Herkünfte:

| `quelle` | Bedeutung |
|---|---|
| `pflegekasse` | Genehmigung durch die Pflegekasse liegt vor |
| `hersteller_pilot` | Pilotzugang im Rahmen einer Erprobung |
| `testzugang` | interner Test, ausdrücklich nicht abrechenbar |

**Sicherheit:**

* Der Code wird **nie im Klartext gespeichert** — nur als SHA-256-Hash über
  (normalisierter Code + serverseitiger Pfeffer `COACH_CODE_PEPPER`).
* Der Klartext wird **genau einmal** angezeigt, direkt beim Ausstellen.
* Alphabet ohne verwechselbare Zeichen (kein 0/O, 1/I/L) — die Codes werden am Telefon
  vorgelesen und von Menschen mit eingeschränktem Sehvermögen abgetippt.
* Coderaum 31^12 ≈ 8·10^17 — Raten über HTTP ist aussichtslos; Fehlversuche liefern
  bewusst dieselbe Meldung, damit sich gültige Präfixe nicht abfragen lassen.

> **Betriebshinweis:** Wird `COACH_CODE_PEPPER` nachträglich geändert, lassen sich bereits
> ausgegebene Codes nicht mehr einlösen. Der Admin-Bereich warnt, solange die Variable fehlt.

## Schritt 3 — Aktivierung

Der Nutzer gibt den Code unter `/pflegecoach/freischaltung` ein. Beim Einlösen:

1. Formatprüfung, dann Hash-Lookup.
2. Gültigkeitsprüfung (Status, Zeitfenster).
3. Einlösen mit Status-Guard `WHERE status = 'ausgegeben'` — bei parallelen Versuchen
   gewinnt genau einer.
4. Anlegen der `coach_freischaltungen`-Zeile.

**Warum hier ausnahmsweise der Systemkontext genutzt wird:** Die Code-Tabelle darf für
Nutzer nicht lesbar sein, und die Freischaltung darf der Nutzer nicht selbst schreiben —
sonst wäre die Zugangsprüfung wertlos. Der Admin-Client wird ausschließlich für diese
beiden Berechtigungstabellen verwendet, **nie** für `coach_*`-Gesundheitsdaten.

### Zwei Datenwelten, verbunden nur über ein Pseudonym

```
NUTZER-SEITE (Art. 9 DSGVO)          BETRIEBS-SEITE (Abrechnung)
coach_users                          coach_freischaltcodes
coach_freischaltungen ──code_id──►   (status, eingeloest_pseudonym)
coach_assessments …                  eul_erbringungen
   ▲                                    ▲
   │ nur der Nutzer                     │ nur Admin + org_fence
   └── kein Admin-Zugriff               └── keine Gesundheitsdaten

                 Brücke: HMAC-Pseudonym (coach_pseudonym_key)
                 Ein Admin sieht „Code X wurde eingelöst" —
                 aber nicht von wem, und kommt an keine Inhalte.
```

**Freischaltung ist derzeit KEINE Zugangsvoraussetzung.** Der Schalter
`COACH_FREISCHALTUNG_PFLICHT` steht auf `false` (Default). Grund: Solange das Verfahren
regulatorisch nicht feststeht, darf ein ungeklärter Mechanismus keine funktionierende
Nutzung blockieren. Der Mechanismus ist vollständig gebaut und mit einer
Umgebungsvariablen scharf zu schalten.

## Schritt 4 — Nutzung

Unverändert: Assessment, Ziele, Wochenplan, Mobilität, Alltag, Angehörigen-Bereich,
Belastungs-Check, Verlauf, Berichte. Siehe `finale_zweckbestimmung.md`.

## Schritt 5 — Nachweise

Für den Nutzennachweis werden **pseudonymisierte** Nutzungsereignisse erfasst
(`coach_nutzungsereignisse`). Schließt GAP-NUTZUNG.

**Doppelte Absicherung vor jeder Erfassung:**

1. Deployment-Schalter `COACH_NUTZUNGSNACHWEIS_AKTIV` (Default **aus**).
2. Gültige Einwilligung `wissenschaftliche_auswertung` des Nutzers.

Fehlt eines von beidem, wird nichts geschrieben — ohne Fehler, damit die Erfassung nie
einen Nutzerablauf blockiert.

**Datenminimierung im Datenmodell verankert:**

| Was NICHT gespeichert wird | Warum |
|---|---|
| `coach_user_id`, auth-User | kein Personenbezug in der Nachweistabelle |
| exakter Zeitstempel | nur die Auswertungswoche (Montag) — verhindert Re-Identifikation über Nutzungszeiten |
| Inhalte, Werte, Antworten | keine Zweitkopie der Gesundheitsdaten |

**Kleine-Fallzahlen-Schutz:** Unter 5 Teilnehmenden gibt `werteNutzungAus()` nur die
Teilnehmerzahl aus und setzt `unterdrueckt` — bei wenigen Teilnehmenden wäre eine
Kennzahl faktisch ein Einzeldatensatz.

Der Nutzer kann seine eigenen Nachweisdaten einsehen (Art. 15) und löschen (Art. 17).
Ein Admin sieht ausschließlich Aggregate, nie Einzelzeilen und nie Pseudonyme.

> **Keine Wirksamkeitsaussage:** Diese Kennzahlen beschreiben Nutzung, nicht Wirkung. Die
> Bewertung erfolgt ausschließlich nach `evaluationskonzept.md`.

## Schritt 6 — Abrechnung

`coach_abrechnungswege` hält **Wege** vor — bewusst ohne Preise, ohne Vergütungshöhen,
ohne Erstattungsbeträge. Diese ergeben sich erst aus Zulassungskategorie und
Vergütungsvereinbarung.

Drei Vorlagen stehen bereit (`lib/coach/abrechnung.ts`), alle deaktiviert:
Direktabrechnung mit der Pflegekasse, Kostenerstattung über die versicherte Person,
Pilotphase ohne Abrechnung. Jede nennt ihre zu prüfende Rechtsgrundlage und ihre
Voraussetzungen.

**Fail-closed:** `istAbrechnungsbereit()` gibt einen Weg erst frei, wenn er `aktiv` **und**
`verguetung_geklaert` ist. Solange keine Vergütungsvereinbarung hinterlegt ist, kann über
keinen Weg abgerechnet werden.

Der PflegeCoach hat **keinen eigenen Rechnungslauf**. Sobald ein Weg freigegeben ist, wird
der Schlüssel an die bestehende Abrechnung übergeben.

---

## Offene Punkte aus 15a

| ID | Frage | Auswirkung |
|---|---|---|
| ORF-DIPA-FLOW | Ist ein Code-/Aktivierungsverfahren für DiPA verbindlich? Wer gibt Codes aus? | Mechanismus gebaut, per Schalter aus |
| ORF-4 | Anspruch bei Pflegegrad 1 | Kriterium als „zu klären" markiert, kein Ausschluss |
| — | Vergütungshöhe und Abrechnungsweg | bewusst nirgends hinterlegt |

## Verifikation

* Unit-Tests: `lib/coach/anspruch.test.ts`, `freischaltung.test.ts`, `nachweise.test.ts`,
  `abrechnung.test.ts`
* Migration ist idempotent und hat ein Rollback-Gegenstück
  (`20260826010001_rollback_…`).
* **Live-Apply steht aus** — wie die übrigen DiPA-Migrationen (GAP-DB).
