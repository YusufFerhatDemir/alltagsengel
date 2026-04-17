# Git Hooks — Alltagsengel

Versionierte Pre-Commit-Hooks gegen bekannte Regressions-Muster
(z. B. falsche Rechtsform die veraltete Rechtsform "GmbH" für Alltagsengel).

## Einmalig installieren

```bash
npm run setup:hooks
```

Dadurch werden die Dateien aus `scripts/hooks/*` nach `.git/hooks/` kopiert
und ausführbar gemacht. Da `.git/` nicht in Git eingecheckt ist, muss jeder
Entwickler diesen Schritt nach `git clone` einmal ausführen.

## Was macht der `pre-commit`-Hook?

Er ruft vor jedem `git commit` automatisch:

```bash
npx tsx scripts/lint-forbidden.ts --staged
```

auf. Die geprüften Patterns stehen in `scripts/forbidden-strings.json`.
Wenn ein verbotener String in einer gestageten Datei gefunden wird, wird
der Commit mit Exit-Code 1 abgebrochen und das Problem genau ausgegeben.

## Manueller Voll-Scan (CI)

```bash
npm run lint:forbidden
```

Durchsucht das komplette Repo und bricht mit Exit-Code 1 ab, sobald ein
Muster gefunden wird. Für GitHub-Actions in die Pipeline integrieren.

## Bypass (Notfall)

```bash
git commit --no-verify
```

Bitte nur im echten Notfall nutzen und dann dokumentieren, warum.

## Pattern hinzufügen

`scripts/forbidden-strings.json` bearbeiten und eine Regel mit `id`,
`pattern`, `reason` und optional `allowedReplacements` ergänzen.
Dann:

```bash
npm run lint:forbidden   # prüft, ob das Repo sauber ist
```

## Analogie

Kein Feuermelder (der erst piept, wenn es schon brennt), sondern ein
**Türsteher mit schwarzer Liste**. Namen auf der Liste kommen nicht mehr
rein — weder beim Commit, noch in die Release-Pipeline.
