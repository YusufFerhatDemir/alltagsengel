# Block 40 — Die vierte Achse: RPC

**Stand:** 14.09.2026 · **Ausgangspunkt:** `a5435966`

---

## Warum RPC die tückischste Achse ist

Die Blöcke 37–39 prüfen Tabellen: verbotene Werte (23514), unbekannte
Schreibspalten (42703), unbekannte Lesespalten (42703). Diese Achse prüft
**Funktionsaufrufe** — und sie wiegt schwerer als die anderen drei:

```ts
const { error } = await supabase.rpc('gibtesnicht', { a: 1 })
```

**`rpc()` wirft nicht.** Es liefert ein Fehlerobjekt. Ein `try/catch`
darum herum ist toter Code, und wer `error` nicht ansieht, merkt nichts.
Genau so wurde in diesem Projekt einmal ein Referral-Bonus nie gebucht.

---

## Ergebnis: sauber — mit einem Befund

387 Funktionen in `public`, **null** Abweichungen bei den Argumentnamen,
**ein** falscher Funktionsname:

```
app/api/health/route.ts   rpc('version')
```

`version()` liegt in `pg_catalog`; PostgREST exponiert ausschließlich
`public`. Live nachgemessen:

```
HTTP 404
PGRST202  Could not find the function public.version in the schema cache
```

### Kein Fehler im Ergebnis — aber in jedem Lauf

Der Code erwartete das sogar. Daneben stand ein Select als Rückfall, mit
Kommentar: *„manche Supabase-Instanzen haben keine version()-RPC"*. Nur
war der Rückfall kein Sonderfall, sondern **der Normalfall**: der RPC ist
hier nie gelungen und konnte es nie.

Die Gesundheitsprüfung war also richtig — sie kostete nur bei **jedem**
Aufruf einen zusätzlichen Rundlauf und hinterließ einen Fehler im
Supabase-Protokoll. Wer dort nach echten Störungen sucht, filtert ihn
seitdem weg.

**Behoben:** der Select ist jetzt die Prüfung. Er beweist Verbindung *und*
Lesbarkeit — mehr als `version()` je bewiesen hätte.

---

## Die Vereinigung der Überladungen

`ladeFunktionen` bildet den Namen auf die **Vereinigung** aller
Argumentnamen über alle Überladungen ab. Das ist Absicht: mehrere
Signaturen derselben Funktion sind zulässig, und welche ein Aufruf trifft,
entscheidet PostgREST anhand der übergebenen Schlüssel. Hier zu raten
hieße Falschalarm — und ein Detektor, der Falschalarm gibt, wird
abgeschaltet.

---

## Wieder ein eigener Test, der nichts prüfte

Die Mutationsprobe deckte auf, dass mein Test zur String-Neutralisierung
wertlos war: er benutzte `` `Stand: ${x}` ``, wo bereits die Anker-Regel
(„Feld folgt direkt auf `{` oder `,`") greift. Beide Varianten lieferten
dasselbe.

Der entscheidende Fall ist ein Komma **im** String, gefolgt von `wort:`:

```ts
{ p_monat: 'Monat, grund: unklar' }
```

Ohne Neutralisierung wäre `grund` ein Argumentname. Der Test prüft jetzt
das; die Mutation lässt ihn fallen.

Das ist in dieser Sitzung das **dritte Mal**, dass die Mutationsprobe
einen meiner eigenen Tests als wirkungslos entlarvt hat (Blöcke 31, 39,
40). Ohne sie hätte ich dreimal eine Absicherung gemeldet, die keine war.

---

## Der Lauf deckt jetzt vier Achsen

```
Wertelisten im Schema : 419 (Tabelle.Spalte)
Tabellen in der API   : 351
Funktionen in public  : 387
Quelldateien geprueft : 1556

NEU: verbotener Wert  : 0
NEU: fehlende Spalte  : 0
NEU: gelesene Spalte  : 0
NEU: RPC-Abweichung   : 0
```

`npm run verify:vokabular` — ein Befehl, vier Fragen, Exit 1 bei jedem
Neuzugang.

---

## Offen — in Yusufs Hand

Nichts Neues aus diesem Block.

Unverändert: `CRON_SECRET`, Migrationen `20261105000000`,
`20261115000000`, `20261120000000`, die 26 Bestandszeilen aus Block 35,
das eigene `failed` für `substitution_requests` (Block 37), `mis_kpis`,
Nachweise für die Einsatzfreigabe, Erika Testfalls fehlende
E-Mail-Adresse.
