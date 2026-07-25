from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
from reportlab.pdfgen import canvas as canvasmod

GOLD = HexColor('#C8A951')
DARK = HexColor('#2C2C2C')
LIGHT_GOLD = HexColor('#F5EDD6')
LIGHT_GRAY = HexColor('#F5F5F5')
MED_GRAY = HexColor('#E8E8E8')
TEXT_GRAY = HexColor('#444444')

output_path = "/sessions/festive-sweet-lovelace/mnt/alltagsengel/Pflege_Kosten_Frankfurt_2026.pdf"

class NumberedCanvas(canvasmod.Canvas):
    def __init__(self, *args, **kwargs):
        canvasmod.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []
    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        canvasmod.Canvas.showPage(self)
    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.setFont("Helvetica", 8)
            self.setFillColor(HexColor('#999999'))
            self.drawCentredString(A4[0]/2, 15*mm, f"Seite {self._pageNumber} von {num_pages}")
            self.setStrokeColor(MED_GRAY)
            self.line(20*mm, 18*mm, A4[0]-20*mm, 18*mm)
            self.setFont("Helvetica", 7)
            self.drawString(20*mm, 12*mm, "Alltagsengel UG | Neue Mainzer Str. 66-68 | 60311 Frankfurt am Main | info@alltagsengel.care")
            canvasmod.Canvas.showPage(self)
        canvasmod.Canvas.save(self)

doc = SimpleDocTemplate(output_path, pagesize=A4, topMargin=20*mm, bottomMargin=25*mm, leftMargin=20*mm, rightMargin=20*mm)
styles = getSampleStyleSheet()

title_style = ParagraphStyle('T', parent=styles['Title'], fontSize=22, leading=26, textColor=DARK, fontName='Helvetica-Bold', spaceAfter=4*mm, alignment=TA_LEFT)
subtitle_style = ParagraphStyle('ST', parent=styles['Normal'], fontSize=12, leading=16, textColor=TEXT_GRAY, spaceAfter=8*mm)
h1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=16, leading=20, textColor=DARK, fontName='Helvetica-Bold', spaceBefore=8*mm, spaceAfter=4*mm)
h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=13, leading=17, textColor=HexColor('#333'), fontName='Helvetica-Bold', spaceBefore=5*mm, spaceAfter=3*mm)
body = ParagraphStyle('B', parent=styles['Normal'], fontSize=10, leading=14, textColor=TEXT_GRAY, spaceAfter=3*mm)
small = ParagraphStyle('S', parent=body, fontSize=8.5, leading=12, textColor=HexColor('#777'))
cs = ParagraphStyle('CS', parent=styles['Normal'], fontSize=9, leading=12, textColor=TEXT_GRAY)
cb = ParagraphStyle('CB', parent=cs, fontName='Helvetica-Bold')
ch = ParagraphStyle('CH', parent=cs, fontName='Helvetica-Bold', textColor=white, fontSize=9)

def P(t, s=cs): return Paragraph(t, s)
def B(t): return Paragraph(t, cb)
def H(t): return Paragraph(t, ch)

TS_BASIC = lambda: TableStyle([
    ('BACKGROUND', (0,0), (-1,0), DARK), ('TEXTCOLOR', (0,0), (-1,0), white),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, LIGHT_GRAY]),
    ('GRID', (0,0), (-1,-1), 0.5, MED_GRAY),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('LEFTPADDING', (0,0), (-1,-1), 6), ('RIGHTPADDING', (0,0), (-1,-1), 6),
])

story = []
w = doc.width

story.append(Paragraph("Intensivpflege &amp; 24-Stunden-Pflege", title_style))
story.append(Paragraph("Kosten, Finanzierung &amp; Anbieter in Frankfurt am Main / Hessen", subtitle_style))
story.append(HRFlowable(width="100%", thickness=2, color=GOLD, spaceAfter=6*mm))
story.append(Paragraph("Stand: Juli 2026 | Erstellt von Alltagsengel UG", small))
story.append(Spacer(1, 6*mm))

# 1
story.append(Paragraph("1. Was ist der Unterschied?", h1))
story.append(Paragraph("Die 24-Stunden-Betreuung und die au&szlig;erklinische Intensivpflege sind zwei grundlegend verschiedene Versorgungsformen.", body))

