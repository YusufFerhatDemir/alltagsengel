# DELTA CHANGELOG — 12.09.2026

**Von:** MASTER_CONTINUATION_12_09_2026 (18 Sektionen)
**Nach:** MASTER_NEXT_EXECUTION_12_09_2026 (28 Sektionen)

---

## Neue Commits (seit MASTER_CONTINUATION)

| Repo | Commit | Inhalt |
|---|---|---|
| AE | b136c9d9 | Security Remediation, lint:pii, Priority Inbox Logik, ci-secret-scan |
| AE | 992adadb | Korb-UI /admin/posteingang, Deep-Links, Warnkasten |
| AE | 909110b6 | .gitignore-Fix (Negation-Bug), Marketing-DB-Adapter (14 Tests) |
| CM | da6af5f | Verification Migration, Cancellation/Dispute/Invoice Module, secret-scan.sh |
| efy | 3ab78a6 | Mitarbeiterportal (5 Tabellen, 48 Tests), Touren-Erweiterungen |

---

## Neue Tabellen

| Tabelle | Repo | Migration |
|---|---|---|
| stornierungen | CM | da6af5f |
| streitfaelle | CM | da6af5f |
| rechnungen | CM | da6af5f |
| rechnungspositionen | CM | da6af5f |
| qualifikationen | efy | 20260912050000 |
| mitarbeiter_dokumente | efy | 20260912050000 |
| abwesenheiten | efy | 20260912050000 |
| krankmeldung_belege | efy | 20260912050000 |
| urlaubskonten | efy | 20260912050000 |

---

## Neue Module / Features

| Modul | Repo | Tests |
|---|---|---|
| Priority Inbox (7 Körbe) | AE | 15 |
| Korb-UI + Deep-Links | AE | — (UI, typecheck+build grün) |
| Marketing-DB-Adapter | AE | 14 |
| lint:pii (CI-blockierend) | AE | Gegenprobe |
| .gitignore Härtung (30 Muster) | AE | beidseitig |
| Cancellation-Modul | CM | 29 (gesamt Funnel) |
| Dispute-Modul | CM | — (in 29) |
| Invoice-Modul | CM | — (in 29) |
| Verification Migration (legacy_verified + tier) | CM | 35 |
| secret-scan.sh (Vollbaum) | CM | CI-integriert |
| Mitarbeiterportal (5 Tabellen) | efy | 48 |
| Tour-Distanz (distanz_meter) | efy | in 2650 |
| Tour-Konflikte (Überschneidung/Koordinaten/Abwesenheit) | efy | in 2650 |

---

## Statusänderungen

| Was | Vorher (CONTINUATION) | Nachher (NEXT_EXECUTION) |
|---|---|---|
| efy Touren-Basis | Unklar / NOT_IMPLEMENTED | VERIFIED_LOCAL |
| efy DRIVE_TIME | NOT_IMPLEMENTED | PARTIAL |
| efy Mitarbeiterportal | NOT_IMPLEMENTED | VERIFIED_LOCAL |
| efy Urlaub/Krankmeldung | NOT_IMPLEMENTED | VERIFIED_LOCAL |
| efy Leistungsnachweis | — | NOT_IMPLEMENTED (bewusste Entscheidung) |
| AE Priority Inbox | Nicht erwähnt | VERIFIED_LOCAL + VERIFIED_LIVE (50/50) |
| AE Marketing-DB | Engine ohne DB | Engine + DB-Adapter (14 Tests) |
| AE .gitignore | Gehärtet (mit Bug) | Gehärtet (Bug behoben) |
| CM Verification | Committed (ee4d935) | Erweitert: legacy_verified + CHECK constraints |
| CM Booking Funnel | Stufen 1-3,6,7 dokumentiert | + Cancellation/Dispute/Invoice Module gebaut |
| CM Secrets | Kein Fund | Fremder Key gefunden + entfernt |
| Security lint:pii | Nicht vorhanden | Blockierend in CI |
| Security secret-scan | Nicht vorhanden (CM) | Vollbaum-Scan in CI |

---

## Neue Security-Befunde

| Befund | Schwere | Status |
|---|---|---|
| Fremder Supabase-Key (vlrviyrgggzhayepfmop) in CM index_legacy.html seit 08.03. | HIGH | Code entfernt, Key-Rotation pending |
| .gitignore Negation-Bug (!*.ts hebt vorherige Regeln auf) | MEDIUM | Behoben (909110b6) |

---

## Neue USER_ACTION_REQUIRED (seit CONTINUATION)

| # | Neu |
|---|---|
| 1 | Birgit Fritzsch antworten (11880-Lead, Demenz/Bruchköbel) |
| 2 | Mohamed Semmami Bewerbung bearbeiten |
| 3 | Vercel Auth Settings für CM fixen |
| 4 | Europcar Zahlungserinnerung |
| 5 | Qonto Kontostand prüfen |
| 6 | efy 5 zusätzliche Migrationen einspielen (vorher 3, jetzt 5 READY_TO_APPLY + 1 LIVE) |

---

## Neue BUSINESS_DECISION_REQUIRED (seit CONTINUATION)

| # | Neu |
|---|---|
| 1 | CM Rechnungsstellung: UStG-Regel (§4 Nr. 12 / 19% / §19)? |
| 2 | efy Leistungsnachweis: digital vs. dokumentbasiert (3 Fragen) |

---

## Testzahlen-Delta

| Repo | Vorher | Nachher | Delta |
|---|---|---|---|
| AE | 9 Lints grün | 9 Lints + lint:pii grün | +lint:pii |
| CM | ~1900 | 1930 | +30 |
| efy | 2590 | 2650 | +60 |

---

*Erstellt: 12.09.2026*
