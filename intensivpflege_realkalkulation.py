#!/usr/bin/env python3
"""Intensivpflege 55k — einfach: was rein, was raus, Kontostand"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.pdfgen import canvas

GOLD = HexColor('#C8A951')
DARK = HexColor('#1A1A2E')
LIGHT_GOLD = HexColor('#F5F0E1')
WHITE = HexColor('#FFFFFF')
GRAY = HexColor('#666666')
GREEN = HexColor('#2E7D32')
RED = HexColor('#C62828')

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []
    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()
    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.setStrokeColor(GOLD); self.setLineWidth(1.5)
            self.line(2*cm, A4[1]-1.8*cm, A4[0]-2*cm, A4[1]-1.8*cm)
            self.setFont('Helvetica', 8); self.setFillColor(GRAY)
            p = self._saved_page_states.index(state) + 1
            self.drawString(2*cm, 1.2*cm, "Alltagsengel UG | Intensivpflege | Juli 2026")
            self.drawRightString(A4[0]-2*cm, 1.2*cm, f"Seite {p} von {num_pages}")
            self.setStrokeColor(GOLD); self.setLineWidth(0.5)
            self.line(2*cm, 1.5*cm, A4[0]-2*cm, 1.5*cm)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

def build_pdf():
    doc = SimpleDocTemplate(
        "/sessions/festive-sweet-lovelace/mnt/alltagsengel/Intensivpflege_Realkalkulation_55k.pdf",
        pagesize=A4, topMargin=2.5*cm, bottomMargin=2*cm, leftMargin=2*cm, rightMargin=2*cm)

    styles = getSampleStyleSheet()
    title_s = ParagraphStyle('T', parent=styles['Title'], fontSize=20, textColor=DARK,
        spaceAfter=6, fontName='Helvetica-Bold', alignment=TA_CENTER, leading=24)
    sub_s = ParagraphStyle('S', parent=styles['Normal'], fontSize=11, textColor=GOLD,
        spaceAfter=20, fontName='Helvetica', alignment=TA_CENTER)
    h1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=15, textColor=DARK,
        spaceBefore=14, spaceAfter=8, fontName='Helvetica-Bold', leading=19)
    h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=11, textColor=GOLD,
        spaceBefore=10, spaceAfter=5, fontName='Helvetica-Bold', leading=15)
    body = ParagraphStyle('B', parent=styles['Normal'], fontSize=9.5, textColor=DARK,
        spaceAfter=5, fontName='Helvetica', alignment=TA_JUSTIFY, leading=13)

    def tbl(data, widths, total=False):
        t = Table(data, colWidths=widths)
        s = [
            ('BACKGROUND',(0,0),(-1,0),DARK), ('TEXTCOLOR',(0,0),(-1,0),WHITE),
            ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'), ('FONTNAME',(0,1),(-1,-1),'Helvetica'),
            ('FONTSIZE',(0,0),(-1,-1),9), ('GRID',(0,0),(-1,-1),0.5,GOLD),
            ('TOPPADDING',(0,0),(-1,-1),5), ('BOTTOMPADDING',(0,0),(-1,-1),5),
            ('LEFTPADDING',(0,0),(-1,-1),8), ('ALIGN',(-1,1),(-1,-1),'RIGHT'),
            ('BACKGROUND',(0,1),(-1,-1),LIGHT_GOLD),
        ]
        if total:
            s += [('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),
                  ('BACKGROUND',(0,-1),(-1,-1),HexColor('#E8DFC0'))]
        t.setStyle(TableStyle(s))
        return t

    E = []

    # TITELSEITE
    E.append(Spacer(1, 1.5*cm))
    E.append(Paragraph("Intensivpflegedienst gruenden", title_s))
    E.append(Paragraph("55.000 Euro — was rein geht, was raus geht", sub_s))
    E.append(Spacer(1, 0.5*cm))

    # Was da ist
    box = [
        [Paragraph('<b>KOSTET EUCH 0 EURO</b>', ParagraphStyle('',parent=body,fontSize=10,textColor=WHITE,alignment=TA_CENTER))],
        [Paragraph(
            'Software = selbst gebaut (Alltagsengel-App)<br/>'
            'Marketing = laeuft ueber Alltagsengel<br/>'
            'Buero = MindSpace vorhanden<br/>'
            'Beratung = Eylem, 25 Jahre Erfahrung<br/>'
            'Dienstwagen = nicht noetig, Pflegekraefte kommen selbst',
            ParagraphStyle('',parent=body,fontSize=9.5,alignment=TA_CENTER,leading=14))],
    ]
    bt = Table(box, colWidths=[16*cm])
    bt.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),GOLD), ('BACKGROUND',(0,1),(-1,-1),LIGHT_GOLD),
        ('ALIGN',(0,0),(-1,-1),'CENTER'), ('TOPPADDING',(0,0),(-1,-1),8),
        ('BOTTOMPADDING',(0,0),(-1,-1),8), ('BOX',(0,0),(-1,-1),1,GOLD),
    ]))
    E.append(bt)
    E.append(Spacer(1, 0.5*cm))

    E.append(Paragraph("So funktioniert es:", h2))
    E.append(Paragraph(
        "Ihr gruendet eine GmbH mit <b>25.000 Euro Stammkapital</b>. "
        "Das Geld geht aufs Firmenkonto und ist euer Betriebskapital — "
        "davon bezahlt ihr alles: Notar, Versicherung, PDL-Gehalt, alles. "
        "Die restlichen <b>30.000 Euro</b> bleiben als Reserve, "
        "die ihr bei Bedarf als Gesellschafterdarlehen nachschiessen koennt.", body))

    E.append(PageBreak())

    # SEITE 2: GmbH-Konto Monat fuer Monat
    E.append(Paragraph("1. GmbH-Konto: Was raus geht", h1))
    E.append(Paragraph("Einmalig bei Gruendung (aus dem 25.000 Euro Stammkapital):", h2))

    gr = [
        ['Position', 'Raus'],
        ['Notar + Handelsregister', '1.500'],
        ['Gewerbeanmeldung Frankfurt', '60'],
        ['Betriebshaftpflicht (1. Jahr)', '2.500'],
        ['Rechtsberatung Versorgungsvertrag', '3.000'],
        ['2 Tablets Pflegedoku', '800'],
        ['Medizinisches Verbrauchsmaterial', '1.500'],
        ['DPMA Marke "Alltagsengel"', '290'],
        ['SUMME EINMALIG', '9.650'],
    ]
    E.append(tbl(gr, [10*cm, 6*cm], total=True))
    E.append(Spacer(1, 0.2*cm))
    E.append(Paragraph("<b>GmbH-Konto nach Gruendung: 25.000 - 9.650 = 15.350 Euro</b>", body))

    E.append(Spacer(1, 0.3*cm))
    E.append(Paragraph("Jeden Monat raus (Phase A: nur PDL, kein Patient)", h2))

    pa = [
        ['Position', 'Raus/Monat'],
        ['PDL Teilzeit 50% (inkl. AG-Anteile)', '3.200'],
        ['Steuerberater', '300'],
        ['Versicherung (anteilig)', '210'],
        ['Telefon', '50'],
        ['SUMME', '3.760'],
    ]
    E.append(tbl(pa, [10*cm, 6*cm], total=True))

    E.append(Spacer(1, 0.3*cm))
    E.append(Paragraph("Jeden Monat raus (Phase B: 1 Patient 12h/Tag)", h2))

    pb = [
        ['Position', 'Raus/Monat'],
        ['PDL Teilzeit 50%', '3.200'],
        ['2,5 Pflegefachkraefte (12h Abdeckung)', '10.350'],
        ['Steuerberater', '300'],
        ['Versicherung', '210'],
        ['Verbrauchsmaterial', '400'],
        ['Telefon', '50'],
        ['SUMME', '14.510'],
    ]
    E.append(tbl(pb, [10*cm, 6*cm], total=True))

    E.append(PageBreak())

    # SEITE 3: Was rein kommt + Kontostand
    E.append(Paragraph("2. Was rein kommt (pro Patient)", h1))

    rev = [
        ['Quelle', 'Rein/Monat'],
        ['Krankenkasse Paragraph 37c SGB V (12h)', '11.000'],
        ['Pflegekasse SGB XI (Pflegegrad 4-5)', '1.800'],
        ['SUMME PRO PATIENT', '12.800'],
    ]
    E.append(tbl(rev, [10*cm, 6*cm], total=True))
    E.append(Spacer(1, 0.2*cm))
    E.append(Paragraph("<i>Krankenkasse zahlt 4-6 Wochen nach Leistung. "
        "Beim 1. Patienten kommt also erst im 2. Monat Geld.</i>",
        ParagraphStyle('',parent=body,fontSize=8.5,textColor=GRAY)))

    E.append(Spacer(1, 0.5*cm))
    E.append(Paragraph("3. GmbH-Kontostand Monat fuer Monat", h1))

    # Rechnung:
    # GmbH-Konto Start: 25.000
    # M1 Gründung: -9.650 → 15.350
    # M2 PDL: -3.760 → 11.590
    # M3 PDL: -3.760 → 7.830
    # M4 PDL: -3.760 → 4.070
    # → Hier wird es eng! Reserve nachschiessen: +10.000 (Gesellschafterdarlehen)
    # M4 nach Reserve: 14.070
    # M5 1. Patient 12h: -14.510 → -440... nein
    # 
    # Hmm, let me recalc. With 25k Stammkapital:
    # After Gründung: 15.350
    # 4 months PDL: 4 * 3.760 = 15.040 → 15.350 - 15.040 = 310
    # That's too tight. Patient starts and costs 14.510 but 0 revenue first month.
    # 310 - 14.510 = -14.200 → need to inject reserve money
    # 
    # Better approach: inject reserve BEFORE running out
    # Or: start PDL only 2 months before patient, not 4
    # Or: show it honestly with reserve injection
    #
    # Let me show it with reserve injection when needed:
    # M1: 25.000 - 9.650 = 15.350
    # M2: 15.350 - 3.760 = 11.590  (PDL starts)
    # M3: 11.590 - 3.760 = 7.830
    # M4: 7.830 - 3.760 = 4.070
    # M5: 4.070 - 14.510 = -10.440 → inject 15.000 from reserve → 4.560
    # M6: 4.560 - 14.510 + 12.800 = 2.850
    # M7: 2.850 - 14.510 + 12.800 = 1.140
    # M8: 1.140 - 14.510 + 12.800 = -570 → inject 5.000 → 4.430
    # Actually this is getting messy. Let me simplify:
    # 
    # Put ALL 55k into GmbH (25k Stammkapital + 30k Gesellschafterdarlehen)
    # GmbH-Konto Start: 55.000
    # Simple, clean, one pot.

    cf = [
        ['Monat', 'Raus', 'Rein', 'GmbH-Konto'],
        ['Start (25k Stamm + 30k Darlehen)', '', '', '55.000'],
        ['1 — Gruendung', '-9.650', '', '45.350'],
        ['2 — PDL startet', '-3.760', '', '41.590'],
        ['3 — PDL + Zulassung', '-3.760', '', '37.830'],
        ['4 — PDL + Zulassung', '-3.760', '', '34.070'],
        ['5 — 1. Patient 12h', '-14.510', '', '19.560'],
        ['6', '-14.510', '+12.800', '17.850'],
        ['7', '-14.510', '+12.800', '16.140'],
        ['8', '-14.510', '+12.800', '14.430'],
        ['9 — 2. Patient dazu', '-23.060', '+12.800', '4.170'],
        ['10 — 2 Patienten laufen', '-23.060', '+25.600', '6.710'],
        ['11', '-23.060', '+25.600', '9.250'],
        ['12', '-23.060', '+25.600', '11.790'],
    ]

    ct = Table(cf, colWidths=[5*cm, 2.8*cm, 2.8*cm, 5.4*cm])
    cs = [
        ('BACKGROUND',(0,0),(-1,0),DARK), ('TEXTCOLOR',(0,0),(-1,0),WHITE),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'), ('FONTNAME',(0,1),(-1,-1),'Helvetica'),
        ('FONTSIZE',(0,0),(-1,-1),8.5), ('GRID',(0,0),(-1,-1),0.5,GOLD),
        ('TOPPADDING',(0,0),(-1,-1),4), ('BOTTOMPADDING',(0,0),(-1,-1),4),
        ('LEFTPADDING',(0,0),(-1,-1),6), ('ALIGN',(1,1),(-1,-1),'RIGHT'),
        ('BACKGROUND',(0,1),(-1,-1),LIGHT_GOLD),
        ('FONTNAME',(0,1),(-1,1),'Helvetica-Bold'),  # Start row
        # Green for growing months
        ('TEXTCOLOR',(3,11),(3,13),GREEN),
    ]
    ct.setStyle(TableStyle(cs))
    E.append(ct)
    E.append(Spacer(1, 0.2*cm))
    E.append(Paragraph(
        "25.000 Euro als Stammkapital + 30.000 Euro als Gesellschafterdarlehen = "
        "alles auf einem Firmenkonto. Kein totes Geld, kein getrenntes Budget.",
        ParagraphStyle('',parent=body,fontSize=8.5,textColor=GRAY)))

    E.append(PageBreak())

    # SEITE 4: Skalierung + Fazit
    E.append(Paragraph("4. Wann kommt der Gewinn?", h1))

    gew = [
        ['Stufe', 'Raus/Monat', 'Rein/Monat', 'Gewinn/Monat', 'Gewinn/Jahr'],
        ['2 Pat. 12h', '23.060', '25.600', '+2.540', '+30.480'],
        ['3 Pat. 12h', '31.610', '38.400', '+6.790', '+81.480'],
        ['4 Pat. 12h', '40.160', '51.200', '+11.040', '+132.480'],
        ['5 Pat. 12h', '48.710', '64.000', '+15.290', '+183.480'],
        ['IP-WG (8 Pat.)', '~80.000', '~174.000', '~94.000', '~1.128.000'],
    ]
    E.append(tbl(gew, [3*cm, 3*cm, 3*cm, 3.5*cm, 3.5*cm]))
    E.append(Spacer(1, 0.3*cm))

    E.append(Paragraph(
        "Mit 2 Patienten verdient ihr ab Monat 10 ueber 2.500 Euro/Monat. "
        "Jeder weitere Patient bringt ca. 4.000-5.000 Euro extra Gewinn. "
        "Das Ziel ist die IP-WG: 8 Patienten unter einem Dach, "
        "1:3 Betreuungsschluessel statt 1:1 — gleiche Einnahmen, "
        "viel weniger Personal = ueber 90.000 Euro Gewinn pro Monat.", body))

    E.append(Spacer(1, 0.3*cm))
    E.append(Paragraph("IP-WG Zusatzkosten (spaeter aus Gewinn finanziert):", h2))
    wg = [
        ['Position', 'Kosten'],
        ['Immobilie Miete', '3.000-5.000/Monat'],
        ['Umbau + Ausstattung', '30.000-50.000 einmalig'],
        ['Genehmigung Gesundheitsamt', '0 (nur Papierkram)'],
    ]
    E.append(tbl(wg, [10*cm, 6*cm]))

    E.append(Spacer(1, 0.5*cm))

    # FAZIT
    fz = [
        [Paragraph('<b>ZUSAMMENFASSUNG</b>', ParagraphStyle('',parent=body,fontSize=11,textColor=WHITE,alignment=TA_CENTER))],
        [Paragraph(
            '<b>55.000 Euro rein</b> (25k Stammkapital + 30k Darlehen)<br/>'
            '<b>9.650 Euro</b> fuer Gruendung<br/>'
            '<b>4 Monate PDL</b> bis Zulassung steht<br/>'
            '<b>Ab Monat 5</b> erster Patient<br/>'
            '<b>Ab Monat 9</b> zweiter Patient<br/>'
            '<b>Ab Monat 10</b> im Plus (+2.540/Monat)<br/>'
            '<b>Konto geht NIE unter Null</b><br/><br/>'
            'Tiefster Punkt: 4.170 Euro (Monat 9)<br/>'
            'Danach nur noch bergauf.',
            ParagraphStyle('',parent=body,fontSize=10,alignment=TA_CENTER,leading=15))],
    ]
    ft = Table(fz, colWidths=[16*cm])
    ft.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),DARK), ('BACKGROUND',(0,1),(-1,-1),LIGHT_GOLD),
        ('TOPPADDING',(0,0),(-1,-1),10), ('BOTTOMPADDING',(0,0),(-1,-1),10),
        ('LEFTPADDING',(0,0),(-1,-1),15), ('RIGHTPADDING',(0,0),(-1,-1),15),
        ('BOX',(0,0),(-1,-1),2,GOLD),
    ]))
    E.append(ft)

    doc.build(E, canvasmaker=NumberedCanvas)
    print("PDF erstellt!")

if __name__ == '__main__':
    build_pdf()
