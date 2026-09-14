'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { sendEmailNotification } from '@/lib/notifications'
import { vorlageFinden, vorlageRendern } from '@/lib/email/templates'
import { vornameAus } from '@/lib/email/auto-versand'
import { istBewerbungsStatus, BEWERBUNG_FILTER } from '@/lib/admin/ops'
import {
  istBewerberStufe, bewerberStufe, stufeFuerBewerbung, mitPipelineStufe, naechsteWiedervorlage,
  BEWERBER_ENDZUSTAENDE,
} from '@/lib/bewerbung/pipeline'
import { pruefeAtsEingabe, atsFelderAus, mitAtsFeldern } from '@/lib/bewerbung/ats-felder'
import { AKTIVITAET_MAX_LEN } from '@/lib/admin/crm-katalog'
import { logger } from '@/lib/logger'

const log = logger.child('applications:actions')

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Bewerbungen
//
// ZIELTABELLE IST `lead_inquiries`, NICHT `applications`.
// `applications` ist laut Migration 20261027000000 bewusst tot und traegt
// produktiv null Zeilen. Die echten Bewerbungen kommen ueber
// components/EngelBewerbungForm.tsx → POST /api/lead-inquiry und landen
// dort. Diese Aktionen haben vorher in die tote Tabelle geschrieben —
// fehlerfrei, folgenlos und fuer niemanden sichtbar.
// ═══════════════════════════════════════════════════════════════

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur fuer Administratoren.')
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) throw new Error('Keine Organisation zugewiesen.')

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Alltagsengel'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ── Bewerbungsstufe ändern ───────────────────────────────────────

/**
 * Stufenwechsel einer Bewerbung (acht Stufen, lib/bewerbung/pipeline.ts).
 *
 * Schreibt in EINEM Update:
 *   bewerbung_daten.pipeline  feine Stufe + Verlauf (übrige Schlüssel bleiben)
 *   status                    grobe CRM-Stufe (CHECK-konform)
 *   follow_up_date            automatische Wiedervorlage, NULL im Endzustand
 *
 * `erwartet` ist die Stufe, welche die Verwaltung beim Klick gesehen hat.
 * Stimmt sie nicht mehr, wird nicht geschrieben (zwei Tabs, /mis/crm).
 */
