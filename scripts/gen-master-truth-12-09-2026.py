#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MASTER_EXECUTION_TRUTH_12_09_2026_FINAL.pdf

SCHRIFT: ausschliesslich DejaVuSans / DejaVuSans-Bold aus public/fonts.
Zwei Riegel gegen stille Helvetica-Rueckfaelle:
  pruefe_keine_helvetica()      — vor dem Bau, ueber alle Stile
  pruefe_pdf_ohne_helvetica()   — nach dem Bau, im fertigen Byte-Strom
Reihenfolge der Importe ist bindend: platypus friert die Basisschrift beim
Import als Klassenattribut ein (siehe gen-master-pdfs-09-09-2026.py).
"""
import os

from reportlab import rl_config
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

REPO = "/Users/work/alltagsengel"
FONT_DIR = os.path.join(REPO, "public", "fonts")
OUT = os.path.join(REPO, "docs", "reports", "MASTER_EXECUTION_TRUTH_12_09_2026_FINAL.pdf")

NORMAL, FETT = "DejaVuSans", "DejaVuSans-Bold"
pdfmetrics.registerFont(TTFont(NORMAL, os.path.join(FONT_DIR, "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont(FETT, os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFontFamily(NORMAL, normal=NORMAL, bold=FETT, italic=NORMAL, boldItalic=FETT)
rl_config.canvas_basefontname = NORMAL

from reportlab.lib import colors                                    # noqa: E402
from reportlab.lib.enums import TA_LEFT                             # noqa: E402
from reportlab.lib.pagesizes import A4                              # noqa: E402
from reportlab.lib.styles import ParagraphStyle                     # noqa: E402
from reportlab.lib.units import cm                                  # noqa: E402
from reportlab.pdfgen.canvas import Canvas as _Canvas               # noqa: E402
from reportlab.platypus import (                                    # noqa: E402
    BaseDocTemplate, Frame, KeepTogether, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)

TINTE = colors.HexColor("#1c1c1c")
GRAU = colors.HexColor("#5a5a5a")
LINIE = colors.HexColor("#d8d8d8")
KOPF_BG = colors.HexColor("#f2efe9")
ZEBRA = colors.HexColor("#faf8f5")
AKZENT = colors.HexColor("#8a6d3b")

GRUEN = colors.HexColor("#1a7f37")
GELB = colors.HexColor("#b8860b")
ROT = colors.HexColor("#c0392b")
SCHWARZ = colors.HexColor("#444444")

# DejaVuSans hat keine Emoji — U+25CF (BLACK CIRCLE) hat ein Glyph, Ampel-Emoji nicht.
AMPEL = {"gruen": GRUEN, "gelb": GELB, "rot": ROT, "schwarz": SCHWARZ}


def amp(schluessel, text):
    return '<font color="#%s">●</font> %s' % (AMPEL[schluessel].hexval()[2:], text)


def stil(name, **kw):
    basis = dict(name=name, fontName=NORMAL, fontSize=8.6, leading=12.2,
                 textColor=TINTE, alignment=TA_LEFT, spaceBefore=0, spaceAfter=0)
    basis.update(kw)
    return ParagraphStyle(**basis)


S = {
    "titel": stil("titel", fontName=FETT, fontSize=21, leading=25, spaceAfter=4),
    "untertitel": stil("untertitel", fontSize=10.5, leading=14.5, textColor=GRAU, spaceAfter=11),
    "h1": stil("h1", fontName=FETT, fontSize=12.6, leading=16, spaceBefore=13, spaceAfter=5, textColor=AKZENT),
    "h2": stil("h2", fontName=FETT, fontSize=9.8, leading=13, spaceBefore=8, spaceAfter=4),
    "p": stil("p", spaceAfter=5),
    "klein": stil("klein", fontSize=7.7, leading=10.6, textColor=GRAU, spaceAfter=4),
    "code": stil("code", fontSize=7.3, leading=9.9, textColor=colors.HexColor("#2c2c2c")),
    "zelle": stil("zelle", fontSize=7.9, leading=10.8),
    "zellef": stil("zellef", fontName=FETT, fontSize=7.9, leading=10.8),
}


def P(t, s="p"):
    return Paragraph(t, S[s])


def tabelle(kopf, zeilen, breiten, farbspalte=None):
    """farbspalte: {zeilenindex(ab 0 fuer erste Datenzeile): farbe} faerbt die ganze Zeile ein."""
    daten = [[Paragraph(c, S["zellef"]) for c in kopf]]
    for z in zeilen:
        daten.append([Paragraph(c, S["zelle"]) for c in z])
    t = Table(daten, colWidths=breiten, repeatRows=1, hAlign="LEFT")
    st = [
        ("FONTNAME", (0, 0), (-1, -1), NORMAL),
        ("BACKGROUND", (0, 0), (-1, 0), KOPF_BG),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, AKZENT),
        ("GRID", (0, 0), (-1, -1), 0.28, LINIE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4.5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for i in range(1, len(daten)):
        if i % 2 == 0:
            st.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    for idx, farbe in (farbspalte or {}).items():
        st.append(("LINEBEFORE", (0, idx + 1), (0, idx + 1), 2.6, farbe))
    t.setStyle(TableStyle(st))
    return t


def codeblock(text):
    z = [[Paragraph(r.replace("&", "&amp;").replace("<", "&lt;") or "&nbsp;", S["code"])]
         for r in text.strip("\n").split("\n")]
    t = Table(z, colWidths=[17.0 * cm], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), NORMAL),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f6f4f0")),
        ("BOX", (0, 0), (-1, -1), 0.4, LINIE),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 0.7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0.7),
    ]))
    return t


class Dok(BaseDocTemplate):
    def __init__(self, pfad, kopfzeile):
        BaseDocTemplate.__init__(self, pfad, pagesize=A4,
                                 leftMargin=2.0 * cm, rightMargin=2.0 * cm,
                                 topMargin=1.9 * cm, bottomMargin=1.6 * cm,
                                 title=kopfzeile, author="Alltagsengel")
        self.kopfzeile = kopfzeile
        rahmen = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="haupt")
        self.addPageTemplates([PageTemplate(id="std", frames=rahmen, onPage=self._rand)])

    def _rand(self, c, doc):
        c.saveState()
        c.setFont(NORMAL, 7.2)
        c.setFillColor(GRAU)
        c.drawString(self.leftMargin, A4[1] - 1.26 * cm, self.kopfzeile)
        c.drawRightString(A4[0] - self.rightMargin, A4[1] - 1.26 * cm, "12.09.2026")
        c.setStrokeColor(LINIE)
        c.setLineWidth(0.4)
        c.line(self.leftMargin, A4[1] - 1.44 * cm, A4[0] - self.rightMargin, A4[1] - 1.44 * cm)
        c.line(self.leftMargin, 1.28 * cm, A4[0] - self.rightMargin, 1.28 * cm)
        c.drawString(self.leftMargin, 0.96 * cm, "Alltagsengel UG — interner Bericht, vertraulich")
        c.drawRightString(A4[0] - self.rightMargin, 0.96 * cm, "Seite %d" % doc.page)
        c.restoreState()


def dejavu_canvas(*a, **kw):
    kw["initialFontName"] = NORMAL
    return _Canvas(*a, **kw)


def pruefe_keine_helvetica():
    for name, s in S.items():
        if "elvetica" in (s.fontName or ""):
            raise SystemExit("ABBRUCH: Stil '%s' nutzt %s statt DejaVuSans." % (name, s.fontName))
    for f in (NORMAL, FETT):
        if f not in pdfmetrics.getRegisteredFontNames():
            raise SystemExit("ABBRUCH: Schrift %s nicht registriert." % f)


def pruefe_pdf_ohne_helvetica(pfad):
    roh = open(pfad, "rb").read()
    if b"Helvetica" in roh:
        raise SystemExit("ABBRUCH: %s enthaelt Helvetica." % os.path.basename(pfad))
    if b"DejaVuSans" not in roh:
        raise SystemExit("ABBRUCH: %s enthaelt kein DejaVuSans." % os.path.basename(pfad))


# ══════════════════════════════════════════════════════════════════════════
B = 17.0 * cm
E = []


def h1(t):
    E.append(P(t, "h1"))


def h2(t):
    E.append(P(t, "h2"))


def p(t):
    E.append(P(t))


def sp(h=4):
    E.append(Spacer(1, h))


def block(n):
    """Die letzten n Elemente zusammenhalten — sonst steht eine Ueberschrift
    allein am Seitenfuss und ihre Tabelle beginnt auf der naechsten Seite."""
    teile = E[-n:]
    del E[-n:]
    E.append(KeepTogether(teile))


# ── Seite 1 ───────────────────────────────────────────────────────────────
E.append(P("Master Execution Truth", "titel"))
E.append(P("Alltagsengel UG (haftungsbeschränkt) · Frankfurt am Main<br/>"
           "Stand 12.09.2026, 04:00 Uhr — löst alle vorherigen Truth-States ab", "untertitel"))

E.append(tabelle(
    ["", "Regel dieses Berichts"],
    [["●", "Jede Zahl ist in dieser Sitzung aus einer <b>Primärquelle</b> gezogen: Testlauf, "
           "<font name='DejaVuSans'>git log</font>, Live-Abruf, Supabase-Abfrage oder visuell geprüftes Dokument. "
           "Wo eine im Auftrag genannte Zahl von der gemessenen abweicht, steht die gemessene — "
           "und die Abweichung wird benannt."]],
    [0.7 * cm, B - 0.7 * cm]))
sp(9)

h1("1 · Executive Summary")
p("Drei Produkte, drei grüne Testsuiten, <b>14.683 Tests</b> ohne einen einzigen Fehlschlag. "
  "Die Technik ist nicht das Problem.")
p("Das Problem ist der Rückstand im Posteingang und die Genehmigungsmappe.")
p("<b>50 offene Leads. 37 davon liegen seit über sieben Tagen. Der älteste seit 58 Tagen.</b> "
  "Darunter vier echte Kundenanfragen — Menschen, die Betreuung für Angehörige gesucht und keine "
  "Antwort bekommen haben. Das ist kein Softwarefehler, das ist verlorener Umsatz. Die "
  "Follow-up-Maschine, die das künftig verhindert, steht seit heute — sie hat aber <b>noch nie "
  "gefeuert</b>, weil <font name='DejaVuSans'>CRON_SECRET</font> in Vercel nicht gesetzt ist. Ein "
  "fehlender Wert trennt eine gebaute Funktion von einer wirkenden.")
p("Bei §45a ist zweierlei gesichert: Die Mappe ist Blatt für Blatt geprüft (26 Scans), und die "
  "Anerkennung wird nirgends mehr fälschlich behauptet (Scanner über 1.600 Dateien, 0 Befunde, in CI). "
  "Unangenehm ist: <b>12 bereits unterschriebene Anträge an andere Bundesländer behaupten, wir seien "
  "bereits anerkannt.</b> Gegenüber Behörden ist das eine unrichtige Angabe.")
p("Drei Sicherheitsbefunde gefunden, <b>zwei davon nicht behoben</b> — die Migrationen sind "
  "geschrieben, aber nicht angewendet.")

sp(6)
h1("2 · Prüfstand — alle drei Produkte")
E.append(tabelle(
    ["Produkt", "Suite", "Ergebnis", "Exit"],
    [["Alltagsengel", "vitest (470 Dateien)", amp("gruen", "<b>10.324</b> bestanden, 38 übersprungen"), "0"],
     ["Alltagsengel", "node:test (286 Suiten)", amp("gruen", "<b>2.770</b> bestanden, 0 Fehler"), "0"],
     ["Alltagsengel", "tsc --noEmit", amp("gruen", "keine Fehler"), "0"],
     ["Alltagsengel", "8 × lint:* (projekteigen)", amp("gruen", "je 0 Befunde"), "0"],
     ["Alltagsengel", "npm run lint (ESLint)", amp("rot", "<b>12 Fehler</b>, 1 Warnung"), "1"],
     ["ChairMatch", "vitest (99 Dateien)", amp("gruen", "<b>1.866</b> bestanden"), "0"],
     ["efy care", "vitest (93 Dateien)", amp("gruen", "<b>2.493</b> bestanden, 30 übersprungen"), "0"]],
    [2.8 * cm, 4.3 * cm, 8.1 * cm, 1.8 * cm],
    {4: ROT}))
block(2)
sp(4)
E.append(P("Abweichung zum Auftrag: dort 10.320 Tests — gemessen <b>10.324</b>. Die vier zusätzlichen "
           "sind der neue Footer-Linkgraph-Test aus <font name='DejaVuSans'>2b708e75</font>.", "klein"))

sp(10)

# ── §3 fliesst ────────────────────────────────────────────────────────────
h1("3 · Der Rückstand — live aus Supabase")
E.append(codeblock(
    "50 offen — 37 verschleppt (>7 Tage), 8 dringend, 2 eskaliert, 1 zur Erinnerung\n"
    "je Art:  Warteliste 0 · Bewerbungen 36 · Anfragen 14\n"
    "Kennzahlen: >24h 1 · >48h 2 · >72h 8 · >7 Tage 37\n"
    "            ältester 58 Tage · heute fällig 0 · Rückrufe 8 · Termine 2"))
sp(6)
E.append(P("Abweichung zum Auftrag: dort „36 ROT\". Gemessen sind <b>37 verschleppt</b> plus 8 dringend — "
           "rote und schwarze Ampel zusammen <b>45 von 50</b>.", "klein"))
sp(6)

h2("Vier Kundenanfragen — alle CALL_REQUIRED, Antwortentwürfe fertig")
E.append(tabelle(
    ["Prio", "Name", "Anliegen", "Wartet seit"],
    [[amp("schwarz", "höchste"), "<b>MantheyIckenroth</b>", "Alltagsbegleitung Darmstadt", "800 h ≈ <b>34 Tage</b>"],
     [amp("rot", "hoch"), "<b>Uwe Büttner</b>", "Verhinderungspflege / Demenz", "1.019 h ≈ <b>43 Tage</b>"],
     [amp("rot", "hoch"), "<b>Maike Reichert</b>", "mehrfache Terminversuche (Dublette)", "sofort"],
     [amp("gelb", "mittel"), "<b>Darleen Suhe</b>", "Alltagsbegleitung Darmstadt", "1.406 h ≈ <b>59 Tage</b>"]],
    [2.3 * cm, 3.9 * cm, 6.6 * cm, 4.2 * cm],
    {0: SCHWARZ, 1: ROT, 2: ROT, 3: GELB}))
block(2)
sp(4)
E.append(P("Maike Reichert hat <b>mehrfach</b> einen Termin versucht und jedes Mal keine Reaktion "
           "erhalten — der Fall mit dem höchsten Eskalationsrisiko, unabhängig vom Alter des Eintrags. "
           "Dazu 8 Rückruf-Leads ohne Freitext (NEEDS_CLASSIFICATION) und 2 Terminwünsche.", "klein"))
sp(8)

h2("Bewerber — 35 aktiv, ATS-Filter gebaut")
E.append(tabelle(
    ["Stufe", "Anzahl", "Bedeutung", "Spitze"],
    [[amp("rot", "<b>PRIO 1</b>"), "<b>7</b>", "qualifiziert, mit Berufserfahrung",
      "<b>Claudia Adjovi</b> — Sozialbetreuerin + Pflegefachhelferin, <b>8 Jahre</b>, PLZ 63739"],
     [amp("gelb", "PRIO 2"), "16", "gute Eignung / Quereinsteiger", "—"],
     [amp("schwarz", "PRIO 3"), "12", "zu wenig Informationen", "—"]],
    [2.5 * cm, 1.5 * cm, 5.0 * cm, 8.0 * cm],
    {0: ROT, 1: GELB, 2: SCHWARZ}))
block(2)
sp(4)
E.append(P("Claudia Adjovi ist die einzige Bewerberin, die die PfluV-Fachkraftanforderung eigenständig "
           "stützen könnte — sie wartet unbearbeitet. Kanal-Blindstelle: 25 von 35 Bewerbungen kommen "
           "<b>ohne UTM</b> an.", "klein"))

h1("4 · Genehmigung §45a — Dokumentenmatrix (26 Scans visuell geprüft)")
E.append(tabelle(
    ["Status", "Dokumente", "Nächste Aktion"],
    [[amp("gruen", "<b>VERIFIED</b>"),
      "Berufserlaubnis Sabrina · Erw. FZ Yusuf (20.07.2026) · IK 460629986 · "
      "HRB 140351 · Betriebshaftpflicht Generali (10 Mio. €)", "keine — bis auf Versicherungsnehmer"],
     [amp("gelb", "<b>UNSIGNED</b>"),
      "Erhebungsbogen (eigene Fassung) · Anschreiben Hessen · Leistungskonzept · "
      "Schulungskonzept · Erkl. Führungszeugnisse · Erkl. SV/Mindestlohn · "
      "Datenschutzkonzept · Einverständnis Veröffentlichung",
      "unterschriebene Scans einlegen"],
     [amp("rot", "<b>FIELD_MISSING</b>"),
      "Arbeitsvertrag Sabrina (Beginn, Stunden, Vergütung, Adresse leer) · "
      "Leistungs-/Kostenübersicht (nennt 30,00 €/Std.) · "
      "Schweigepflichterklärung (Name, Geburtsdatum, Wohnort leer)",
      "Felder ausfüllen, dann unterschreiben"],
     [amp("schwarz", "<b>MISSING</b>"),
      "Erhebungsbogen Anbieterform II der Stadt Frankfurt", "Formular neu beschaffen"],
     [amp("gelb", "<b>SUBMITTED</b>"),
      "Gewerbeanmeldung — online eingereicht, Bestätigung ausstehend", "Eingangsbestätigung sichern"]],
    [2.9 * cm, 8.7 * cm, 5.4 * cm],
    {0: GRUEN, 1: GELB, 2: ROT, 3: SCHWARZ, 4: GELB}))
block(2)
sp(5)
E.append(P("<b>Wichtige Einordnung:</b> Die unterschriebenen Fassungen existieren — 12 Anträge an andere "
           "Bundesländer tragen Tinten-Unterschriften vom 16.07.2026. Für die <b>Hessen-Mappe</b> wurde auf "
           "diesem Rechner keine unterschriebene Fassung gefunden. „UNSIGNED\" heißt hier: <i>die "
           "Repo-Kopie</i> ist unsigniert — nicht, dass eine Unterschrift fehlt.", "klein"))
sp(8)

h1("5 · Kritische Funde")
E.append(tabelle(
    ["", "Fund", "Konsequenz"],
    [[amp("schwarz", ""), "<b>12 Anschreiben an Bundesländer behaupten die §45a-Anerkennung</b> — "
      "unterschrieben und datiert 16.07.2026", "Unrichtige Angabe gegenüber Behörden. Richtigstellung nötig."],
     [amp("schwarz", ""), "<b>Kartenscan mit Prüfziffer</b> in <font name='DejaVuSans'>~/Downloads</font> "
      "(Nummer, Ablauf, CVV)", "<b>Nicht im Repo</b> — per SHA-256 über alle PDFs und die Git-Historie "
      "geprüft. Karte gilt als kompromittiert: löschen und sperren lassen."],
     [amp("rot", ""), "<b>Erhebungsbogen Frankfurt ist kein PDF</b>, sondern eine gespeicherte "
      "Cloudflare-Sperrseite (5.824 Bytes HTML)", "Download war fehlgeschlagen und blieb unbemerkt."],
     [amp("rot", ""), "<b>FZ Sabrina ist einfach, nicht erweitert</b> (22.04.2026, keine Eintragung)",
      "§45a und der eigene Arbeitsvertrag §10 verlangen das erweiterte; zudem ~5 Monate alt (Behörden: ≤ 3)."],
     [amp("rot", ""), "<b>Betriebshaftpflicht läuft auf „Alltagsengel\" ohne UG</b>",
      "Behörde erwartet „Alltagsengel UG (haftungsbeschränkt)\". Beim Versicherer klären."],
     [amp("rot", ""), "<b>Preis-Widerspruch 35 € vs. 40 €</b> — vier Investorenseiten gegen "
      "<font name='DejaVuSans'>lib/mis/constants.ts</font>",
      "BUSINESS_DECISION_REQUIRED. Bis zur Entscheidung keine dieser Zahlen in neues Material."],
     [amp("rot", ""), "<b>ChairMatch: <font name='DejaVuSans'>spatial_ref_sys</font> von anon beschreib- "
      "und löschbar</b> — die Sonde war blind dafür",
      "Migration geschrieben, <b>nicht angewendet</b>. Lücke offen."],
     [amp("rot", ""), "<b>efy care: anon und authenticated hatten TRUNCATE</b>",
      "Migration geschrieben, <b>nicht angewendet</b>. Lücke offen."],
     [amp("gelb", ""), "<b>efy care ist nirgends deployt</b> — kein <font name='DejaVuSans'>.vercel</font>, "
      "kein DNS auf drei geprüften Domains", "Unentschiedener Zwischenstand im Portfolio."],
     [amp("gelb", ""), "<b>ESLint ist in CI stillgelegt</b> — <font name='DejaVuSans'>npm run lint || true</font>",
      "12 Fehler seit 21.–29.08. unbemerkt. Die 8 projekteigenen Lints laufen blockierend und sind grün."]],
    [0.65 * cm, 7.6 * cm, 8.75 * cm],
    {0: SCHWARZ, 1: SCHWARZ, 2: ROT, 3: ROT, 4: ROT, 5: ROT, 6: ROT, 7: ROT, 8: GELB, 9: GELB}))
block(2)

h1("6 · Marketing, SEO, Deployments")
h2("Marketing")
E.append(tabelle(
    ["Kennzahl", "Wert", "Bewertung"],
    [["Content-Stücke im Katalog", "<b>54</b> (4 Plandateien), alle mit Datum", amp("gruen", "Plan steht")],
     ["überfällig / heute / künftig", "5 / 4 / 45", amp("gelb", "leichter Verzug")],
     ["<font name='DejaVuSans'>marketing_content_status</font>", "<b>0 von 54</b> Zeilen",
      amp("rot", "Ausführung nicht nachvollziehbar")],
     ["E-Mail-Vorlagen", "16 in DB = 16 im Katalog", amp("gruen", "vollständig")],
     ["§45a-Verstöße · 125-€-Nennungen · fehlende Abmeldelinks", "0 · 0 · 0", amp("gruen", "sauber")]],
    [5.6 * cm, 5.6 * cm, 5.8 * cm],
    {0: GRUEN, 1: GELB, 2: ROT, 3: GRUEN, 4: GRUEN}))
block(2)
sp(7)

h2("SEO — 182 Sitemap-URLs live vermessen")
E.append(tabelle(
    ["Prüfung / Befund", "Ergebnis"],
    [["Sitemap-URLs · Canonicals · JSON-LD · noindex",
      amp("gruen", "182/182 HTTP 200 · 186/186 self-canonical · 186/186 geparst · 0 noindex")],
     ["Exakte Titel- oder Description-Dubletten", amp("gruen", "<b>0</b>")],
     ["<font name='DejaVuSans'>/leistungen</font> hatte <b>1</b> internen Link von 186 Seiten",
      amp("gruen", "<b>behoben</b> — Footer, Commit 2b708e75")],
     ["<font name='DejaVuSans'>/haushaltshilfe</font> hatte <b>0</b> Links außerhalb des Silos",
      amp("gruen", "<b>behoben</b> — Footer, Commit 2b708e75")],
     ["Near-Duplicate-Descriptions auf <b>65 Stadtseiten</b> (bis 96,3 % identisch)",
      amp("rot", "offen — Textarbeit, Muster liegt vor")],
     ["76 Titel > 60 Zeichen, 55 Descriptions > 160 Zeichen", amp("gelb", "offen")],
     ["Keyword-Kollision <font name='DejaVuSans'>/pflegebox</font> ↔ <font name='DejaVuSans'>/hygienebox</font>",
      amp("gelb", "offen — Entscheidung nötig")]],
    [9.4 * cm, 7.6 * cm],
    {0: GRUEN, 1: GRUEN, 2: GRUEN, 3: GRUEN, 4: ROT, 5: GELB, 6: GELB}))
block(2)
sp(4)
E.append(P("Befund 1 und 2 brauchten <b>keine neue Seite</b> — zwei Footer-Zeilen. Der Regressionstest "
           "<font name='DejaVuSans'>__tests__/seo/footer-linkgraph.test.ts</font> hält die Regel fest; "
           "mit Gegenprobe belegt (Zeile entfernt → 3 von 4 Fällen rot).", "klein"))
sp(7)

h2("Live-Deployments und Commits")
E.append(tabelle(
    ["Produkt", "Live", "HEAD", "Weitere Commits heute"],
    [["Alltagsengel", amp("gruen", "alltagsengel.care — 200, 182 URLs"), "<b>2b708e75</b>",
      "f6465b6f · 105b94b8 · 915509d7 · a64e28a7"],
     ["ChairMatch", amp("gruen", "www.chairmatch.de — 308→200, 153 URLs"), "<b>aacde3e</b>", "095f2d1 · c507e9b"],
     ["efy care", amp("rot", "<b>nicht deployt</b>"), "<b>6cf0b8f</b>", "84d2e84 · c0b766a"]],
    [2.6 * cm, 6.3 * cm, 2.5 * cm, 5.6 * cm],
    {0: GRUEN, 1: GRUEN, 2: ROT}))
block(2)
sp(4)
E.append(P("Zur CI-Lage: die Läufe zu <font name='DejaVuSans'>105b94b8</font> und "
           "<font name='DejaVuSans'>f6465b6f</font> wurden <b>abgebrochen</b>, weil der jeweils nächste "
           "Push sie verdrängt hat; der Lauf zu <font name='DejaVuSans'>2b708e75</font> lief zum "
           "Redaktionsschluss noch. Beleg für diese Commits ist der <b>lokale Prüfstand</b>, nicht ein "
           "grünes CI-Häkchen.", "klein"))

h1("7 · USER_ACTION_REQUIRED — sofort")
E.append(tabelle(
    ["#", "Aktion", "Warum"],
    [["1", "<b>CRON_SECRET in Vercel setzen</b>",
      "Die Follow-up-Maschine hat <b>noch nie gefeuert</b>. Ohne den Wert laufen alle Ketten ins Leere — "
      "„Bearer undefined\" gilt sonst für jeden."],
     ["2", "<b>Vier Kundenanfragen anrufen</b>",
      "MantheyIckenroth (34 T) · Büttner (43 T) · Reichert (mehrfach vergeblich) · Suhe (59 T)"],
     ["3", "<b>Claudia Adjovi anrufen</b>", "8 Jahre Erfahrung, Top-Kandidatin, wartet unbearbeitet"],
     ["4", "<b>Kartenscan löschen, Karte sperren lassen</b>",
      "Prüfziffer sichtbar. Nichts aus dem Projekt zu entfernen — die Datei liegt nur in "
      "<font name='DejaVuSans'>~/Downloads</font>."]],
    [0.8 * cm, 5.4 * cm, 10.8 * cm],
    {0: ROT, 1: ROT, 2: ROT, 3: ROT}))
block(2)
sp(8)

h2("Diese Woche")
E.append(tabelle(
    ["#", "Aktion", "Warum"],
    [["5", "12 Bundesländer-Anträge richtigstellen", "behaupten eine Anerkennung, die nicht vorliegt"],
     ["6", "Erhebungsbogen Frankfurt neu beschaffen", "Repo-Datei ist eine Cloudflare-Sperrseite"],
     ["7", "Erweitertes FZ für Sabrina beantragen", "vorhanden ist nur ein einfaches, ~5 Monate alt"],
     ["8", "Arbeitsvertrag Sabrina ausfüllen", "Beginn, Stunden, Vergütung, Adresse leer"],
     ["9", "Versicherungsnehmer auf die UG umschreiben", "Police läuft auf „Alltagsengel\" ohne Rechtsform"],
     ["10", "Preisentscheidung 35 € vs. 40 €", "vier Investorenseiten gegen die Code-Konstante"],
     ["11", "Zwei Migrationen im SQL-Editor anwenden",
      "ChairMatch + efy care — DDL ist aus der Sitzung nicht möglich (42501); "
      "ein service_role-Apply meldet 204 <b>ohne Wirkung</b>"],
     ["12", "Gerichtskasse-Mahnung prüfen", "26.05.2026, Az. 72 HRB 140351/0 002, Status unbekannt"]],
    [0.8 * cm, 6.4 * cm, 9.8 * cm]))
block(2)
sp(8)

h1("8 · BLOCKED_EXTERNAL")
E.append(tabelle(
    ["Punkt", "Hängt an", "Blockiert"],
    [["Gewerbeanmeldung-Bestätigung", "Stadt Frankfurt", "§45a-Mappe unvollständig"],
     ["Erhebungsbogen Anbieterform II", "Stadt Frankfurt (Download defekt)", "§45a-Antrag"],
     ["<b>§45a-Anerkennungsbescheid Hessen</b>", "Land Hessen",
      "Kassenabrechnung · Tariffreigabe · „kostenlos\"-Werbung"],
     ["Google Business Profile", "Google-Verifizierung", "Local SEO, Bewertungen"],
     ["Stripe", "bewusst <b>DEFERRED</b>", "Online-Zahlung — kein Blocker fürs Rechnungsgeschäft"]],
    [5.4 * cm, 5.2 * cm, 6.4 * cm],
    {2: ROT}))
block(2)

h1("9 · Nächste 20 produktive Schritte")
E.append(tabelle(
    ["Umsatz & Menschen", "Genehmigung"],
    [["1 · Vier Kundenanfragen abtelefonieren, Ergebnis im Posteingang festhalten<br/>"
      "2 · Acht Rückruf-Leads klassifizieren (eine Frage: Kunde oder Bewerber?)<br/>"
      "3 · Sieben PRIO-1-Bewerber kontaktieren, beginnend mit Claudia Adjovi<br/>"
      "4 · CRON_SECRET setzen und den 05:00-Lauf am Folgetag gegen "
      "<font name='DejaVuSans'>notifications</font> belegen<br/>"
      "5 · Dublette Maike Reichert zusammenführen",
      "6 · Erhebungsbogen der Stadt beschaffen<br/>"
      "7 · Erweitertes Führungszeugnis Sabrina beantragen<br/>"
      "8 · Arbeitsvertrag und Schweigepflichterklärung vervollständigen<br/>"
      "9 · Richtigstellung an die 12 Bundesländer formulieren (Absender „Alltagsengel\")<br/>"
      "10 · Versicherungsnehmer auf die UG umschreiben lassen"]],
    [8.5 * cm, 8.5 * cm]))
block(2)
sp(6)
E.append(tabelle(
    ["Produkt", "Technische Schuld"],
    [["11 · Near-Duplicate-Descriptions der 65 Stadtseiten auflösen — Muster aus "
      "<font name='DejaVuSans'>/haushaltshilfe</font> übernehmen<br/>"
      "12 · 76 Titel auf ≤ 60 Zeichen kürzen, beginnend mit "
      "<font name='DejaVuSans'>/engel-werden</font> (91 Zeichen, Marke doppelt)<br/>"
      "13 · <font name='DejaVuSans'>/pflegebox</font> ↔ <font name='DejaVuSans'>/hygienebox</font> "
      "entscheiden: eine Seite führt das Keyword<br/>"
      "14 · Dokumentenstatus ins Kunden-CRM — <b>braucht eine Migration</b><br/>"
      "15 · <font name='DejaVuSans'>marketing_content_status</font> befüllen, damit Veröffentlichung "
      "nachvollziehbar wird",
      "16 · <font name='DejaVuSans'>|| true</font> bei ESLint in <font name='DejaVuSans'>ci.yml</font> "
      "entfernen — nach Punkt 17<br/>"
      "17 · Die 12 ESLint-Fehler beheben (6 Admin-Seiten, "
      "<font name='DejaVuSans'>lib/a11y.ts</font>, ein Test)<br/>"
      "18 · Zwei offene Migrationen anwenden und <b>nachmessen</b>, nicht annehmen<br/>"
      "19 · UTM aufs Bewerberformular nachziehen — 25 von 35 kommen ohne Quelle an<br/>"
      "20 · efy care deployen oder ausdrücklich als „nicht deployt\" führen"]],
    [8.5 * cm, 8.5 * cm]))
sp(11)

h1("10 · Stehende Regeln — unverändert gültig")
E.append(tabelle(
    ["", "Regel"],
    [["●", "<b>131 €</b> Entlastungsbetrag — nie 125 € (als verbotene Zeichenkette hinterlegt)"],
     ["●", "<b>§45a = „im Anerkennungsverfahren\"</b> — nie „anerkannt\". "
           "<font name='DejaVuSans'>ANERKENNUNG_45A_LIEGT_VOR = false</font>"],
     ["●", "<b>Kundenkommunikation immer als „Alltagsengel\"</b> — nie ein persönlicher Name"],
     ["●", "<b>Keine Preise erfinden</b> — PRICE_DECISION_REQUIRED / BUSINESS_DECISION_REQUIRED"],
     ["●", "<b>Keine Stripe-Abhängigkeit</b> — Stripe = DEFERRED"],
     ["●", "<b>Keine echten Mails versenden</b>"],
     ["●", "<b>Alle Commits über <font name='DejaVuSans'>./deploy.sh</font></b>"],
     ["●", "<b>PDFs in DejaVuSans</b> — Helvetica-Rückfall per Prüfung ausgeschlossen"]],
    [0.65 * cm, 16.35 * cm]))
block(2)
sp(10)
E.append(P("Erstellt 12.09.2026. Alle Zahlen in dieser Sitzung aus Primärquellen gemessen. "
           "Langfassung: <font name='DejaVuSans'>docs/reports/MASTER_EXECUTION_TRUTH_12_09_2026_FINAL.md</font>", "klein"))

# ══ Bauen ═════════════════════════════════════════════════════════════════
pruefe_keine_helvetica()
dok = Dok(OUT, "Master Execution Truth — Alltagsengel UG")
dok.build(E, canvasmaker=dejavu_canvas)
pruefe_pdf_ohne_helvetica(OUT)
print("OK: %s (%.1f KB)" % (OUT, os.path.getsize(OUT) / 1024.0))
