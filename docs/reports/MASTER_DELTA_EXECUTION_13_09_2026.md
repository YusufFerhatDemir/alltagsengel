# MASTER — Konsolidierung + Kritische Absicherung
## 13.09.2026

**Drei Produkte · Kein neues Feature · Jede Aussage markiert.**
Legende: `VERIFIED_LIVE` · `VERIFIED_LOCAL` · `DOCUMENT_VERIFIED` · `INFERRED` · `UNKNOWN`

---

## A · Security P0

### Alltagsengel

| Frage | Ergebnis | Marke |
|---|---|---|
| Repo PUBLIC? | **Ja** — anonym HTTP 200, forks=0 | VERIFIED_LIVE |
| Sensible Dateien abrufbar? | **8 Fundstellen** (4 Dokumente, je doppelt): 2× Führungszeugnis, 2× Berufsurkunde, 2× IK-Bestätigung, 2× Haftpflicht-Police | VERIFIED_LIVE |
| Führungszeugnis seit wann öffentlich? | seit 10.08.2026 — **über 1 Monat** | VERIFIED_LIVE |
| Secrets im Baum? | **Sauber** — ci-secret-scan exit 0 | VERIFIED_LOCAL |
| Secrets in Historie? | 7 JWTs, alle `role=anon`, **kein** `service_role` | VERIFIED_LOCAL |
| Key-Rotation nötig? | **NEIN** — nur anon-Keys | VERIFIED_LOCAL |

**Klassifizierung:**
- **REPO_PRIVATE_REQUIRED** — Ja, sofort (schließt alle 8 Fundstellen)
- **DOCUMENT_REMOVAL_REQUIRED** — Ja (unabhängig von Repo-Sichtbarkeit)
- **HISTORY_CLEANUP_REQUIRED** — Bedingt (nur bei erneuter Öffentlichkeit)
- **KEY_ROTATION_REQUIRED** — Nein

### ChairMatch

| Frage | Ergebnis | Marke |
|---|---|---|
| Repo PUBLIC? | **Ja** — anonym HTTP 200 | VERIFIED_LIVE |
| .env-Dateien abrufbar? | **Nein** — alle 404 | VERIFIED_LIVE |
| Fremder Key (`vlrviyrgggzhayepfmop`) im Baum? | **Nein** | VERIFIED_LOCAL |
| Fremder Key in Historie? | **Ja**, anonym abrufbar | VERIFIED_LIVE |
| Fremder Key noch gültig? | **Ja** — auth/v1/health HTTP 200 | VERIFIED_LIVE |
| Eingebracht | `e9de001` am 05.03.2026 (nicht 08.03. wie zuvor berichtet) | VERIFIED_LOCAL |

**Klassifizierung:**
- **KEY_ROTATION_REQUIRED** — Ja, dringend (Key lebt)
- **REPO_PRIVATE_REQUIRED** — Als Entscheidung, nicht automatisch
- **HISTORY_CLEANUP_REQUIRED** — Formal, aber nachrangig nach Rotation

### efy care

Kein öffentliches Repo — keine Security-P0-Befunde.

---

## B · §45a Genehmigung — Frist und Primärquelle

**Einzige Primärquelle:** `Rueckmeldung-Behoerde-2026-07-08.docx`

| Angabe | Wert | Marke |
|---|---|---|
| Aktenzeichen | 51.D24.12 | DOCUMENT_VERIFIED |
| Absender | Der Magistrat, Amt 51, Frau Krause | DOCUMENT_VERIFIED |
| Originalfrist | **31.08.2026** | DOCUMENT_VERIFIED |
| 7 Nachforderungen | Führungszeugnisse, Gewerbeanmeldung, ARGE/IK, Konzept, Versicherung, Kostenübersicht, Erhebungsbogen | DOCUMENT_VERIFIED |
| Verlängerung beantragt? | Entwurf existiert (bis 10.10.2026) | DOCUMENT_VERIFIED |
| Verlängerung versendet? | **UNKNOWN** | UNKNOWN |
| Verlängerung bewilligt? | **UNKNOWN** | UNKNOWN |
| Aktueller Verfahrensstand | **UNKNOWN** | UNKNOWN |

**Korrektur:** Mein Bericht vom 12.09. sagte „Frist abgelaufen". **Zurückgezogen** — die Fristablauf ist belegt, aber eine mündliche Verlängerung wäre wirksam und wird in einem eigenen Entwurf erwähnt. Status ist UNKNOWN, nicht „abgelaufen".

**Erhebungsbogen:** War als MISSING geführt — **korrigiert**: liegt vollständig in `~/Downloads` seit 17.07.2026, 41 Formularfelder. Die Repo-Kopie ist eine Cloudflare-Sperrseite.

**Telefonleitfaden** für Frau Krause (069/212-33607) liegt in `GENEHMIGUNG_FRIST_PRIMAERQUELLE_LATEST.md`. Vier Fragen: Verfahren offen? Unterlagen fehlen? Frist? Nachreichung?

