# Prüfdossier für die pflegefachliche Inhaltsfreigabe

**Produkt:** Digitaler PflegeCoach · **Version:** 0.5.0 · **Stand:** 2026-08-14
**Deckt ab:** DiPA-Matrix QI-01 (Vorbereitung) · **Status der Anforderung:** EXTERN NÖTIG (Pflegefachkraft)

---

## 0. An wen sich dieses Dokument richtet

An die Pflegefachkraft, die die Inhalte des PflegeCoach prüfen und
freigeben soll. Es ist so geschrieben, dass die Prüfung ohne technische
Vorkenntnisse und ohne Rückfragen an die Entwicklung möglich ist.

**Warum die Freigabe intern nicht möglich ist:** Sie erfordert eine
pflegefachliche Qualifikation. Eine Freigabe durch das Entwicklungsteam
wäre keine Freigabe, sondern eine Selbstbestätigung — und im Prüfverfahren
wertlos. Deshalb bleibt QI-01 extern, obwohl das Dossier intern vollständig
erstellt ist.

**Zugleich das höchste Produktrisiko:** R1.4 in
`audit/dipa/risikoakte_pflegecoach.md` ist mit „hoch" bewertet und wird
erst durch diese Freigabe gemindert. Der Punkt betrifft nicht nur die
DiPA-Zukunft, sondern auch das heute verkaufte Angebot.

## 1. Prüfgegenstand

| Nr. | Gruppe | Anzahl | Fundstelle |
|---|---|---|---|
| 1 | Bewegungsübungen | 4 | `lib/coach/inhalte.ts` → `UEBUNGEN` |
| 2 | Wissensmodule | 5 | `lib/coach/inhalte.ts` → `WISSEN_MODULE` |
| 3 | Wohnraum-Checkliste | 1 Liste | `lib/coach/inhalte.ts` → `WOHNRAUM_CHECK` |
| 4 | Empfehlungslogik | Regelwerk | `lib/coach/empfehlungen.ts` |
| 5 | Pflegeprobleme und -ziele | Herleitung | `audit/dipa/pflegeprobleme_pflegeziele.md` |
| 6 | Selbsteinschätzung (5 Bereiche, Stufen 0–4) | 1 Instrument | `lib/coach/assessment.ts` |
| 7 | Belastungs-Kurzform (7 Items, Stufen 0–3) | 1 Instrument | `lib/coach/belastung.ts` |

Zusätzlich stehen alle Inhalte im laufenden Produkt unter
`/pflegecoach/mobilitaet`, `/pflegecoach/alltag`, `/pflegecoach/angehoerige`
und `/pflegecoach/belastung` — die Prüfung sollte in der Oberfläche
erfolgen, nicht nur am Text: Der Zusammenhang, in dem ein Hinweis erscheint,
gehört zur Aussage.

## 2. Die Übungen im Einzelnen

| Übung | Ziel laut Produkt | Besonders zu prüfen |
|---|---|---|
| Aufstehen vom Stuhl | Beinkraft, Sicherheit beim Transfer | Ist die Ausführungsbeschreibung sturzsicher? Fehlt eine Kontraindikation? |
| Fersen- und Zehenstand mit Festhalten | Gleichgewicht | Ist das Festhalten hinreichend eindeutig beschrieben? |
| Gehstrecke in der Wohnung | Ausdauer, Alltagsmobilität | Ist die Steigerung angemessen zurückhaltend? |
| Schultern und Nacken lockern (im Sitzen) | Beweglichkeit | Bestehen Bedenken bei Vorerkrankungen der Halswirbelsäule? |

Jede Übung trägt einen eigenen Sicherheitshinweis. Ausdrücklich mitzuprüfen
ist, ob dieser Hinweis **ausreicht** — nicht nur, ob er vorhanden ist.

## 3. Prüfkriterien

Bitte je Inhalt beantworten:

| Nr. | Frage | Antwortform |
|---|---|---|
| K1 | Ist der Inhalt fachlich zutreffend? | ja / nein / mit Änderung |
| K2 | Ist er für Laien ohne Anleitung sicher ausführbar? | ja / nein / mit Änderung |
| K3 | Fehlt ein Sicherheitshinweis oder eine Gegenanzeige? | nein / ja: welche |
| K4 | Ist er für die Zielgruppe verständlich formuliert? | ja / nein / mit Änderung |
| K5 | Enthält er eine unzulässige Aussage (Heilversprechen, Diagnostik, individualisierte Therapie)? | nein / ja: welche |
| K6 | Ist die Quellenlage angemessen — oder wird eine Quellenangabe benötigt? | ja / Quelle nötig |

