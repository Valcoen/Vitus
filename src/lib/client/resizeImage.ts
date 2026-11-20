'use client'

/**
 * Shrinks a camera photo in the browser before upload (saves mobile data;
 * also turns iPhone HEIC into JPEG, which the server can read).
 * Falls back to the original file if the browser can't decode it.
 */
export async function resizeForUpload(file: File, maxSide = 2000, quality = 0.85): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality))
    return blob ?? file
  } catch {
    return file
  }
}

export async function uploadRecipeImage(recipeId: string, file: File): Promise<{ imageUrl: string } | { error: string }> {
  const blob = await resizeForUpload(file)
  const form = new FormData()
  form.append('file', blob, 'photo.jpg')
  try {
    const res = await fetch(`/api/recipes/${recipeId}/image`, { method: 'POST', body: form })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { error: json.error || `Upload fehlgeschlagen (${res.status})` }
    return { imageUrl: json.imageUrl }
  } catch {
    return { error: 'Keine Verbindung – Bild wurde nicht hochgeladen.' }
  }
}
