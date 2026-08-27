# Migration 20261010000006 — `kim_audit_log.aktion = 'anhang_abgewiesen'`

**Stand: 27.08.2026 · Projekt `nnwyktkqibdjxgimjyuq` · Ergebnis: LIVE_VERIFIZIERT (bereits angewendet)**

## Ausgangslage

Die Migration `supabase/migrations/20261010000006_kim_audit_anhang_abgewiesen.sql`
galt intern als „im Repo, aber nicht auf Production". Sie erweitert den
CHECK-Constraint `kim_audit_log_aktion_check` um den Wert `anhang_abgewiesen`
— die Aktion, die `lib/kim/inbox-service.ts` protokolliert, wenn ein
eingehender KIM-Anhang die Prüfung nicht besteht und verworfen wird.

Ohne die Migration wäre der Verwurf weiterhin wirksam (der Anhang wird
verworfen, der Postfach-Abruf läuft weiter), aber `writeKimAuditLog()` ist
fail-soft: der Audit-Eintrag wäre still weggefallen.

## Inhaltliche Prüfung

| Frage | Befund |
| --- | --- |
| DDL? | Ja — `ALTER TABLE … DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`. |
| Destruktiv? | Nein. Keine `DROP TABLE`/`DROP COLUMN`, keine `UPDATE`/`DELETE`, keine Datenänderung. |
| Rückwärtskompatibel? | Ja. Der neue Constraint ist eine **Erweiterung**: alle 15 bisher erlaubten Werte bleiben erlaubt, `anhang_abgewiesen` kommt hinzu. Bestandszeilen können den Constraint nicht verletzen. |
| Idempotent? | Ja — `DROP CONSTRAINT IF EXISTS` vor dem `ADD`. |
| Rollback nötig? | Nein. Ein Rückbau würde nur dann etwas ändern, wenn bereits Zeilen mit dem neuen Wert existieren — und würde dann fehlschlagen statt Daten zu verlieren. |

## Anwendung

**Nicht durch den Agent anwendbar, war aber auch nicht nötig — der Constraint
ist live bereits im neuen Stand.**

Zwei getrennte Befunde:

1. **Supabase-MCP steht in dieser Session nicht zur Verfügung.** Es gibt in
   diesem Repo keinen MCP-Zugang und kein `DATABASE_URL`; der einzige Weg zur
   Live-DB ist PostgREST mit dem `service_role`-Schlüssel.
2. **`service_role` darf in diesem Projekt kein DDL.** `scripts/apply-migration.mjs`
   prüft das vorab und bricht ab:

   ```
   ABBRUCH: Rolle "service_role" darf in diesem Projekt kein DDL ausfuehren.
   (kein CREATE auf schema public, kein Mitglied von "postgres";
    alle Objekte in public gehoeren "postgres")
   ```

   Der Weg für DDL bleibt der Supabase-SQL-Editor (läuft als `postgres`).

## Live-Verifikation (27.08.2026)

Beide Prüfungen liefen über die Lese-Sonde `public._run_sql` (Ergebnis per
`RAISE EXCEPTION`, dadurch wird die Transaktion zugleich zurückgerollt).

**1. Constraint-Definition auf Production**

```
CHECK ((aktion = ANY (ARRAY['erstellt', 'bearbeitet', 'gesendet', 'sendefehler',
  'zugestellt', 'gelesen', 'storniert', 'wiederholt', 'empfangen',
  'anhang_hochgeladen', 'anhang_heruntergeladen', 'adresse_angelegt',
  'adresse_geaendert', 'adresse_verifiziert', 'provider_konfiguriert',
  'anhang_abgewiesen'])))
```

`anhang_abgewiesen` ist enthalten — der Ziel-Stand der Migration ist erreicht.

**2. Schreibprobe (eingefügt und zurückgerollt)**

```
PROBE|schreibtest=AKZEPTIERT |zeilen_inkl_probe=1 |rollback=ja
```

Ein `INSERT` mit `aktion = 'anhang_abgewiesen'` wird von der Datenbank
angenommen (kein `23514`). Die Zeilenzahl von 1 *einschließlich* der Probe
heißt zugleich: bis heute wurde live **noch kein** eingehender Anhang
abgewiesen — die Audit-Spur ist scharf, aber unbenutzt.

## Konsequenz

* Migration 20261010000006 ist **auf Production angewendet**. Kein weiterer
  Schritt nötig.
* Die interne Notiz „Migration offen" war überholt und ist damit erledigt.
## Mitgeprüft: 20261012000000 (Nachtdienst-Fix auf `assignments`)

Bei der Gelegenheit gegengeprüft, weil auch diese Migration intern als „offen"
geführt wurde. Sie ist **ebenfalls live**:

* `pg_proc.prosrc` von `public.check_assignment_overlap()` enthält die
  Minutenrechnung über den Tageswechsel (`+ 1440`), den Suchraum
  `assignment_date - 1 … + 1`, den Wochentags-Versatz über `% 7` (Sonntag
  als 0 UND 7) und den Riegel `z.dauer > 0` für Null-Einsätze.
* Länge des Live-Rumpfes: **2985 Zeichen** — zeichengleich mit dem
  Repo-Stand, wenn man dessen reine `--`-Kommentarzeilen abzieht
  (3257 mit, 2985 ohne). Angewendet wurde also derselbe Code über einen Weg,
  der die Kommentarzeilen entfernt hat; fachlich ist kein Unterschied übrig.
