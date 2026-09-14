# Block 36 — Ein Klarname im Bildfeld

**Stand:** 14.09.2026 · **Ausgangspunkt:** `36e9530a`

---

## Die Frage

Block 35 hat gezeigt, dass der Admin-Anlegeweg die Belegfelder nicht
setzte. Trägt der Signaturweg der Native-App dieselbe Lücke?

---

## Antwort: nein — dieser Weg ist korrekt

`app/api/native/signatures/route.ts` ruft `uebernimmOderMelde`, und
`uebernimmSignaturInNachweis` setzt `proof_status` **und**
`client_signed_at` in **einem** Update, mit Compare-and-Swap gegen den
gelesenen Stand, mit Behandlung gesperrter Zeilen und mit einer
benannten Fehlermeldung statt eines stillen Rücksprungs.

Und die Trennung ist bewusst: nur bei `signer_role === 'client'` wird
übernommen. *„Die Unterschrift der Pflegekraft belegt, dass der Einsatz
stattgefunden hat — sie belegt nicht, dass der Kunde ihn bestätigt."*

**Kein Befund in der Kette.** Live: `service_signatures` hat 0 Zeilen —
der Weg ist noch nie gelaufen.

---

## Der Befund liegt in der Anzeige

`uebernimmSignaturInNachweis` schreibt den **Klarnamen** des Signatars in
`client_signature`. Das ist das Feld für das Unterschriftsbild, und
`app/admin/leistungsnachweis-digital` rendert es so:

```tsx
<img src={detailRecord.client_signature} alt="Unterschrift" />
```

Für jeden über diesen Weg unterschriebenen Nachweis zeigte die
Admin-Detailansicht damit ein **kaputtes Bild**. Die daneben vorhandenen
Spalten `client_signer_name` und `client_signer_role`, die dieselbe
Ansicht bereits ausgibt, blieben **leer**.

---

## Was NICHT der Befund war — und was mich das gelehrt hat

Mein erster Reflex war, den Namen aus `client_signature` zu entfernen und
in `client_signer_name` zu legen. **Die Kette riss sofort.** Der Trigger
sagt es wörtlich:

> kann nicht auf "UNTERSCHRIEBEN" gesetzt werden: es liegt kein
> Unterschriftsbeleg vor (weder `client_signature` mit `client_signed_at`
> noch eine Zeile in `service_signatures` mit `signer_role='client'`)

`enforce_unterschrift_beleg` akzeptiert genau **zwei** Belege. Der
Signaturdienst (`lib/signaturen/signaturen.ts`) legt seine Unterschrift in
`signaturen`/`signatur_dokumente` ab — **nicht** in `service_signatures`.
Für ihn ist `client_signature` der einzige Beleg, den die Datenbank
akzeptiert.

**Das Feld ist tragend, nicht nachlässig.** Es bleibt.

### Ein zweiter Beinahe-Fehler, ebenfalls von Tests gefangen

Ich setzte `client_signer_role: 'client'` — das Vokabular der Native-Route.
Die Spalte trägt aber einen CHECK mit **deutschem** Vokabular:

```sql
service_records_client_signer_role_check
  client_signer_role IS NULL
  OR client_signer_role = ANY (ARRAY['KUNDE','ANGEHOERIGER','VERTRETER'])
```

Ein ungültiger Wert lässt das **ganze** Update scheitern — die Unterschrift
hätte den Nachweis dann überhaupt nicht mehr erreicht. Das wäre deutlich
schlimmer gewesen als der kosmetische Ausgangsbefund.

Das ist das **dritte** Vokabular-Paar in diesem System (nach
`invoices.status` deutsch/englisch und `service_type`/`leistungsart`).

---

## Behebung

| Was | Wie |
|---|---|
| `client_signature` | **bleibt** — der Trigger verlangt ihn als Beleg |
| `client_signer_name` | wird jetzt gesetzt (die Spalte, die die Ansicht ausgibt) |
| `client_signer_role` | wird auf `'KUNDE'` gesetzt — über `SIGNER_ROLE_KUNDE`, nicht als Literal |
| `SIGNER_ROLLEN` | neue Konstante mit dem erlaubten Vokabular, damit niemand das App-Vokabular durchreicht |
| Anzeige | `<img>` nur noch für echte Bilddaten (`istBilddaten`); sonst Klartext plus Unterzeichnername |
| Unterschriftsblock | erscheint jetzt auch **ohne** Bild, wenn ein Name vorliegt — sonst sähe ein unterschriebener Nachweis unsigniert aus |

### Testschema war lockerer als die Produktion

`client_signer_role` fehlte im PGlite-Schema **samt CHECK**. Ein UPDATE auf
eine unbekannte Spalte scheitert in Postgres komplett (42703) — und ohne
den CHECK hätte das Testschema `'client'` klaglos geschluckt, die
Produktion nicht. Beides nachgezogen; die Datei warnt in ihrem eigenen
Kommentar genau davor.

---

## Tests

14 neue Tests; die bestehenden 145 der Signaturkette (inkl. PGlite-E2E)
bleiben grün.

| Mutation | Wirkung |
|---|---|
| `istBilddaten` liefert immer `true` | **4 Tests** fallen |
| `client_signer_role` zurück auf `'client'` | **4 Tests** fallen, davon 3 im echten Postgres |

---

## Offen — in Yusufs Hand

Nichts Neues aus diesem Block. Unverändert: `CRON_SECRET`, Migrationen
`20261105000000`, `20261115000000`, `20261120000000`, Entscheidung zu den
26 Bestandszeilen aus Block 35, `mis_kpis` pflegen oder abschalten,
Nachweise für die Einsatzfreigabe, Erika Testfalls fehlende
E-Mail-Adresse.
