// ═══════════════════════════════════════════════════════════════
// PflegeCoach — statische Inhaltsmodule (Übungen, Wissen, Checklisten)
//
// QUALITÄTSSICHERUNG: Alle Inhalte tragen pruefstatus 'entwurf', bis
// eine pflegefachliche Freigabe dokumentiert ist (DiPAV: qualitäts-
// gesicherte Inhalte — siehe audit/dipa/dipav_gap_liste.md, GAP-QS).
// Die UI zeigt bei 'entwurf' einen sichtbaren Hinweis an.
//
// INHALTLICHE LEITPLANKEN:
//  * Allgemeine Alltags- und Bewegungsanleitungen — KEINE individualisierte
//    Therapie, keine Heilversprechen (MDR-Negativabgrenzung).
//  * Gesetzliche Leistungsangaben nur mit Paragraf; Beträge entsprechen
//    der Regulatorik-Analyse (audit/DIPA_REGULATORIK_2026-08-09.md).
// ═══════════════════════════════════════════════════════════════

export type PruefStatus = 'entwurf' | 'fachlich_freigegeben'

export interface Uebung {
  id: string
  titel: string
  ziel: string
  schritte: string[]
  sicherheitshinweis: string
  dauer_minuten: number
  pruefstatus: PruefStatus
}

/** Allgemeine, niedrigschwellige Bewegungsübungen für den Hausgebrauch. */
export const UEBUNGEN: Uebung[] = [
  {
    id: 'aufstehen-vom-stuhl',
    titel: 'Aufstehen vom Stuhl',
    ziel: 'Kraft in den Beinen für sicheres Aufstehen erhalten',
    schritte: [
      'Auf einen stabilen Stuhl mit Armlehnen setzen, Füße hüftbreit aufstellen.',
      'Mit den Händen auf den Armlehnen abstützen, Oberkörper leicht nach vorn.',
      'Langsam aufstehen, kurz stehen bleiben, langsam wieder hinsetzen.',
      'So oft wiederholen, wie es ohne Anstrengung gut möglich ist (z. B. 5-mal).',
    ],
    sicherheitshinweis: 'Nur mit stabilem Stuhl an rutschfestem Standort. Bei Schwindel sofort sitzen bleiben.',
    dauer_minuten: 5,
    pruefstatus: 'entwurf',
  },
  {
    id: 'fersen-zehenstand',
    titel: 'Fersen- und Zehenstand mit Festhalten',
    ziel: 'Gleichgewicht und Wadenkraft im Stand erhalten',
    schritte: [
      'Mit beiden Händen an einer stabilen Fläche festhalten (z. B. Küchenzeile).',
      'Langsam auf die Zehenspitzen stellen, 2 Sekunden halten, langsam absenken.',
      'Danach das Gewicht auf die Fersen verlagern, Zehen leicht anheben.',
      'Im Wechsel wiederholen, solange es sich sicher anfühlt (z. B. 8-mal).',
    ],
    sicherheitshinweis: 'Immer mit beiden Händen festhalten. Feste, geschlossene Schuhe oder rutschfeste Socken tragen.',
    dauer_minuten: 5,
    pruefstatus: 'entwurf',
  },
  {
    id: 'gehen-in-der-wohnung',
    titel: 'Gehstrecke in der Wohnung',
    ziel: 'Regelmäßige Bewegung in den Alltag einbauen',
    schritte: [
      'Eine feste, freie Strecke in der Wohnung wählen (z. B. Flur).',
      'In gewohntem Tempo hin- und zurückgehen, bei Bedarf mit Gehhilfe.',
      'Mit wenigen Minuten beginnen und die Zeit nur langsam steigern.',
    ],
    sicherheitshinweis: 'Strecke vorher auf Stolperquellen prüfen (Teppichkanten, Kabel). Gehhilfe benutzen, wenn sie verordnet ist.',
    dauer_minuten: 10,
    pruefstatus: 'entwurf',
  },
  {
    id: 'schulter-nacken-mobilisation',
    titel: 'Schultern und Nacken lockern (im Sitzen)',
    ziel: 'Beweglichkeit im Oberkörper für Alltagsverrichtungen erhalten',
    schritte: [
      'Aufrecht auf einen Stuhl setzen, Füße fest am Boden.',
      'Schultern langsam nach hinten kreisen (5-mal), dann nach vorn (5-mal).',
      'Den Kopf langsam zur rechten und linken Seite drehen, jeweils kurz halten.',
    ],
    sicherheitshinweis: 'Alle Bewegungen langsam und nur so weit, wie es angenehm ist. Nichts erzwingen.',
    dauer_minuten: 5,
    pruefstatus: 'entwurf',
  },
]

