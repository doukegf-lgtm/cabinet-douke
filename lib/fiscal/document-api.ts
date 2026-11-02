import { NextResponse } from 'next/server'

export const DOCUMENT_BUCKET = 'fiscal-documents'
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024

const MIME_EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'text/csv': ['csv'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
}

export function documentError(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store' } },
  )
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function safeFilename(value: string) {
  const base = value
    .normalize('NFKC')
    .replace(/[\\/]/g, '_')
    .replace(/[^\p{L}\p{N}._() -]/gu, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)

  return base && base !== '.' && base !== '..' ? base : 'document'
}

export function validateDocumentFile(
  filename: string,
  mimeType: string,
  size: number,
  bytes: Uint8Array,
): string | null {
  if (!Number.isSafeInteger(size) || size <= 0) return 'Le fichier est vide ou invalide.'
  if (size > DOCUMENT_MAX_BYTES) return 'Le fichier dépasse la limite autorisée de 20 Mo.'

  const extension = filename.split('.').pop()?.toLowerCase() || ''
  const allowed = MIME_EXTENSIONS[mimeType]
  if (!allowed || !allowed.includes(extension)) {
    return 'Format refusé. Formats autorisés : PDF, XLSX, XLS, DOCX, CSV, JPG et PNG.'
  }

  const starts = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte)

  if (mimeType === 'application/pdf' && !starts(0x25, 0x50, 0x44, 0x46, 0x2d)) {
    return 'Le contenu du fichier ne correspond pas à un PDF valide.'
  }
  if (mimeType === 'image/png' && !starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return 'Le contenu du fichier ne correspond pas à une image PNG valide.'
  }
  if (mimeType === 'image/jpeg' && !starts(0xff, 0xd8, 0xff)) {
    return 'Le contenu du fichier ne correspond pas à une image JPEG valide.'
  }
  if (
    (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') &&
    !starts(0x50, 0x4b, 0x03, 0x04)
  ) {
    return 'Le contenu du fichier bureautique est invalide.'
  }
  if (mimeType === 'application/vnd.ms-excel' &&
      !starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) {
    return 'Le contenu du fichier XLS est invalide.'
  }
  if (mimeType === 'text/csv') {
    const sample = bytes.subarray(0, Math.min(bytes.length, 8192))
    if (sample.some((byte) => byte === 0)) return 'Le fichier CSV contient des données binaires invalides.'
  }

  return null
}
