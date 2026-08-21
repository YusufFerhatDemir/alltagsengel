// Zentrale App-Konfiguration.
// Supabase-Zugang kommt aus native/.env (EXPO_PUBLIC_* — wird von Expo
// beim Bundeln inline ersetzt). Werte identisch mit NEXT_PUBLIC_* der
// Web-App; Vorlage: native/.env.example. Für EAS-Cloud-Builds die beiden
// Variablen einmalig per `npx eas env:create` hinterlegen.

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
// Supabase-Key-Migration: neuer Publishable-Key zuerst, Legacy-Anon als
// Fallback. Expo ersetzt EXPO_PUBLIC_* beim Bundeln textuell — die Kette muss
// deshalb ausgeschrieben bleiben, dynamischer Zugriff funktioniert nicht.
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase-Konfiguration fehlt — native/.env anlegen (siehe .env.example)')
}

// Web-App als API-Backend (Lead- & Kontakt-Formulare laufen über Next.js-Routes)
export const API_BASE = 'https://alltagsengel.care'

export const CONTACT = {
  phone: '+491783382825',
  phoneDisplay: '+49 178 338 28 25',
  email: 'info@alltagsengel.care',
  whatsapp: 'https://wa.me/491783382825?text=Hallo!%20Ich%20interessiere%20mich%20f%C3%BCr%20Alltagsengel.',
  address: 'Neue Mainzer Str. 66-68\n60311 Frankfurt am Main',
}

// Entlastungsbetrag §45b SGB XI
export const MONATSBETRAG = 131
