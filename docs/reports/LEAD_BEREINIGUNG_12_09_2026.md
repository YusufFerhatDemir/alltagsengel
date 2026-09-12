# Lead-Bereinigung — 12.09.2026

**Quelle:** `lead_inquiries` in Supabase, live abgefragt am 12.09.2026, 08:00 UTC.
50 Zeilen, davon 48 `new` und 2 `contacted`.

---

## 1. Der Befund, der alles andere schlägt

**Kein einziger Kundenlead hat eine E-Mail-Adresse. Alle 6 sind reine Telefonkontakte.**

Das heißt: Es gibt keinen schriftlichen Antwortweg. Jeder Antwortentwurf, der als
E-Mail gedacht ist, läuft ins Leere. Was unten steht, sind deshalb **Telefonleitfäden**
mit SMS-Rückfallvariante — nichts anderes ist zustellbar.

Zweiter Befund: **Birgit Fritzsch (Bruchköbel, über 11880.com) ist nicht in der
Datenbank.** Die Anfrage hat den Funnel nie erreicht. 11880 liefert Leads über ein
eigenes Portal aus; ohne Freischaltung der Kontaktdaten und ohne Übergabe in
`lead_inquiries` bleibt jede solche Anfrage unsichtbar für Posteingang, Ampel und
Follow-up-Kette. Siehe USER_ACTION_REQUIRED unten.

---

## 2. Klassifizierung

| Klasse | Anzahl | Bedeutung |
|---|---|---|
| **BEWERBER** | 36 | Quelle `engel-bewerbung` |
| **RUECKRUF_UNKLAR** | 8 | Quelle `rueckruf`, Freitext nur „Rückruf gewünscht — bevorzugte Zeit …" |
| **KUNDE** | 6 | Stadtseiten + Terminbuchung |
| **ERLEDIGT** | 2 | Status `contacted` |
| **DUPLIKAT** | 2 Gruppen / 4 Zeilen | siehe unten |

### Dubletten

| Schlüssel | Zeilen | Name | Befund |
|---|---|---|---|
| Telefon `…753122812` | 2 | **Maike Reichert** | Zwei Terminwünsche (2. Sep und 11. Sep) — **keine Dublette im Sinne eines Doppeleintrags**, sondern zwei getrennte Versuche derselben Person. Nicht zusammenführen und abhaken: der zweite Versuch ist die Eskalation des ersten. |
| Telefon `…664742198` | 2 | **Amela** | Einmal als Kundin (`alltagsbegleitung-hanau`, `contacted`), einmal als Bewerberin (`engel-bewerbung`). Dieselbe Person in zwei Rollen — **echte Dublette über Kategoriegrenzen**. Vor dem Anruf klären, in welcher Rolle sie gemeint ist. |

---

## 3. Kunden — sechs Fälle, alle telefonisch

> **Gesprächsregel für alle:** Absender und Unterschrift sind „Alltagsengel", nie ein
> persönlicher Name. Bei Fällen über 30 Tagen wird die Verspätung **zuerst** angesprochen,
> nicht am Ende versteckt. Keine Preise nennen — die Stundensätze sind nicht freigegeben
> (siehe `PRICE_SOURCE_OF_TRUTH.md`). Keine Zusage zur Kassenabrechnung: das Angebot ist
> **im Anerkennungsverfahren** nach § 45a, nicht anerkannt.

### 3.1 Maike Reichert — 11,9 und 9,8 Tage · HÖCHSTE PRIORITÄT

Zwei Online-Terminwünsche, beide unbeantwortet:
* Mi, 02.09.2026, 12–15 Uhr — „Bitte zur Bestätigung zurückrufen"
* Fr, 11.09.2026, 12–15 Uhr — derselbe Wunsch, neun Tage später

Der zweite Termin war **gestern**. Sie hat zweimal aktiv um einen Rückruf gebeten und
ihn zweimal nicht bekommen. Das ist der Fall mit dem höchsten Eskalationsrisiko —
nicht der älteste, aber der mit dem klarsten Signal, dass jemand erreicht werden wollte.

> „Guten Tag Frau Reichert, hier ist Alltagsengel aus Frankfurt.
> Sie haben bei uns zweimal einen Termin für Alltagsbegleitung angefragt — für den
> 2. und für den 11. September — und beide Male keine Rückmeldung von uns bekommen.
> Das tut mir aufrichtig leid, das ist unser Fehler und nicht Ihrer.
> Ich rufe an, um das jetzt zu klären: Brauchen Sie die Begleitung noch?
> Dann finden wir jetzt gemeinsam einen Termin, und diesmal bekommen Sie eine
> Bestätigung."

Wenn sie ablehnt: nicht überreden. Fragen, ob sie zwischenzeitlich jemanden gefunden
hat, und ob wir uns für später vormerken dürfen.

### 3.2 Darleen Suhe — 58,9 Tage · älteste Anfrage

Quelle `alltagsbegleitung-darmstadt`, kein Freitext, nur Telefonnummer.

> „Guten Tag Frau Suhe, hier ist Alltagsengel.
> Sie haben Anfang Juli über unsere Seite für Darmstadt angefragt. Ihre Anfrage ist
> bei uns liegen geblieben — fast zwei Monate lang. Dafür entschuldige ich mich, das
> hätte nicht passieren dürfen.
> Ich möchte trotzdem fragen: Ging es um Alltagsbegleitung für Sie selbst oder für
> eine Angehörige? Und ist das Thema noch aktuell?"

Ohne Freitext ist nichts über den Bedarf bekannt — die Fragen sind offen zu stellen,
nicht zu raten.

### 3.3 Uwe Büttner — 42,7 Tage · inhaltlich der konkreteste Fall

