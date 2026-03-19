/**
 * Example: How to use file upload validation in API routes
 * 
 * Import and use in your API routes like this:
 */

// ============================================
// EXAMPLE 1: Simple file upload endpoint
// ============================================
/*
import { NextRequest, NextResponse } from 'next/server'
import { validateFileUpload, generateSafeFilename } from '@/lib/file-upload-validation'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 })
    }

    // Validate file
    const validation = validateFileUpload(file)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Generate safe filename
    const safeFilename = generateSafeFilename(file.name)
    console.log(`Original: ${file.name}, Safe: ${safeFilename}`)

    // Upload to storage (e.g., Supabase, S3)
    // const buffer = await file.arrayBuffer()
    // await uploadToStorage(safeFilename, buffer)

    return NextResponse.json({ 
      success: true, 
      filename: safeFilename,
      size: file.size,
      type: file.type 
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
*/

// ============================================
// EXAMPLE 2: Multiple file upload
// ============================================
/*
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Keine Dateien hochgeladen' }, { status: 400 })
    }

    const uploaded = []
    const errors = []

    for (const file of files) {
      const validation = validateFileUpload(file)
      
      if (!validation.valid) {
        errors.push({ filename: file.name, error: validation.error })
        continue
      }

      const safeFilename = generateSafeFilename(file.name)
      uploaded.push({ 
        original: file.name, 
        safe: safeFilename,
        size: file.size 
      })
      
      // Upload to storage
      // const buffer = await file.arrayBuffer()
      // await uploadToStorage(safeFilename, buffer)
    }

    return NextResponse.json({ uploaded, errors })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
*/

// ============================================
// EXAMPLE 3: With custom file size limit
// ============================================
/*
const MAX_PROFILE_PHOTO_SIZE = 2 * 1024 * 1024 // 2MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('profilePhoto') as File

    // Validate with custom size limit
    const validation = validateFileUpload(file, MAX_PROFILE_PHOTO_SIZE)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Continue with upload...
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
*/

// ============================================
// EXAMPLE 4: Client-side validation
// ============================================
/*
// In a React component
import { validateFileUpload, generateSafeFilename } from '@/lib/file-upload-validation'

export function FileUploadForm() {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate on client side too
    const validation = validateFileUpload(file)
    if (!validation.valid) {
      alert(`Fehler: ${validation.error}`)
      return
    }

    // Show safe filename to user
    console.log(`Datei wird als "${validation.sanitizedFilename}" gespeichert`)

    // Upload
    const formData = new FormData()
    formData.append('file', file)

    fetch('/api/upload', { method: 'POST', body: formData })
      .then(r => r.json())
      .then(data => console.log('Upload erfolgreich:', data))
      .catch(err => console.error('Upload fehler:', err))
  }

  return (
    <input 
      type="file" 
      accept=".jpg,.jpeg,.png,.webp,.pdf"
      onChange={handleFileChange}
    />
  )
}
*/

export {}
