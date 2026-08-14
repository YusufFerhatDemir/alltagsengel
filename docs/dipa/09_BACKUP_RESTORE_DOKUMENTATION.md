**Stand:** 2026-08-14 · **Zweck:** Ehrlicher Status von Backup und Restore für den Digitalen PflegeCoach — was existiert, was nie erprobt wurde.

# Backup- und Restore-Dokumentation — Digitaler PflegeCoach

## Ergebnis der Prüfung

Es gibt **zwei unterschiedliche Ebenen von "Sicherung"** im Projekt, die nicht
verwechselt werden dürfen:

1. **Datensicherung (Backup der Nutzdaten)** — liegt vollständig bei der
   Hosting-Plattform (Supabase). **Welcher Plan, welche Retention und ob eine
   Rücksicherung funktioniert, ist im Repository nicht dokumentiert und wurde
   laut den Audit-Unterlagen selbst nie erprobt.**
2. **Schema-/Code-Versionierung (Migrationen als Wiederherstellungsmechanismus
   für die Datenbankstruktur)** — ist vollständig vorhanden und diszipliniert
   geführt, deckt aber nur das Schema ab, nicht die Nutzdaten selbst.

---

## 1. Datensicherung durch die Plattform — nicht produktbezogen dokumentiert

`audit/dipa/sicherheitsarchitektur_pflegecoach.md` §4 hält für die
Verschlüsselung im Ruhezustand ausdrücklich fest, dass **alle** Angaben zu
Plattformleistungen — "Hosting, Datenbank, Verschlüsselung im Ruhezustand,
Sicherungskopien" — vor einer Antragstellung zu verifizieren sind und "hier
nicht als gesichert dargestellt" werden.

Es findet sich im Repository **keine Dokumentation**, welcher Supabase-Plan
aktiv ist, welche Backup-Retention gilt oder ob Point-in-Time-Recovery
verfügbar ist. Das ist keine Wissenslücke dieses Dokuments, sondern eine
bestehende Lücke im Projekt selbst — vermerkt in mehreren Quellen:

- `audit/dipa/sicherheitsarchitektur_pflegecoach.md` §7, Schwäche S5:
  **"Kein geprüftes Wiederanlaufkonzept. Sicherung liegt bei der Plattform;
  eine Rücksicherung wurde nie erprobt."** Bewertung: Verfügbarkeitsrisiko,
  kein Vertraulichkeitsrisiko.
- `audit/dipa/risikoanalyse_pflegecoach.md`, R3.4 (Datenverlust): "Verantwortung
  der Datenbankplattform. **Offen:** ein produktbezogenes Wiederanlaufkonzept
  mit geprüfter Rücksicherung fehlt."
- `audit/dipa/risikoakte_pflegecoach.md`, R3.4: Restrisiko bleibt "S3 mittel" —
  eingestuft als "Technik — offen", weil die Rücksicherung nie erprobt wurde.
- `audit/dipa/isms_scope_vorbereitung.md` §2/§3: führt "Rücksicherung nie
  erprobt" als eine der **fünf größten Lücken** des Informationssicherheits-
  Managements und stuft sie ausdrücklich als **intern schließbar** ein (im
  Gegensatz zur Lieferantenverträge-Lücke, die extern ist).

## 2. Was tatsächlich geplant, aber noch nicht erledigt ist

`docs/DIPA_MATRIX_FINAL.md` nennt unter Matrix-Punkt DS-03 (Löschkonzept) als
nächste Aktion: **"Aufbewahrungsfrist der Sicherungen festhalten — hängt an
DS-04"** (der AVV-Kette). Im Abschnitt "Empfohlene Reihenfolge" der Matrix
steht unter Punkt 7 (intern parallel zu erledigende Punkte) ausdrücklich:
**"Rücksicherung erproben"** — als offene interne Aufgabe, bislang nicht
durchgeführt.

**Status: NICHT ERPROBT.** Es gibt keinen Nachweis im Repository, dass eine
Rücksicherung aus einem Backup jemals tatsächlich durchgeführt und protokolliert
wurde.

