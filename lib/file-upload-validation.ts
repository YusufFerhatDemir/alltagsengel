/**
 * File Upload Validation Utility
 * Validates file uploads for security: type, size, and filename sanitization
 */

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export interface FileValidationResult {
  valid: boolean
  error?: string
  sanitizedFilename?: string
}

/**
 * Validate file upload
 * @param file - File object from FormData
 * @param maxSize - Max file size in bytes (default: 5MB)
 * @returns Validation result with sanitized filename if valid
 */
export function validateFileUpload(
  file: File,
  maxSize: number = MAX_FILE_SIZE
): FileValidationResult {
  // Check if file exists
  if (!file || !file.name) {
    return { valid: false, error: 'Keine Datei vorhanden' }
  }

  // Check file type (MIME type)
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: `Dateityp nicht erlaubt. Erlaubte Typen: ${ALLOWED_EXTENSIONS.join(', ')}` }
  }

  // Check file size
  if (file.size > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1)
    return { valid: false, error: `Datei zu groß. Maximum: ${maxSizeMB}MB` }
  }

  // Validate extension
  const extension = getFileExtension(file.name).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return { valid: false, error: `Dateityp nicht erlaubt. Erlaubte Typen: ${ALLOWED_EXTENSIONS.join(', ')}` }
  }

  // Sanitize filename
  const sanitizedFilename = sanitizeFilename(file.name)
  if (!sanitizedFilename) {
    return { valid: false, error: 'Ungültiger Dateiname' }
  }

  return { valid: true, sanitizedFilename }
}

/**
 * Sanitize filename to prevent directory traversal and injection attacks
 * @param filename - Original filename
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  // Remove path traversal attempts
  let sanitized = filename.replace(/\.\.\//g, '').replace(/\.\.\\/g, '')

  // Remove any path separators
  sanitized = sanitized.replace(/[\/\\]/g, '')

  // Remove special characters that could cause issues
  sanitized = sanitized.replace(/[<>:"|?*\x00-\x1f]/g, '')

  // Remove leading/trailing spaces and dots
  sanitized = sanitized.trim().replace(/^\.+/, '')

  // Limit length
  if (sanitized.length > 255) {
    const ext = getFileExtension(sanitized)
    const name = sanitized.substring(0, 255 - ext.length - 1)
    sanitized = name + '.' + ext
  }

  return sanitized || 'file'
}

/**
 * Get file extension from filename
 * @param filename - Filename
 * @returns Extension without dot
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

/**
 * Generate a safe unique filename
 * @param originalFilename - Original filename
 * @returns Safe unique filename with timestamp
 */
export function generateSafeFilename(originalFilename: string): string {
  const sanitized = sanitizeFilename(originalFilename)
  const ext = getFileExtension(sanitized)
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  const name = sanitized.substring(0, 50).replace(/\.[^.]*$/, '')
  return `${name}-${timestamp}-${random}${ext ? '.' + ext : ''}`
}
