import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function POST(req: NextRequest) {
  let tmpIn: string | undefined
  let tmpOut: string | undefined

  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const format = (form.get('format') as string | null) ?? 'jpeg'

    if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 })

    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`
    const outExt = format === 'png' ? 'png' : 'jpg'
    tmpIn  = join(tmpdir(), `hcv_in_${id}.heic`)
    tmpOut = join(tmpdir(), `hcv_out_${id}.${outExt}`)

    await writeFile(tmpIn, Buffer.from(await file.arrayBuffer()))

    // sips: pre-installed macOS tool, uses the OS's HEVC/HEIC codec.
    // Works for all HEIC variants including HEVC-encoded iPhone photos.
    await execAsync(`/usr/bin/sips -s format ${outExt === 'png' ? 'png' : 'jpeg'} "${tmpIn}" --out "${tmpOut}"`)

    const result = await readFile(tmpOut)
    const mime = format === 'png' ? 'image/png' : 'image/jpeg'

    return new NextResponse(result, { headers: { 'Content-Type': mime } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  } finally {
    if (tmpIn)  await unlink(tmpIn).catch(() => {})
    if (tmpOut) await unlink(tmpOut).catch(() => {})
  }
}