## 3. Schema-Versionierung als (Teil-)Ersatzmechanismus

Das Datenbankschema des PflegeCoach ist vollständig und nachvollziehbar über
`supabase/migrations/` versioniert:

- `supabase/migrations/20260819010000_pflegecoach_dipa_modul.sql` — Kern
- `supabase/migrations/20260826010000_dipa_freischaltung_nachweise_eul.sql` —
  Freischaltung, Nachweise, ergänzende Leistungen

Zu **jeder** dieser Migrationen existiert im selben Verzeichnis ein
zugehöriges Rollback-Skript (`*_rollback_*.sql`), was projektweit für alle
Migrationen gilt (237 Migrationsdateien im Repository, durchgängig mit
Rollback-Gegenstück).

Zusätzlich existiert eine **Shadow-Datenbank**
(`supabase/shadow/50_pflegecoach_tests.sql`), die das Schema vollständig aus
dem Repository neu aufbaut und gegen 68 automatisierte Zugriffstests prüft.
Das ist ein wirksamer Mechanismus, um zu verifizieren, dass sich das Schema
aus dem Code heraus reproduzieren lässt — **das ist aber keine
Datensicherung**. Es stellt die Struktur wieder her, nicht die tatsächlich
gespeicherten Gesundheitsdaten der Nutzer.

| Mechanismus | Deckt ab | Deckt NICHT ab |
|---|---|---|
| Migrations + Rollback-Skripte | Datenbankstruktur (Schema, Policies, Trigger) | Nutzdaten (Inhalte der Tabellen) |
| Shadow-Datenbank (`supabase-shadow.sh`, `50_pflegecoach_tests.sql`) | Reproduzierbarkeit des Schemas, Zugriffsregeln | Nutzdaten |
| Code-Rollback (`scripts/rollback.sh`) | Anwendungscode | Datenbankinhalte |
| Supabase-Plattform-Backup | vermutlich Nutzdaten — **nicht dokumentiert, nicht erprobt** | — |

## 4. Zusammenfassung

**BLOCKED / OFFEN:**
- Es ist nicht dokumentiert, welche Backup-Konfiguration (Plan, Retention,
  Point-in-Time-Recovery) bei Supabase für dieses Projekt aktiv ist.
- Eine Rücksicherung wurde nie erprobt und nie protokolliert.
- Es existiert kein produktbezogenes Wiederanlaufkonzept (Recovery Time
  Objective / Recovery Point Objective sind für den PflegeCoach nicht
  definiert).
- Eine Aufbewahrungsfrist für Sicherungskopien ist nicht festgelegt — sie
  hängt laut Matrix an der noch fehlenden Auftragsverarbeiter-Dokumentation
  (DS-04).

**VORHANDEN:**
- Vollständige, disziplinierte Schema-Versionierung mit Rollback-Skript zu
  jeder Migration.
- Eine Shadow-Datenbank, die das Schema reproduzierbar aus dem Repository
  aufbaut und gegen automatisierte Tests prüft.
- Code-seitiger Rollback-Mechanismus (`scripts/rollback.sh`, Revert statt
  Reset).

**Nächster sinnvoller Schritt (laut Matrix als intern lösbar eingestuft):**
Eine Rücksicherung tatsächlich einmal vollständig durchführen und
protokollieren — das schließt zugleich das in der Risikoakte offene Risiko
R3.4.

---

## Quellen

- `audit/dipa/sicherheitsarchitektur_pflegecoach.md` §4, §7 (Schwäche S5)
- `audit/dipa/risikoanalyse_pflegecoach.md` (R3.4)
- `audit/dipa/risikoakte_pflegecoach.md` (R3.4)
- `audit/dipa/isms_scope_vorbereitung.md` §2, §3, §5
- `docs/DIPA_MATRIX_FINAL.md` (DS-03, "Empfohlene Reihenfolge" Punkt 7)
- `supabase/migrations/` (Verzeichnisinhalt, Migrations- und Rollback-Dateien)
