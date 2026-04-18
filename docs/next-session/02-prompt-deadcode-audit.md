# Prompt 2 — Dead-Code-Audit (Code + DB)

**Zweck:** Nach Abschluss von Prompt 1 (P1-Roadmap) soll eine neue Session einen umfassenden Dead-Code-Audit fahren — im Code UND in der Supabase-Datenbank.

---

## Wann diesen Prompt verwenden?

**Nicht gleichzeitig mit Prompt 1.** Warte, bis Prompt 1 komplett abgearbeitet und gepusht ist. Dann in einer NEUEN Session Prompt 2 verwenden.

**Grund:** Dead-Code-Audit läuft über die ganze Codebase und Datenbank — das ist ein Marathon. Wenn du das mit Implementierungs-Arbeit mischst, wird keines von beidem sauber gemacht.

---

## Anleitung zur Nutzung

1. Neue Session in Cowork (`+ New task`).
2. Ordner `alltagsengel` auswählen.
3. Modell: **Claude Opus 4.7**.
4. Extended Thinking: **High**.
5. Prompt-Block unten **1:1 kopieren**.

---

## Der Prompt (zum Kopieren)

```
Projekt: AlltagsEngel.care (Next.js 14 App Router + Supabase + Capacitor)

KONTEXT LADEN:
1. docs/next-session/00-STATUS-HANDOVER.md
2. CLAUDE.md (Projekt-Regeln)
3. package.json (dependencies + scripts)

AUFGABE:
Umfassender Dead-Code-Audit über die GESAMTE Codebase UND die Supabase-Datenbank. Keine Code-Änderungen in dieser Session — nur Analyse und Reports.

ARBEITSWEISE — PARALLEL mit Agent-Teams:

Agent-Team 1 (Code-Audit Frontend):
 - Durchsuche /app, /components, /hooks, /lib nach:
   * Ungenutzten Exports (export function / export default, aber nirgendwo importiert)
   * Ungenutzten Imports in Dateien
   * Nie gerenderten Komponenten
   * Utility-Funktionen ohne Aufrufer
   * Toten Props (Interface-Felder nie gelesen)
   * console.log / debugger die im Prod liegen
 - Nutze: ts-prune, depcheck, oder manuelle grep-Muster
 - Ausgabe: docs/audit/DEAD_CODE_FRONTEND.md

Agent-Team 2 (Code-Audit Backend/API):
 - Durchsuche /app/api nach:
   * Nie aufgerufenen Endpoints (kein fetch/axios-Call im Frontend gefunden)
   * Verwaisten Route-Handlern
   * Ungenutzten Middleware-Funktionen
   * /lib-Utilities nur für API genutzt, aber nicht mehr von API aufgerufen
 - Kreuz-Check: Welche Endpoints tauchen im Frontend auf? Welche werden nur von Supabase Edge Functions genutzt?
 - Ausgabe: docs/audit/DEAD_CODE_BACKEND.md

Agent-Team 3 (DB-Audit via Supabase MCP):
 - Via mcp__7c09e07f-...-list_tables: alle Tabellen listen
 - Via mcp__7c09e07f-...-execute_sql: 
   * Ungenutzte Tabellen (row_count = 0 UND keine Foreign-Key-Referenzen)
   * Spalten die nirgendwo im Code referenziert sind (grep nach Spalten-Name)
   * Views ohne Query-History
   * Funktionen/Stored-Procedures die nirgendwo aufgerufen werden
   * RLS-Policies auf gelöschten Tabellen / für nicht mehr existierende Rollen
 - Via mcp__7c09e07f-...-list_migrations: Migrationen identifizieren die Dinge erzeugt haben, die nie genutzt wurden
 - Ausgabe: docs/audit/DEAD_CODE_DATABASE.md

Agent-Team 4 (Assets + Dependencies):
 - /public/* auf ungenutzte Bilder, Icons, Fonts prüfen
 - package.json dependencies mit `depcheck` oder `ncu` abgleichen — welche werden nirgendwo importiert?
 - /archive-Ordner: was davon kann weg?
 - Ausgabe: docs/audit/DEAD_CODE_ASSETS.md

MASTER-REPORT:
Nach Abschluss aller 4 Team-Audits: docs/audit/DEAD_CODE_MASTER.md mit:
 - Executive Summary (# Treffer pro Kategorie)
 - Priorisierung: sicher-zu-löschen / unsicher-investigate / behalten
 - Risiko-Matrix: pro Fund → Wahrscheinlichkeit dass Löschung etwas bricht (low/med/high) × Impact wenn doch gebraucht (low/med/high)
 - Empfohlene Reihenfolge der Bereinigung
 - Geschätzte Einsparung: LOC, Bundle-Size, DB-Größe

RICHTLINIEN:
- Keine Code-Löschung. Kein Commit. Nur Reports.
- Bei Unsicherheit: "investigate" markieren, nicht "delete".
- Ältere Migrations NICHT als "dead code" markieren — sie sind historischer Verlauf, nicht Ausführung.
- Feature-Flags / A/B-Tests nicht als tot markieren, auch wenn gerade deaktiviert.
- Sprach-Dateien (i18n) nicht als tot markieren, wenn Sprache aktuell nicht aktiv ist.

AM ENDE:
Präsentiere mir den Master-Report. Ich entscheide dann, was gelöscht wird — du darfst NICHTS ohne meine explizite Freigabe entfernen.

KEINE FRAGEN WÄHREND DER ANALYSE — arbeite durch, präsentiere am Ende.
```

---

## Erwartete Deliverables

```
docs/audit/
├── DEAD_CODE_FRONTEND.md    (Team 1)
├── DEAD_CODE_BACKEND.md     (Team 2)
├── DEAD_CODE_DATABASE.md    (Team 3)
├── DEAD_CODE_ASSETS.md      (Team 4)
└── DEAD_CODE_MASTER.md      (zusammengefasst + priorisiert)
```

---

## Was du danach tust

1. **Master-Report in Ruhe lesen** — 20-30 Minuten.
2. Entscheiden: welche Punkte sind wirklich weg-kandidaten, welche bleiben?
3. **Eine NEUE Session** öffnen mit dem Folge-Prompt:
   > „Arbeite `docs/audit/DEAD_CODE_MASTER.md` ab — aber NUR die Punkte die ich grün markiert habe. Für jeden Punkt: Löschung, Verify-Step (Build, Tests), Commit, Push."

**Analogie:** Die Audit-Session ist wie ein Inventurbuch. Die Folge-Session ist der Aufräum-Tag. Nie beides gleichzeitig — sonst räumt man das Falsche weg.

---

## Warum der Audit wichtig ist

Über Monate sammelt sich in jedem Projekt „Sediment" an:
- Alte Proof-of-Concepts die nie produktiv gingen
- Abandoned Features (z.B. eine nicht fertig gebaute Chat-Funktion)
- Verwaiste DB-Tabellen von Migrationen die später revertiert wurden
- NPM-Pakete die mal getestet, aber nie eingebaut wurden

**Kosten von Dead Code:**
- Längere Build-Zeiten
- Größere Bundle-Size → langsamere App → schlechtere Lighthouse-Scores → schlechtere SEO
- Kognitive Last für Entwickler (der Nächste denkt „was macht die Datei?")
- Security-Angriffsfläche (ungepflegte Endpoints sind Angriffsziel)
- DB-Backup-Größe und Kosten

**Analogie:** Ein Dachboden voller nie genutzter Kartons. Einzeln harmlos, zusammen machen sie das Haus schwerer, heizen teurer, und im Brandfall ist der Überblick weg.
