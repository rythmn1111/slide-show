'use client'

import { useState, useEffect, useCallback } from 'react'
import { useChannel, type AppMessage } from '@/hooks/useChannel'
import './Remote.css'

type Filter = 'all' | 'photos' | 'videos'
type State = {
  playing: boolean
  index: number
  total: number
  filename: string
  volume: number
  filter: Filter
  speed: number
}

export default function Remote() {
  const [state, setState] = useState<State | null>(null)
  const [connected, setConnected] = useState(false)

  const send = useChannel(useCallback((msg: AppMessage) => {
    if (msg.type === 'state') {
      setState(msg)
      setConnected(true)
    }
  }, []))

  // Ask the slideshow tab for its current state when we open
  useEffect(() => {
    send({ type: 'request-state' })
  }, [send])

  function cmd(action: AppMessage) {
    send(action)
  }

  return (
    <div className="remote">
      <div className="remote-header">
        <span className={`dot${connected ? ' online' : ''}`} />
        <span>{connected ? 'Connected' : 'Open the slideshow tab first…'}</span>
      </div>

      {state && (
        <div className="now-playing">
          <div className="np-name">{state.filename || '—'}</div>
          <div className="np-pos">{state.index + 1} / {state.total} · {state.filter}</div>
        </div>
      )}

      <div className="transport">
        <button className="rbtn big" onClick={() => cmd({ type: 'command', action: 'prev' })}>‹</button>
        <button
          className={`rbtn big play${state?.playing ? ' active' : ''}`}
          onClick={() => cmd({ type: 'command', action: state?.playing ? 'pause' : 'play' })}
        >
          {state?.playing ? '⏸' : '▶'}
        </button>
        <button className="rbtn big" onClick={() => cmd({ type: 'command', action: 'next' })}>›</button>
      </div>

      <div className="r-section-label">Filter</div>
      <div className="filter-row">
        {(['all', 'photos', 'videos'] as Filter[]).map(f => (
          <button
            key={f}
            className={`rbtn filter${state?.filter === f ? ' active' : ''}`}
            onClick={() => cmd({ type: 'command', action: 'filter', value: f })}
          >
            {f === 'all' ? 'All' : f === 'photos' ? '🖼 Photos' : '🎬 Videos'}
          </button>
        ))}
      </div>

      <div className="r-section-label">Volume — {state ? Math.round(state.volume * 100) : 100}%</div>
      <input
        className="r-slider"
        type="range" min={0} max={1} step={0.05}
        value={state?.volume ?? 1}
        onChange={e => cmd({ type: 'command', action: 'volume', value: Number(e.target.value) })}
      />

      <div className="r-section-label">Speed — {state?.speed ?? 3}s</div>
      <input
        className="r-slider"
        type="range" min={1} max={15} step={0.5}
        value={state?.speed ?? 3}
        onChange={e => cmd({ type: 'command', action: 'speed', value: Number(e.target.value) })}
      />
    </div>
  )
}