export async function updateApplicationStatus(
  applicationId: string,
  stufe: string,
  erwartet?: string,
): Promise<{ ok: true; followUpDate: string | null } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!applicationId || typeof applicationId !== 'string') {
      return { ok: false, error: 'Ungueltige Bewerbungs-ID.' }
    }
    // Fail-closed: nur bekannte Stufen. Der daraus abgeleitete Status ist
    // per Konstruktion CHECK-konform (istBewerbungsStatus prueft es trotzdem).
    if (!istBewerberStufe(stufe)) {
      return { ok: false, error: 'Ungueltige Stufe fuer eine Bewerbung.' }
    }
    const ziel = bewerberStufe(stufe)
    if (!istBewerbungsStatus(ziel.dbStatus)) {
      return { ok: false, error: 'Stufe ohne gueltigen CRM-Status.' }
    }

    // Bewerbungsdaten laden — fuer die Freigabe-E-Mail brauchen wir Name und
    // E-Mail-Adresse, fuer den Pipeline-Stand die bestehende jsonb-Nutzlast.
    // Der Bewerbungsfilter steht dabei, damit ueber diese Aktion keine
    // Kundenanfrage aus derselben Tabelle umgestempelt werden kann.
    const { data: bewerbung, error: lesenFehler } = await supabase
      .from('lead_inquiries')
      .select('name, email, status, bewerbung_daten')
      .eq('id', applicationId)
      .eq('organization_id', organizationId)
      .or(BEWERBUNG_FILTER)
      .single()

    if (lesenFehler || !bewerbung) {
      return { ok: false, error: `Bewerbung nicht gefunden: ${lesenFehler?.message ?? 'keine Zeile'}` }
    }

    const vorher = stufeFuerBewerbung(bewerbung.bewerbung_daten, bewerbung.status)
    if (erwartet && erwartet !== vorher.stufe) {
      return {
        ok: false,
        error: `Die Bewerbung steht inzwischen auf „${bewerberStufe(vorher.stufe).label}" — bitte Seite neu laden.`,
      }
    }

    const jetzt = new Date()
    const followUpDate = naechsteWiedervorlage(stufe, jetzt)

    const { data: geaendert, error: dbError } = await supabase
      .from('lead_inquiries')
      .update({
        status: ziel.dbStatus,
        bewerbung_daten: mitPipelineStufe(bewerbung.bewerbung_daten, stufe, jetzt, name),
        follow_up_date: followUpDate,
      })
      .eq('id', applicationId)
      .eq('organization_id', organizationId)
      // CAS auf den gelesenen Status: dazwischen umgestellt → keine Zeile.
      .eq('status', bewerbung.status)
      .or(BEWERBUNG_FILTER)
      .select('id')

    if (dbError) return { ok: false, error: `Status-Update fehlgeschlagen: ${dbError.message}` }
    if (!geaendert || geaendert.length === 0) {
      return { ok: false, error: 'Die Bewerbung wurde inzwischen geaendert — bitte Seite neu laden.' }
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'application',
      entityId: applicationId,
      details: {
        neue_stufe: stufe,
        vorherige_stufe: vorher.stufe,
        neuer_status: ziel.dbStatus,
        wiedervorlage: followUpDate,
      },
    })

    const status = ziel.dbStatus
    const warSchonFreigegeben = bewerbung.status === 'converted'

    // ── Freigabe-Bestätigung per E-Mail ──────────────────────────
    // Bei Freigabe automatische E-Mail an den Bewerber.
    // Absender immer „Alltagsengel", nie ein persoenlicher Name.
    //
    // `converted` ist der Freigabezustand im Wortschatz von lead_inquiries.
    // Die frueher hier geprueften Werte (approved/freigegeben/angenommen/
    // active) kann die Spalte gar nicht annehmen — der Zweig war unerreichbar.
    //
    // ZWEITE EINSCHRAENKUNG, die man kennen muss: das Website-Formular fragt
    // keine E-Mail ab (siehe Migration 20261027000000). Produktiv traegt
    // heute KEINE der eingegangenen Bewerbungen eine Adresse, die Mail geht
    // also nur bei hier von Hand erfassten Bewerbungen raus. Der Rueckruf
    // ueber die Telefonnummer bleibt der eigentliche Weg.
    // Nur beim UEBERGANG nach „einsatzbereit": ein erneutes Setzen derselben
    // Stufe darf keine zweite Freigabe-Mail ausloesen.
    if (status === 'converted' && !warSchonFreigegeben && bewerbung?.email) {
      // Der Text steht in lib/email/templates.ts unter `bewerber_freigabe`
      // und NICHT mehr hier. Bis zum 14.09.2026 war er fest verdrahtetes
      // HTML mitten in dieser Server-Action — der einzige Versand, der an
      // den 22 gepflegten Vorlagen vorbeilief. Wer die
      // Kundenkommunikation ueberarbeitet, sieht die Vorlagen; diesen
      // Text haette er nicht gefunden.
      const vorlage = vorlageFinden('bewerber_freigabe')
      if (vorlage) {
        const gerendert = vorlageRendern(vorlage, {
          vorname: vornameAus(bewerbung.name),
        })
        try {
          await sendEmailNotification(
            bewerbung.email,
            bewerbung.name || 'Bewerber',
            gerendert.betreff,
            gerendert.rumpfHtml,
          )
        } catch (err) {
          // Freigabe-Mail ist best-effort — Fehler darf den Statuswechsel
          // nicht rueckgaengig machen.
          log.errorWithException('Freigabe-E-Mail konnte nicht gesendet werden', err)
        }
      } else {
        // Kann nur passieren, wenn die Vorlage umbenannt wurde. Dann
        // lieber eine Zeile im Protokoll als eine stille Nicht-Zustellung.
        log.error('Vorlage bewerber_freigabe nicht gefunden — keine Freigabe-Mail versendet')
      }
    }

    return { ok: true, followUpDate }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

