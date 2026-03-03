'use client'
import React, { useState } from 'react'
import { BRAND, PRIORITY_LABELS, DOC_STATUS_LABELS, RISK_COLORS } from '@/lib/mis/constants'
import { MIcon } from './MisIcons'

// ===== KPI Card =====
export function KpiCard({ title, value, target, unit, trend, icon, color, onClick }: {
  title: string; value: string | number; target?: string | number; unit?: string;
  trend?: 'up' | 'down' | 'stable'; icon?: string; color?: string; onClick?: () => void
}) {
  const trendColor = trend === 'up' ? BRAND.success : trend === 'down' ? BRAND.error : BRAND.muted
  return (
    <div onClick={onClick} style={{
      background: BRAND.white, borderRadius: 14, padding: '20px 22px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: `1px solid ${BRAND.border}`,
      cursor: onClick ? 'pointer' : 'default', transition: 'all 0.2s',
      display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200, flex: '1 1 220px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: BRAND.muted, fontWeight: 500 }}>{title}</span>
        {icon && <span style={{ color: color || BRAND.gold, opacity: 0.7 }}><MIcon name={icon} size={18} /></span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: BRAND.coal, fontFamily: 'var(--font-cormorant), serif' }}>{value}</span>
        {unit && <span style={{ fontSize: 14, color: BRAND.muted }}>{unit}</span>}
      </div>
      {(target !== undefined || trend) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {trend && <span style={{ color: trendColor, display: 'flex', alignItems: 'center', gap: 2, fontSize: 12 }}>
            <MIcon name={trend === 'up' ? 'arrowUp' : trend === 'down' ? 'arrowDown' : 'activity'} size={14} />
            {trend === 'up' ? 'Steigend' : trend === 'down' ? 'Fallend' : 'Stabil'}
          </span>}
          {target !== undefined && <span style={{ fontSize: 12, color: BRAND.muted }}>Ziel: {target}{unit ? ` ${unit}` : ''}</span>}
        </div>
      )}
    </div>
  )
}

// ===== Section Header =====
export function SectionHeader({ title, subtitle, icon, actions }: {
  title: string; subtitle?: string; icon?: string; actions?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {icon && <span style={{ color: BRAND.gold }}><MIcon name={icon} size={24} /></span>}
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: BRAND.coal, fontFamily: 'var(--font-cormorant), serif', margin: 0 }}>{title}</h2>
          {subtitle && <p style={{ fontSize: 13, color: BRAND.muted, margin: '4px 0 0' }}>{subtitle}</p>}
        </div>
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  )
}

// ===== Button =====
export function MisButton({ children, variant = 'primary', icon, onClick, disabled, size = 'md' }: {
  children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: string; onClick?: () => void; disabled?: boolean; size?: 'sm' | 'md'
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: BRAND.gold, color: BRAND.white, border: 'none' },
    secondary: { background: BRAND.white, color: BRAND.coal, border: `1px solid ${BRAND.border}` },
    ghost: { background: 'transparent', color: BRAND.muted, border: 'none' },
    danger: { background: '#FEE2E2', color: BRAND.error, border: `1px solid #FECACA` },
  }
  const pad = size === 'sm' ? '6px 12px' : '8px 16px'
  const fs = size === 'sm' ? 12 : 13
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles[variant], padding: pad, borderRadius: 8, fontSize: fs, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
      opacity: disabled ? 0.5 : 1, transition: 'all 0.15s', fontFamily: 'inherit',
    }}>
      {icon && <MIcon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  )
}

// ===== Badge =====
export function Badge({ label, color, size = 'md' }: { label: string; color: string; size?: 'sm' | 'md' }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: size === 'sm' ? '2px 6px' : '3px 10px',
      borderRadius: 6, fontSize: size === 'sm' ? 10 : 11, fontWeight: 600,
      background: `${color}18`, color: color, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const info = DOC_STATUS_LABELS[status] || { label: status, color: BRAND.muted }
  return <Badge label={info.label} color={info.color} />
}

