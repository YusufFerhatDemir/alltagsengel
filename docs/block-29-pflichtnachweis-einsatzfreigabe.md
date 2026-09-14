# Block 29 — Die Einsatzfreigabe verlangte keinen Beleg

**Stand:** 14.09.2026 · **Ausgangspunkt:** `6167f378`

---

## Der Befund

`lib/bewerbung/ats-felder.ts` trägt einen Riegel, der bewusst **immer
`false`** liefert — `darfAlsVerifiziertGelten()`. Seine Begründung steht
wörtlich daneben:

> `fzStatus = 'eingetroffen'` heißt, dass jemand das in eine Maske getippt
> hat — nicht, dass ein Führungszeugnis vorliegt. […] **Bei § 45a hängt
> daran die Einsatzfreigabe.**

Der letzte Satz war ein Versprechen ohne Deckung. Eine Stufe später prüfte
die Einsatzfreigabe nämlich das:

```ts
q.title?.toLowerCase().includes('führungszeugnis') && q.pflicht
```

Eine von Hand angelegte Zeile mit `title: 'Erweitertes Führungszeugnis'`,
`pflicht: true`, `dokument_id: null` und `verifiziert_am: null` passierte
das. **Kein Dokument, kein Prüfer, kein Zeitpunkt** — und der Mitarbeiter
war für den Einsatz bei pflegebedürftigen Menschen freigegeben.

Die Belegkette existierte längst. `caregiver_qualifications` führt
`dokument_id`, `verifiziert_von` und `verifiziert_am`, und
`updateQualifikation` pflegt sie. Gelesen hat sie **niemand** — für keine
Entscheidung. Dieselbe Art toter Spur wie `mis_kpis` in Block 28.

### Zweiter Befund: der Titel ist Freitext

Der Abgleich lief über einen Teilstring im frei tippbaren `title`. Das
trifft in beide Richtungen daneben:

| Titel | vorher | jetzt |
|---|---|---|
| „Führungszeugnis beantragt" | zählt als Nachweis | zählt nicht |
| „Erw. FZ" (Typ `fuehrungszeugnis`) | zählt nicht | zählt |
| „Fortbildung: Führungszeugnis-Recht" (Typ `fortbildung`) | zählt als Nachweis | zählt nicht |

Die Tabelle führt `qualification_type` mit fester Werteliste. Der Typ
entscheidet jetzt; der Titel bleibt **Rückfall für Altbestand**, der vor
Einführung der Spalte angelegt wurde.

---

## Behebung

Neu: `lib/personal/pflichtnachweis.ts` — eine Regel, eine Stelle.
Freigabeprüfung, Prüfskript und Tests lesen dieselbe.

| Bestandteil | Zweck |
|---|---|
| `PFLICHT_QUALIFIKATIONEN` | Führungszeugnis + Erste Hilfe, mit kanonischem Typ |
| `NACHWEIS_SPALTEN` | Spaltenliste als Konstante — die alte Abfrage ließ die Belegspalten weg, und **eine Prüfung, die ein Feld nicht liest, kann es nicht verlangen** |
| `passtZuPflicht()` | Typ entscheidet, Titel als Rückfall |
| `belegLuecke()` | fail-closed: erst Dokument, dann Prüfvermerk |
| `pflichtProbleme()` | alle Beanstandungen in Klartext |

`sammleVoraussetzungen` ruft jetzt `pflichtProbleme()`; die lokale
Duplikat-Liste in `einsatzfreigabe.ts` ist entfernt.

### Reihenfolge der Beanstandungen

Bei einem **abgelaufenen** Nachweis wird „abgelaufen" gemeldet und die
Belegprüfung tritt zurück — „abgelaufen" ist die nützlichere Auskunft,
eine zusätzliche Belegbeanstandung wäre nur Lärm.

---

## Dritter Befund: der Prüfvermerk konnte auf nichts zeigen

Der Vermerk selbst (`verifiziert_von` / `verifiziert_am`) kommt seit einer
früheren Härtung aus dem Auth-Kontext und nicht mehr aus dem Rumpf — gut.
Zwei Wege führten trotzdem zu einem Vermerk, der nichts belegt:

