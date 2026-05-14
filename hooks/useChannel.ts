'use client'

import { useEffect, useRef, useCallback } from 'react'

export type AppMessage =
  | { type: 'command'; action: 'next' | 'prev' | 'play' | 'pause' }
  | { type: 'command'; action: 'volume'; value: number }
  | { type: 'command'; action: 'filter'; value: 'all' | 'photos' | 'videos' }
  | { type: 'command'; action: 'speed'; value: number }
  | { type: 'state'; playing: boolean; index: number; total: number; filename: string; volume: number; filter: 'all' | 'photos' | 'videos'; speed: number }
  | { type: 'request-state' }

const CHANNEL = 'slideshow'

export function useChannel(onMessage: (msg: AppMessage) => void) {
  const channelRef = useRef<BroadcastChannel | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel(CHANNEL)
    channelRef.current = channel
    channel.onmessage = (e: MessageEvent<AppMessage>) => {
      onMessageRef.current(e.data)
    }
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [])

  const send = useCallback((msg: AppMessage) => {
    channelRef.current?.postMessage(msg)
  }, [])

  return send
}
