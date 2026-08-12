# Abschlussbericht Block 12 + 13

**Datum:** 2026-08-08
**Branch:** staging/expansion-abnahme
**Commits:** b5b83e4 (Block 12), 25c2009 (Block 13)

---

## Block 12 — Defense-in-Depth org_id-Guards

### Zusammenfassung

9 Funktionen in 4 Dateien hatten fehlende `organization_id`-Filter in ihren
Supabase-Queries. Alle betroffenen API-Routes hatten zwar bereits org-fence
Pre-Checks, aber die Lib-Funktionen selbst waren verwundbar gegenueber Aufrufen
aus neuem Code, der den Pre-Check vergisst.

### Betroffene Funktionen

| Datei | Funktion | Tabelle |
|-------|----------|---------|
| kassenabrechnung-engine.ts | `exportiereLauf()` | abrechnungslaeufe |
| kassenabrechnung-engine.ts | `gebeLaufFrei()` | abrechnungslaeufe |
| kassenabrechnung-engine.ts | `storniereLauf()` | abrechnungslaeufe |
| korrekturlaeufe.ts | `erstelleKorrekturlauf()` | abrechnungslaeufe, dta_ruecklaeufer, dta_fehlerprotokoll |
| korrekturlaeufe.ts | `fuehreKorrekturAus()` | dta_korrekturlaeufe |
| korrekturlaeufe.ts | `ladeKorrekturHistorie()` | abrechnungslaeufe (Ketten-Traversierung) |
| ruecklaeufer.ts | `ordneRuecklaeuferZu()` | dta_ruecklaeufer |
| ruecklaeufer.ts | `markiereRuecklaeuferErledigt()` | dta_ruecklaeufer |
| fehlerprotokoll.ts | `aktualisiereFehler()` | dta_fehlerprotokoll |

### Ansatz

- Alle 9 Funktionen haben einen optionalen `organizationId`-Parameter erhalten
- Wenn gesetzt, werden ALLE SELECTs und UPDATEs mit `.eq('organization_id', organizationId)` gefiltert
- Optional statt pflicht, um Abwaertskompatibilitaet zu wahren
- Alle 6 aufrufenden API-Routes geben jetzt `organizationId` durch

---

## Block 13 — Expansion Multi-Tenant

### Zusammenfassung

3 Expansion-Blocker behoben, die den Betrieb ausserhalb Hessens verhinderten:

### 1. AOK-Routing bundesweit (schluesselverzeichnis.ts)

**Problem:** `findeDatenannahmestelle()` gab `null` fuer alle AOK ausser Hessen
zurueck. Das brach den gesamten DTA-Export fuer nicht-hessische AOK-Klienten ab.

**Loesung:** ITSCare (IK 105810615) ist die zentrale Datenannahmestelle fuer
alle AOK-Regionen im § 105 SGB XI Datenaustausch. Die Hessen-Beschraenkung
wurde entfernt — die Funktion gibt jetzt fuer alle Bundeslaender ein Ergebnis.

**Neu:** `findeDatenannahmestelleAsync()` — async DB-First-Lookup auf die
`datenannahmestellen`-Tabelle (org-spezifisch, bundesland-spezifisch), mit
Fallback auf die hardcoded Tabelle. Fuer den Fall, dass eine AOK-Region eine
andere Annahmestelle als ITSCare nutzt.

### 2. Leistungsnachweis-PDF Multi-Tenant (leistungsnachweis-pdf.ts)

**Problem:** `LEISTUNGSERBRINGER`-Konstante hardcodierte Name, Adresse und
Email von Alltagsengel UG. Jeder andere Mandant haette PDFs mit falschen
Absenderdaten generiert.

**Loesung:**
- Neue `getLeistungserbringer()` Funktion laedt Name/Adresse aus `organizations`
- `loadLeistungsnachweis()` akzeptiert optionalen `organizationId`-Parameter
- HTML-Template nutzt dynamische Org-Daten statt Konstante
- Fallback auf `LEISTUNGSERBRINGER` wenn keine DB-Daten verfuegbar

### 3. EDIFACT-Generator Absendername (kassenabrechnung-engine.ts, dry-run)

**Problem:** `absender_name: 'Alltagsengel UG'` war hardcodiert in der
Export-Funktion und im Dry-Run.

**Loesung:** Org-Name wird aus `organizations.name` geladen. Fallback auf
'Alltagsengel UG'.

---

## Verifizierung

- TypeScript-Check: 0 Fehler nach allen Aenderungen
- Grep-Scan: Verbleibende 'Alltagsengel'-Referenzen sind korrekte Fallback-Werte
- Abwaertskompatibilitaet: Alle neuen Parameter sind optional
- Keine Breaking Changes in oeffentlichen Interfaces
