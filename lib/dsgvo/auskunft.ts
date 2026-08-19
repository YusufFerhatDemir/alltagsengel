// ═══════════════════════════════════════════════════════════════════════
// Art.-15-Auskunft (DSGVO) — Datensammlung fuer den Selbstbedienungs-Export
//
// Security-Audit 2026-08-19, NIEDRIG-5:
// Exportwege gab es nur fuer PflegeCoach (/api/coach/export), FHIR und die
// Abrechnung. Fuer den regulaeren Kunden-, Engel- und Fahrer-Bereich musste
// jede Auskunft nach Art. 15 Abs. 3 DSGVO von Hand zusammengestellt werden.
//
// Grundsatz dieser Sammlung: es wird ausschliesslich mit dem NUTZER-Client
// gelesen, nie mit dem Service-Role-Key. Damit entscheidet RLS, welche Zeilen
// der Person gehoeren — der Export kann konstruktionsbedingt nichts
// ausliefern, was die Person nicht ohnehin sehen darf. Ein Fehler beim
// Aufbau wuerde sonst zum Datenleck.
// ═══════════════════════════════════════════════════════════════════════

/** Minimale Sicht auf den Supabase-Client, die diese Datei braucht. */
export interface AuskunftClient {
  from(tabelle: string): {
    select(spalten: string): {
      eq(spalte: string, wert: unknown): PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }>
    }
  }
}

export interface Quelle {
  /** Tabellenname in der Datenbank. */
  tabelle: string
  /** Spalte, ueber die die Zeilen der Person zugeordnet sind. */
  spalte: string
  /** Klartext fuer den Export — die Auskunft muss verstaendlich sein. */
  bezeichnung: string
}

/**
 * Direkt an die Nutzer-ID gebundene Quellen.
 * Ergaenzende, indirekt gebundene Daten (z. B. Pflegedokumentation ueber die
 * Klienten-Akte) kommen ueber `QUELLEN_UEBER_CLIENT` bzw.
 * `QUELLEN_UEBER_CAREGIVER` dazu.
 */
export const QUELLEN_DIREKT: Quelle[] = [
  { tabelle: 'profiles',            spalte: 'id',           bezeichnung: 'Stammdaten Ihres Kontos' },
  { tabelle: 'clients',             spalte: 'user_id',      bezeichnung: 'Ihre Kundenakte' },
  { tabelle: 'caregivers',          spalte: 'user_id',      bezeichnung: 'Ihre Mitarbeiterakte' },
  { tabelle: 'angels',              spalte: 'id',           bezeichnung: 'Ihr Engel-Profil' },
  { tabelle: 'angel_availability',  spalte: 'angel_id',     bezeichnung: 'Ihre hinterlegten Zeitfenster' },
  { tabelle: 'care_recipients',     spalte: 'profile_id',   bezeichnung: 'Angaben zur betreuten Person' },
  { tabelle: 'notifications',       spalte: 'user_id',      bezeichnung: 'Ihre Benachrichtigungen' },
  { tabelle: 'push_subscriptions',  spalte: 'user_id',      bezeichnung: 'Registrierte Geraete fuer Push-Nachrichten' },
  { tabelle: 'krankenfahrten',      spalte: 'customer_id',  bezeichnung: 'Von Ihnen gebuchte Krankenfahrten' },
]

/** Quellen, bei denen die Person Absender oder Empfaenger sein kann. */
export const QUELLEN_ZWEISEITIG: Array<Quelle & { zweiteSpalte: string }> = [
  { tabelle: 'messages',  spalte: 'sender_id',   zweiteSpalte: 'receiver_id', bezeichnung: 'Ihre Nachrichten' },
  { tabelle: 'bookings',  spalte: 'customer_id', zweiteSpalte: 'angel_id',    bezeichnung: 'Ihre Buchungen' },
  { tabelle: 'reviews',   spalte: 'reviewer_id', zweiteSpalte: 'angel_id',    bezeichnung: 'Bewertungen mit Ihrem Bezug' },
  { tabelle: 'referrals', spalte: 'referrer_id', zweiteSpalte: 'referred_id', bezeichnung: 'Empfehlungen' },
]