t = Table([
    [H("<b>Kriterium</b>"), H("<b>24h-Betreuung</b>"), H("<b>Intensivpflege</b>")],
    [B("Zielgruppe"), P("Senioren mit Pflegebedarf"), P("Beatmungspflichtige, Tracheostoma")],
    [B("Personal"), P("Betreuungskräfte (oft Osteuropa)"), P("Examinierte Pflegefachkräfte (1:1)")],
    [B("Leistungen"), P("Grundpflege, Hauswirtschaft, Begleitung"), P("Beatmung, Absaugung, med. Pflege")],
    [B("Rechtsgrundlage"), P("SGB XI (Pflegeversicherung)"), P("§37c SGB V (Krankenversicherung)")],
    [B("Kosten/Monat"), P("<b>2.500-3.500 EUR</b>"), P("<b>15.000-25.000 EUR</b>")],
    [B("Eigenanteil"), P("1.500-2.500 EUR (je nach PG)"), P("Max. 280 EUR/Jahr, dann 0 EUR")],
], colWidths=[w*0.22, w*0.39, w*0.39], repeatRows=1)
t.setStyle(TS_BASIC())
story.append(t)
story.append(Spacer(1, 6*mm))

# 2
story.append(Paragraph("2. Kosten der 24-Stunden-Betreuung", h1))
story.append(Paragraph("2.1 Monatliche Gesamtkosten", h2))
t = Table([
    [H("<b>Betreuungsmodell</b>"), H("<b>Kosten/Monat</b>")],
    [P("Basiskenntnisse Deutsch"), P("<b>2.500-2.800 EUR</b>")],
    [P("Gute Deutschkenntnisse + Erfahrung"), P("<b>2.800-3.200 EUR</b>")],
    [P("Pflegeerfahrung + fliessend Deutsch"), P("<b>3.200-3.500 EUR</b>")],
    [P("Kost und Logis (zusaetzlich)"), P("ca. 300-500 EUR")],
], colWidths=[w*0.65, w*0.35], repeatRows=1)
t.setStyle(TS_BASIC())
story.append(t)
story.append(Spacer(1, 4*mm))

story.append(Paragraph("2.2 Vergleich der Modelle", h2))
t = Table([
    [H("<b>Modell</b>"), H("<b>Kosten/Monat</b>"), H("<b>Verfuegbarkeit</b>")],
    [P("Osteuropa (Entsendung)"), P("<b>2.500-3.500 EUR</b>"), P("Gut, 7-10 Tage")],
    [P("Deutsche Fachkraft (Live-in)"), P("<b>5.000-7.000+ EUR</b>"), P("Kaum verfuegbar")],
    [P("Pflegeheim Frankfurt"), P("<b>3.350-3.533 EUR</b> EA"), P("Wartezeiten")],
], colWidths=[w*0.42, w*0.33, w*0.25], repeatRows=1)
t.setStyle(TS_BASIC())
story.append(t)
story.append(Spacer(1, 2*mm))
story.append(Paragraph("Mindestlohn seit Jan. 2026: 13,90 EUR/Std. - gilt auch fuer osteuropaeische Kraefte.", small))

story.append(Paragraph("2.3 Typische Leistungen", h2))
for l in ["Grundpflege (Koerperpflege, An-/Auskleiden, Hilfe beim Essen)",
          "Hauswirtschaft (Kochen, Putzen, Waesche, Einkaufen)",
          "Alltagsbegleitung (Spaziergaenge, Arztbesuche, Gesellschaft)",
          "Naechtliche Bereitschaft (Rufbereitschaft, kein Nachtdienst)",
          "Mobilisation und Lagerung"]:
    story.append(Paragraph("&bull; " + l, body))
story.append(Paragraph("<b>Nicht enthalten:</b> Medizinische Behandlungspflege - dafuer ambulanter Pflegedienst noetig.", body))

story.append(PageBreak())