export interface ChecklistItem {
  id: string
  text: string
}

/** Wohnraum-Sicherheits-Check (Sturzvermeidung — organisatorische Checkliste). */
export const WOHNRAUM_CHECK: ChecklistItem[] = [
  { id: 'teppiche', text: 'Lose Teppiche und Läufer entfernt oder rutschfest fixiert' },
  { id: 'kabel', text: 'Kabel und Leitungen aus den Laufwegen geräumt' },
  { id: 'licht', text: 'Alle Wege gut beleuchtet, Nachtlicht zwischen Bett und Bad' },
  { id: 'bad', text: 'Rutschfeste Matte in Dusche/Wanne, Haltegriffe wo nötig' },
  { id: 'treppe', text: 'Treppen mit beidseitigem Handlauf und markierten Stufenkanten' },
  { id: 'schuhe', text: 'Feste, geschlossene Hausschuhe mit rutschfester Sohle' },
  { id: 'greifhoehe', text: 'Häufig genutzte Dinge in Greifhöhe (keine Leiter/Hocker nötig)' },
  { id: 'sitzhoehe', text: 'Stühle, Bett und Toilette in geeigneter Sitzhöhe' },
]

export interface WissensModul {
  id: string
  titel: string
  zielgruppe: 'angehoerig' | 'pflegebeduerftig' | 'alle'
  abschnitte: { ueberschrift: string; text: string }[]
  pruefstatus: PruefStatus
}