// ── Wiedervorlage von Hand setzen ────────────────────────────────

/**
 * Überschreibt die automatische Wiedervorlage, z. B. mit dem Datum des
 * vereinbarten Vorstellungsgesprächs. `null` ist nur im Endzustand
 * erlaubt: eine offene Bewerbung ohne Wiedervorlage ist genau der Lead,
 * der tagelang vergessen wird.
 */
export async function setApplicationWiedervorlage(
  applicationId: string,
  datum: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!applicationId || typeof applicationId !== 'string') {
      return { ok: false, error: 'Ungueltige Bewerbungs-ID.' }
    }
    if (datum !== null && (typeof datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(datum)))) {
      return { ok: false, error: 'Bitte ein gueltiges Datum angeben.' }
    }

    const { data: bewerbung, error: lesenFehler } = await supabase
      .from('lead_inquiries')
      .select('status, bewerbung_daten')
      .eq('id', applicationId)
      .eq('organization_id', organizationId)
      .or(BEWERBUNG_FILTER)
      .single()
    if (lesenFehler || !bewerbung) {
      return { ok: false, error: `Bewerbung nicht gefunden: ${lesenFehler?.message ?? 'keine Zeile'}` }
    }

    const { stufe } = stufeFuerBewerbung(bewerbung.bewerbung_daten, bewerbung.status)
    if (datum === null && !BEWERBER_ENDZUSTAENDE.includes(stufe)) {
      return { ok: false, error: 'Eine offene Bewerbung braucht eine Wiedervorlage.' }
    }

    const { data: geaendert, error: dbError } = await supabase
      .from('lead_inquiries')
      .update({ follow_up_date: datum })
      .eq('id', applicationId)
      .eq('organization_id', organizationId)
      .or(BEWERBUNG_FILTER)
      .select('id')
    if (dbError) return { ok: false, error: `Wiedervorlage fehlgeschlagen: ${dbError.message}` }
    if (!geaendert || geaendert.length === 0) {
      return { ok: false, error: 'Bewerbung nicht mehr vorhanden — bitte Seite neu laden.' }
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'application',
      entityId: applicationId,
      details: { wiedervorlage: datum, stufe },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

// ── ATS-Arbeitsfelder schreiben ──────────────────────────────────

/**
 * Setzt die Arbeitsfelder einer Bewerbung (lib/bewerbung/ats-felder.ts).
 *
 * ── WAS HIER NICHT PASSIERT ───────────────────────────────────────────
 * Diese Aktion aendert **weder `status` noch `follow_up_date` noch die
 * Pipeline-Stufe**. Eine Notiz ist kein Stufenwechsel. Wer beides in einen
 * Schreibvorgang legt, bekommt Stufenwechsel, die niemand ausgeloest hat,
 * weil jemand eine Telefonnummer korrigiert hat.
 *
 * ── WARUM DIE VIER FORMULARFELDER ABGEWIESEN WERDEN ───────────────────
 * `qualifikation`, `fuehrerschein`, `verfuegbarkeit` und `sprachen` stehen
 * im Formularkatalog und gehoeren der Bewerberin. Sie hier zu ueberschreiben
 * hiesse, ihre Selbstauskunft durch eine Verwaltungsnotiz zu ersetzen — und
 * zwar an einem zweiten Ort, der dann auseinanderlaeuft. `pruefeAtsFelder`
 * wuerde sie stillschweigend fallen lassen; genau das ist das Muster, das
 * ein gruenes „Gespeichert" ohne Speicherung erzeugt. Deshalb hier ein
 * ausdruecklicher Fehler.
 */
export async function setApplicationAtsFelder(
  applicationId: string,
  felder: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!applicationId || typeof applicationId !== 'string') {
      return { ok: false, error: 'Ungueltige Bewerbungs-ID.' }
    }
    if (!felder || typeof felder !== 'object' || Array.isArray(felder)) {
      return { ok: false, error: 'Keine Felder uebergeben.' }
    }

    const { felder: geprueft, fehler } = pruefeAtsEingabe(felder)
    if (fehler) return { ok: false, error: fehler }

    const { data: bewerbung, error: lesenFehler } = await supabase
      .from('lead_inquiries')
      .select('bewerbung_daten')
      .eq('id', applicationId)
      .eq('organization_id', organizationId)
      .or(BEWERBUNG_FILTER)
      .single()
    if (lesenFehler || !bewerbung) {
      return { ok: false, error: `Bewerbung nicht gefunden: ${lesenFehler?.message ?? 'keine Zeile'}` }
    }

    const vorher = atsFelderAus(bewerbung.bewerbung_daten)
    const nutzlast = mitAtsFeldern(bewerbung.bewerbung_daten, geprueft)

    const { data: geaendert, error: dbError } = await supabase
      .from('lead_inquiries')
      .update({ bewerbung_daten: nutzlast })
      .eq('id', applicationId)
      .eq('organization_id', organizationId)
      .or(BEWERBUNG_FILTER)
      .select('id')
    if (dbError) return { ok: false, error: `Speichern fehlgeschlagen: ${dbError.message}` }
    if (!geaendert || geaendert.length === 0) {
      return { ok: false, error: 'Bewerbung nicht mehr vorhanden — bitte Seite neu laden.' }
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'application',
      entityId: applicationId,
      // Nur die Feldnamen, nicht die Werte: im Protokoll stehen sonst
      // Freitextnotizen ueber Bewerberinnen, die dort nicht hingehoeren.
      details: { ats_felder: Object.keys(geprueft), vorher_gesetzt: Object.keys(vorher) },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

// ── Notizen mit Verlauf ──────────────────────────────────────────

/**
 * Hängt eine Notiz an eine Bewerbung — als EIGENEN Eintrag, nicht als
 * Überschreibung.
 *
 * ── WARUM NEBEN `ats.notizen` ─────────────────────────────────────────
 * `ats.notizen` ist ein einziges Feld. Wer es zum zweiten Mal beschreibt,
 * löscht das erste Telefonat. Für den Stand („woran hängt es gerade") ist
 * das richtig — für den Verlauf („was ist bisher passiert") ist es
 * unbrauchbar. Beides in ein Feld zu zwingen hiesse, sich für eines der
 * beiden zu entscheiden, ohne es zu merken.
 *
 * ── WARUM `mis_crm_activities` UND KEINE NEUE TABELLE ─────────────────
 * Die Tabelle führt bereits `lead_id` mit Fremdschlüssel auf
 * `lead_inquiries` — und Bewerbungen SIND Zeilen in `lead_inquiries`. Eine
 * eigene Tabelle bräuchte DDL, und DDL ist aus der Agentensitzung mit
 * 42501 gesperrt. Der Verlauf einer Bewerbung und der einer Kundenanfrage
 * liegen damit am selben Ort, was sie ohnehin sollten.
 */
export async function addApplicationNotiz(
  applicationId: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!applicationId || typeof applicationId !== 'string') {
      return { ok: false, error: 'Ungueltige Bewerbungs-ID.' }
    }
    if (typeof text !== 'string' || !text.trim()) {
      return { ok: false, error: 'Die Notiz ist leer.' }
    }
    const sauber = text.trim()
    if (sauber.length > AKTIVITAET_MAX_LEN.description) {
      return { ok: false, error: `Die Notiz ist zu lang (max. ${AKTIVITAET_MAX_LEN.description} Zeichen).` }
    }

    // Gehoert die Bewerbung uns? Der Fremdschluessel erzwingt nur, DASS die
    // Zeile existiert, nicht wem sie gehoert.
    const { data: bewerbung } = await supabase
      .from('lead_inquiries')
      .select('id')
      .eq('id', applicationId)
      .eq('organization_id', organizationId)
      .or(BEWERBUNG_FILTER)
      .maybeSingle()
    if (!bewerbung) return { ok: false, error: 'Bewerbung nicht gefunden oder kein Zugriff.' }

    const { error } = await supabase
      .from('mis_crm_activities')
      .insert({
        lead_id: applicationId,
        activity_type: 'note',
        // Der Titel steht in der Liste; die erste Zeile der Notiz ist dort
        // brauchbarer als ein generisches „Notiz".
        title: sauber.split('\n')[0].slice(0, 120),
        description: sauber,
        // Urheber aus der Anmeldung, nie aus der Eingabe.
        performed_by: name,
        organization_id: organizationId,
      })
    if (error) return { ok: false, error: `Notiz konnte nicht gespeichert werden: ${error.message}` }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'application',
      entityId: applicationId,
      // Ohne den Wortlaut: eine Notiz ueber eine Bewerberin gehoert nicht
      // ins Protokoll.
      details: { aktion: 'notiz_angelegt', laenge: sauber.length },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

export interface BewerbungsNotiz {
  id: string
  text: string
  von: string | null
  am: string | null
}

/** Liest den Notizverlauf einer Bewerbung, neueste zuerst. */
export async function ladeApplicationNotizen(
  applicationId: string,
): Promise<{ ok: true; notizen: BewerbungsNotiz[] } | { ok: false; error: string }> {
  try {
    const { supabase, organizationId } = await requireAdmin()
    if (!applicationId || typeof applicationId !== 'string') {
      return { ok: false, error: 'Ungueltige Bewerbungs-ID.' }
    }

    const { data, error } = await supabase
      .from('mis_crm_activities')
      .select('id, title, description, performed_by, created_at')
      .eq('lead_id', applicationId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) return { ok: false, error: error.message }

    return {
      ok: true,
      notizen: (data ?? []).map(z => ({
        id: z.id,
        text: z.description || z.title || '',
        von: z.performed_by ?? null,
        am: z.created_at ?? null,
      })),
    }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

// ── Neue Bewerbung anlegen ───────────────────────────────────────

interface NewApplicationPayload {
  /** Ein Feld, kein Vor-/Nachname: `lead_inquiries` fuehrt nur `name`. */
  name: string
  email: string | null
  phone: string | null
  /** Qualifikation/Stelle — liegt in `service`, es gibt keine Spalte `position`. */
  position: string | null
  source: string
  referred_by_caregiver_id: string | null
  notes: string | null
}

export async function createApplication(
  payload: NewApplicationPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!payload.name?.trim()) {
      return { ok: false, error: 'Name ist ein Pflichtfeld.' }
    }
    // `phone` ist in der Praxis der einzige Rueckweg zur Bewerberin: das
    // Website-Formular fragt keine E-Mail ab. Eine Bewerbung ohne beides
    // waere ein Datensatz, den niemand beantworten kann.
    if (!payload.phone?.trim() && !payload.email?.trim()) {
      return { ok: false, error: 'Bitte Telefon oder E-Mail angeben — sonst gibt es keinen Rueckweg.' }
    }

    const row = {
      // Ausdruecklich gesetzt statt auf den Spalten-Default current_org_id()
      // zu vertrauen: der ist fail-open und liefert bei fehlender
      // Mitgliedschaft die Stamm-Organisation. Hier ist die Organisation
      // bekannt, also wird sie genannt.
      organization_id: organizationId,
      art: 'bewerbung',
      name: payload.name.trim(),
      email: payload.email,
      phone: payload.phone,
      service: payload.position,
      source: payload.source,
      message: payload.notes,
      status: 'new',
      eingereicht_am: new Date().toISOString(),
      // `lead_inquiries` hat keine Spalte fuer die Empfehlung. Sie hier
      // wegzulassen hiesse, die Mitarbeiter-werben-Mitarbeiter-Angabe
      // stillschweigend zu verwerfen; `bewerbung_daten` ist das dafuer
      // vorgesehene jsonb-Feld.
      bewerbung_daten: payload.referred_by_caregiver_id
        ? { empfohlen_von_caregiver_id: payload.referred_by_caregiver_id }
        : null,
    }

    const { data: angelegt, error: dbError } = await supabase
      .from('lead_inquiries')
      .insert(row)
      .select('id')
      .single()
    if (dbError) return { ok: false, error: `Anlegen fehlgeschlagen: ${dbError.message}` }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'application',
      entityId: angelegt?.id ?? 'neu',
      details: { name: row.name, source: row.source },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
