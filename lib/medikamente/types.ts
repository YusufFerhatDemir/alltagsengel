import type { SupabaseClient } from '@supabase/supabase-js'

export type Einnahmezeit = 'morgens' | 'mittags' | 'abends' | 'nachts'

export type MedikamentStatus = 'aktiv' | 'pausiert' | 'abgesetzt'

export type MedikamentKategorie =
  | 'herz_kreislauf'
  | 'schmerz'
  | 'psychopharmaka'
  | 'antibiotika'
  | 'diabetes'
  | 'atemwege'
  | 'magen_darm'
  | 'hormone'
  | 'blutgerinnung'
  | 'sonstige'

export interface Medikament {
  id: string
  client_id: string
  organization_id: string
  medikament_name: string
  wirkstoff: string | null
  pzn: string | null
  kategorie: MedikamentKategorie
  darreichungsform: string | null
  dosierung: string
  einheit: string
  einnahme_morgens: boolean
  einnahme_mittags: boolean
  einnahme_abends: boolean
  einnahme_nachts: boolean
  einnahme_hinweis: string | null
  verordnet_von: string | null
  beginn_datum: string | null
  end_datum: string | null
  dauermedikation: boolean
  status: MedikamentStatus
  abgesetzt_am: string | null
  abgesetzt_grund: string | null
  notizen: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface MedikamentEingabe {
  id: string
  medikament_id: string
  client_id: string
  organization_id: string
  einnahme_zeit: Einnahmezeit
  geplant_um: string
  gegeben_um: string | null
  gegeben_von: string | null
  status: 'geplant' | 'gegeben' | 'verweigert' | 'ausgelassen'
  verweigert_grund: string | null
  notizen: string | null
  created_at: string
}

export interface MedikamentFilter {
  client_id?: string
  status?: MedikamentStatus
  kategorie?: MedikamentKategorie
  dauermedikation?: boolean
}

export interface EingabeFilter {
  client_id: string
  medikament_id?: string
  datum_von?: string
  datum_bis?: string
  status?: MedikamentEingabe['status']
}

export type MedikamentClient = SupabaseClient

export const KATEGORIEN: Record<MedikamentKategorie, string> = {
  herz_kreislauf: 'Herz/Kreislauf',
  schmerz: 'Schmerzmittel',
  psychopharmaka: 'Psychopharmaka',
  antibiotika: 'Antibiotika',
  diabetes: 'Diabetes',
  atemwege: 'Atemwege',
  magen_darm: 'Magen/Darm',
  hormone: 'Hormone',
  blutgerinnung: 'Blutgerinnung',
  sonstige: 'Sonstige',
}

export const DARREICHUNGSFORMEN = [
  'Tablette', 'Kapsel', 'Tropfen', 'Saft', 'Spritze',
  'Pflaster', 'Salbe', 'Creme', 'Zäpfchen', 'Inhalation',
  'Infusion', 'Augentropfen', 'Ohrentropfen', 'Nasenspray', 'Sonstige',
] as const

export const EINHEITEN = [
  'mg', 'g', 'ml', 'IE', 'µg', 'Tropfen', 'Hub', 'Stück',
] as const