export const WISSEN_MODULE: WissensModul[] = [
  {
    id: 'entlastungsleistungen',
    titel: 'Entlastungsangebote für pflegende Angehörige',
    zielgruppe: 'angehoerig',
    abschnitte: [
      {
        ueberschrift: 'Entlastungsbetrag (§ 45b SGB XI)',
        text: 'Pflegebedürftige in häuslicher Pflege haben Anspruch auf einen monatlichen Entlastungsbetrag (131 € seit der Pflegereform 2025). Er kann u. a. für Betreuungs- und Entlastungsangebote eingesetzt werden. Die Abrechnung läuft über die Pflegekasse — dort erfahren Sie, welche Angebote in Ihrer Region anerkannt sind.',
      },
      {
        ueberschrift: 'Verhinderungspflege (§ 39 SGB XI)',
        text: 'Wenn Sie als Pflegeperson verhindert sind (Urlaub, Krankheit, Termine), übernimmt die Pflegekasse unter bestimmten Voraussetzungen die Kosten einer Ersatzpflege. Auskunft zu Höhe und Voraussetzungen gibt Ihre Pflegekasse.',
      },
      {
        ueberschrift: 'Pflegeberatung (§ 7a SGB XI)',
        text: 'Sie haben Anspruch auf kostenlose, unabhängige Pflegeberatung — z. B. in Pflegestützpunkten. Die Beratung hilft bei Anträgen, Leistungsfragen und der Organisation der häuslichen Pflege.',
      },
      {
        ueberschrift: 'Pflegekurse (§ 45 SGB XI)',
        text: 'Pflegekassen bieten kostenlose Pflegekurse für Angehörige und ehrenamtliche Pflegepersonen an — auch als Schulung in der eigenen Häuslichkeit.',
      },
    ],
    pruefstatus: 'entwurf',
  },
  {
    id: 'selbstsorge',
    titel: 'Auf sich selbst achten',
    zielgruppe: 'angehoerig',
    abschnitte: [
      {
        ueberschrift: 'Eigene Grenzen ernst nehmen',
        text: 'Dauerhafte Überlastung hilft niemandem — auch der gepflegten Person nicht. Planen Sie feste, kleine Auszeiten ein und tragen Sie sie wie Termine in den Wochenplan ein.',
      },
      {
        ueberschrift: 'Unterstützung annehmen',
        text: 'Verteilen Sie Aufgaben in der Familie, im Freundeskreis oder über Entlastungsangebote. Die Belastungs-Selbsteinschätzung im PflegeCoach hilft Ihnen, Veränderungen früh zu bemerken.',
      },
      {
        ueberschrift: 'Im Notfall',
        text: 'Bei akuten gesundheitlichen Notfällen wählen Sie den Notruf 112. Für nicht lebensbedrohliche Beschwerden ist der ärztliche Bereitschaftsdienst unter 116 117 erreichbar.',
      },
    ],
    pruefstatus: 'entwurf',
  },
  {
    id: 'rueckenschonend',
    titel: 'Rückenschonend unterstützen',
    zielgruppe: 'angehoerig',
    abschnitte: [
      {
        ueberschrift: 'Grundregeln',
        text: 'Arbeiten Sie möglichst nah am Körper der unterstützten Person, mit geradem Rücken und aus den Beinen heraus. Nutzen Sie vorhandene Hilfsmittel (z. B. Rutschbrett, Haltegürtel), statt zu heben.',
      },
      {
        ueberschrift: 'Mitmachen lassen',
        text: 'Geben Sie der gepflegten Person Zeit, so viel wie möglich selbst zu tun — das erhält ihre Fähigkeiten und entlastet Sie. Kündigen Sie jede Bewegung vorher an.',
      },
      {
        ueberschrift: 'Anleitung vor Ort',
        text: 'Praktische Techniken lernen Sie am besten in einem kostenlosen Pflegekurs (§ 45 SGB XI) — auch als Einzelschulung zu Hause möglich.',
      },
    ],
    pruefstatus: 'entwurf',
  },
  {
    id: 'alltag-selbstversorgung',
    titel: 'Selbstversorgung im Alltag erleichtern',
    zielgruppe: 'pflegebeduerftig',
    abschnitte: [
      {
        ueberschrift: 'Energie einteilen',
        text: 'Planen Sie anstrengende Tätigkeiten (Duschen, Einkaufen) zu Tageszeiten, zu denen Sie sich am fittesten fühlen, und bauen Sie Pausen fest ein.',
      },
      {
        ueberschrift: 'Kleine Hilfen nutzen',
        text: 'Greifhilfen, Anziehhilfen, rutschfeste Unterlagen oder ein Duschhocker können Selbständigkeit erhalten. Zu Hilfsmitteln berät Ihre Pflegekasse oder das Sanitätshaus.',
      },
      {
        ueberschrift: 'Trinken und Essen im Blick behalten',
        text: 'Feste Trink-Erinnerungen im Wochenplan helfen, über den Tag verteilt genug zu trinken. Stellen Sie Getränke sichtbar an Ihre häufigsten Aufenthaltsorte.',
      },
    ],
    pruefstatus: 'entwurf',
  },
  {
    id: 'soziale-teilhabe',
    titel: 'Kontakte und Beschäftigung pflegen',
    zielgruppe: 'alle',
    abschnitte: [
      {
        ueberschrift: 'Feste Kontaktzeiten',
        text: 'Regelmäßige Anrufe, Besuche oder gemeinsame Aktivitäten lassen sich als wiederkehrende Aktivität im Wochenplan verankern — Verbindlichkeit hilft beiden Seiten.',
      },
      {
        ueberschrift: 'Beschäftigung mit Sinn',
        text: 'Vertraute Tätigkeiten (Kochen, Gartenarbeit, Musik, Fotos ordnen) in kleinen, machbaren Schritten erhalten Alltagskompetenz und Freude. Wählen Sie gemeinsam aus, was gut passt.',
      },
      {
        ueberschrift: 'Angebote vor Ort',
        text: 'Viele Gemeinden, Kirchengemeinden und Vereine bieten Begegnungs- und Betreuungsgruppen an. Der Pflegestützpunkt kennt Angebote in Ihrer Nähe.',
      },
    ],
    pruefstatus: 'entwurf',
  },
]

export const INHALT_ENTWURF_HINWEIS =
  'Dieser Inhalt befindet sich in fachlicher Prüfung und wird vor dem Pilotbetrieb pflegefachlich freigegeben.'
