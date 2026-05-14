'use client'

import { useState } from 'react'
import './Converter.css'

const HEIC_EXTS = new Set(['heic', 'heif'])

// ── Minimal FS types with write support ──────────────────────────────────────

type AnyHandle = { kind: 'file' | 'directory'; name: string }
type FileH = AnyHandle & {
  kind: 'file'
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>
}
type DirH = AnyHandle & {
  kind: 'directory'
  values(): AsyncIterableIterator<AnyHandle>
  getDirectoryHandle(name: string): Promise<DirH>
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileH>
  removeEntry(name: string): Promise<void>
}

interface ConvertJob {
  file: File
  dirHandle: DirH
  originalName: string
  displayPath: string
}

interface JobResult {
  displayPath: string
  ok: boolean
  error?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function collectHeicFiles(dir: DirH, pathPrefix: string): Promise<ConvertJob[]> {
  const jobs: ConvertJob[] = []
  for await (const entry of dir.values()) {
    if (entry.kind === 'directory') {
      try {
        const sub = await dir.getDirectoryHandle(entry.name)
        jobs.push(...await collectHeicFiles(sub, `${pathPrefix}/${entry.name}`))
      } catch { /* skip unreadable dirs */ }
    } else {
      const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
      if (!HEIC_EXTS.has(ext)) continue
      try {
        const file = await (entry as FileH).getFile()
        jobs.push({
          file,
          dirHandle: dir,
          originalName: entry.name,
          displayPath: `${pathPrefix}/${entry.name}`,
        })
      } catch { /* skip unreadable files */ }
    }
  }
  return jobs
}

async function convertJob(job: ConvertJob): Promise<void> {
  console.log('[converter] sips API →', job.originalName, job.file.size, 'bytes')
  // Use server-side sips via API — only reliable method for HEVC-encoded iPhone HEIC on Chrome.
  const src = job.file.type ? job.file : new File([job.file], job.file.name, { type: 'image/heic' })
  const body = new FormData()
  body.append('file', src, src.name)
  body.append('format', 'png')

  const res = await fetch('/api/convert-heic', { method: 'POST', body })
  if (!res.ok) {
    let msg = res.statusText
    try { msg = (await res.json()).error ?? msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  const pngBlob = await res.blob()

  // Write the new .png file alongside the original
  const base = job.originalName.replace(/\.(heic|heif)$/i, '')
  const newHandle = await job.dirHandle.getFileHandle(`${base}.png`, { create: true })
  const writable = await newHandle.createWritable()
  await writable.write(pngBlob)
  await writable.close()

  // Remove the original HEIC file
  await job.dirHandle.removeEntry(job.originalName)
}

// ── Component ─────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'scanning' | 'confirming' | 'converting' | 'done'

export default function Converter() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [jobs, setJobs] = useState<ConvertJob[]>([])
  const [results, setResults] = useState<JobResult[]>([])
  const [progress, setProgress] = useState(0)

  async function pickFolder() {
    try {
      const dir = await (window as unknown as {
        showDirectoryPicker(opts?: { mode?: string }): Promise<DirH>
      }).showDirectoryPicker({ mode: 'readwrite' })

      setPhase('scanning')
      setJobs([])
      setResults([])

      const found = await collectHeicFiles(dir, dir.name)
      setJobs(found)
      setPhase(found.length === 0 ? 'done' : 'confirming')
    } catch {
      setPhase('idle')
    }
  }

  async function startConversion() {
    setPhase('converting')
    setProgress(0)
    const accumulated: JobResult[] = []

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]
      try {
        await convertJob(job)
        accumulated.push({ displayPath: job.displayPath, ok: true })
      } catch (e) {
        accumulated.push({ displayPath: job.displayPath, ok: false, error: (e as Error).message })
      }
      setProgress(i + 1)
      setResults([...accumulated])
    }

    setPhase('done')
  }

  function reset() {
    setPhase('idle')
    setJobs([])
    setResults([])
    setProgress(0)
  }

  const doneCount = results.filter(r => r.ok).length
  const failCount = results.filter(r => !r.ok).length
  const recentResults = results.slice(-4)

  return (
    <div className="converter">
      <div className="conv-card">
        <h1>HEIC Converter</h1>
        <p className="conv-sub">
          Selects a folder, finds every HEIC/HEIF photo (including subfolders),
          converts each one to PNG, and replaces the original file. All other files are untouched.
        </p>

        {phase === 'idle' && (
          <button className="conv-btn" onClick={pickFolder}>
            Choose Folder
          </button>
        )}

        {phase === 'scanning' && (
          <p className="conv-spinner">Scanning for HEIC files…</p>
        )}

        {phase === 'confirming' && (
          <>
            <p className="conv-found">
              Found <strong>{jobs.length}</strong> HEIC file{jobs.length !== 1 ? 's' : ''}
            </p>
            <ul className="conv-list">
              {jobs.slice(0, 12).map(j => (
                <li key={j.displayPath} title={j.displayPath}>{j.displayPath}</li>
              ))}
              {jobs.length > 12 && (
                <li className="conv-more">…and {jobs.length - 12} more</li>
              )}
            </ul>
            <p className="conv-warn">
              Each .heic file will be replaced with a .png file in the same location.
              This cannot be undone — make sure you have a backup if needed.
            </p>
            <button className="conv-btn" onClick={startConversion}>
              Convert {jobs.length} file{jobs.length !== 1 ? 's' : ''}
            </button>
            <button className="conv-btn-ghost" onClick={reset}>Cancel</button>
          </>
        )}

        {phase === 'converting' && (
          <>
            <p className="conv-progress-label">
              Converting <span>{progress}</span> / <span>{jobs.length}</span>
            </p>
            <div className="conv-bar-track">
              <div
                className="conv-bar-fill"
                style={{ width: `${(progress / jobs.length) * 100}%` }}
              />
            </div>
            <div className="conv-recent">
              {recentResults.map(r => (
                <p key={r.displayPath} className={`conv-log-line ${r.ok ? 'ok' : 'fail'}`}>
                  {r.ok ? '✓' : '✗'} {r.displayPath}
                </p>
              ))}
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            {jobs.length === 0 ? (
              <p className="conv-no-heic">No HEIC files found in that folder.</p>
            ) : (
              <>
                <p className={`conv-summary ${failCount === 0 ? 'all-ok' : 'has-err'}`}>
                  {doneCount} converted{failCount > 0 ? `, ${failCount} failed` : ''}
                </p>
                <p className="conv-summary-sub">
                  {failCount === 0
                    ? 'All HEIC files have been replaced with PNG.'
                    : 'Some files could not be converted — see errors below.'}
                </p>
                {failCount > 0 && (
                  <ul className="conv-errors">
                    {results.filter(r => !r.ok).map(r => (
                      <li key={r.displayPath}>{r.displayPath}: {r.error}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <button className="conv-btn" onClick={reset}>
              Convert Another Folder
            </button>
          </>
        )}
      </div>
    </div>
  )
}