export function PriorityBadge({ priority }: { priority: string }) {
  const info = PRIORITY_LABELS[priority] || { label: priority, color: BRAND.muted }
  return <Badge label={info.label} color={info.color} />
}

export function RiskBadge({ level }: { level: string }) {
  return <Badge label={level.charAt(0).toUpperCase() + level.slice(1)} color={RISK_COLORS[level] || BRAND.muted} />
}

// ===== Data Table =====
export function DataTable<T extends Record<string, unknown>>({ columns, data, onRowClick, emptyMessage = 'Keine Daten vorhanden' }: {
  columns: { key: string; label: string; width?: string; render?: (row: T) => React.ReactNode }[];
  data: T[]; onRowClick?: (row: T) => void; emptyMessage?: string;
}) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${BRAND.border}`, background: BRAND.white }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${BRAND.border}` }}>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: BRAND.muted,
                fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
                width: col.width, whiteSpace: 'nowrap',
              }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: 40, textAlign: 'center', color: BRAND.muted }}>{emptyMessage}</td></tr>
          ) : data.map((row, i) => (
            <tr key={i} onClick={() => onRowClick?.(row)} style={{
              borderBottom: `1px solid ${BRAND.border}`, cursor: onRowClick ? 'pointer' : 'default',
              transition: 'background 0.1s',
            }} onMouseEnter={e => (e.currentTarget.style.background = BRAND.light)}
               onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              {columns.map(col => (
                <td key={col.key} style={{ padding: '12px 16px', color: BRAND.coal }}>
                  {col.render ? col.render(row) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ===== Progress Bar =====
export function ProgressBar({ value, max = 100, color, label, showPercent = true }: {
  value: number; max?: number; color?: string; label?: string; showPercent?: boolean
}) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      {(label || showPercent) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: BRAND.muted }}>
          {label && <span>{label}</span>}
          {showPercent && <span style={{ fontWeight: 600 }}>{Math.round(pct)}%</span>}
        </div>
      )}
      <div style={{ height: 6, borderRadius: 3, background: BRAND.border, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: color || BRAND.gold, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

// ===== Mini Chart (Bar) =====
export function MiniBarChart({ data, labels, color, height = 120 }: {
  data: number[]; labels?: string[]; color?: string; height?: number
}) {
  const max = Math.max(...data, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height, padding: '0 4px' }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: BRAND.muted, fontWeight: 600 }}>
            {v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v.toLocaleString('de-DE')}
          </span>
          <div style={{
            width: '100%', maxWidth: 40, minHeight: 4,
            height: `${(v / max) * (height - 30)}px`,
            background: `linear-gradient(180deg, ${color || BRAND.gold}, ${color || BRAND.gold}88)`,
            borderRadius: '4px 4px 0 0', transition: 'height 0.5s ease',
          }} />
          {labels && <span style={{ fontSize: 10, color: BRAND.muted }}>{labels[i]}</span>}
        </div>
      ))}
    </div>
  )
}

// ===== Card Container =====
export function Card({ children, title, icon, actions, noPad, style }: {
  children: React.ReactNode; title?: string; icon?: string; actions?: React.ReactNode;
  noPad?: boolean; style?: React.CSSProperties
}) {
  return (
    <div style={{
      background: BRAND.white, borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      border: `1px solid ${BRAND.border}`, overflow: 'hidden', ...style,
    }}>
      {title && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 20px', borderBottom: `1px solid ${BRAND.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {icon && <span style={{ color: BRAND.gold }}><MIcon name={icon} size={18} /></span>}
            <h3 style={{ fontSize: 15, fontWeight: 600, color: BRAND.coal, margin: 0 }}>{title}</h3>
          </div>
          {actions}
        </div>
      )}
      <div style={noPad ? {} : { padding: 20 }}>{children}</div>
    </div>
  )
}

