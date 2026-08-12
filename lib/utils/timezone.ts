const BERLIN = 'Europe/Berlin' as const;
const FMT_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: BERLIN });
const FMT_MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: BERLIN, year: 'numeric', month: '2-digit' });

export function heuteBerlin(): string {
  return FMT_DATE.format(new Date());
}

export function datumBerlin(date: Date): string {
  return FMT_DATE.format(date);
}

export function monatBerlin(date?: Date): string {
  const s = FMT_MONTH.format(date ?? new Date());
  return s.slice(0, 7);
}
