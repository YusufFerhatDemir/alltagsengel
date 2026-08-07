# Fachliche Quellenprüfung: 30 EUR / 25 EUR / 5 EUR

**Datum:** 2026-08-07
**Typ:** READ-ONLY Analyse — keine DB-Änderung, keine Migration
**Auftraggeber:** Yusuf

---

## Ergebnis auf einen Blick

| Wert | Bedeutung | Klassifizierung | Abrechenbar? |
|------|-----------|-----------------|--------------|
| **30 EUR/h** | PfluV-Preisobergrenze für Nr. 2 | **RECHTLICHER_GRENZWERT** | NEIN — kein Abrechnungstarif |
| **25 EUR/h** | PfluV-Preisobergrenze für Nr. 3 | **RECHTLICHER_GRENZWERT** | NEIN — kein Abrechnungstarif |
| **5 EUR** | Selbst beantragte Fahrtkosten-Pauschale | **FACHLICH_ZU_LIEFERN** | NEIN — weder PfluV-Wert noch genehmigt |

**Keine dieser drei Werte darf als OFFIZIELL_VERIFIZIERT in billing_tariffs gespeichert werden.**

---

## 1. Analyse: 30 EUR/h (Betreuung)

### Fundstelle 1 — PfluV Hessen, §3 (Preisobergrenzen)

**Dokument:** `§45a-Checkliste-Unterlagen.md`, Abschnitt „Wichtige Preisgrenze (§ 3 PfluV)"

**Wortlaut:**

> | Angebotsform | Max. Preis/Std. (inkl. USt.) |
> | Entlastung von Pflegenden (Nr. 2) | **30,00 €** |

### Fundstelle 2 — Recherche-Dokument (pflege-in-hessen.de)

**Dokument:** `recherche-45a-hauswirtschaft-vs-betreuung.md`, Zeile 51-53

**Wortlaut:**

> | Angebotskategorie | **Preisobergrenze** (inkl. USt.) |
> | Betreuungsangebote (Nr. 1) + Entlastung von Pflegenden (Nr. 2) | **max. 30 €/Stunde** |

### Fundstelle 3 — Erhebungsbogen

**Dokument:** `§45a-Erhebungsbogen-Alltagsengel-ausgefuellt.md`, Zeile 164

**Wortlaut:**

> Entlastung von Pflegenden (§ 45a Abs. 1 S. 2 Nr. 2) | **30,00 €/Std.** inkl. USt. *(gesetzl. Maximum lt. PfluV Hessen)*

### Klassifizierung: RECHTLICHER_GRENZWERT

**Was dieser Wert ist:** Eine gesetzliche Preisobergrenze (PfluV Hessen §3). Ein anerkannter §45a-Anbieter in Hessen darf für Betreuungsleistungen (Nr. 2) MAXIMAL 30 EUR/h inkl. USt. verlangen.

**Was dieser Wert NICHT ist:**

- Kein verbindlicher Abrechnungssatz — der Anbieter WÄHLT seinen Preis (bis max. 30 EUR)
- Kein Erstattungsbetrag der Pflegekasse — die Kasse erstattet dem Versicherten das, was er bezahlt hat (bis zum Entlastungsbetrag)
- Kein genehmigter Alltagsengel-Tarif — der Erhebungsbogen ist ein ANTRAG, kein Bescheid

---

## 2. Analyse: 25 EUR/h (Hauswirtschaft / Entlastung im Alltag)

### Fundstelle 1 — PfluV Hessen, §3

**Dokument:** `§45a-Checkliste-Unterlagen.md`, Abschnitt „Wichtige Preisgrenze (§ 3 PfluV)"

**Wortlaut:**

> | Angebotsform | Max. Preis/Std. (inkl. USt.) |
> | Entlastung im Alltag (Nr. 3) | **25,00 €** |

### Fundstelle 2 — Recherche-Dokument

**Dokument:** `recherche-45a-hauswirtschaft-vs-betreuung.md`, Zeile 51, 54

**Wortlaut:**

> | Angebotskategorie | **Preisobergrenze** (inkl. USt.) |
> | Angebote zur Entlastung im Alltag (Nr. 3) = Hauswirtschaft | **max. 25 €/Stunde** |

