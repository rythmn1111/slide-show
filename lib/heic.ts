// HEIC conversion for browser.
//
// Method order:
//  1. <img> → canvas  (Safari, which uses macOS Image I/O for <img> elements)
//  2. createImageBitmap → canvas  (Safari fallback)
//  3. heic2any  (non-HEVC HEIC variants; open-source libheif without HEVC codec)
//  4. /api/convert-heic  (server-side sips — macOS pre-installed tool with full HEVC support)
//     This handles HEVC-encoded iPhone HEIC that all browser-side methods fail on.

async function imgToBlob(file: File, mimeType: string): Promise<Blob> {
  const url = URL.createObjectURL(file)
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        reject(new Error('zero dimensions')); return
      }
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('no 2d context')); return }
      try {
        ctx.drawImage(img, 0, 0)
        canvas.toBlob(
          b => b ? resolve(b) : reject(new Error('toBlob null')),
          mimeType,
          mimeType === 'image/jpeg' ? 0.92 : undefined
        )
      } catch (e) { reject(e) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img load failed')) }
    img.src = url
  })
}

export async function convertHeicToBlob(
  file: File,
  mimeType: 'image/png' | 'image/jpeg' = 'image/jpeg'
): Promise<Blob> {
  const src = (file.type === 'image/heic' || file.type === 'image/heif')
    ? file
    : new File([file], file.name, { type: 'image/heic' })

  // Method 1: <img> → canvas (Safari uses macOS Image I/O here)
  try { return await imgToBlob(src, mimeType) } catch { /* next */ }

  // Method 2: createImageBitmap → canvas
  try {
    const bitmap = await createImageBitmap(src)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        b => b ? resolve(b) : reject(new Error('toBlob null')),
        mimeType,
        mimeType === 'image/jpeg' ? 0.92 : undefined
      )
    })
  } catch { /* next */ }

  // Method 3: heic2any — wrap in timeout in case the Worker hangs silently
  try {
    const mod = await import('heic2any')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = ((mod as any).default ?? mod) as (o: { blob: Blob; toType: string; quality?: number }) => Promise<Blob | Blob[]>
    const race = Promise.race([
      fn({ blob: src, toType: mimeType, quality: mimeType === 'image/jpeg' ? 0.92 : undefined }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('heic2any timeout')), 8000)),
    ])
    const result = await race
    return Array.isArray(result) ? result[0]! : result
  } catch (e) { console.warn('[heic] method3 heic2any:', (e as Error).message) }

  // Method 4: server-side sips (macOS pre-installed, full HEVC support)
  console.log('[heic] trying method4 sips API for', src.name)
  const body = new FormData()
  body.append('file', src, src.name)
  body.append('format', mimeType === 'image/png' ? 'png' : 'jpeg')
  const res = await fetch('/api/convert-heic', { method: 'POST', body })
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(payload.error ?? res.statusText)
  }
  console.log('[heic] method4 sips succeeded for', src.name)
  return res.blob()
}

// Returns a blob URL for a HEIC file. Falls back to raw HEIC URL (Safari renders natively).
export async function heicToObjectUrl(file: File): Promise<string> {
  try {
    const blob = await convertHeicToBlob(file, 'image/jpeg')
    return URL.createObjectURL(blob)
  } catch (e) {
    console.warn('[heic] all methods failed for', file.name, (e as Error).message)
    const src = (file.type === 'image/heic' || file.type === 'image/heif')
      ? file : new File([file], file.name, { type: 'image/heic' })
    return URL.createObjectURL(src)
  }
}
