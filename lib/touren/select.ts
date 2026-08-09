// ═══════════════════════════════════════════════════════════
// TOURENPLANUNG — gemeinsame Select-Strings für PostgREST
// ═══════════════════════════════════════════════════════════
// Eigene Datei (nicht in server.ts), damit route.ts-Dateien
// keine Nicht-HTTP-Exporte brauchen.

export const STOP_SELECT =
  'id, tour_id, assignment_id, client_id, position, geplante_ankunft, geplantes_ende, ' +
  'fahrzeit_minuten, distanz_km, adresse, plz, status, tatsaechliche_ankunft, ' +
  'tatsaechliches_ende, service_record_id, notes, ' +
  'clients:client_id(first_name, last_name, phone)'

export const TOUR_SELECT =
  'id, caregiver_id, tour_date, name, status, start_zeit, ende_zeit, ' +
  'gesamt_fahrzeit_minuten, gesamt_distanz_km, template_id, ' +
  'vertretung_fuer_caregiver_id, vertretung_grund, notes, created_at, updated_at, ' +
  'caregivers:caregiver_id(first_name, last_name, zip_code, has_vehicle), ' +
  `tour_stops(${STOP_SELECT})`

// supabase-js kann die verschachtelten Select-Strings nicht typisieren
// (GenericStringError-Fallback) — die Zeilentypen werden daher explizit
// deklariert und an den Abfrage-Stellen gecastet.

export interface StopZeile {
  id: string
  tour_id: string
  assignment_id: string | null
  client_id: string | null
  position: number
  geplante_ankunft: string | null
  geplantes_ende: string | null
  fahrzeit_minuten: number | null
  distanz_km: number | null
  adresse: string | null
  plz: string | null
  status: string
  tatsaechliche_ankunft: string | null
  tatsaechliches_ende: string | null
  service_record_id: string | null
  notes: string | null
  clients: { first_name: string | null; last_name: string | null; phone: string | null } | null
}

export interface TourZeile {
  id: string
  caregiver_id: string
  tour_date: string
  name: string | null
  status: string
  start_zeit: string | null
  ende_zeit: string | null
  gesamt_fahrzeit_minuten: number
  gesamt_distanz_km: number
  template_id: string | null
  vertretung_fuer_caregiver_id: string | null
  vertretung_grund: string | null
  notes: string | null
  created_at: string
  updated_at: string
  caregivers: { first_name: string | null; last_name: string | null; zip_code: string | null; has_vehicle: boolean | null } | null
  tour_stops: StopZeile[]
}
