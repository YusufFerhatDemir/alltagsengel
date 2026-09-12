#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Markdown → PDF mit DejaVuSans. Wiederverwendbar für docs/reports/*.md.

    python3 scripts/md-nach-pdf.py docs/reports/DATEI.md [Kopfzeile]

SCHRIFT: ausschliesslich DejaVuSans / DejaVuSans-Bold aus public/fonts.
Zwei Riegel, beide aus scripts/gen-master-pdfs-09-09-2026.py uebernommen:

  pruefe_keine_helvetica()     vor dem Bau, ueber alle Stile
  pruefe_pdf_ohne_helvetica()  nach dem Bau, im fertigen Byte-Strom

WARUM DER ZWEITE RIEGEL NOETIG IST: Am 13.09.2026 lag eine fertige PDF im
Ordner, deren Text vollstaendig in DejaVuSans gesetzt war — und die trotzdem
`Helvetica` in den Seitenressourcen fuehrte (pdffonts: Type 1, nicht
eingebettet). ReportLab traegt die Basisschrift des Canvas dort ein, auch
wenn nie ein Zeichen damit gesetzt wird. Ein Blick auf die Seite haette das
nie gezeigt.

REIHENFOLGE DER IMPORTE IST BINDEND: platypus friert die Basisschrift beim
Import als Klassenattribut von CellStyle ein. Erst registrieren, dann
rl_config setzen, DANN platypus importieren.
"""

import os
import re
import sys

from reportlab import rl_config
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = os.path.join(REPO, "public", "fonts")

NORMAL, FETT = "DejaVuSans", "DejaVuSans-Bold"
pdfmetrics.registerFont(TTFont(NORMAL, os.path.join(FONT_DIR, "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont(FETT, os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFontFamily(NORMAL, normal=NORMAL, bold=FETT, italic=NORMAL, boldItalic=FETT)
rl_config.canvas_basefontname = NORMAL

from reportlab.lib import colors                                      # noqa: E402
from reportlab.lib.enums import TA_LEFT                               # noqa: E402
from reportlab.lib.pagesizes import A4                                # noqa: E402
from reportlab.lib.styles import ParagraphStyle                       # noqa: E402
from reportlab.lib.units import cm                                    # noqa: E402
from reportlab.pdfgen.canvas import Canvas as _Canvas                 # noqa: E402
from reportlab.platypus import (                                      # noqa: E402
    BaseDocTemplate, Frame, KeepTogether, PageTemplate, Paragraph, Spacer,
    Table, TableStyle,
)

TINTE = colors.HexColor("#1c1c1c")
GRAU = colors.HexColor("#5a5a5a")
LINIE = colors.HexColor("#d8d8d8")
KOPF_BG = colors.HexColor("#f2efe9")
ZEBRA = colors.HexColor("#faf8f5")
AKZENT = colors.HexColor("#8a6d3b")


def stil(name, **kw):
    basis = dict(name=name, fontName=NORMAL, fontSize=8.6, leading=12.2,
                 textColor=TINTE, alignment=TA_LEFT, spaceBefore=0, spaceAfter=0)
    basis.update(kw)
    return ParagraphStyle(**basis)


S = {
    "h1": stil("h1", fontName=FETT, fontSize=19, leading=23, spaceAfter=4),
    "h2": stil("h2", fontName=FETT, fontSize=12.6, leading=16, spaceBefore=13,
               spaceAfter=5, textColor=AKZENT),
    "h3": stil("h3", fontName=FETT, fontSize=10, leading=13.5, spaceBefore=9, spaceAfter=4),
    "p": stil("p", spaceAfter=5),
    "li": stil("li", spaceAfter=3, leftIndent=10),
    "klein": stil("klein", fontSize=7.7, leading=10.6, textColor=GRAU, spaceAfter=4),
    "zelle": stil("zelle", fontSize=7.7, leading=10.4),
    "zellef": stil("zellef", fontName=FETT, fontSize=7.7, leading=10.4),
}


def inline(text):
    """Markdown-Auszeichnung → ReportLab-Markup. Reihenfolge: erst escapen."""
    t = (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`(.+?)`", r'<font face="%s">\1</font>' % NORMAL, t)
    t = re.sub(r"\[(.+?)\]\((.+?)\)", r"\1", t)      # Linktext behalten, Ziel weg
    return t


def tabelle(zeilen, breite):
    kopf, *rest = zeilen
    daten = [[Paragraph(inline(c), S["zellef"]) for c in kopf]]
    for z in rest:
        daten.append([Paragraph(inline(c), S["zelle"]) for c in z])
    spalten = max(len(z) for z in daten)
    for z in daten:
        while len(z) < spalten:
            z.append(Paragraph("", S["zelle"]))
    t = Table(daten, colWidths=[breite / spalten] * spalten, repeatRows=1, hAlign="LEFT")
    st = [
        ("FONTNAME", (0, 0), (-1, -1), NORMAL),
        ("BACKGROUND", (0, 0), (-1, 0), KOPF_BG),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, AKZENT),
        ("GRID", (0, 0), (-1, -1), 0.28, LINIE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2.6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.6),
    ]
    for i in range(1, len(daten)):
        if i % 2 == 0:
            st.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    t.setStyle(TableStyle(st))
    return t


def bauteile(md, breite):
    """Markdown zeilenweise in Flowables. Kein voller Parser — was die
    Berichte hier benutzen: Ueberschriften, Tabellen, Listen, Zitate, Absaetze."""
    raus = []
    zeilen = md.split("\n")
    i = 0
    while i < len(zeilen):
        z = zeilen[i]
        if z.startswith("|"):
            block = []
            while i < len(zeilen) and zeilen[i].startswith("|"):
                spalten = [c.strip() for c in zeilen[i].strip().strip("|").split("|")]
                # Trennzeile (---|---) gehoert nicht in die Ausgabe
                if not all(re.fullmatch(r":?-{2,}:?", c or "-") for c in spalten):
                    block.append(spalten)
                i += 1
            if block:
                raus.append(Spacer(1, 3))
                raus.append(tabelle(block, breite))
                raus.append(Spacer(1, 5))
            continue
        if z.startswith("### "):
            raus.append(Paragraph(inline(z[4:]), S["h3"]))
        elif z.startswith("## "):
            raus.append(Paragraph(inline(z[3:]), S["h2"]))
        elif z.startswith("# "):
            raus.append(Paragraph(inline(z[2:]), S["h1"]))
        elif z.strip() in ("---", "***"):
            raus.append(Spacer(1, 7))
        elif re.match(r"^\s*[-*]\s+", z):
            raus.append(Paragraph("• " + inline(re.sub(r"^\s*[-*]\s+", "", z)), S["li"]))
        elif re.match(r"^\s*\d+\.\s+", z):
            raus.append(Paragraph(inline(z.strip()), S["li"]))
        elif z.startswith(">"):
            raus.append(Paragraph(inline(z.lstrip("> ")), S["klein"]))
        elif z.strip():
            raus.append(Paragraph(inline(z.strip()), S["p"]))
        i += 1
    return raus


class Dok(BaseDocTemplate):
    def __init__(self, pfad, kopfzeile, datum):
        BaseDocTemplate.__init__(self, pfad, pagesize=A4,
                                 leftMargin=1.9 * cm, rightMargin=1.9 * cm,
                                 topMargin=1.8 * cm, bottomMargin=1.5 * cm,
                                 title=kopfzeile, author="Alltagsengel")
        self.kopfzeile, self.datum = kopfzeile, datum
        rahmen = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="haupt")
        self.addPageTemplates([PageTemplate(id="std", frames=rahmen, onPage=self._rand)])

    def _rand(self, c, doc):
        c.saveState()
        c.setFont(NORMAL, 7.2)
        c.setFillColor(GRAU)
        c.drawString(self.leftMargin, A4[1] - 1.2 * cm, self.kopfzeile)
        c.drawRightString(A4[0] - self.rightMargin, A4[1] - 1.2 * cm, self.datum)
        c.setStrokeColor(LINIE)
        c.setLineWidth(0.4)
        c.line(self.leftMargin, A4[1] - 1.38 * cm, A4[0] - self.rightMargin, A4[1] - 1.38 * cm)
        c.line(self.leftMargin, 1.22 * cm, A4[0] - self.rightMargin, 1.22 * cm)
        c.drawString(self.leftMargin, 0.9 * cm, "Alltagsengel UG — interner Bericht, vertraulich")
        c.drawRightString(A4[0] - self.rightMargin, 0.9 * cm, "Seite %d" % doc.page)
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


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Aufruf: md-nach-pdf.py <datei.md> [Kopfzeile]")
    md_pfad = sys.argv[1]
    md = open(md_pfad, encoding="utf-8").read()
    erste = next((z[2:].strip() for z in md.split("\n") if z.startswith("# ")), "Bericht")
    kopf = sys.argv[2] if len(sys.argv) > 2 else erste
    datum = next((re.search(r"\d{2}\.\d{2}\.\d{4}", z).group(0)
                  for z in md.split("\n")[:8] if re.search(r"\d{2}\.\d{2}\.\d{4}", z)), "")

    pruefe_keine_helvetica()
    ziel = os.path.splitext(md_pfad)[0] + ".pdf"
    dok = Dok(ziel, kopf, datum)
    breite = A4[0] - 2 * 1.9 * cm
    dok.build(bauteile(md, breite), canvasmaker=dejavu_canvas)
    pruefe_pdf_ohne_helvetica(ziel)
    print("OK: %s (%.1f KB)" % (ziel, os.path.getsize(ziel) / 1024.0))


if __name__ == "__main__":
    main()