---

## C · Preis — Source of Truth

### PfluV-Deckel jetzt aus Rechtsquelle belegt

| Betrag | Bedeutung | Rechtsgrundlage | Gültig bis | Marke |
|---|---|---|---|---|
| **30 €/Std** | Höchstentgelt Betreuung, **brutto inkl. USt** | PfluV § 1 Abs. 1 Nr. 12 a | 31.12.2026 | DOCUMENT_VERIFIED (mit Vorbehalt) |
| **25 €/Std** | Höchstentgelt Entlastung, **brutto inkl. USt** | PfluV § 1 Abs. 1 Nr. 12 b | 31.12.2026 | DOCUMENT_VERIFIED (mit Vorbehalt) |

**Vorbehalt:** Die Fassung im Haus reicht bis 31.12.2024. Die Verlängerung bis 31.12.2026 ist durch Ministerialschreiben belegt. Ob die angekündigte Neufassung (1. Halbjahr 2026) die Beträge geändert hat: UNKNOWN.

**Drei Feinheiten**, die in der DB-Tabelle fehlen:
1. Grenze ist **brutto** inkl. USt
2. **Alle Nebenkosten** zählen mit (außer Fahrtkosten)
3. Es ist eine **Anerkennungsvoraussetzung** — Überschreiten gefährdet die Anerkennung selbst

### Der echte Konflikt

Kassentarife stehen auf **35 €** (blocked). PfluV-Deckel liegt bei **30/25 €**. Am Tag der Anerkennung wären die Tarife 5–10 € zu hoch. Entgelte über der Grenze **stehen der Anerkennung entgegen**.

### BUSINESS_DECISION_REQUIRED (6 Punkte)

1. Kassentarife auf ≤ 30/25 € anpassen — **vor** der Anerkennung
2. Eine Vergütungsaussage festlegen (drei verschiedene live: 15–25€, 18–22€, 18–24€)
3. 30 €/Std in Anlage-07 (Behördenantrag)
4. Investorenseiten: 35 oder 40 €/h
5. NATIVE_FALLBACK_HOURLY_RATE unter den Deckel
6. `leistungspreise` stilllegen oder verifizieren

---

## D · ATS — Operative Übersicht

**36 Bewerbungen**, alle `status=new`, keine bearbeitet, keine Wiedervorlage.

### PRIO1 (5 Personen)

| Name | PLZ | Qualifikation | Fehlende Info | Kanal |
|---|---|---|---|---|
| Ziyana Filote | 63743 | Pflegefachkraft | Erfahrung, Startdatum, FZ | Tel + **E-Mail** |
| Claudia Adjovi | 63739 | Pflegehelfer/in, 8 Jahre | Startdatum, FZ, Führerschein | Tel |
| Sotiris Tiropoulos | 60326 | Alltagsbegleiter/in (§ 45b) | Erfahrung, Startdatum, FZ | Tel |
| michelle Gruber | 55124 | Pflegehelfer/in | Erfahrung, Startdatum, FZ | Tel |
| Francesca L. Potočan | 63457 | Betreuungskraft (§ 53b) | Erfahrung, Startdatum, FZ | Tel |

**PRIO2:** 29 · **PRIO3:** 1 · **NEEDS_INFO:** 1

**Datenlücke:** Durchschnitt 5,4 von 16 Merkmalen. Startdatum und erw. Führungszeugnis fehlen strukturell (kein Formularfeld).

**Mohamed Semmami:** Nicht in DB (VERIFIED_LIVE). Ursprung: Strato-Mail (INFERRED). Kein Datensatz angelegt.

---

## E · Kunden-Leads — Aktionsliste

| # | Name | Prio | Alter | Nächste Aktion | Status |
|---|---|---|---|---|---|
| 1 | Maike Reichert | **P1** | 12 T | Anrufen — 2× vergeblich um Rückruf gebeten | CALL_REQUIRED |
| 2 | Manthey Ickenroth | **P1** | 34 T | Anrufen — Bedarfsfenster nach Herz-OP jetzt offen | CALL_REQUIRED |
| 3 | Uwe Büttner | P2 | 43 T | Anrufen — Bayern, Selbstzahler klären | CALL_REQUIRED |
| 4 | Darleen Suhe | P2 | 59 T | Anrufen — kein Bedarf bekannt | CALL_REQUIRED |
| 5 | Birgit Fritzsch | P1 | UNKNOWN | 11880-Portal freischalten | BLOCKED_EXTERNAL |
| 6 | Sarune Veitaite | UNKNOWN | UNKNOWN | Herkunft klären | UNKNOWN |

**Alle 4 DB-Einträge:** `status=new`, keine Wiedervorlage, keine E-Mail — nur Telefon.

**Struktureller Befund:** 3 von 6 Personen sind dem Unternehmen bekannt, dem System nicht (Fritzsch, Veitaite, Semmami). Ursache: Kanäle ohne Rücklaufweg.

