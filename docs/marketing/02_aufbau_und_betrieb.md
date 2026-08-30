# Marketing-/CRM-System — Aufbau und Betrieb

## Die eine Unterscheidung, auf der alles ruht

| | Transaktionspost | Werbepost |
|---|---|---|
| Beispiele | Rechnung, Mahnung, Terminbestätigung, Passwortreset | Newsletter, Reaktivierung, Empfehlungsprogramm |
| Rechtsgrundlage | Art. 6 Abs. 1 lit. b DSGVO (Vertrag) | § 7 Abs. 2 Nr. 2 UWG (Einwilligung) |
| Einwilligung nötig | **nein** | **ja, vorher und ausdrücklich** |
| Sperrliste beachten | **nein** | **ja** |
| Weg im Code | `lib/notifications.ts` | `lib/marketing/versand.ts` |
| Schalter | `RECHNUNGSVERSAND_AUTOMATISCH`, `MAHNVERSAND_AUTOMATISCH` | `MARKETINGVERSAND_FREIGEGEBEN` |

Beide Wege teilen sich Versanddienst (Resend) und Absender
(`Alltagsengel <info@alltagsengel.care>`) — **sonst nichts**.

Eine Rechnung, die wegen einer Newsletter-Abmeldung nicht zugestellt wird,
wäre ein Fehler. Deshalb sind die Schalter getrennt: ein gemeinsamer hätte
bedeutet, dass mit dem Rechnungsversand unbemerkt die Werbung mit scharf
wird.

---

## Der Weg einer Kampagne

```
Entwurf ──► Trockenlauf ──► Freigabe ──► Versand
            (zählt,          (Mensch,      (einmalig,
             sendet nichts)   an die Zahl   drei Tore)
                              gebunden)
```

### 1. Entwurf
`POST /api/admin/marketing/campaigns` mit `segment_key` und `template_key`.
Beide werden **gegen den Katalog im Code geprüft** — ein freier Filter aus
einem Formular wäre eine Abfrage, die jemand von außen schreibt, und die
Folge wäre Post an den falschen Personenkreis.

Vorlage und Segment müssen **dieselbe Einwilligungsart** verlangen. Sonst
liefe eine Engel-Vorlage an ein Kundensegment, gestützt auf eine
Einwilligung, die für etwas anderes erteilt wurde.

### 2. Trockenlauf
`POST /api/admin/marketing/campaigns/{id}/dry-run` — **sendet nichts.**

Liefert zwei Zahlen und eine Aufschlüsselung:

```
im Segment:    312
versandfähig:    0
  312 — Keine Werbeeinwilligung erteilt
```

Die Aufschlüsselung ist der eigentliche Wert. „0 Empfänger" allein wäre von
einem Fehler nicht zu unterscheiden — und genau so sähe eine unerreichbare
Einwilligungstabelle aus.

Der Trockenlauf schreibt `dry_run_am` und `empfaenger_anzahl` an die
Kampagne. **Ein neuer Trockenlauf entwertet eine bestehende Freigabe.**

### 3. Freigabe
`PATCH /api/admin/marketing/campaigns/{id}` mit `{ "freigeben": true }`.

Die Freigabe merkt sich die Zahl, die der freigebende Mensch **gesehen
hat** (`freigegeben_fuer_anzahl`). Wächst das Segment danach, gilt sie
nicht mehr. Ohne diese Bindung wäre „ich habe 12 Empfänger freigegeben" die
Grundlage für einen Versand an 1200.

Eine geschrumpfte Zahl entwertet die Freigabe **nicht** — es gehen weniger
Mails raus als verantwortet wurde.

### 4. Versand
`POST /api/admin/marketing/campaigns/{id}/versenden` — der einzige scharfe
Weg. Drei Tore müssen offen sein:

1. `MARKETINGVERSAND_FREIGEGEBEN='1'` **und** Produktionslauf
2. Freigabe vorhanden und die Empfängerzahl nicht gewachsen
3. Die Kampagne wurde noch nicht versendet

Tor 3 ist eine **Datenbankregel**, kein Vorsatz: der UNIQUE-Teilindex
`email_campaigns_einmal_versendet` lässt eine zweite Versand-Eintragung
nicht zu.

Je Empfänger gilt: **Protokoll anlegen → senden → Protokoll
fortschreiben.** Bricht der Lauf ab, steht hinterher fest, wer schon dran
war. Andersherum wäre ein Absturz zwischen beiden Schritten eine Mail ohne
Spur — und der Wiederaufnahmelauf schickte sie ein zweites Mal.

---

## Was ohne Freigabe funktioniert

| Weg | Erreicht echte Empfänger? |
|---|---|
| Trockenlauf | nein |
| Vorschau (`GET .../preview`) | nein |
| Testversand (`POST .../testversand`) | nur `@alltagsengel.care` |

Die Beschränkung des Testversands ist kein Komfortmerkmal: ohne sie wäre er
der Weg, den ganzen Riegel zu umgehen. Eine Kampagne „testweise" an eine
Kundenadresse ist kein Test, sondern ein Versand.

Ein Testversand erzeugt **keinen** Eintrag in der Zustellspur — sonst
verfälschte er die Kennzahlen und die Adresse würde später fälschlich als
„hat schon bekommen" ausgeschlossen.