**Zu K5, wichtig:** Der PflegeCoach ist ausdrücklich **kein
Medizinprodukt** (`audit/dipa/mdr_negativabgrenzung.md`). Ein Inhalt, der
eine individuelle therapeutische Empfehlung ausspricht oder eine Wirkung
verspricht, würde diese Abgrenzung verletzen. Solche Formulierungen sind
kein Schönheitsfehler, sondern ein Ausschlussgrund — bitte ausdrücklich
markieren.

## 4. Was das Produkt bewusst nicht tut

Damit die Prüfung nicht an falscher Stelle ansetzt:

* **Keine Deutung von Messwerten.** Summenwerte werden dargestellt, nie
  bewertet. Es gibt keine Einstufung in „auffällig" oder „unauffällig".
* **Keine individualisierte Empfehlung.** Die Empfehlungslogik
  (`lib/coach/empfehlungen.ts`) wählt aus einem festen Bestand statischer
  Hinweise aus; sie erzeugt keine Texte und passt keine an.
* **Kein Ersatz für ärztliche oder pflegerische Beratung.** Der Hinweis
  steht im Produkt; bitte prüfen, ob er an den richtigen Stellen erscheint.
* **Keine Notfallfunktion.** Auf den Notruf wird hingewiesen, mehr nicht.

## 5. Ergebnis der Prüfung

Bitte je Inhalt eine der drei Einstufungen:

| Einstufung | Bedeutung | Folge im Produkt |
|---|---|---|
| freigegeben | unverändert verwendbar | `pruefstatus: 'fachlich_freigegeben'`, der Entwurfs-Hinweis entfällt |
| freigegeben mit Änderung | Änderung ist im Protokoll benannt | Änderung wird eingearbeitet, danach Freigabe |
| nicht freigegeben | fachlich nicht vertretbar | Inhalt wird entfernt, nicht abgeschwächt |

Es gibt bewusst keine Zwischenstufe „mit Bedenken". Ein Inhalt, der
Bedenken auslöst, wird geändert oder entfernt.

## 6. Protokoll der Freigabe

Für die DiPA-Unterlagen wird je Inhalt festgehalten:

| Feld | Inhalt |
|---|---|
| Inhalt | Kennung und Titel |
| Geprüft von | Name, Qualifikation, Registrierungs-/Berufsbezeichnung |
| Datum | Prüfdatum |
| Ergebnis | freigegeben / mit Änderung / nicht freigegeben |
| Änderungen | Wortlaut der geforderten Änderung |
| Grundlage | Leitlinie, Standard, Fachliteratur oder Berufserfahrung |

Das ausgefüllte Protokoll wird als eigenes Dokument in `audit/dipa/`
abgelegt und in der Matrix als Nachweis für QI-01 verlinkt.

## 7. Technische Umsetzung nach der Freigabe

Für die prüfende Person nur zur Kenntnis — nichts davon ist von ihr zu tun:

1. Jeder freigegebene Inhalt erhält `pruefstatus: 'fachlich_freigegeben'`.
2. Der sichtbare Entwurfs-Hinweis entfällt für diesen Inhalt automatisch.
3. Produktversion steigt auf MINOR, Eintrag im Changelog.
4. Risiko R1.4 wird in der Risikoakte neu bewertet.
5. Katalogeintrag AK-QS-01 wird auf `erfuellt` gesetzt — mit dem Protokoll
   als Nachweis.

**Wichtig:** Wird ein freigegebener Inhalt später geändert, fällt er
zurück auf `entwurf` und muss erneut geprüft werden. Eine Freigabe gilt
für den Wortlaut, nicht für den Titel.

## 8. Status

Kein Auftrag erteilt, keine Prüfung begonnen. Alle 12 Inhaltsmodule tragen
`pruefstatus: 'entwurf'`, und das Produkt weist diesen Stand sichtbar aus.
**Nächster Schritt:** Pflegefachkraft beauftragen; dieses Dossier ist die
vollständige Auftragsgrundlage.
