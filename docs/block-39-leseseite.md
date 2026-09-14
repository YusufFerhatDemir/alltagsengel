# Block 39 — Die Leseseite ist sauber

**Stand:** 14.09.2026 · **Ausgangspunkt:** `d753e8d2`

---

## Die Frage

Die Blöcke 37 und 38 prüfen **Schreibwege**: verbotene Werte (23514) und
unbekannte Spalten (42703). Die gefährlichere Hälfte ist die **Leseseite**.

Eine unbekannte Spalte in `.select()` scheitert genauso — nur ist die
Folge dort schlimmer: der Fehler wird in aller Regel verschluckt, die
Liste kommt leer zurück, und die Oberfläche zeigt einen Leerzustand.
Genau die stille Null, die sich durch diese ganze Sitzung zieht.

---

## Ergebnis: sauber — und das ist geprüft

**Null Befunde** über alle `.from('X').select('…')` in 1.555 Quelldateien
gegen 351 Tabellen.

Das ist kein „der Detektor hat nichts gemeldet". In den Blöcken 37 und 38
haben **fünf** Detektor-Entwürfe null Befunde gemeldet, weil sie blind
waren. Deshalb die Gegenprobe: eine Falschspalte in
`app/kunde/leistungsnachweis/page.tsx` eingebaut —

```
Verdachtsfaelle: 1
  app/kunde/leistungsnachweis/page.tsx:66  service_records.gibtesnicht
```

— gefunden, Datei per `git checkout` wiederhergestellt, Abweichungen 0.

Der Lauf prüft jetzt drei Achsen:

```
NEU: verbotener Wert  : 0
NEU: fehlende Spalte  : 0
NEU: gelesene Spalte  : 0
```

---

## Was bewusst NICHT geprüft wird

**Eingebettete Abfragen.** PostgREST kennt dafür zwei Formen:

```
kunde:profiles!customer_id(first_name)   Alias : Tabelle ! Schlüssel
profiles:customer_id(first_name)         Alias : Fremdschlüsselspalte
```

Ohne Auflösung der Fremdschlüssel sind sie nicht auseinanderzuhalten — im
zweiten Fall hält jeder naive Ausdruck `customer_id` für eine Tabelle. Mein
erster Versuch meldete prompt **9 Treffer, alle falsch**.

Ein Detektor, der Falschalarm gibt, wird abgeschaltet. Lieber prüft er
weniger. Die Einschränkung steht im Modul, damit sie niemand für ein
Versehen hält.

---

## Zwei Tests, die nichts prüften

Die Mutationsprobe deckte auf, dass zwei meiner eigenen Tests wertlos
waren — beide Mutationen liefen **grün** durch:

**1. Einbettungen ausklammern.** Der Test benutzte `t(a, b)` mit *zwei*
Feldern. Beim Zerlegen an Kommata trägt dort jedes Segment eine Klammer und
wird ohnehin verworfen. Erst ab **drei** Feldern entsteht aus `t(a, b, c)`
ein Segment `b` ganz ohne Klammer — das rutscht durch und sähe aus wie
eine Spalte der äußeren Tabelle. Der Test prüft jetzt diesen Fall.

**2. Die Stern-Abkürzung.** Der Test benutzte `'*, kunde:profiles(a)'`, wo
beide Varianten dasselbe liefern. Dabei fiel auf, dass die Abkürzung auch
**sachlich zu grob** war: `select('*, gibtesnicht')` scheitert sehr wohl —
der Stern macht eine Abfrage nicht unfehlbar. Übersprungen wird jetzt nur
noch ein **reines** `*`.

Nach der Schärfung fällt bei jeder Mutation genau ein Test.

---

## Ein eigener Fehler, offen gelegt

Bei der ersten Gegenprobe habe ich eine Sicherungskopie mit `||`-Fallback
angelegt. Die erste Variante war erfolgreich — in der Sicherung lag
deshalb eine **andere Datei**, und beim Zurückspielen habe ich
`app/kunde/leistungsnachweis/page.tsx` damit überschrieben. Der Typecheck
hat es gefangen (`Property 'default' is missing`), `git checkout` hat es
behoben.

Später habe ich dann `git checkout` auf `lib/schema/spalten.ts` benutzt —
eine Datei mit **uncommitteter** Arbeit aus diesem Block. Damit war die
gerade geschriebene Leseseite weg und musste neu eingefügt werden.

Beides ist folgenlos geblieben, aber es gehört in den Bericht: eine
Sicherung mit Fallback ist keine Sicherung, und `git checkout` ist kein
Rückgängig.

---

## Offen — in Yusufs Hand

Nichts Neues. `pflege_massnahmen_evaluationen` hat weiterhin keine
Kundenbindung (wie `pflege_massnahmen` vor Block 31), **wird vom Portal
aber nicht gelesen** — eine Policy dafür zu schreiben wäre spekulativ.
`npm run verify:portal-bindung` schlägt an, sobald eine `/kunde`-Seite
darauf zugreift. Das ist der richtige Ort dafür.

Unverändert: `CRON_SECRET`, Migrationen `20261105000000`,
`20261115000000`, `20261120000000`, die 26 Bestandszeilen aus Block 35,
das eigene `failed` für `substitution_requests` (Block 37), `mis_kpis`,
Nachweise für die Einsatzfreigabe, Erika Testfalls fehlende
E-Mail-Adresse.