// ===== Grid =====
export function MisGrid({ children, cols = 4, gap = 16 }: { children: React.ReactNode; cols?: number; gap?: number }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${Math.floor(100/cols)}%, 220px))`,
      gap,
    }}>
      {children}
    </div>
  )
}

// ===== Empty State =====
export function EmptyState({ icon, title, description, action }: {
  icon: string; title: string; description?: string; action?: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '60px 20px', textAlign: 'center',
    }}>
      <span style={{ color: BRAND.border, marginBottom: 16 }}><MIcon name={icon} size={48} /></span>
      <h3 style={{ fontSize: 18, fontWeight: 600, color: BRAND.coal, margin: '0 0 6px' }}>{title}</h3>
      {description && <p style={{ fontSize: 14, color: BRAND.muted, margin: '0 0 20px', maxWidth: 400 }}>{description}</p>}
      {action}
    </div>
  )
}

// ===== Tabs =====
export function Tabs({ tabs, active, onChange }: {
  tabs: { id: string; label: string; icon?: string; count?: number }[];
  active: string; onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: `2px solid ${BRAND.border}`, marginBottom: 20, overflowX: 'auto' }}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)} style={{
          padding: '10px 16px', fontSize: 13, fontWeight: active === tab.id ? 600 : 400,
          color: active === tab.id ? BRAND.gold : BRAND.muted, background: 'none', border: 'none',
          borderBottom: active === tab.id ? `2px solid ${BRAND.gold}` : '2px solid transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: -2,
          whiteSpace: 'nowrap', fontFamily: 'inherit',
        }}>
          {tab.icon && <MIcon name={tab.icon} size={14} />}
          {tab.label}
          {tab.count !== undefined && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
              background: active === tab.id ? `${BRAND.gold}18` : `${BRAND.muted}15`,
              color: active === tab.id ? BRAND.gold : BRAND.muted,
            }}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ===== Search Input =====
export function SearchInput({ value, onChange, placeholder = 'Suchen...' }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, background: BRAND.light,
      border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '8px 14px',
    }}>
      <span style={{ color: BRAND.muted }}><MIcon name="search" size={16} /></span>
      <input
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          border: 'none', background: 'none', outline: 'none', fontSize: 13,
          color: BRAND.coal, width: '100%', fontFamily: 'inherit',
        }}
      />
    </div>
  )
}

// ===== Modal =====
export function Modal({ open, onClose, title, children, width = 560 }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number
}) {
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: BRAND.white, borderRadius: 16, width: '100%', maxWidth: width,
        maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 20px', borderBottom: `1px solid ${BRAND.border}`,
          position: 'sticky', top: 0, background: BRAND.white, zIndex: 1,
        }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: BRAND.coal, margin: 0, fontFamily: 'var(--font-cormorant), serif' }}>{title}</h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: BRAND.muted, padding: 4,
          }}><MIcon name="x" size={20} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

// ===== Activity Item =====
export function ActivityItem({ icon, title, time, color }: {
  icon: string; title: string; time: string; color?: string
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: `1px solid ${BRAND.border}` }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${color || BRAND.gold}15`, color: color || BRAND.gold, flexShrink: 0,
      }}>
        <MIcon name={icon} size={16} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, color: BRAND.coal, margin: 0 }}>{title}</p>
        <p style={{ fontSize: 11, color: BRAND.muted, margin: '2px 0 0' }}>{time}</p>
      </div>
    </div>
  )
}

// ===== Stat Row =====
export function StatRow({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: `1px solid ${BRAND.border}`,
    }}>
      <span style={{ fontSize: 13, color: BRAND.muted }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.coal }}>{value}</span>
        {subValue && <span style={{ fontSize: 11, color: BRAND.muted, marginLeft: 6 }}>{subValue}</span>}
      </div>
    </div>
  )
}
