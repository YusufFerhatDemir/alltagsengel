// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Anspruchsprüfung (Schritt 1 des DiPA-Nutzerflows)
//
// WAS DIESE DATEI IST: eine Orientierungshilfe für den Nutzer
// („Kann ich den PflegeCoach voraussichtlich über die Pflegekasse
// beantragen?"). Die Kriterien sind KONFIGURIERBAR und versioniert.
//
// WAS SIE NICHT IST: eine Anspruchsentscheidung. Über den Leistungs-
// anspruch entscheidet ausschließlich die Pflegekasse. Deshalb gibt es
// bewusst die Stufe 'anspruch_unklar' statt einer Ja/Nein-Automatik.
//
// KEINE ERFUNDENEN VORAUSSETZUNGEN: Jedes Kriterium trägt seine Quelle
// und ein `verifiziert`-Flag. Kriterien mit verifiziert=false dürfen den
// Nutzer nur zu einer Rückfrage bei der Pflegekasse führen, nie zu einem
// Ausschluss. Beträge und Vergütungshöhen kommen hier nicht vor.
// Referenz: audit/DIPA_REGULATORIK_2026-08-09.md, audit/dipa/nutzerflow_dipa.md
// ═══════════════════════════════════════════════════════════════

/** Version der Kriterienfassung — wird mit jeder Prüfung gespeichert. */
export const ANSPRUCH_KRITERIEN_VERSION = '2026-08-v1'

export type AnspruchErgebnis = 'anspruch_moeglich' | 'anspruch_unklar' | 'kein_anspruch'

export type NutzungDurch = 'pflegebeduerftig' | 'angehoerig' | 'gemeinsam'

export interface AnspruchEingabe {
  /** 0 = kein Pflegegrad, 1–5 = festgestellter Pflegegrad, null = unbekannt */
  pflegegrad: number | null
  /** Pflegegrad ist beantragt, aber noch nicht festgestellt */
  pflegegradBeantragt: boolean
  /** Versorgung findet zu Hause statt (nicht stationär) */
  haeuslicheVersorgung: boolean | null
  nutzungDurch: NutzungDurch | null
}

export interface AnspruchKriterium {
  key: string
  frage: string
  erlaeuterung: string
  quelle: string
  /**
   * true  = aus einer offiziellen Quelle belegt (siehe Regulatorik-Analyse)
   * false = noch extern zu verifizieren; darf niemals zum Ausschluss führen,
   *         sondern nur zu einem Hinweis „bei der Pflegekasse klären"
   */
  verifiziert: boolean
}

/**
 * Konfigurierbarer Kriterienkatalog. Ergänzungen hier eintragen —
 * die Auswertung unten bleibt bewusst schlank und nachvollziehbar.
 */
export const ANSPRUCH_KRITERIEN: AnspruchKriterium[] = [
  {
    key: 'pflegegrad',
    frage: 'Liegt ein festgestellter Pflegegrad vor?',
    erlaeuterung:
      'Der Leistungsanspruch für digitale Pflegeanwendungen setzt einen Pflegegrad voraus.',
    quelle: '§ 40b SGB XI (siehe audit/DIPA_REGULATORIK_2026-08-09.md, Teil 1)',
    verifiziert: true,
  },
  {
    key: 'pflegegrad_1_sonderfall',
    frage: 'Besteht der Anspruch auch bei Pflegegrad 1?',
    erlaeuterung:
      'Bei Pflegegrad 1 bestehen für einzelne Leistungsarten Besonderheiten. Ob und in welchem Umfang der Anspruch auf digitale Pflegeanwendungen bei Pflegegrad 1 besteht, ist mit der Pflegekasse zu klären.',
    quelle: 'Offene regulatorische Frage ORF-4 (audit/DIPA_REGULATORIK_2026-08-09.md)',
    verifiziert: false,
  },
  {
    key: 'haeusliche_versorgung',
    frage: 'Findet die Versorgung zu Hause statt?',
    erlaeuterung:
      'Der Digitale PflegeCoach ist für die häusliche Versorgung bestimmt (Zweckbestimmung). Für stationär versorgte Personen ist er nicht vorgesehen.',
    quelle: 'Zweckbestimmung (audit/dipa/finale_zweckbestimmung.md)',
    verifiziert: true,
  },
  {
    key: 'nutzung_durch',
    frage: 'Wer nutzt die Anwendung?',
    erlaeuterung:
      'Der PflegeCoach kann von der pflegebedürftigen Person, von pflegenden Angehörigen oder gemeinsam genutzt werden.',
    quelle: 'Zielgruppendefinition (audit/dipa/zielgruppendefinition.md)',
    verifiziert: true,
  },
]

export interface AnspruchErgebnisDetail {
  ergebnis: AnspruchErgebnis
  kriterienVersion: string
  hinweise: string[]
  /** Was der Nutzer als Nächstes tun sollte — immer gefüllt. */
  naechsterSchritt: string
}

