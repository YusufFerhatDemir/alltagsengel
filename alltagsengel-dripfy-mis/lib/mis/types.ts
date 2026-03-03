// ========================================
// AlltagsEngel MIS - Type Definitions
// ========================================

export interface MisDocument {
  id: string
  title: string
  description?: string
  category_id?: string
  file_path?: string
  file_name?: string
  file_size: number
  file_type?: string
  version: number
  status: 'draft' | 'review' | 'approved' | 'archived' | 'obsolete'
  iso_doc_number?: string
  iso_revision?: string
  classification: 'public' | 'internal' | 'confidential' | 'restricted'
  owner_id?: string
  approved_by?: string
  approved_at?: string
  review_due_at?: string
  tags: string[]
  metadata: Record<string, unknown>
  download_count: number
  created_at: string
  updated_at: string
  category?: DocumentCategory
}

export interface DocumentCategory {
  id: string
  name: string
  slug: string
  parent_id?: string
  icon: string
  color: string
  sort_order: number
}

export interface AuditLogEntry {
  id: string
  entity_type: string
  entity_id: string
  action: string
  actor_id?: string
  actor_name?: string
  details: Record<string, unknown>
  created_at: string
}

export interface KPI {
  id: string
  name: string
  slug: string
  category: string
  value: number
  target: number
  unit: string
  trend: 'up' | 'down' | 'stable'
  period: string
}

export interface QualityProcess {
  id: string
  process_id: string
  name: string
  description?: string
  category: 'core' | 'support' | 'management'
  status: 'active' | 'review' | 'suspended' | 'retired'
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  last_audit_date?: string
  next_audit_date?: string
  kpis: unknown[]
}

export interface QualityAudit {
  id: string
  audit_number: string
  process_id?: string
  audit_type: 'internal' | 'external' | 'supplier' | 'certification'
  auditor_name?: string
  status: 'planned' | 'in_progress' | 'completed' | 'closed'
  findings_count: number
  non_conformities: number
  score?: number
  scheduled_date?: string
  completed_date?: string
}

export interface CAPA {
  id: string
  capa_number: string
  type: 'corrective' | 'preventive' | 'improvement'
  title: string
  description?: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'investigation' | 'action_plan' | 'implementation' | 'verification' | 'closed'
  due_date?: string
}

export interface Supplier {
  id: string
  name: string
  category?: string
  contact_person?: string
  email?: string
  phone?: string
  rating: number
  status: 'active' | 'pending' | 'suspended' | 'blacklisted'
  iso_certified: boolean
  contract_start?: string
  contract_end?: string
}

export interface PurchaseOrder {
  id: string
  po_number: string
  supplier_id?: string
  status: 'draft' | 'submitted' | 'approved' | 'ordered' | 'received' | 'closed' | 'cancelled'
  items: unknown[]
  total_amount: number
  currency: string
  order_date?: string
  expected_delivery?: string
  supplier?: Supplier
}

export interface BudgetItem {
  id: string
  category: string
  subcategory?: string
  description?: string
  planned_amount: number
  actual_amount: number
  period: string
  year: number
}

export interface MisTask {
  id: string
  title: string
  description?: string
  module: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'review' | 'done' | 'cancelled'
  assigned_to?: string
  due_date?: string
  tags: string[]
}

export interface Notification {
  id: string
  title: string
  message?: string
  type: 'info' | 'warning' | 'error' | 'success' | 'task' | 'review'
  module?: string
  link?: string
  is_read: boolean
  created_at: string
}

export type MISModule =
  | 'dashboard' | 'documents' | 'dataroom' | 'finance'
  | 'supply-chain' | 'quality' | 'ai-assistant'
  | 'market' | 'team' | 'settings'
