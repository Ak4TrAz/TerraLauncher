import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, Check, AlertTriangle } from 'lucide-react'
import { api } from '../api'

// Progression d'une tâche (0 à 1), calculée par le launcher ; null tant que la taille totale est inconnue
const progressOf = (t) => (t.status === 'done' ? 1 : t.progress ?? (t.total ? Math.min(1, t.received / t.total) : null))

const fmt = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} Go` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} Mo` : `${Math.round(b / 1e3)} Ko`)

// Icône de téléchargements dans l'en-tête, avec anneau de progression et liste en temps réel.
export default function DownloadsButton() {
  const [tasks, setTasks] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    api.downloads.list().then(setTasks)
    return api.downloads.onUpdate(setTasks)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const running = tasks.filter((t) => t.status === 'running')
  // Rond : progression des tâches en cours, pondérée par leur taille. Il ne recule pas tant que ce sont
  // les mêmes tâches ; tant qu'aucune taille n'est connue, un arc tourne à la place.
  const known = running.filter((t) => progressOf(t) !== null && t.total > 0)
  const weight = known.reduce((s, t) => s + t.total, 0)
  const raw = weight ? known.reduce((s, t) => s + progressOf(t) * t.total, 0) / weight : null
  const kept = useRef({ key: '', value: 0 })
  const key = running.map((t) => t.id).join(',')
  if (kept.current.key !== key) kept.current = { key, value: 0 }
  if (raw !== null) kept.current.value = Math.max(kept.current.value, raw)
  const progress = raw === null ? null : kept.current.value
  const R = 19
  const C = 2 * Math.PI * R

  return (
    <div className="no-drag relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} title="Téléchargements" className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition hover:bg-white/5 ${open ? 'bg-white/5' : ''}`}>
        {running.length > 0 && (
          <svg className={`absolute inset-0 -rotate-90 ${progress === null ? 'animate-spin [animation-duration:1.2s]' : ''}`} viewBox="0 0 44 44">
            <circle cx="22" cy="22" r={R} fill="none" stroke="#49382b" strokeWidth="3" />
            {progress === null
              ? <circle cx="22" cy="22" r={R} fill="none" stroke="#e46b1a" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${C * 0.2} ${C}`} />
              : <circle cx="22" cy="22" r={R} fill="none" stroke="#e46b1a" strokeWidth="3" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} className="transition-[stroke-dashoffset] duration-200" />}
          </svg>
        )}
        <Download className={`h-5 w-5 ${running.length ? 'text-ember-400' : 'text-cream/75'}`} />
        {running.length > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ember-500 px-1 text-[11px] font-bold text-white">{running.length}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.12 }} className="absolute right-0 top-full z-50 mt-2 w-[380px] overflow-hidden rounded-tl-lg border border-bark-700 bg-bark-850 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.85)]">
            <div className="flex items-center border-b border-bark-700/70 px-4 py-3">
              <span className="flex-1 font-bold">Téléchargements</span>
              {tasks.some((t) => t.status !== 'running') && (
                <button onClick={() => api.downloads.clear()} className="text-xs font-semibold text-cream-muted hover:text-cream">Effacer les terminés</button>
              )}
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2">
              {tasks.length === 0 && <p className="px-3 py-6 text-center text-sm text-cream-muted">Aucun téléchargement en cours.</p>}
              {tasks.map((t) => {
                const p = progressOf(t)
                const pct = p === null ? 0 : p * 100
                return (
                  <div key={t.id} className="rounded-tl px-3 py-2.5 hover:bg-bark-800/50">
                    <div className="mb-1.5 flex items-center gap-2">
                      {t.status === 'done' && <Check className="h-4 w-4 text-[#63bd73]" />}
                      {t.status === 'error' && <AlertTriangle className="h-4 w-4 text-[#df7164]" />}
                      <span className="flex-1 truncate text-sm font-semibold">{t.title}</span>
                      <span className="text-xs text-cream-muted">{t.status === 'running' ? (p === null ? '…' : `${Math.floor(pct)} %`) : t.status === 'done' ? 'Terminé' : 'Échec'}</span>
                    </div>
                    {t.status === 'running' && p === null ? (
                      <div className="working-bar h-1.5 rounded-full bg-bark-700" />
                    ) : (
                      <div className="h-1.5 overflow-hidden rounded-full bg-bark-700">
                        <div className={`h-full rounded-full transition-[width] duration-200 ${t.status === 'error' ? 'bg-[#df7164]' : t.status === 'done' ? 'bg-[#63bd73]' : 'working-shine bg-ember-500'}`} style={{ width: `${t.status === 'done' ? 100 : Math.max(pct, 2)}%` }} />
                      </div>
                    )}
                    <div className="mt-1.5 flex justify-between text-[11px] text-cream-muted/80">
                      <span className="truncate">{t.error || t.detail}</span>
                      {t.status === 'running' && t.total > 0 && <span>{fmt(t.received)} / {fmt(t.total)}{t.speed ? ` · ${fmt(t.speed)}/s` : ''}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