# 3
story.append(Paragraph("3. Kosten der Intensivpflege", h1))
t = Table([
    [H("<b>Versorgungsform</b>"), H("<b>Kosten/Monat</b>"), H("<b>Eigenanteil</b>")],
    [P("Haeusliche IP (1:1, 24h)"), P("<b>15.000-25.000 EUR</b>"), P("Max. 280 EUR/Jahr")],
    [P("Intensivpflege-WG"), P("<b>8.000-15.000 EUR</b>"), P("Oft 0 EUR")],
    [P("Stationaere IP"), P("variabel"), P("Keine Zuzahlung")],
], colWidths=[w*0.35, w*0.30, w*0.35], repeatRows=1)
t.setStyle(TS_BASIC())
story.append(t)
story.append(Spacer(1, 4*mm))
story.append(Paragraph("Die <b>Krankenkasse</b> uebernimmt die komplette medizinische Behandlungspflege. Eigenanteil: 10 EUR/Tag fuer max. 28 Tage = <b>max. 280 EUR pro Jahr</b>. Bei chronischer Erkrankung Zuzahlungsbefreiung moeglich.", body))

# 4
story.append(Paragraph("4. Finanzierung &amp; Zuschuesse", h1))
story.append(Paragraph("4.1 Pflegegeld und Sachleistungen", h2))
t = Table([
    [H("<b>Pflegegrad</b>"), H("<b>Pflegegeld</b>"), H("<b>Sachleistung</b>")],
    [B("PG 1"), P("-"), P("-")],
    [B("PG 2"), P("347 EUR"), P("796 EUR")],
    [B("PG 3"), P("<b>599 EUR</b>"), P("<b>1.497 EUR</b>")],
    [B("PG 4"), P("800 EUR"), P("1.859 EUR")],
    [B("PG 5"), P("990 EUR"), P("2.299 EUR")],
], colWidths=[w*0.30, w*0.35, w*0.35], repeatRows=1)
ts = TS_BASIC()
ts.add('BACKGROUND', (0,3), (-1,3), LIGHT_GOLD)
t.setStyle(ts)
story.append(t)

story.append(Paragraph("4.2 Weitere Zuschuesse", h2))
t = Table([
    [H("<b>Leistung</b>"), H("<b>Betrag</b>"), H("<b>Ab</b>")],
    [P("Entlastungsbetrag (§45b)"), P("<b>131 EUR/Monat</b>"), P("PG 1")],
    [P("Entlastungsbudget (VHP+KZP)"), P("<b>3.539 EUR/Jahr</b>"), P("PG 2")],
    [P("Pflegehilfsmittel"), P("42 EUR/Monat"), P("PG 1")],
    [P("Wohnraumanpassung"), P("bis 4.180 EUR"), P("PG 1")],
    [P("Wohngruppenzuschlag"), P("224 EUR/Monat"), P("PG 1")],
    [P("WG-Zuschuss (ab 2026)"), P("450 EUR/Monat"), P("PG 1")],
], colWidths=[w*0.45, w*0.35, w*0.20], repeatRows=1)
t.setStyle(TS_BASIC())
story.append(t)

story.append(Paragraph("4.3 Rechenbeispiel: 24h mit Pflegegrad 3", h2))
t = Table([
    [H("<b>Position</b>"), H("<b>Betrag/Monat</b>")],
    [P("Kosten 24h-Betreuung"), P("2.800 EUR")],
    [P("abzgl. Pflegegeld PG 3"), P("- 599 EUR")],
    [P("abzgl. Entlastungsbetrag"), P("- 131 EUR")],
    [P("abzgl. Entlastungsbudget"), P("- 295 EUR")],
    [B("<b>Verbleibender Eigenanteil</b>"), B("<b>ca. 1.775 EUR</b>")],
], colWidths=[w*0.65, w*0.35], repeatRows=1)
ts2 = TS_BASIC()
ts2.add('BACKGROUND', (0,0), (-1,0), GOLD)
ts2.add('BACKGROUND', (0,-1), (-1,-1), LIGHT_GOLD)
ts2.add('BOX', (0,0), (-1,-1), 1.5, GOLD)
t.setStyle(ts2)
story.append(t)
story.append(Spacer(1, 2*mm))
story.append(Paragraph("Zusaetzlich Steuervorteile (§35a EStG: max. 4.000 EUR/Jahr = 333 EUR/Monat) moeglich.", small))

story.append(PageBreak())