---

## Abmeldung

`/api/marketing/abmeldung` — **ohne Anmeldung erreichbar**, gesichert durch
ein HMAC-Token über die Adresse plus Ratenbegrenzung. Art. 21 DSGVO
verbietet, den Widerspruch zu erschweren; deshalb hat das Token **keinen
Ablauf** und ist beliebig oft benutzbar. Ein Abmeldelink muss noch in einer
zwei Jahre alten Mail funktionieren.

* **GET** zeigt eine Bestätigungsseite und ändert nichts.
* **POST** meldet ab.

Die Trennung ist nötig, weil Links in Mails auch von Automaten geöffnet
werden (Link-Vorabprüfung im Mailweg, Bild-Proxys). RFC 8058 verlangt für
die Ein-Klick-Abmeldung aus demselben Grund POST — und genau diesen POST
setzt der Header `List-Unsubscribe-Post` ab, den jede Werbemail mitträgt.

Die Abmeldung tut **drei** Dinge:

1. widerruft jede offene Einwilligung der Adresse,
2. **setzt die Adresse auf die Sperrliste**,
3. deaktiviert die Verteilerzeile, falls es eine gibt.

Schritt 2 ist der wichtigste. Ohne ihn würde die nächste Anmeldung über ein
beliebiges Formular den Widerruf aufheben.

---

## Sperrliste

Steht auf der **Adresse**, nicht auf der Kontokennung — und überlebt
deshalb die Kontolöschung. Sie ist ausdrücklich **nicht** im
Löschkatalog (`lib/dsgvo/loeschkatalog.ts`): Art. 21 Abs. 3 DSGVO verlangt,
dem Widerspruch dauerhaft zu entsprechen, und das geht nur, wenn die
Adresse gespeichert bleibt.

**Entfernen ist nur bei zwei Gründen möglich:** `hard_bounce` und
`ungueltig`. Beides sind technische Befunde über die Adresse. `abmeldung`,
`spam_beschwerde`, `soft_bounce_dauerhaft` und `manuell` bleiben stehen —
sie beruhen auf dem Willen der Person.

---

## Automationen: vorbereitet, NICHT scharf

Sieben Automationen sind definiert und anlegbar. **Keine läuft.** Es gibt
keinen Cron-Eintrag und keinen Aufrufer; `marketing_automations.aktiv` steht
per DEFAULT auf `false`, und ein CHECK verbietet `aktiv = true` ohne
Freigabevermerk.

Drei Dinge fehlen, bevor eine Automation scharf geschaltet werden darf:

1. **Es gibt überhaupt Einwilligungen.** Live: null.
2. **Der Nachlauf ist begrenzt.** Eine Automation „7 Tage nach
   Registrierung" trifft beim ersten Lauf *jede* Registrierung, die je
   stattgefunden hat. Ohne eine Grenze wäre der erste Lauf der größte
   Versand der Firmengeschichte.
3. **Es gibt eine Zustellspur je Person und Automation**, damit dieselbe
   Mail nicht täglich erneut rausgeht.

Deshalb hat die API bewusst **kein** `PATCH` auf `aktiv`.

---

## Berechtigung

Eine Antwort auf drei Ebenen — die Lehre aus dem Bonusmodul, wo Seite,
Schnittstelle und Datenbank drei verschiedene gaben:

| Ebene | Regel |
|---|---|
| Oberfläche `/admin/marketing/*` | `marketing.verwalten` |
| Schnittstelle `/api/admin/marketing/*` | `marketing.verwalten` |
| Datenbank `marketing_*`, `email_*` | `is_admin()` |

`marketing.verwalten` steht in `NUR_ADMINISTRATION` — also genau
admin + superadmin, dieselbe Menge, die `is_admin()` bezeichnet. `pdl`,
`qm` und `buchhaltung` bekommen es nicht.

`/api/marketing/abmeldung` ist bewusst **nicht** registriert: der
Abmeldeweg muss ohne Anmeldung erreichbar sein.

---

## Was fehlt — ehrlich benannt

* **Öffnungen und Klicks werden nicht erfasst.** Die Spalten `opened_at`
  und `clicked_at` existieren, aber nichts füllt sie. Das bräuchte einen
  Resend-Webhook. Das Cockpit zeigt dort Nullen, keine Schätzungen.
* **Bounces werden nicht automatisch auf die Sperrliste geschrieben.**
  Auch das ist ein Webhook. Bis dahin trägt der Betrieb sie von Hand ein
  (`POST /api/admin/marketing/suppression`).
* **`lead_inquiries` hat keine E-Mail-Spalte.** Die 34 Anfragen sind per
  Mail nicht erreichbar. Erforderlich wäre eine Adressspalte *samt
  Einwilligungs-Kontrollkästchen am Formular*.
* **Es gibt keinen Anmeldeweg mit Doppel-Opt-in für Werbung.** Der
  vorhandene Newsletter-Weg (`POST /api/newsletter`) schreibt in
  `newsletter_subscribers`, legt aber **keine** `marketing_consents`-Zeile
  an. Solange das so ist, entsteht keine Einwilligung von selbst.

Der letzte Punkt ist der Grund, warum jeder Trockenlauf heute
`versandfähig: 0` meldet.