export interface AuskunftAbschnitt {
  tabelle: string
  bezeichnung: string
  anzahl: number
  daten: unknown[]
  /** Gesetzt, wenn die Quelle nicht gelesen werden konnte (z. B. Tabelle fehlt). */
  hinweis?: string
}

export interface Auskunft {
  hinweis: string
  rechtsgrundlage: string
  erstelltAm: string
  betroffenePerson: { id: string; email: string | null }
  abschnitte: AuskunftAbschnitt[]
  nichtEnthalten: string[]
}

const NICHT_ENTHALTEN = [
  'Zugangsdaten und Passwort-Hashes — diese liegen ausschliesslich beim Authentifizierungsdienst und werden nach Art. 15 Abs. 4 DSGVO nicht herausgegeben.',
  'PflegeCoach-Daten — diese sind pseudonymisiert gespeichert und ueber den eigenen Export unter /api/coach/export abrufbar.',
  'Interne Protokolle zur Betrugs- und Missbrauchserkennung, soweit deren Offenlegung die Pruefung vereiteln wuerde.',
  'Angaben, die Rechte Dritter verletzen wuerden (Art. 15 Abs. 4 DSGVO) — etwa Inhalte, die ausschliesslich andere Personen betreffen.',
]

async function lade(
  client: AuskunftClient,
  tabelle: string,
  spalte: string,
  wert: string,
): Promise<{ daten: unknown[]; hinweis?: string }> {
  try {
    const { data, error } = await client.from(tabelle).select('*').eq(spalte, wert)
    if (error) {
      // 42P01 = Tabelle existiert nicht, 42703 = Spalte existiert nicht.
      // Beides ist kein Grund, die ganze Auskunft scheitern zu lassen — es
      // wird transparent im Abschnitt vermerkt.
      return { daten: [], hinweis: `Nicht abrufbar (${error.code ?? 'Fehler'}).` }
    }
    return { daten: data ?? [] }
  } catch {
    return { daten: [], hinweis: 'Nicht abrufbar.' }
  }
}

/** Sammelt die Auskunft. Der Client MUSS der Nutzer-Client sein (RLS aktiv). */
export async function sammleAuskunft(
  client: AuskunftClient,
  nutzer: { id: string; email: string | null },
  jetzt: string,
): Promise<Auskunft> {
  const abschnitte: AuskunftAbschnitt[] = []

  for (const q of QUELLEN_DIREKT) {
    const { daten, hinweis } = await lade(client, q.tabelle, q.spalte, nutzer.id)
    abschnitte.push({ tabelle: q.tabelle, bezeichnung: q.bezeichnung, anzahl: daten.length, daten, ...(hinweis ? { hinweis } : {}) })
  }

  for (const q of QUELLEN_ZWEISEITIG) {
    const a = await lade(client, q.tabelle, q.spalte, nutzer.id)
    const b = await lade(client, q.tabelle, q.zweiteSpalte, nutzer.id)
    const gesehen = new Set<string>()
    const daten: unknown[] = []
    for (const zeile of [...a.daten, ...b.daten]) {
      const schluessel = JSON.stringify((zeile as { id?: unknown })?.id ?? zeile)
      if (gesehen.has(schluessel)) continue
      gesehen.add(schluessel)
      daten.push(zeile)
    }
    const hinweis = a.hinweis ?? b.hinweis
    abschnitte.push({ tabelle: q.tabelle, bezeichnung: q.bezeichnung, anzahl: daten.length, daten, ...(hinweis ? { hinweis } : {}) })
  }

  return {
    hinweis:
      'Diese Datei enthaelt die zu Ihrer Person bei Alltagsengel gespeicherten Daten. '
      + 'Sie wurde automatisch aus Ihrem eigenen Zugang erzeugt; enthalten ist genau das, '
      + 'was Ihrem Konto zugeordnet ist.',
    rechtsgrundlage: 'Art. 15 Abs. 3 DSGVO (Recht auf Kopie) i. V. m. Art. 20 DSGVO (Datenuebertragbarkeit)',
    erstelltAm: jetzt,
    betroffenePerson: nutzer,
    abschnitte,
    nichtEnthalten: NICHT_ENTHALTEN,
  }
}