const HINWEIS_KEINE_ENTSCHEIDUNG =
  'Diese Einschätzung ist unverbindlich. Über den Leistungsanspruch entscheidet allein Ihre Pflegekasse.'

/**
 * Wertet die Selbstauskunft aus. Reine Funktion — deterministisch testbar.
 *
 * Grundhaltung: im Zweifel 'anspruch_unklar' mit Hinweis, nie ein
 * automatischer Ausschluss auf Basis unsicherer Annahmen.
 */
export function pruefeAnspruch(eingabe: AnspruchEingabe): AnspruchErgebnisDetail {
  const hinweise: string[] = []

  // Häusliche Versorgung: Produktgrenze, keine Rechtsfrage.
  if (eingabe.haeuslicheVersorgung === false) {
    return {
      ergebnis: 'kein_anspruch',
      kriterienVersion: ANSPRUCH_KRITERIEN_VERSION,
      hinweise: [
        'Der Digitale PflegeCoach ist für die Versorgung zu Hause gedacht.',
        HINWEIS_KEINE_ENTSCHEIDUNG,
      ],
      naechsterSchritt:
        'Wenn sich die Versorgungssituation ändert, können Sie die Prüfung jederzeit wiederholen.',
    }
  }

  const pg = eingabe.pflegegrad

  // Kein Pflegegrad und keiner beantragt.
  if (pg === 0 && !eingabe.pflegegradBeantragt) {
    return {
      ergebnis: 'kein_anspruch',
      kriterienVersion: ANSPRUCH_KRITERIEN_VERSION,
      hinweise: [
        'Für die Kostenübernahme durch die Pflegekasse ist ein Pflegegrad erforderlich.',
        'Einen Pflegegrad beantragen Sie formlos bei Ihrer Pflegekasse; die Begutachtung übernimmt der Medizinische Dienst.',
        HINWEIS_KEINE_ENTSCHEIDUNG,
      ],
      naechsterSchritt: 'Pflegegrad bei der Pflegekasse beantragen und Prüfung danach wiederholen.',
    }
  }

  // Pflegegrad beantragt, aber noch nicht festgestellt.
  if (pg === 0 || pg === null) {
    hinweise.push(
      eingabe.pflegegradBeantragt
        ? 'Ihr Pflegegrad ist beantragt, aber noch nicht festgestellt. Die Pflegekasse kann erst nach der Feststellung entscheiden.'
        : 'Ohne Angabe eines Pflegegrads lässt sich der Anspruch nicht einschätzen.'
    )
    hinweise.push(HINWEIS_KEINE_ENTSCHEIDUNG)
    return {
      ergebnis: 'anspruch_unklar',
      kriterienVersion: ANSPRUCH_KRITERIEN_VERSION,
      hinweise,
      naechsterSchritt: 'Rückmeldung der Pflegekasse zum Pflegegrad abwarten und danach erneut prüfen.',
    }
  }

  if (pg < 0 || pg > 5) {
    return {
      ergebnis: 'anspruch_unklar',
      kriterienVersion: ANSPRUCH_KRITERIEN_VERSION,
      hinweise: ['Der angegebene Pflegegrad ist ungültig (möglich sind 1 bis 5).', HINWEIS_KEINE_ENTSCHEIDUNG],
      naechsterSchritt: 'Angaben korrigieren und Prüfung wiederholen.',
    }
  }

  // Ab hier: Pflegegrad 1–5 liegt vor.
  if (pg === 1) {
    hinweise.push(
      'Bei Pflegegrad 1 gelten für einzelne Leistungen Besonderheiten. Bitte lassen Sie sich den Anspruch von Ihrer Pflegekasse ausdrücklich bestätigen.'
    )
  }
  if (eingabe.haeuslicheVersorgung === null) {
    hinweise.push('Bitte geben Sie noch an, ob die Versorgung zu Hause stattfindet.')
  }
  if (eingabe.nutzungDurch === 'angehoerig') {
    hinweise.push(
      'Die Nutzung durch pflegende Angehörige ist vorgesehen. Der Antrag wird trotzdem über die pflegebedürftige Person bzw. deren Pflegekasse gestellt.'
    )
  }
  hinweise.push(HINWEIS_KEINE_ENTSCHEIDUNG)

  return {
    ergebnis: 'anspruch_moeglich',
    kriterienVersion: ANSPRUCH_KRITERIEN_VERSION,
    hinweise,
    naechsterSchritt:
      'Stellen Sie den Antrag bei Ihrer Pflegekasse. Nach der Genehmigung erhalten Sie einen Freischaltcode, den Sie hier eingeben.',
  }
}

export const ANSPRUCH_ERGEBNIS_LABELS: Record<AnspruchErgebnis, string> = {
  anspruch_moeglich: 'Antrag ist voraussichtlich möglich',
  anspruch_unklar: 'Noch offen — bitte bei der Pflegekasse klären',
  kein_anspruch: 'Voraussetzungen derzeit nicht erfüllt',
}
