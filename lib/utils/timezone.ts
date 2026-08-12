const BERLIN = 'Europe/Berlin' as const;
const FMT_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: BERLIN });
const FMT_MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: BERLIN, year: 'numeric', month: '2-digit' });
const FMT_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: BERLIN,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

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

export interface BerlinTeile {
  year: string; month: string; day: string;
  hour: string; minute: string; second: string;
}

export function berlinParts(date: Date): BerlinTeile {
  const parts = FMT_PARTS.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second'),
  };
}
