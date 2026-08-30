# DiPA Regulatorischer Blocker-Status

**Stand: 30.08.2026 — abgeleitet aus DIPA_REALITY_CHECK.md, Anforderungskatalog und Production-DB**

## Zulassungsblocker — Eingangsdokumente (OHNE DIESE KEIN ANTRAG)

| # | Anforderung | Kennung | Status | Zuständig |
|---|-------------|---------|--------|-----------|
| 1 | **TR-03161 Datensicherheitszertifikat** | AK-SEC-01 | **FEHLT** | BSI-anerkannte Prüfstelle |
| 2 | **ISO 27001 / ISMS Zertifikat** | AK-SEC-05 | **FEHLT** | DAkkS-akkreditierte Stelle |
| 3 | **Wissenschaftliches Evaluationskonzept** | AK-NN-01 | **FEHLT** | Wissenschaftliche Einrichtung |

## Behördliche Verfahren

| # | Anforderung | Status | Zuständig | Anmerkung |
|---|-------------|--------|-----------|-----------|
| 4 | **BfArM-Antrag** | **FEHLT** | BfArM | Vorbereitungspaket fertig (`BFARM_BERATUNG_PAKET.md`), kein Antrag eingereicht |
| 5 | **BfArM-Verzeichniseintrag** | **FEHLT** | BfArM | Erst nach Antragsprüfung (3 Monate Frist ab vollständigem Antrag) |
| 6 | **GKV-SV Vergütungsverhandlung** | **FEHLT** | GKV-Spitzenverband | Erst nach BfArM-Listung |
| 7 | **BSI TR-03161 Konformität** | **FEHLT** | BSI / Prüfstelle | Prüfung extern zu beauftragen |

## Interne technische Anforderungen

| Klasse | Gesamt | Offen | Status |
|--------|--------|-------|--------|
| A — Intern erledigt | 25 | 0 | **VORHANDEN** |
| B — Intern umsetzbar (technisch) | 4 | 0 | **VORHANDEN** |
| C — Intern erstellbar (Dokumentation) | 7 | 4 | **TEILWEISE** |
| D — Externer Dienstleister nötig | 8 | 8 | **FEHLT** |
| E — Behörde/Kostenträger nötig | 4 | 2 | **FEHLT** |

## Klasse C — Offene GF-Entscheidungen (4 Stück)

| # | Was | Status | Zuständig |
|---|-----|--------|-----------|
| 1 | Unterzeichnete DSFA + AVV-Kette | **FEHLT** | Geschäftsführung + DSB |
| 2 | Support-Zusage (24-h-Frist) | **FEHLT** | Geschäftsführung |
| 3 | Nutzungsbedingungen Selbstzahler (final) | **FEHLT** | Kanzlei |
| 4 | Entscheidung Vergütung/Abrechnungsweg | **FEHLT** | Geschäftsführung |

## Klasse D — Externe Nachweise (8 Stück, alle FEHLT)

| # | Nachweis | Kennung | Status | Geschätzte Dauer |
|---|----------|---------|--------|-----------------|
| 1 | TR-03161-Zertifikat | AK-SEC-01 | **FEHLT** | 2–4 Monate |
| 2 | ISO-27001-Zertifikat | AK-SEC-05 | **FEHLT** | 6–12 Monate |
| 3 | Wiss. Evaluationskonzept | AK-NN-01 | **FEHLT** | 1–3 Monate |
| 4 | Externer Penetrationstest | AK-SEC-04 | **FEHLT** | 1–2 Monate |
| 5 | Summative Gebrauchstauglichkeit | AK-BF-02 | **FEHLT** | 1–2 Monate |
| 6 | Pflegefachliche Inhaltsfreigabe | AK-QI-01 | **FEHLT** | 1 Monat |
| 7 | Lizenzierte Erhebungsinstrumente | AK-QI-02 | **FEHLT** | variabel |
| 8 | Screenreader-Protokoll | AK-BF-03 | **FEHLT** | intern machbar |

## Zusammenfassung per Stelle

| Stelle | Relevante Anforderungen | Status |
|--------|------------------------|--------|
| **TR-03161** | Datensicherheitszertifikat (AK-SEC-01) | **FEHLT** — extern zu beauftragen |
| **ISO 27001** | ISMS-Zertifikat (AK-SEC-05) | **FEHLT** — extern zu beauftragen, 6–12 Mon. |
| **BfArM** | Antrag, Beratungstermin, Verzeichniseintrag | **FEHLT** — Vorbereitungspaket fertig, kein Antrag eingereicht |
| **GKV-SV** | Vergütungsverhandlung | **NICHT ANWENDBAR** — erst nach BfArM-Listung |
| **BSI** | TR-03161-Konformitätsprüfung | **FEHLT** — Prüfstelle nicht beauftragt |

## Production-Sicherung

| Schalter | Wert | Beweis |
|----------|------|--------|
| COACH_DIPA_MODUS | nicht gesetzt (= aus) | Env-Register, kein Wert in Production |
| COACH_PREISE_FREIGEGEBEN | nicht gesetzt (= aus) | Env-Register |
| verkauf_moeglich | false | `/api/coach/tarife` Response |
| coach_users Zeilen | 0 | Production-DB-Query |

## Zeitliche Einschätzung

Frühestmöglicher BfArM-Verzeichniseintrag: **Mitte bis Ende 2027**, nur wenn externe Aufträge zeitnah vergeben werden. Engpass: ISO 27001 (6–12 Monate).

## Bewertung

**TECHNICALLY VERIFIED** — 34/48 Anforderungen intern erfüllt (71%). Regulatorisch FEHLT: 0/3 Eingangsblocker vorhanden. Kein BfArM-Antrag eingereicht. DiPA-Modus in Production AUS. Kein Verkauf möglich. 0 Nutzer.