# 5
story.append(Paragraph("5. Anbieter in Frankfurt am Main", h1))
story.append(Paragraph("5.1 Vermittlungen 24-Stunden-Betreuung", h2))
t = Table([
    [H("<b>Anbieter</b>"), H("<b>Schwerpunkt</b>")],
    [B("Pflegehelden Frankfurt"), P("Polnische Pflegekraefte, bundesweit")],
    [B("Brinkmann Pflegevermittlung"), P("Region Frankfurt / Main-Taunus")],
    [B("Sofiapflege"), P("Langjahrige Erfahrung, Region Frankfurt")],
    [B("Pflege zu Hause Kueffel"), P("Polnische Pflegekraefte")],
    [B("Sencurina Frankfurt"), P("Seit 2008, Formalitaeten-Service")],
    [B("Humanis"), P("30+ Jahre Erfahrung")],
    [B("Deutsche Seniorenbetreuung"), P("Bundesweite Vermittlung")],
    [B("Gute Pflege 24"), P("Pflegedienst Frankfurt und Umgebung")],
], colWidths=[w*0.45, w*0.55], repeatRows=1)
t.setStyle(TS_BASIC())
story.append(t)

story.append(Paragraph("5.2 Intensivpflegedienste", h2))
t = Table([
    [H("<b>Anbieter</b>"), H("<b>Schwerpunkt</b>")],
    [B("GIP Intensivpflege"), P("WGs Bockenheim + Niederrad, haeusliche IP")],
    [B("Pulmo Ambulante und IP"), P("Heimbeatmung, Rhein-Main, ganz Hessen")],
    [B("APIT Intensiv Team"), P("Seit 2004, Kinder-IP, ueberregional")],
    [B("Hand fuers Herz"), P("Ausserklinische Beatmung")],
    [B("Avyta"), P("12+ Jahre, ausserklinische IP")],
    [B("Leben fuer Leben"), P("Frankfurt, Rhein-Main, Main-Kinzig")],
    [B("RENAFAN"), P("IP-WG Offenbach/Tempelsee")],
    [B("SorglosPflege"), P("Vermittlung IP-Dienste")],
], colWidths=[w*0.45, w*0.55], repeatRows=1)
t.setStyle(TS_BASIC())
story.append(t)
story.append(Spacer(1, 2*mm))
story.append(Paragraph("Insgesamt ca. 26 Intensivpflegedienste in Frankfurt verfuegbar.", small))

# 6 Summary
story.append(Spacer(1, 5*mm))
story.append(HRFlowable(width="100%", thickness=2, color=GOLD, spaceAfter=4*mm))
story.append(Paragraph("6. Kostenuebersicht auf einen Blick", h1))
t = Table([
    [H("<b>Versorgung</b>"), H("<b>Gesamt/M</b>"), H("<b>Eigenanteil/M</b>"), H("<b>Traeger</b>")],
    [B("24h Osteuropa"), P("2.500-3.500 EUR"), P("1.500-2.500 EUR"), P("Privat+PK")],
    [B("24h Deutsche Kraft"), P("5.000-7.000+ EUR"), P("3.500-5.500+ EUR"), P("Privat+PK")],
    [B("Pflegeheim FFM"), P("variabel"), P("3.350-3.533 EUR"), P("Privat+PK")],
    [B("IP haeuslich"), P("15.000-25.000 EUR"), P("<b>Max. 280 EUR/J</b>"), P("KK+PK")],
    [B("IP-WG"), P("8.000-15.000 EUR"), P("<b>Oft 0 EUR</b>"), P("KK+PK")],
], colWidths=[w*0.28, w*0.25, w*0.25, w*0.22], repeatRows=1)
ts3 = TS_BASIC()
ts3.add('BACKGROUND', (0,0), (-1,0), GOLD)
ts3.add('BOX', (0,0), (-1,-1), 1.5, GOLD)
t.setStyle(ts3)
story.append(t)
story.append(Spacer(1, 3*mm))
story.append(Paragraph("PK = Pflegekasse | KK = Krankenkasse", small))

story.append(Spacer(1, 8*mm))
story.append(HRFlowable(width="100%", thickness=1, color=MED_GRAY, spaceAfter=3*mm))
story.append(Paragraph("Recherche erstellt am 20. Juli 2026. Alle Angaben ohne Gewaehr.", small))
story.append(Paragraph("<b>Hinweis:</b> Alltagsengel bietet Alltagsbegleitung nach §45a SGB XI an - keine Pflege, sondern Unterstuetzung im Alltag. Der Entlastungsbetrag (131 EUR/Monat) kann dafuer eingesetzt werden.", body))

doc.build(story, canvasmaker=NumberedCanvas)
print("OK:", output_path)
