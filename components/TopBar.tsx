import Link from 'next/link'

export default function TopBar({ title, backHref, dark = false }: { title: string; backHref: string; dark?: boolean }) {
  return (
    <div className="topbar">
      <Link href={backHref} className={`back-btn${dark ? ' dark' : ''}`}>&lsaquo;</Link>
      <div className={`topbar-title${dark ? ' light' : ''}`}>{title}</div>
    </div>
  )
}
