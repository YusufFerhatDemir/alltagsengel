#!/usr/bin/env python3
"""Professionelle PDF: Ambulanten Intensivpflegedienst gründen"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether
)
from reportlab.pdfgen import canvas

# Colors
GOLD = HexColor('#C8A951')
DARK = HexColor('#1A1A2E')
LIGHT_GOLD = HexColor('#F5F0E1')
WHITE = HexColor('#FFFFFF')
GRAY = HexColor('#666666')
LIGHT_GRAY = HexColor('#F5F5F5')

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
            # Header line
            self.setStrokeColor(GOLD)
            self.setLineWidth(1.5)
            self.line(2*cm, A4[1] - 1.8*cm, A4[0] - 2*cm, A4[1] - 1.8*cm)
            # Footer
            self.setFont('Helvetica', 8)
            self.setFillColor(GRAY)
            page_num = self._saved_page_states.index(state) + 1
            self.drawString(2*cm, 1.2*cm, "Alltagsengel UG | Recherche: Intensivpflegedienst gruenden | Juli 2026")
            self.drawRightString(A4[0] - 2*cm, 1.2*cm, f"Seite {page_num} von {num_pages}")
            # Footer line
            self.setStrokeColor(GOLD)
            self.setLineWidth(0.5)
            self.line(2*cm, 1.5*cm, A4[0] - 2*cm, 1.5*cm)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

def build_pdf():
    doc = SimpleDocTemplate(
        "/sessions/festive-sweet-lovelace/mnt/alltagsengel/Intensivpflegedienst_Gruendung_2026.pdf",
        pagesize=A4,
        topMargin=2.5*cm,
        bottomMargin=2*cm,
        leftMargin=2*cm,
        rightMargin=2*cm,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle('CustomTitle', parent=styles['Title'],
        fontSize=22, textColor=DARK, spaceAfter=6, fontName='Helvetica-Bold',
        alignment=TA_CENTER, leading=26)
    
    subtitle_style = ParagraphStyle('Subtitle', parent=styles['Normal'],
        fontSize=11, textColor=GOLD, spaceAfter=20, fontName='Helvetica',
        alignment=TA_CENTER)

    h1_style = ParagraphStyle('H1', parent=styles['Heading1'],
        fontSize=16, textColor=DARK, spaceBefore=20, spaceAfter=10,
        fontName='Helvetica-Bold', borderWidth=0, leading=20)

    h2_style = ParagraphStyle('H2', parent=styles['Heading2'],
        fontSize=12, textColor=GOLD, spaceBefore=14, spaceAfter=6,
        fontName='Helvetica-Bold', leading=16)

    body_style = ParagraphStyle('Body', parent=styles['Normal'],
        fontSize=9.5, textColor=DARK, spaceAfter=6, fontName='Helvetica',
        alignment=TA_JUSTIFY, leading=13)

    bold_body = ParagraphStyle('BoldBody', parent=body_style,
        fontName='Helvetica-Bold')

    small_style = ParagraphStyle('Small', parent=body_style,
        fontSize=8, textColor=GRAY, leading=11)

    story = []

    # === TITLE PAGE ===
    story.append(Spacer(1, 3*cm))
    story.append(Paragraph("Ambulanten Intensivpflegedienst<br/>gruenden", title_style))
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("Umfassende Recherche: Business Case, Zulassung, Personalrekrutierung", subtitle_style))
    story.append(Spacer(1, 1*cm))

    # Info box
    info_data = [
        ['Erstellt:', '20. Juli 2026'],
        ['Fuer:', 'Yusuf Ferhat Demir / Alltagsengel UG'],
        ['Standort:', 'Frankfurt am Main, Hessen'],
        ['Rechtsgrundlage:', 'Ausserklinische Intensivpflege nach Paragraph 37c SGB V'],
    ]
    info_table = Table(info_data, colWidths=[4*cm, 12*cm])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME', (1,0), (1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 10),
        ('TEXTCOLOR', (0,0), (-1,-1), DARK),
        ('ALIGN', (0,0), (0,-1), 'RIGHT'),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (0,-1), 10),
    ]))
    story.append(info_table)

    story.append(Spacer(1, 2*cm))

    # Key highlights box
    highlight_data = [
        [Paragraph('<b>DER JACKPOT AUF EINEN BLICK</b>', ParagraphStyle('', parent=body_style, fontSize=11, textColor=DARK, alignment=TA_CENTER))],
        [Paragraph('15.000-25.000 Euro/Monat pro Patient von der Krankenkasse<br/>'
                   'Gewinnmarge 10-20% | IP-WG mit 8 Patienten: 180.000-420.000 Euro/Jahr Gewinn<br/>'
                   'Markt = Anbietermarkt: Wer Personal hat, bekommt Patienten<br/>'
                   'Eigene Rekrutierung aus der Tuerkei = strategischer Wettbewerbsvorteil',
                   ParagraphStyle('', parent=body_style, fontSize=10, alignment=TA_CENTER, leading=15))],
    ]
    highlight_table = Table(highlight_data, colWidths=[16*cm])
    highlight_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), GOLD),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('BACKGROUND', (0,1), (-1,-1), LIGHT_GOLD),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LEFTPADDING', (0,0), (-1,-1), 15),
        ('RIGHTPADDING', (0,0), (-1,-1), 15),
        ('BOX', (0,0), (-1,-1), 1, GOLD),
    ]))
    story.append(highlight_table)

    story.append(PageBreak())

    # === PAGE 2: BUSINESS CASE ===
    story.append(Paragraph("1. Business Case und Gewinnpotenzial", h1_style))

    story.append(Paragraph("1.1 Verguetung pro Patient", h2_style))
    story.append(Paragraph(
        "Die Kosten fuer eine 24-Stunden-Intensivpflege eines beatmungspflichtigen Patienten liegen bei "
        "<b>15.000-25.000 Euro pro Monat</b>. Die Krankenkasse (Paragraph 37c SGB V) uebernimmt die medizinische "
        "Behandlungspflege (ca. 80-90% der Gesamtkosten). Die Pflegekasse (SGB XI) uebernimmt die Grundpflege. "
        "Der Eigenanteil der Patienten ist minimal: max. 280 Euro/Jahr.", body_style))

    story.append(Paragraph("1.2 Stundensaetze", h2_style))
    rate_data = [
        ['Versorgungsform', 'Stundensatz (Richtwert)'],
        ['1:1 Einzelversorgung (haeuslich)', 'ca. 55-65 Euro/Stunde'],
        ['Intensivpflege-WG (1:3 Betreuung)', 'ca. 30-40 Euro/Stunde pro Patient'],
    ]
    rate_table = Table(rate_data, colWidths=[9*cm, 7*cm])
    rate_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('ALIGN', (1,0), (1,-1), 'CENTER'),
        ('GRID', (0,0), (-1,-1), 0.5, GOLD),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('BACKGROUND', (0,1), (-1,-1), LIGHT_GOLD),
    ]))
    story.append(rate_table)
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("1.3 Kostenstruktur und Margen", h2_style))
    story.append(Paragraph(
        "Personalkosten machen ca. <b>75-85%</b> der Gesamtkosten aus. Sachkosten, Miete, Verwaltung: 10-15%. "
        "Typische Gewinnmarge: <b>10-20% Umsatzrendite</b>. Intensivpflege tendiert zum oberen Ende (15-20%), "
        "da die Verguetungssaetze hoeher sind und die Auslastung planbar ist (24/7-Versorgung).", body_style))

    story.append(Paragraph("1.4 Beispielrechnung: 1 Patient (1:1, haeuslich)", h2_style))
    example_data = [
        ['Position', 'Betrag/Monat'],
        ['Erloes von Krankenkasse', 'ca. 20.000 Euro'],
        ['Personalkosten (5,6 VZAe fuer 24/7)', 'ca. 16.000-17.000 Euro'],
        ['Sachkosten, PDL-Anteil, Verwaltung', 'ca. 1.500-2.000 Euro'],
        ['Gewinn vor Steuern', 'ca. 1.000-2.500 Euro'],
    ]
    ex_table = Table(example_data, colWidths=[9*cm, 7*cm])
    ex_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ('GRID', (0,0), (-1,-1), 0.5, GOLD),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('BACKGROUND', (0,1), (-1,-2), LIGHT_GOLD),
        ('BACKGROUND', (0,-1), (-1,-1), HexColor('#E8DFC0')),
    ]))
    story.append(ex_table)
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(
        "<i>Hinweis: Die Marge pro Patient ist bei 1:1-Versorgung relativ gering. Das grosse Geld liegt in der "
        "Skalierung und besonders in Intensivpflege-WGs (siehe Abschnitt 6).</i>", small_style))

    story.append(Paragraph("1.5 Rentabilitaetsschwelle", h2_style))
    story.append(Paragraph(
        "Ab <b>3-5 Patienten</b> in 1:1-Versorgung wird ein Intensivpflegedienst rentabel. "
        "Ab <b>6-8 Patienten</b> in einer IP-WG. Erste stabile Gewinne nach <b>12-24 Monaten</b>. "
        "Realistischer Jahresumsatz mit 10 Patienten (1:1): ca. <b>1,8-3 Mio. Euro</b>.", body_style))

    story.append(PageBreak())

    # === PAGE 3: ZULASSUNG ===
    story.append(Paragraph("2. Zulassung und Voraussetzungen", h1_style))

    story.append(Paragraph("2.1 Gesetzliche Grundlage", h2_style))
    story.append(Paragraph(
        "Seit dem GKV-IPReG (2020) ist die ausserklinische Intensivpflege (AKI) in <b>Paragraph 37c SGB V</b> "
        "eigenstaendig geregelt. Fuer die Abrechnung mit Krankenkassen braucht man einen "
        "<b>Versorgungsvertrag nach Paragraph 132l SGB V</b>.", body_style))

    story.append(Paragraph("2.2 Kann Yusuf ohne Pflegeausbildung Geschaeftsfuehrer sein?", h2_style))
    story.append(Paragraph(
        "<b>Ja!</b> Die Geschaeftsfuehrung erfordert keine Pflegeausbildung. Yusuf kann als GF die "
        "kaufmaennischen/organisatorischen Aufgaben uebernehmen. Er muss aber eine qualifizierte "
        "<b>Pflegedienstleitung (PDL)</b> anstellen.", body_style))

    story.append(Paragraph("2.3 Anforderungen an die PDL", h2_style))
    pdl_data = [
        ['Anforderung', 'Details'],
        ['Ausbildung', 'Examinierte Pflegefachkraft'],
        ['Berufserfahrung', 'Mind. 2 Jahre in den letzten 5 Jahren'],
        ['Weiterbildung', 'PDL-Weiterbildung (mind. 460 Stunden) ODER Pflegestudium'],
        ['Intensivpflege', 'Fachweiterbildung Intensivpflege/Anaesthesie'],
    ]
    pdl_table = Table(pdl_data, colWidths=[4*cm, 12*cm])
    pdl_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME', (1,1), (1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('GRID', (0,0), (-1,-1), 0.5, GOLD),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('BACKGROUND', (0,1), (-1,-1), LIGHT_GOLD),
    ]))
    story.append(pdl_table)
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("<b>Empfehlung:</b> PDL mit Gesellschafteranteilen oder Gewinnbeteiligung binden, "
                           "um Abhaengigkeit zu reduzieren.", body_style))

    story.append(Paragraph("2.4 Personalanforderungen (pro Patient, 1:1)", h2_style))
    story.append(Paragraph(
        "Fuer die 24/7-Versorgung eines Patienten: ca. <b>5,0-5,6 VZAe</b> Pflegefachkraefte. "
        "Alle muessen examiniert sein + Zusatzqualifikation Beatmungspflege (mind. 120h Basiskurs). "
        "Jaehrliche Fortbildungspflicht.", body_style))

    story.append(Paragraph("2.5 Rechtsform", h2_style))
    story.append(Paragraph(
        "<b>GmbH empfohlen</b> (Haftungsbegrenzung, Seriositaet gegenueber Kassen). Stammkapital: 25.000 Euro "
        "(mind. 12.500 Euro bei Gruendung). Separate GmbH fuer Intensivpflege gruenden "
        "(Haftungstrennung von Alltagsengel UG).", body_style))

    story.append(PageBreak())

    # === PAGE 4: PERSONAL AUS DEM AUSLAND ===
    story.append(Paragraph("3. Personalrekrutierung aus dem Ausland", h1_style))

    story.append(Paragraph("3.1 Herkunftslaender im Vergleich", h2_style))
    country_data = [
        ['Land', 'Vorteile', 'Triple Win?'],
        ['Tuerkei', 'Kulturelle Naehe, gut ausgebildet, Deutschland-Interesse', 'Nein'],
        ['Philippinen', 'Sehr gut ausgebildet, Englisch, hohes Pflege-Ethos', 'Ja'],
        ['Tunesien', 'EU-nah, junge Bevoelkerung', 'Ja'],
        ['Indien', 'Grosse Ausbildungskapazitaet', 'Ja'],
        ['Indonesien', 'Wachsender Pool', 'Ja'],
    ]
    c_table = Table(country_data, colWidths=[3*cm, 9.5*cm, 3.5*cm])
    c_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME', (1,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('ALIGN', (2,0), (2,-1), 'CENTER'),
        ('GRID', (0,0), (-1,-1), 0.5, GOLD),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('BACKGROUND', (0,1), (-1,-1), LIGHT_GOLD),
    ]))
    story.append(c_table)
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("3.2 Kosten pro Fachkraft (Rekrutierung bis Anerkennung)", h2_style))
    cost_data = [
        ['Position', 'Kosten'],
        ['Sprachkurs (B1-B2) im Herkunftsland', '2.000-4.000 Euro'],
        ['Vermittlungsgebuehr (Agentur)', '3.000-8.000 Euro'],
        ['Flug und Erstausstattung', '1.000-2.000 Euro'],
        ['Anerkennungsverfahren + Anpassungslehrgang', '2.000-5.000 Euro'],
        ['Unterkunft/Begleitung Anfangsphase', '2.000-4.000 Euro'],
        ['GESAMT PRO FACHKRAFT', '10.000-20.000 Euro'],
    ]
    cost_table = Table(cost_data, colWidths=[9*cm, 7*cm])
    cost_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTNAME', (0,1), (-1,-2), 'Helvetica'),
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ('GRID', (0,0), (-1,-1), 0.5, GOLD),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('BACKGROUND', (0,1), (-1,-2), LIGHT_GOLD),
        ('BACKGROUND', (0,-1), (-1,-1), HexColor('#E8DFC0')),
    ]))
    story.append(cost_table)
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("3.3 Beschleunigtes Fachkraefteverfahren", h2_style))
    story.append(Paragraph(
        "Seit Maerz 2024 (novelliertes Fachkraefteeinwanderungsgesetz): Pflegekraefte mit <b>2 Jahren "
        "Berufserfahrung</b> koennen auch ohne anerkannten deutschen Abschluss einreisen und als "
        "Pflegehilfskraft arbeiten, waehrend sie den Anerkennungsprozess in Deutschland durchlaufen. "
        "Beschleunigtes Verfahren: ca. <b>15 Wochen</b> (Gebuehr: 411 Euro + 75 Euro Visum).", body_style))

    story.append(Paragraph("3.4 Eigene Rekrutierungsagentur (Tuerkei)", h2_style))
    story.append(Paragraph(
        "<b>Moeglich und empfohlen!</b> Yusufs tuerkische Sprachkenntnisse und Netzwerke sind ein "
        "massiver Wettbewerbsvorteil. Schritte: Gewerbeanmeldung als Personalvermittlung, "
        "Kooperationspartner in der Tuerkei finden (Pflegeschulen, Unis), Prozess standardisieren. "
        "Optional: Guetesiegel 'Faire Anwerbung Pflege Deutschland' beantragen. "
        "Kann als <b>zweites Geschaeftsmodell</b> auch andere Pflegedienste bedienen.", body_style))

    story.append(PageBreak())

    # === PAGE 5: GRÜNDUNGSKOSTEN ===
    story.append(Paragraph("4. Gruendungskosten und Anlaufphase", h1_style))

    story.append(Paragraph("4.1 Startkapital", h2_style))
    start_data = [
        ['Position', 'Kosten (geschaetzt)'],
        ['GmbH-Gruendung (Notar, HR, Stammkapital)', '25.000-30.000 Euro'],
        ['Bueroausstattung und IT', '10.000-20.000 Euro'],
        ['Dienstwagen (1-2)', '15.000-30.000 Euro'],
        ['Pflegehilfsmittel und med. Ausstattung', '5.000-15.000 Euro'],
        ['Software (Doku, Dienstplanung, Abrechnung)', '3.000-10.000 Euro/Jahr'],
        ['Marketing und Website', '5.000-10.000 Euro'],
        ['Versicherungen', '3.000-5.000 Euro/Jahr'],
        ['Rechts- und Gruendungsberatung', '5.000-10.000 Euro'],
        ['Liquiditaetsreserve (6 Monate Personal)', '80.000-150.000 Euro'],
        ['GESAMT STARTKAPITAL', '150.000-280.000 Euro'],
    ]
    start_table = Table(start_data, colWidths=[9*cm, 7*cm])
    start_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTNAME', (0,1), (-1,-2), 'Helvetica'),
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ('GRID', (0,0), (-1,-1), 0.5, GOLD),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('BACKGROUND', (0,1), (-1,-2), LIGHT_GOLD),
        ('BACKGROUND', (0,-1), (-1,-1), HexColor('#E8DFC0')),
    ]))
    story.append(start_table)
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("4.2 Zeitplan: Von Gruendung bis erster Patient", h2_style))
    time_data = [
        ['Phase', 'Dauer', 'Aktivitaeten'],
        ['1. Planung', '2-3 Mon.', 'Businessplan, Rechtsform, Finanzierung'],
        ['2. Gruendung', '1-2 Mon.', 'GmbH gruenden, Gewerbeanmeldung, Raeume'],
        ['3. Zulassung', '4-6 Mon.', 'Versorgungsvertrag Paragraph 132l, Verhandlung mit Kassen'],
        ['4. Personalaufbau', '3-6 Mon.', 'PDL einstellen, Fachkraefte rekrutieren'],
        ['5. Erster Patient', '1-2 Mon.', 'Ueberleitung aus Klinik, Versorgungsstart'],
        ['GESAMT', '9-18 Mon.', ''],
    ]
    time_table = Table(time_data, colWidths=[4*cm, 3*cm, 9*cm])
    time_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTNAME', (0,1), (-1,-2), 'Helvetica'),
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('GRID', (0,0), (-1,-1), 0.5, GOLD),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('BACKGROUND', (0,1), (-1,-2), LIGHT_GOLD),
        ('BACKGROUND', (0,-1), (-1,-1), HexColor('#E8DFC0')),
    ]))
    story.append(time_table)
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("4.3 Foerdermoeglichkeiten", h2_style))
    story.append(Paragraph(
        "<b>KfW ERP-Gruenderkredit StartGeld (067):</b> Bis 200.000 Euro, fuer Existenzgruender. "
        "<b>Hessische Foerderung (GuW/WIBank):</b> Zinsguenstige Foerderkredite. "
        "<b>Bank fuer Sozialwirtschaft:</b> Spezialkredite fuer Pflegedienste. "
        "Antragstellung ueber die Hausbank.", body_style))

    story.append(PageBreak())

    # === PAGE 6: WETTBEWERB ===
    story.append(Paragraph("5. Wettbewerb und Marktlage Frankfurt", h1_style))

    story.append(Paragraph(
        "In Frankfurt gibt es aktuell ca. <b>24-26 Intensivpflegedienste</b> (u.a. GIP, RENAFAN, Horizont, "
        "Pulmo, Gemeinsam Stark). Trotzdem: Der Markt ist ein <b>Anbietermarkt</b> mit dramatischem "
        "Fachkraeftemangel. Es gibt deutlich mehr Nachfrage als Angebot.", body_style))

    story.append(Paragraph("<b>Kernaussage: Wer qualifiziertes Personal hat, bekommt Patienten. "
                           "Der Engpass ist nicht die Nachfrage, sondern das Personal.</b>", bold_body))

    story.append(Paragraph("5.1 Patientenakquise", h2_style))
    story.append(Paragraph(
        "<b>Klinik-Sozialdienste</b> sind der wichtigste Kanal. Beatmungspatienten werden aus Kliniken "
        "in die haeusliche Versorgung entlassen. Direkter Kontakt zu den grossen Frankfurter Kliniken "
        "(Uniklinik, Buergerhospital, Markuskrankenhaus). Dazu: niedergelassene Pneumologen, "
        "Beatmungszentren, Mund-zu-Mund. Keine bezahlten Lead-Services noetig.", body_style))

    # === PAGE 6 cont: IP-WGs ===
    story.append(Paragraph("6. Intensivpflege-WGs: Der profitabelste Weg", h1_style))

    story.append(Paragraph(
        "Eine IP-WG ist eine ambulant betreute Wohngemeinschaft mit <b>3-12 beatmungspflichtigen Patienten</b>, "
        "die 24/7 durch Pflegefachkraefte versorgt werden. Rechtlich ambulant, kein Heim.", body_style))

    compare_data = [
        ['Aspekt', '1:1 haeuslich', 'IP-WG'],
        ['Betreuungsschluessel', '1:1', '1:2 bis 1:3'],
        ['Personal pro Patient', '5,0-5,6 VZAe', '1,8-2,5 VZAe'],
        ['Marge pro Patient', '1.000-2.500 Euro', '3.000-5.000 Euro'],
        ['Skalierbarkeit', 'Schwierig', 'Gut'],
    ]
    comp_table = Table(compare_data, colWidths=[5*cm, 5.5*cm, 5.5*cm])
    comp_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME', (1,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('ALIGN', (1,0), (-1,-1), 'CENTER'),
        ('GRID', (0,0), (-1,-1), 0.5, GOLD),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('BACKGROUND', (0,1), (-1,-1), LIGHT_GOLD),
    ]))
    story.append(comp_table)
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("6.1 Beispielrechnung: IP-WG mit 8 Patienten", h2_style))
    wg_data = [
        ['Position', 'Betrag/Monat'],
        ['Erloese (8 Pat. x 12.000-15.000 Euro KK)', '96.000-120.000 Euro'],
        ['Personalkosten (10-12 VZAe, Schluessel 1:3)', '55.000-72.000 Euro'],
        ['Miete WG (200-300 qm)', '3.000-5.000 Euro'],
        ['PDL, QM, Verwaltung', '5.000-8.000 Euro'],
        ['Sachkosten, Versicherung', '2.000-4.000 Euro'],
        ['GEWINN VOR STEUERN', '15.000-35.000 Euro/Monat'],
    ]
    wg_table = Table(wg_data, colWidths=[9*cm, 7*cm])
    wg_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTNAME', (0,1), (-1,-2), 'Helvetica'),
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('ALIGN', (1,0), (1,-1), 'RIGHT'),
        ('GRID', (0,0), (-1,-1), 0.5, GOLD),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('BACKGROUND', (0,1), (-1,-2), LIGHT_GOLD),
        ('BACKGROUND', (0,-1), (-1,-1), GOLD),
        ('TEXTCOLOR', (0,-1), (-1,-1), WHITE),
    ]))
    story.append(wg_table)
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(
        "<b>= 180.000-420.000 Euro Gewinn/Jahr pro WG mit 8 Patienten</b>", 
        ParagraphStyle('', parent=body_style, fontSize=11, textColor=GOLD)))

    story.append(PageBreak())

    # === PAGE 7: STRATEGIE ===
    story.append(Paragraph("7. Strategische Empfehlung", h1_style))

    # Summary table
    sum_data = [
        ['Kriterium', 'Bewertung'],
        ['Marktpotenzial', 'Sehr hoch - Anbietermarkt, mehr Nachfrage als Angebot'],
        ['Gewinnpotenzial', 'Hoch - IP-WG: 180.000-420.000 Euro/Jahr pro WG'],
        ['Einstiegshuerdeen', 'Hoch - PDL-Pflicht, Fachkraeftemangel, Zulassungsprozess'],
        ['Kapitalbedarf', '150.000-280.000 Euro'],
        ['Zeitbedarf bis Rentabilitaet', '12-24 Monate'],
        ['Groesstes Risiko', 'Fachkraeftemangel - ohne Personal kein Geschaeft'],
        ['Groesste Chance', 'Eigene Rekrutierung Tuerkei = Wettbewerbsvorteil'],
    ]
    sum_table = Table(sum_data, colWidths=[5*cm, 11*cm])
    sum_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), DARK),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('FONTNAME', (1,1), (1,-1), 'Helvetica'),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('GRID', (0,0), (-1,-1), 0.5, GOLD),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('BACKGROUND', (0,1), (-1,-1), LIGHT_GOLD),
    ]))
    story.append(sum_table)
    story.append(Spacer(1, 0.5*cm))

    story.append(Paragraph("7.1 Empfohlene Strategie", h2_style))
    steps = [
        "1. Separate GmbH gruenden fuer den Intensivpflegedienst (Haftungstrennung von Alltagsengel)",
        "2. Erfahrene PDL einstellen - idealerweise mit Intensivpflege-Hintergrund und Gesellschafteranteil",
        "3. IP-WG als erstes Modell starten (profitabler als 1:1-Versorgung)",
        "4. Parallel eigene Rekrutierung aus der Tuerkei aufbauen - das ist der strategische Schluessel",
        "5. Klein anfangen: Erste WG mit 4-6 Patienten, dann skalieren",
        "6. Netzwerk aufbauen: Klinik-Sozialdienste Frankfurt, Pneumologen, Beatmungszentren",
    ]
    for step in steps:
        story.append(Paragraph(step, body_style))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("7.2 Synergien mit Alltagsengel", h2_style))
    story.append(Paragraph(
        "Eylems 25 Jahre Branchenerfahrung und Netzwerk. "
        "Bestehende Mitarbeiterstruktur als Recruiting-Netzwerk. "
        "Wohngruppenzuschlag (214 Euro/Monat) - Alltagsengel koennte diesen Service in den eigenen IP-WGs erbringen. "
        "Serioeser Geschaeftssitz in der Frankfurter Innenstadt.", body_style))

    story.append(Spacer(1, 1*cm))

    # Final box
    final_data = [
        [Paragraph('<b>FAZIT</b>', ParagraphStyle('', parent=body_style, fontSize=12, textColor=WHITE, alignment=TA_CENTER))],
        [Paragraph(
            'Die ausserklinische Intensivpflege ist ein hochprofitabler Markt mit massivem '
            'Fachkraeftemangel. Wer Personal hat, bekommt Patienten. Yusufs tuerkische '
            'Sprachkenntnisse und Netzwerke sind ein einzigartiger Wettbewerbsvorteil fuer die '
            'Personalrekrutierung. Empfehlung: Separate GmbH gruenden, mit einer IP-WG starten, '
            'parallel eigene Rekrutierungsagentur aufbauen.',
            ParagraphStyle('', parent=body_style, fontSize=10, alignment=TA_CENTER, leading=14))],
    ]
    final_table = Table(final_data, colWidths=[16*cm])
    final_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), DARK),
        ('BACKGROUND', (0,1), (-1,-1), LIGHT_GOLD),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LEFTPADDING', (0,0), (-1,-1), 15),
        ('RIGHTPADDING', (0,0), (-1,-1), 15),
        ('BOX', (0,0), (-1,-1), 2, GOLD),
    ]))
    story.append(final_table)

    # Build
    doc.build(story, canvasmaker=NumberedCanvas)
    print("PDF erstellt: Intensivpflegedienst_Gruendung_2026.pdf")

if __name__ == '__main__':
    build_pdf()