### Fundstelle 3 — KASSEN_DATEN_HESSEN.md, Zeile 69

**Wortlaut:**

> Aktuelle Entgeltgrenze: für Angebote zur Entlastung im Alltag **max. 25 €/Stunde inkl. USt.**

### Fundstelle 4 — Erhebungsbogen

**Dokument:** `§45a-Erhebungsbogen-Alltagsengel-ausgefuellt.md`, Zeile 165

**Wortlaut:**

> Entlastung im Alltag (§ 45a Abs. 1 S. 2 Nr. 3) | **25,00 €/Std.** inkl. USt. *(gesetzl. Maximum lt. PfluV Hessen)*

### Klassifizierung: RECHTLICHER_GRENZWERT

Identische Logik wie 30 EUR. Preisobergrenze, kein Abrechnungstarif.

---

## 3. Analyse: 5 EUR (Wegepauschale)

### Fundstelle — NUR Erhebungsbogen

**Dokument:** `§45a-Erhebungsbogen-Alltagsengel-ausgefuellt.md`, Zeile 177

**Wortlaut:**

> | Je Einsatz (Pauschale) | **5,00 €** |

### Keine PfluV-Fundstelle

Die PfluV Hessen regelt Fahrtkosten lediglich mit dem Satz (Erhebungsbogen Zeile 167):

> „Zum Entgelt zählen alle Nebenkosten mit Ausnahme angemessener Fahrtkosten."

Es gibt KEINE PfluV-Obergrenze für die Fahrtkosten-Pauschale. Die 5 EUR sind ein Wert, den Alltagsengel IM ANTRAG selbst eingetragen hat.

### Klassifizierung: FACHLICH_ZU_LIEFERN

**Was dieser Wert ist:** Ein selbst gewählter Betrag, den Alltagsengel im Erhebungsbogen als gewünschte Pauschale angegeben hat. Weder gesetzlich vorgeschrieben noch behördlich genehmigt.

**Was dieser Wert NICHT ist:**

- Kein PfluV-Grenzwert (keine Regelung für Fahrtkosten-Höhe gefunden)
- Kein genehmigter Tarif (Anerkennungsbescheid liegt nicht vor)

---

## 4. Kernfrage: Legt der Anbieter seinen Preis selbst fest?

### Antwort: JA — innerhalb der PfluV-Obergrenzen

Die Systematik funktioniert so:

1. **PfluV Hessen §3** setzt MAXIMALPREISE (Preisobergrenzen): 30 EUR (Nr. 2), 25 EUR (Nr. 3)
2. **Der Anbieter** wählt seinen Preis selbst (kann auch niedriger sein) und trägt ihn im Erhebungsbogen ein
3. **Die Anerkennungsbehörde** (Magistrat Frankfurt) prüft den Antrag und erteilt einen Anerkennungsbescheid
4. **Erst mit dem Anerkennungsbescheid** ist der Anbieter berechtigt, diese Preise abzurechnen
5. **Die Pflegekasse** erstattet dem Versicherten die Kosten bis zum Entlastungsbetrag (131 EUR/Monat, §45b SGB XI)

Die PfluV schreibt also KEINE verbindlichen Abrechnungssätze vor. Sie setzt Obergrenzen. Der tatsächliche Abrechnungspreis wird durch den Anbieter festgelegt und im Anerkennungsverfahren bestätigt.

**Beleg:** `recherche-45a-hauswirtschaft-vs-betreuung.md`, Zeile 77-78:

> Als §45a-Anbieter (aktuell): Max. 25 €/Std. (Hauswirtschaft) bzw. 30 €/Std. (Betreuung)

**Beleg:** `45a-anerkennung/01-bundeslaender-uebersicht.md`, Zeile 23:

> | Stundensatz | Unterhalb der §89 SGB XI Vergütungssätze |

---

## 5. Strikte Begriffstrennung

