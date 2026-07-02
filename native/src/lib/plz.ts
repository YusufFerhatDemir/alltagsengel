// ═══════════════════════════════════════════════════════════
// PLZ-CHECK — Einzugsgebiet Frankfurt + 30 km
// Logik identisch mit components/EinzugsgebietLeaflet.tsx (Web).
// ═══════════════════════════════════════════════════════════

export const KERN: { praefix: string; region: string }[] = [
  { praefix: '60', region: 'Frankfurt am Main' },
  { praefix: '659', region: 'Frankfurt am Main (West)' },
  { praefix: '611', region: 'Bad Vilbel / Karben / Wetterau' },
  { praefix: '613', region: 'Bad Homburg / Hochtaunus' },
  { praefix: '614', region: 'Oberursel / Königstein / Kronberg' },
  { praefix: '630', region: 'Offenbach am Main' },
  { praefix: '631', region: 'Rodgau / Dietzenbach / Kreis Offenbach' },
  { praefix: '632', region: 'Langen / Neu-Isenburg' },
  { praefix: '633', region: 'Dreieich / Rödermark' },
  { praefix: '634', region: 'Hanau / Maintal / Bruchköbel' },
  { praefix: '6350', region: 'Seligenstadt' },
  { praefix: '6351', region: 'Hainburg' },
  { praefix: '642', region: 'Darmstadt' },
  { praefix: '643', region: 'Weiterstadt / Griesheim' },
  { praefix: '645', region: 'Groß-Gerau / Mörfelden-Walldorf' },
  { praefix: '654', region: 'Rüsselsheim / Kelsterbach' },
  { praefix: '657', region: 'Hofheim / Eschborn / Main-Taunus' },
  { praefix: '658', region: 'Bad Soden / Schwalbach / Main-Taunus' },
]

export const RAND: { praefix: string; region: string }[] = [
  { praefix: '612', region: 'Bad Nauheim / Usingen' },
  { praefix: '635', region: 'Main-Kinzig-Kreis' },
  { praefix: '637', region: 'Aschaffenburg / Alzenau' },
  { praefix: '648', region: 'Dieburg / Darmstadt-Dieburg' },
  { praefix: '651', region: 'Wiesbaden' },
  { praefix: '652', region: 'Wiesbaden' },
  { praefix: '655', region: 'Idstein / Untertaunus' },
  { praefix: '551', region: 'Mainz' },
]

export type Zone = 'kern' | 'rand' | null

export function pruefePlz(plz: string): { zone: Zone; region: string } {
  const alle = [
    ...KERN.map(k => ({ ...k, zone: 'kern' as const })),
    ...RAND.map(r => ({ ...r, zone: 'rand' as const })),
  ].sort((a, b) => b.praefix.length - a.praefix.length)
  for (const e of alle) {
    if (plz.startsWith(e.praefix)) return { zone: e.zone, region: e.region }
  }
  return { zone: null, region: '' }
}
