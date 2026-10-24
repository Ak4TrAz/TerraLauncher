import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Search, Copy, FolderOpen, Pause, Play, Loader2, ArrowDownToLine } from 'lucide-react'
import { api } from '../api'
import { Select } from './ui'

const SHOWN_MAX = 2000 // lignes affichées au plus (les plus récentes)
const LEVELS = [
  { value: 'all', label: 'Tout' },
  { value: 'warn', label: 'Avertissements et erreurs' },
  { value: 'error', label: 'Erreurs seulement' }
]
const COLOR = { FATAL: 'text-red-400', ERROR: 'text-red-400', WARN: 'text-amber-300', DEBUG: 'text-cream-muted', TRACE: 'text-cream-muted' }
const isError = (l) => l.level === 'ERROR' || l.level === 'FATAL'
const time = (t) => new Date(t).toLocaleTimeString('fr-FR')
const asText = (l) => `[${time(l.t)}] [${l.level}]${l.logger ? ` [${l.logger}]` : ''} ${l.text}`

// Journal du jeu : en direct pendant la partie, sinon celui de la dernière partie
export default function GameLog({ inst, running, toast }) {
  const [lines, setLines] = useState(null)
  const [fromFile, setFromFile] = useState(false)
  const [level, setLevel] = useState('all')
  const [query, setQuery] = useState('')
  const [follow, setFollow] = useState(true)
  const box = useRef(null)

  useEffect(() => {
    let alive = true
    setLines(null)
    api.game.log(inst.id).then((r) => { if (alive) { setLines(r.lines); setFromFile(!!r.fromFile) } }).catch(() => alive && setLines([]))
    const off = api.game.onLog((log) => {
      if (log.instanceId !== inst.id) return
      if (log.reset) { setLines([]); setFromFile(false); return }
      setLines((cur) => [...(cur || []), ...log.lines].slice(-5000))
    })
    return () => { alive = false; off() }
  }, [inst.id])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (lines || []).filter((l) =>
      (level === 'all' || (level === 'warn' ? l.level === 'WARN' || isError(l) : isError(l))) &&
      (!q || l.text.toLowerCase().includes(q) || (l.logger || '').toLowerCase().includes(q)))
  }, [lines, level, query])
  const shown = filtered.slice(-SHOWN_MAX)
  const errors = (lines || []).filter(isError).length
  const warnings = (lines || []).filter((l) => l.level === 'WARN').length

  // Défilement automatique vers la fin tant que « Suivre » est actif
  useLayoutEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [shown.length, follow, lines])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(filtered.map(asText).join('\n'))
      toast(`${filtered.length} ligne${filtered.length > 1 ? 's' : ''} copiée${filtered.length > 1 ? 's' : ''}.`, 'success')
    } catch { toast('Copie impossible.', 'error') }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cream-muted" />
          <input className="input h-11 pl-12" placeholder="Rechercher dans le journal…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={level} onChange={setLevel} options={LEVELS} className="w-[250px]" />
        <button className="btn-ghost" onClick={() => setFollow((f) => !f)} title={follow ? 'Arrêter de suivre les nouvelles lignes' : 'Suivre les nouvelles lignes'}>
          {follow ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {follow ? 'Pause' : 'Suivre'}
        </button>
        <button className="btn-ghost" onClick={copy} disabled={!filtered.length}><Copy className="h-4 w-4" /> Copier</button>
        <button className="btn-ghost" onClick={() => api.instances.openLogs(inst.id).catch((e) => toast(e.message, 'error'))}><FolderOpen className="h-4 w-4" /> Dossier des logs</button>
      </div>

      <div className="flex min-h-6 flex-wrap items-center gap-3 text-sm text-cream-muted">
        {running ? <span className="flex items-center gap-1.5 font-semibold text-ember-400"><span className="h-2 w-2 animate-pulse rounded-full bg-ember-500" /> En direct</span> : <span>{fromFile ? 'Dernière partie' : lines?.length ? 'Partie terminée' : ''}</span>}
        {lines && <span>{lines.length} ligne{lines.length > 1 ? 's' : ''}</span>}
        {errors > 0 && <span className="text-red-400">{errors} erreur{errors > 1 ? 's' : ''}</span>}
        {warnings > 0 && <span className="text-amber-300">{warnings} avertissement{warnings > 1 ? 's' : ''}</span>}
        {filtered.length > SHOWN_MAX && <span>· seules les {SHOWN_MAX} dernières lignes sont affichées (Copier prend tout)</span>}
      </div>

      <div className="relative">
        <div
          ref={box}
          onWheel={(e) => { if (e.deltaY < 0) setFollow(false) }}
          className="h-[58vh] overflow-auto rounded-tl border border-bark-700 bg-[#120d0a] p-3 font-mono text-[12.5px] leading-[1.55] selection:bg-ember-500/40"
        >
          {!lines && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-ember-400" /></div>}
          {lines && !lines.length && <div className="py-10 text-center font-sans text-sm text-cream-muted">Aucun journal pour l’instant. Lance le jeu pour le voir s’afficher ici en direct.</div>}
          {shown.map((l, i) => (
            <div key={i} className={`whitespace-pre-wrap break-words ${COLOR[l.level] || 'text-cream/85'}`}>
              <span className="select-none text-cream-muted/60">{time(l.t)} </span>
              {l.logger && <span className="text-cream-muted">[{l.logger}] </span>}
              {l.text}
            </div>
          ))}
        </div>
        {!follow && lines?.length > 0 && (
          <button className="absolute bottom-4 right-6 flex items-center gap-1.5 rounded-full bg-ember-500 px-3 py-1.5 text-sm font-semibold text-white shadow-lg hover:bg-ember-400" onClick={() => setFollow(true)}>
            <ArrowDownToLine className="h-4 w-4" /> Aller à la fin
          </button>
        )}
      </div>
    </div>
  )
}