Freitext: *„Wir benötigen für unsere an Demenz erkrankte Mutter tageweise
Verhinderungspflege"*. Quelle `alltagsbegleitung-aschaffenburg`.

Das ist ein qualifizierter Bedarf: Verhinderungspflege nach § 39 SGB XI, Demenz,
tageweise. Aschaffenburg liegt in Bayern — **außerhalb des Hessen-Gatings**; die
Kassenabrechnung ist dort ohnehin nicht möglich, das Gespräch geht in Richtung
Selbstzahler oder Weitervermittlung.

> „Guten Tag Herr Büttner, hier ist Alltagsengel.
> Sie haben Ende Juli wegen tageweiser Verhinderungspflege für Ihre Mutter angefragt.
> Ihre Anfrage ist bei uns liegen geblieben — das war ein Fehler, und es tut mir leid,
> gerade bei diesem Thema.
> Falls es noch aktuell ist: Wie ist die Lage heute? Hat Ihre Mutter einen Pflegegrad,
> und geht es um einzelne Tage oder um eine regelmäßige Entlastung?"

Nicht zusagen: dass die Kasse das übernimmt. Das Verhinderungspflege-Budget besteht
unabhängig von § 45a, aber die Abrechnung darüber ist an die Anerkennung gebunden.

### 3.4 MantheyIckenroth — 33,6 Tage · Terminlage bereits verstrichen

Freitext: *„Ich werde am 14.8. am Herzen operiert. Nach der anschließenden Reha
benötige ich Hilfe vor allem im Haushalt."*

**Die Operation war vor vier Wochen.** Die Person ist mit hoher Wahrscheinlichkeit
inzwischen aus der Reha zurück — also genau jetzt im Bedarfszeitraum, den sie
angekündigt hat. Der Fall ist nicht verfallen, er ist **gerade fällig**.

> „Guten Tag, hier ist Alltagsengel aus Frankfurt.
> Sie hatten sich im August bei uns gemeldet — vor Ihrer Herz-Operation, wegen Hilfe
> im Haushalt für die Zeit nach der Reha. Ihre Anfrage ist bei uns liegen geblieben,
> und dafür möchte ich mich entschuldigen.
> Wie geht es Ihnen? Ich rufe an, weil der Zeitpunkt, den Sie genannt hatten, jetzt
> ungefähr erreicht ist — falls Sie die Unterstützung im Haushalt noch brauchen,
> können wir darüber sprechen."

Hier zuerst nach dem Befinden fragen. Eine Herz-OP ist kein Aufhänger für einen
Verkaufseinstieg.

### 3.5 Amela — 56,5 Tage · Status `contacted`, Rolle unklar

Steht zweimal in der Datenbank: als Kundin über `alltagsbegleitung-hanau` (bereits
kontaktiert) und als Bewerberin über `engel-bewerbung`. Vor dem Anruf klären, welche
Rolle gemeint ist — sonst beginnt das Gespräch mit einer Verwechslung.

---

## 4. Rückruf-Leads — 8 Stück, alle nicht klassifizierbar

| Wartet | Name | Wunschzeit |
|---|---|---|
| 51,0 T | Opitz | nachmittags |
| 45,0 T | Stefanie Bendert | nachmittags |
| 43,0 T | Demirhan | vormittags |
| 34,8 T | Assa Sohail | vormittags |
| 21,8 T | John-James | nachmittags |
| 3,8 T | Gabriela Zajder | abends |
| 3,8 T | Martina Kühl | nachmittags |
| 2,0 T | Ana Rajic | nachmittags |

Das Rückruf-Formular erfasst **nur** Name, Telefon und Wunschzeit — keinen Freitext,
keine E-Mail. Ob dahinter eine Kundin, ein Bewerber oder eine Rückfrage steckt, ist
aus den Daten nicht zu entscheiden. Es hilft kein Nachdenken, nur ein Anruf.

**Erste Frage im Gespräch:** „Suchen Sie Unterstützung im Alltag, oder interessieren
Sie sich für eine Tätigkeit bei uns?"

**Reihenfolge:** die drei jüngsten zuerst (Zajder, Kühl, Rajic — unter vier Tagen,
da ist die Chance auf ein Gespräch am höchsten), danach die alten von oben nach unten.
Bei allem über 30 Tagen dieselbe Regel: die Verspätung zuerst ansprechen.

**Produktlücke:** Solange das Rückruf-Formular kein Anliegen-Feld hat, produziert es
weiter unklassifizierbare Leads. Ein einzelnes Pflichtfeld („Worum geht es?" mit drei
Optionen) würde diese Kategorie auflösen.

---

## 5. USER_ACTION_REQUIRED

| # | Punkt | Warum |
|---|---|---|
| 1 | **11880.com: Kontaktdaten freischalten** | Birgit Fritzsch (Bruchköbel) ist über 11880 gekommen und **nicht** in der Datenbank. Ohne Freischaltung im 11880-Portal sind Name und Nummer nicht abrufbar — und ohne Übergabe an `lead_inquiries` läuft für solche Anfragen weder Ampel noch Follow-up. Der Lead ist damit doppelt unsichtbar. |
| 2 | **Prüfen, wie viele 11880-Anfragen es schon gab** | Wenn Fritzsch die erste bemerkte ist, sind frühere möglicherweise unbemerkt verfallen. |
| 3 | **Entscheiden: Rückruf-Formular um Anliegen-Feld erweitern** | Löst die Kategorie RUECKRUF_UNKLAR dauerhaft auf. Ein Feld, drei Optionen. |
| 4 | **E-Mail-Feld im Kundenformular** | Kein einziger der 6 Kundenleads hat eine Adresse. Damit ist jede schriftliche Nachfassung unmöglich und die Follow-up-Kette kann Kunden nie erreichen — nur die Verwaltung. |
