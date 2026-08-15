const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

export function escapeXml(s: string | number | null | undefined): string {
  const str = String(s ?? '')
  return str.replace(/[&<>"']/g, c => ESCAPE_MAP[c] || c)
}

export function formatCiiDate(d: string | Date | null | undefined): string {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return ''
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export function formatAmount(n: number | null | undefined): string {
  return (typeof n === 'number' ? n : 0).toFixed(2)
}

export function formatQuantity(n: number | null | undefined): string {
  const v = typeof n === 'number' ? n : 0
  return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, '')
}