---

## F · Vercel-Blocker

### ChairMatch

| Frage | Antwort | Marke |
|---|---|---|
| Production gesund? | **PRODUCTION_HEALTHY** — kein fehlerhafter Deploy belegt | VERIFIED_LIVE |
| Welcher Commit live? | UNKNOWN — kein VERCEL_TOKEN, Header nennen keinen Commit | UNKNOWN |
| Zweites Deploy-Ziel? | **GitHub Pages aktiv** — HTTP 200, indexierbar, eigener Canonical | VERIFIED_LIVE |

**Klassifizierung: DEPLOY_PIPELINE_PARTIAL**

**Notbremse eingebaut:** `robots.txt` in Repo-Wurzel → Pages: `Disallow: /`, www.chairmatch.de: unverändert `Allow: /` (VERIFIED_LIVE).

### Drei Klicks für Yusuf

1. **Key rotieren:** Supabase Dashboard → Projekt `vlrviyrgggzhayepfmop` → Settings → API → neuen Key generieren
2. **Pages abschalten:** GitHub → chairmatch → Settings → Pages → Source: „None"
3. **spatial_ref_sys-Migration:** Supabase SQL-Editor, danach `anon-perimeter-probe.sh` bis exit 0

---

## G · Migrationen

### efy care — 9 Migrationen

| Status | Anzahl |
|---|---|
| VERIFIED_LIVE | 1 |
| READY_TO_APPLY | 7 |
| UNKNOWN | 1 (nicht von außen prüfbar) |
| BLOCKED | **0** |

Alle 9 idempotent bestätigt (VERIFIED_LOCAL). Reihenfolge zwingend aufsteigend.

### ChairMatch — spatial_ref_sys

Transaktions-Fix committed. SQL-Blöcke für den Editor stehen bereit. USER_ACTION_REQUIRED (Supabase SQL-Editor).

---

## H · Regressions-Check — alle drei grün

| Produkt | Tests | Typecheck | Build | Commit |
|---|---|---|---|---|
| Alltagsengel | 10.460 vitest + 2.770 node:test | 0 Fehler | ✓ | c2255007 |
| ChairMatch | 1.987 | 0 Fehler | ✓ | 49de127 |
| efy care | 2.696 + 30 skipped | 0 Fehler | ✓ | a7dc846 |

---

## I · USER_ACTION_REQUIRED — Zusammenfassung

| # | Aktion | Produkt | Dringlichkeit |
|---|---|---|---|
| 1 | **AE-Repo auf privat stellen** | Alltagsengel | **SOFORT** — PII seit >1 Monat öffentlich |
| 2 | **Frau Krause anrufen** (069/212-33607) — Leitfaden liegt bereit | Alltagsengel | **HOCH** — Verfahrensstand UNKNOWN |
| 3 | **CM-Key rotieren** im Supabase-Dashboard | ChairMatch | **HOCH** — Key ist noch gültig |
| 4 | **GitHub Pages abschalten** | ChairMatch | HOCH — indexierbares Duplikat |
| 5 | **Preisentscheidung:** Kassentarife ≤ 30/25 € | Alltagsengel | Vor Anerkennung |
| 6 | **Vergütungsaussage vereinheitlichen** (3 verschiedene live) | Alltagsengel | HOCH |
| 7 | **Kunden anrufen:** Reichert (P1), Ickenroth (P1), Büttner, Suhe | Alltagsengel | Reichert heute |
| 8 | **Bewerber kontaktieren:** 5× PRIO1 | Alltagsengel | Diese Woche |
| 9 | **efy-Migrationen einspielen** (7× READY_TO_APPLY) | efy care | Bei Gelegenheit |
| 10 | **spatial_ref_sys-Migration** im SQL-Editor | ChairMatch | Bei Gelegenheit |
| 11 | **Leistungsnachweis-Modus entscheiden** | efy care | Vor nächster Phase |
| 12 | **11880-Portal:** Fritzsch-Kontaktdaten freischalten | Alltagsengel | Diese Woche |

---

## Berichtigungen in diesem Lauf

| Was | Vorher | Jetzt | Marke |
|---|---|---|---|
| §45a-Frist | „abgelaufen" | UNKNOWN — mündliche Verlängerung möglich | Korrektur |
| Erhebungsbogen | MISSING | DOCUMENT_VERIFIED — lag in ~/Downloads | Korrektur |
| CM Key-Einführung | „Commit 2d89dc7 vom 08.03." | `e9de001` vom 05.03.2026 | Korrektur |
| efy Funktionszahl | „81" | 80 (Tippfehler im vorigen Bericht) | Korrektur |
| Preiskonflikt | „35 vs 40" | 35 vs 30/25 PfluV-Deckel (der echte Konflikt) | Korrektur |

---

**Commits:** AE `c2255007` · CM `49de127` · efy `a7dc846`
**Keine neuen Features gebaut. Kein Preis geändert. Niemand kontaktiert.**
