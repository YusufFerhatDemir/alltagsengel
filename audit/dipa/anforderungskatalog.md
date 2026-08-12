# Anforderungskatalog — Struktur und Pflege

**Stand:** 2026-08-12 · **Block:** 15c
**Maschinenlesbare Fassung:** `lib/coach/anforderungskatalog.ts`
**Anzeige:** `/admin/dipa` → Anforderungskatalog

---

## 1. Warum der Katalog leer aussieht, wo man Text erwartet

Der Katalog enthält **keine ausformulierten Verordnungs- oder Richtlinientexte**. Das ist
kein Versäumnis, sondern die einzige belastbare Vorgehensweise:

* Die verbindlichen Anforderungen stehen in Originaldokumenten, die versioniert werden
  und sich ändern (zuletzt erkennbar durch eine Änderungsverordnung und eine neue
  Leitfaden-Fassung, siehe `audit/DIPA_REGULATORIK_2026-08-09.md`).
* Eine paraphrasierte Anforderung im Code veraltet unbemerkt und wird dann zur Grundlage
  falscher „erfüllt"-Meldungen.
* Im Prüfverfahren zählt der Originaltext, nicht unsere Fassung.

Der Katalog hält deshalb fest: **welche Anforderung wir meinen, woher sie stammt, ob wir
den Originaltext dagegen geprüft haben, wie weit wir sind, womit wir es belegen und wer
zuständig ist.**

## 2. Aufbau eines Eintrags

| Feld | Bedeutung |
|---|---|
| `id` | stabile Kennung, z. B. `AK-SEC-01` |
| `kategorie` | eines von neun Themenfeldern |
| `formulierung` | **unsere Arbeitsfassung** — ausdrücklich nicht der Verordnungstext |
| `quelle` | wo der verbindliche Text nachzulesen ist |
| `anforderungstextGeprueft` | wurde der Originaltext gegen diesen Eintrag geprüft? |
| `stand` | offen / in Arbeit / erfüllt / nicht anwendbar |
| `nachweis` | Datei, Zertifikat, Testprotokoll |
| `gapId` | Verweis in `dipav_gap_liste.md`, falls offen |
| `verantwortlich` | technik / fachlich / extern / geschäftsführung |

## 3. Die Fortschrittsregel

`katalogFortschritt()` zählt einen Eintrag nur dann in die Quote, wenn er `erfuellt`
**und** `anforderungstextGeprueft: true` ist.

Das führt dazu, dass die Quote derzeit deutlich niedriger ist als die Zahl der als
„erfüllt" markierten Einträge. Das ist beabsichtigt: Ein Fortschrittsbalken, der auf
ungeprüften Annahmen beruht, ist eine Selbsttäuschung — und würde genau dann reißen, wenn
es darauf ankommt.

Die Admin-Ansicht weist offen aus, wie viele Einträge noch ungeprüft sind.

## 4. Kategorien

| Schlüssel | Themenfeld |
|---|---|
| `produkt_zweckbestimmung` | Produkt & Zweckbestimmung |
| `datenschutz` | Datenschutz |
| `datensicherheit` | Datensicherheit |
| `interoperabilitaet` | Interoperabilität |
| `barrierefreiheit` | Barrierefreiheit |
| `qualitaet_inhalte` | Qualität der Inhalte |
| `nutzennachweis` | Nutzennachweis / Evaluation |
| `verbraucherschutz` | Verbraucherschutz & Werbefreiheit |
| `qms_risikomanagement` | QMS & Risikomanagement |

Kategorien lassen sich ergänzen (`KATEGORIE_LABELS`), ohne bestehende Einträge zu berühren.

## 5. Pflegeprozess

```
Erkenntnis (Gap, Beratung, Prüfstelle, neue Fassung eines Dokuments)
        ↓
dipav_gap_liste.md aktualisieren        ← die Wahrheit steht hier
        ↓
lib/coach/anforderungskatalog.ts anpassen  ← maschinenlesbare Sicht darauf
        ↓
Test lib/coach/abrechnung.test.ts läuft grün (IDs eindeutig, Quellen vorhanden,
offene Einträge nennen Gap oder Nachweis)
        ↓
committen
```

**Beim Abgleich mit einem Originaldokument** zusätzlich:

1. `formulierung` an den Originaltext angleichen (sinngemäß, nicht abschreiben).
2. `quelle` mit konkreter Fundstelle versehen.
3. `anforderungstextGeprueft: true` setzen — **erst dann**, mit Datum im Commit.

## 6. Was der Katalog nicht leistet

* Er ersetzt keine Beratung durch das Innovationsbüro und keine Prüfstelle.
* Er trifft keine Aussage darüber, ob eine Anforderung für uns überhaupt gilt — dafür
  gibt es `nicht_anwendbar`, und diese Einordnung muss begründet werden.
* Er kennt keine Fristen. Termine gehören in die Projektplanung, nicht in den Katalog.

## 7. Verweise

* Gap-Liste (führend): `dipav_gap_liste.md`
* Fragen an das Innovationsbüro: `bfarm_fragenkatalog.md`
* Regulatorische Grundlage: `audit/DIPA_REGULATORIK_2026-08-09.md`
