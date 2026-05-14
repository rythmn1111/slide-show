'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useChannel, type AppMessage } from '@/hooks/useChannel'
import './App.css'

type MediaFile = { name: string; url: string; type: 'image' | 'video' }
type Filter = 'all' | 'photos' | 'videos'
type Transition = 'fade' | 'slide-left' | 'slide-right' | 'zoom-in' | 'zoom-out' | 'blur-fade' | 'flip'

const TRANSITIONS: Transition[] = ['fade', 'slide-left', 'slide-right', 'zoom-in', 'zoom-out', 'blur-fade', 'flip']
function pickTransition(): Transition {
  return TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)] as Transition
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg'])
const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'mov', 'mkv', 'm4v'])
function getMediaType(name: string): 'image' | 'video' | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (VIDEO_EXTS.has(ext)) return 'video'
  return null
}

export default function App() {
  const [allFiles, setAllFiles] = useState<MediaFile[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(3)
  const [volume, setVolume] = useState(1)
  const [transition, setTransition] = useState<Transition>('fade')
  const [remoteUrl, setRemoteUrl] = useState('/remote')
  const [overlayVisible, setOverlayVisible] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const objectUrlsRef = useRef<string[]>([])
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const broadcastState = useRef<() => void>(() => {})

  const files = allFiles.filter(f =>
    filter === 'all' ? true : filter === 'photos' ? f.type === 'image' : f.type === 'video'
  )
  const current = files[index]

  useEffect(() => { setRemoteUrl(`${location.protocol}//${location.host}/remote`) }, [])

  // Auto-hide overlay after 3s of inactivity
  useEffect(() => {
    function showOverlay() {
      setOverlayVisible(true)
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => setOverlayVisible(false), 3000)
    }
    window.addEventListener('mousemove', showOverlay)
    window.addEventListener('touchstart', showOverlay)
    showOverlay()
    return () => {
      window.removeEventListener('mousemove', showOverlay)
      window.removeEventListener('touchstart', showOverlay)
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [])

  // Track fullscreen state
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume
  }, [volume, index])

  const goTo = useCallback((i: number) => {
    setTransition(pickTransition())
    setIndex(i)
  }, [])

  const next = useCallback(() => {
    setTransition(pickTransition())
    setIndex(i => files.length === 0 ? 0 : (i + 1) % files.length)
  }, [files.length])

  const prev = useCallback(() => {
    setTransition(pickTransition())
    setIndex(i => (i - 1 + files.length) % files.length)
  }, [files.length])

  const send = useChannel(useCallback((msg: AppMessage) => {
    if (msg.type === 'request-state') { broadcastState.current(); return }
    if (msg.type !== 'command') return
    if (msg.action === 'next') next()
    else if (msg.action === 'prev') prev()
    else if (msg.action === 'play') setPlaying(true)
    else if (msg.action === 'pause') setPlaying(false)
    else if (msg.action === 'volume') setVolume(msg.value)
    else if (msg.action === 'filter') { setFilter(msg.value); setIndex(0) }
    else if (msg.action === 'speed') setSpeed(msg.value)
  }, [next, prev]))

  broadcastState.current = () => send({
    type: 'state',
    playing, index,
    total: files.length,
    filename: files[index]?.name ?? '',
    volume, filter, speed,
  })

  useEffect(() => {
    broadcastState.current()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, index, volume, filter, speed, files.length])

  useEffect(() => {
    if (!playing || files.length === 0 || current?.type === 'video') return
    timerRef.current = setTimeout(() => next(), speed * 1000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [playing, index, speed, files.length, current?.type, next])

  useEffect(() => {
    if (current?.type === 'video' && videoRef.current) {
      videoRef.current.volume = volume
      videoRef.current.play().catch(() => {})
    }
  }, [index, current?.type]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (current?.type !== 'video' || !videoRef.current) return
    if (playing) videoRef.current.play().catch(() => {})
    else videoRef.current.pause()
  }, [playing, current?.type])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p) }
      else if (e.key === 'Escape') setPlaying(false)
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev])

  useEffect(() => {
    return () => { objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url)) }
  }, [])

  useEffect(() => { setIndex(0) }, [filter])

  async function pickFolder() {
    try {
      const dir = await (window as unknown as { showDirectoryPicker(): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      objectUrlsRef.current = []
      const mediaFiles: MediaFile[] = []
      type FSDir = { values(): AsyncIterableIterator<FileSystemHandle> }
      for await (const entry of (dir as unknown as FSDir).values()) {
        if (entry.kind !== 'file') continue
        const type = getMediaType(entry.name)
        if (!type) continue
        const file = await (entry as FileSystemFileHandle).getFile()
        const url = URL.createObjectURL(file)
        objectUrlsRef.current.push(url)
        mediaFiles.push({ name: entry.name, url, type })
      }
      mediaFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      setAllFiles(mediaFiles)
      setIndex(0)
      setPlaying(false)
      setTransition('fade')
    } catch { /* cancelled */ }
  }

  if (allFiles.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-content">
          <div className="empty-icon">▶</div>
          <h1>Slideshow</h1>
          <p>Select a folder with photos and videos</p>
          <button className="pick-btn" onClick={pickFolder}>Choose Folder</button>
          <p className="remote-hint">
            Open remote in another tab: <code>{remoteUrl}</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`app${overlayVisible ? '' : ' idle'}`}>
      <div className="media-area" onClick={() => setPlaying(p => !p)}>
        {current?.type === 'image' && (
          <img
            key={current.url}
            src={current.url}
            alt={current.name}
            className={`media-item t-${transition}`}
          />
        )}
        {current?.type === 'video' && (
          <video
            key={current.url}
            ref={videoRef}
            src={current.url}
            className={`media-item t-${transition}`}
            playsInline
            onEnded={() => { if (playing) next() }}
          />
        )}
        {!playing && (
          <div className="pause-overlay"><span>▶</span></div>
        )}
        <div className="filename">{current?.name}</div>
        <div className="counter">{files.length > 0 ? `${index + 1} / ${files.length}` : '0 / 0'}</div>
      </div>

      {/* Floating overlay — auto-hides after 3s idle */}
      <div className="float-toolbar">
        <button className="float-btn" onClick={pickFolder} title="Change folder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        <button className="float-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}>
          {isFullscreen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
              <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
              <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