| Begriff | Definition | Wert für Alltagsengel |
|---------|-----------|----------------------|
| **Entlastungsbetrag (§45b)** | Monatliches Budget des Versicherten | 131 EUR/Monat |
| **PfluV-Preisobergrenze** | Gesetzliches Maximum für §45a-Anbieter | 30 EUR/h (Nr. 2), 25 EUR/h (Nr. 3) |
| **Anbieterpreis** | Der vom Anbieter festgelegte Stundensatz | NICHT FESTGELEGT (Bescheid fehlt) |
| **Pflegekassen-Erstattung** | Was die Kasse dem Versicherten erstattet | Tatsächliche Kosten bis max. 131 EUR/Monat |
| **Maximal anerkennungsfähige Vergütung** | PfluV-Obergrenze = max. Preis im Bescheid | 30 bzw. 25 EUR/h |

### Datenfluss bei Abrechnung (nach erfolgter Anerkennung):

```
Versicherter bucht Leistung bei Anbieter
  → Anbieter erbringt Leistung (z.B. 2h Betreuung × 30 EUR = 60 EUR)
  → Versicherter reicht Rechnung bei Pflegekasse ein
  → Pflegekasse erstattet dem Versicherten: min(60 EUR, verbleibendes Monatsbudget)
  → Versicherter zahlt an Anbieter
```

Der Anbieter rechnet NICHT direkt mit der Pflegekasse ab (anders als bei §36/§89). Der Versicherte ist Kostenträger und erhält die Erstattung.

---

## 6. Anerkennungsbescheid — Status Alltagsengel

### Ergebnis: LIEGT NICHT VOR

**Dokument:** `zulassung_45a_status.md`, Zeile 104-107

**Wortlaut:**

> 8. Hessen / Frankfurt
> Status: ❌ Keine Antwort erhalten, kein Bounce
> Zuständig: Regierungspräsidium Darmstadt (für Frankfurt/Südhessen)
> Nächster Schritt: RP Darmstadt direkt kontaktieren, IK-Nummer mitschicken

### Zusätzlich fehlende Voraussetzungen (gleiche Quelle, Zeile 126-135):

| Voraussetzung | Status |
|---------------|--------|
| Fachkraft (3-jährige Ausbildung) | ❌ MUSS NOCH EINGESTELLT WERDEN |
| Qualifikationsnachweis Fachkraft | ❌ abhängig von Fachkraft |
| Helfer (geschult, 30h) | ❌ Schulung muss noch stattfinden |
| Konzept / QS-Konzept | ❌ MUSS ERSTELLT WERDEN |
| Kostenkalkulation | ❌ MUSS ERSTELLT WERDEN |
| Führungszeugnis (erweitert) | ⏳ beantragt 20.07., erwartet ~03.08. |

**Fazit:** Selbst wenn der Magistrat Frankfurt auf den Antrag reagiert, fehlen noch mehrere Voraussetzungen für die Anerkennung. Ein Anerkennungsbescheid ist auf absehbare Zeit NICHT zu erwarten.

---

## 7. Konsequenz für billing_tariffs

### Darf Alltagsengel diese Preise als Kassentarife speichern?

**NEIN.** Begründung:

1. **Kein Anerkennungsbescheid** → Alltagsengel ist KEIN anerkannter §45a-Anbieter in Hessen
2. **30/25 EUR sind Obergrenzen**, keine bestätigten Tarife
3. **5 EUR ist ein selbst gewählter Antragswert**, nicht behördlich bestätigt
4. Ohne Anerkennung kann Alltagsengel §45b-Leistungen NICHT über die Pflegekasse abrechnen lassen

### Erlaubte Tarifquellen (billing_tarifquellen):

| Tarifquelle | Anwendbar? | Begründung |
|-------------|-----------|------------|
| ANERKENNUNGSBESCHEID | ❌ NEIN | Liegt nicht vor |
| VERGUETUNGSVEREINBARUNG | ❌ NEIN | Keine Vereinbarung mit Pflegekassen |
| KASSENVEREINBARUNG | ❌ NEIN | Kein Rahmenvertrag vorhanden |
| PRIVATE_PREISLISTE | ✅ JA | Für Privatpreise frei festlegbar |
| MANUELL_FREIGEGEBEN | ⚠️ Bedingt | Nur wenn Yusuf explizit freigibt |

---

## 8. Aktualisierte Klassifizierung aller bekannten Preise