1. **`verifiziert: true` auf einer Zeile ohne `dokument_id`** — ein
   „geprüft" über ein Dokument, das es nicht gibt.
2. **`dokument_id` nach der Prüfung austauschen** — der Vermerk blieb
   stehen und bürgte danach für ein Blatt, das niemand gesehen hat.

Bei einer MD-Prüfung ist genau dieser Vermerk der Beleg dafür, dass das
Führungszeugnis eingesehen wurde. Er darf nicht länger halten als das,
worauf er sich bezieht.

`updateQualifikation` weist jetzt (1) mit Klartext ab und löscht bei (2)
den alten Vermerk — sichtbar, nicht stillschweigend. Der Bestand wird
dafür nur gelesen, wenn der Patch die Belegkette überhaupt berührt.

---

## Live-Wirkung: keine

Gemessen am 14.09.2026, **vor** der Änderung:

```
caregiver_qualifications        0 Zeilen
caregivers.einsatzfreigabe      false, false
```

Die Verschärfung nimmt also **keiner bestehenden Freigabe** ihre
Grundlage. Sie schließt die Tür, bevor zum ersten Mal jemand hindurchgeht.

`npm run verify:einsatzbereitschaft` nach der Änderung — unverändertes
Bild, weil die Nachweise schlicht fehlen:

```
✗ Maria Schmidt     · Pflichtqualifikation "Erweitertes Führungszeugnis" fehlt
                    · Pflichtqualifikation "Erste-Hilfe-Nachweis" fehlt
                    · Einsatzfreigabe ist nicht erteilt
Betreuungskraefte einsatzbereit : 0 von 2
```

---

## Bestandstests: fünf Fixtures kodierten „getippte Zeile genügt"

Die Verschärfung machte fünf Fixtures rot — und das war der Beweis, dass
der Riegel etwas tut. Sie tragen jetzt die Belegkette:

| Datei | Suite |
|---|---|
| `lib/personal/__tests__/sperrlogik.test.ts` | node:test |
| `lib/personal/__tests__/einsatzfreigabe.test.ts` | node:test |
| `__tests__/einsatzplanung/client-freigabe-unbekannt.test.ts` | vitest |
| `__tests__/e2e/buchung-einsatz-kette.test.ts` | vitest |

Gegenprobe: wird `belegLuecke()` die Dokumentprüfung wieder
herausgenommen, fallen zwei Tests um — der Riegel ist nicht nur
vorhanden, er wird auch geprüft.

---

## Geprüft und **kein** Befund

- **Kein zweiter Schreibweg** auf `einsatzfreigabe`: alle Treffer außerhalb
  von `setzeEinsatzfreigabe` sind Lesevorgänge oder UI-Zustand.
- **Das Bewerbungsverfahren legt keine Qualifikationen an** — es gibt
  keinen Pfad, auf dem ein getippter ATS-Status zu einer
  Freigabegrundlage wird.
- **`deployment_cleared`** taucht in drei Seiten als `?? r.deployment_cleared`
  auf, existiert live aber **nicht** als Spalte. Toter Rückfall, wird
  nirgends selektiert — kein `42703`-Risiko, keine zweite Wahrheitsquelle.

---

## Offen — in Yusufs Hand

Unverändert:

- **`CRON_SECRET` setzen** — 40 verschleppte Leads warten
- **Migrationen** `20261105000000` (Audit-Lücke) und `20261115000000`
  (Mandantenzaun) einspielen — DDL nur im SQL-Editor
- **BUSINESS_DECISION #5** — 13 unabrechenbare Nachweise
- **`mis_kpis` pflegen oder abschalten** (Block 28)

Neu aus diesem Block:

- **Die Einsatzfreigabe braucht jetzt echte Dokumente.** Für jede der
  beiden Kräfte: Führungszeugnis und Erste-Hilfe-Nachweis hochladen, als
  Qualifikation mit `qualification_type` anlegen, `pflicht` und
  `einsatzrelevant` setzen — und den Prüfvermerk über
  `updateQualifikation({ verifiziert: true })` setzen. Ohne diesen letzten
  Schritt bleibt die Freigabe verweigert, und das ist Absicht.