| Preis | Herkunft | Neue Klassifizierung |
|-------|----------|---------------------|
| 30 EUR/h | PfluV Hessen §3 Nr. 2 | RECHTLICHER_GRENZWERT |
| 25 EUR/h | PfluV Hessen §3 Nr. 3 | RECHTLICHER_GRENZWERT |
| 5 EUR | Erhebungsbogen Alltagsengel | FACHLICH_ZU_LIEFERN |
| 35 EUR/h | service_pricing (Native App) | INTERNER_PREIS |
| 38 EUR/h | service_pricing (Hauswirtschaft) | INTERNER_PREIS |
| 40 EUR/h | service_pricing (Begleitservice) | INTERNER_PREIS |
| 32 EUR/h | Hardcoded in Buchungs-UI | INTERNER_PREIS |
| 20 EUR/h | Engel-Vergütung (constants.ts) | INTERNER_PREIS |
| 34 EUR/h | Bestehende Rechnungen | AUS_RECHNUNG_ABGELEITET |
| 52 EUR/h | Bestehende Rechnungen | AUS_RECHNUNG_ABGELEITET |
| 131 EUR/Mon. | §45b SGB XI (Pflegereform 2025) | OFFIZIELL_VERIFIZIERT |

Hinweis: Nur der Entlastungsbetrag (131 EUR) ist OFFIZIELL_VERIFIZIERT — er ist ein Bundesgesetz (§45b SGB XI) und gilt unabhängig von der Anbieter-Anerkennung.

---

## 9. Was Yusuf noch liefern/entscheiden muss

### Priorität 1 — Ohne das geht NICHTS:

1. **Anerkennungsbescheid Hessen einholen** — RP Darmstadt kontaktieren, Antrag nachverfolgen
2. **Fachkraft einstellen** — ohne Fachkraft keine Anerkennung möglich
3. **QS-Konzept + Kostenkalkulation erstellen** — Pflicht-Anlagen für den Antrag

### Priorität 2 — Tarif-Entscheidungen (erst NACH Anerkennung relevant):

4. **Tatsächlicher Stundensatz Betreuung (Nr. 2):** Welcher Preis ≤ 30 EUR? (30 EUR = Maximum)
5. **Tatsächlicher Stundensatz Hauswirtschaft (Nr. 3):** Welcher Preis ≤ 25 EUR? (25 EUR = Maximum)
6. **Fahrtkosten-Pauschale bestätigen:** 5 EUR wie beantragt? Oder anderer Betrag?
7. **Privatpreise festlegen:** Welche Stundensätze für Selbstzahler? (keine PfluV-Grenze)
8. **§39-Preise festlegen:** Verhinderungspflege hat keine PfluV-Obergrenze

### Priorität 3 — Systemische Entscheidungen:

9. **PfluV-Novelle beobachten:** Wenn die starren Grenzen fallen, können höhere Preise angesetzt werden
10. **Tarifquelle nach Bescheid:** ANERKENNUNGSBESCHEID oder MANUELL_FREIGEGEBEN?

---

## 10. GO/NO-GO für Tarifbefüllung

### ❌ NO-GO

**Begründung:**

- Kein Anerkennungsbescheid für Hessen vorhanden
- 30/25 EUR sind Preisobergrenzen, keine bestätigten Tarife
- 5 EUR ist ein unbestätigter Antragswert
- Mehrere Anerkennungsvoraussetzungen fehlen (Fachkraft, Konzept, Kalkulation)
- Ohne §45a-Anerkennung kann Alltagsengel NICHT über die Pflegekasse abrechnen

**Wann wird GO möglich?**

Erst wenn ALLE folgenden Bedingungen erfüllt sind:

1. ✅ Anerkennungsbescheid Hessen liegt vor
2. ✅ Preise im Bescheid bestätigt
3. ✅ Yusuf hat tatsächliche Stundensätze festgelegt
4. ✅ Import-SQL mit echten Werten befüllt
5. ✅ Auf Staging getestet

**Die Import-SQL (`tariff-import-v3-prepared.sql`) bleibt technisch vorbereitet, aber NICHT ausführbar.**

---

*Erstellt: 2026-08-07 | Keine Production-DB-Änderung | Keine Migration | Keine Tarife freigegeben*
