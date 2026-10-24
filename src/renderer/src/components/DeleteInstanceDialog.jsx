import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import Banner, { Logo } from './Banner'
import { VersionChip, LoaderChip, formatPlayTime } from './ui'
import { api } from '../api'

// Image de secours pour la feuille quand la capture d'écran est impossible (aperçu navigateur)
function fallbackImage(inst, w, h) {
  const c = document.createElement('canvas')
  c.width = w * 2
  c.height = h * 2
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, c.height)
  g.addColorStop(0, '#5a3a24')
  g.addColorStop(1, '#1c1612')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#f6e9df'
  ctx.font = `800 ${Math.round(c.height * 0.14)}px sans-serif`
  ctx.fillText(inst.name, c.width * 0.06, c.height * 0.86)
  return c.toDataURL('image/png')
}

// Suppression d'une instance : la carte passe au premier plan (fond grisé) avec la confirmation ;
// une fois confirmée, la carte se froisse comme une feuille de papier et tombe.
export default function DeleteInstanceDialog({ inst, onCancel, onDelete, onDone }) {
  const [phase, setPhase] = useState('confirm') // confirm | crumpling
  const [hidden, setHidden] = useState(false) // vraie carte cachée sous la feuille 3D
  const cardRef = useRef(null)
  const canvasRef = useRef(null)
  const effect = useRef(null)

  // Le moteur 3D et l'animation se chargent pendant que la question est posée
  useEffect(() => {
    effect.current = import('../crumple/play').then((m) => { m.preloadCrumple().catch(() => {}); return m })
  }, [])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && phase === 'confirm' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, onCancel])

  const confirm = async () => {
    setPhase('crumpling')
    await new Promise((r) => setTimeout(r, 180)) // les boutons s'effacent avant la capture
    const r = cardRef.current.getBoundingClientRect()
    const rect = { left: r.left, top: r.top, width: r.width, height: r.height }
    const deletion = onDelete() // la suppression se fait pendant l'animation
    try {
      const shot = await api.app.capture?.(rect).catch(() => null)
      const { playCrumple } = await effect.current
      await playCrumple({ canvas: canvasRef.current, imageUrl: shot || fallbackImage(inst, rect.width, rect.height), rect, onFirstFrame: () => setHidden(true) })
    } catch {
      setHidden(true) // pas de WebGL ou fichiers absents : la carte s'efface simplement
      await new Promise((r) => setTimeout(r, 250))
    }
    await deletion
    onDone()
  }

  return (
    <motion.div
      className="no-drag fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-black/65 p-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      onMouseDown={() => phase === 'confirm' && onCancel()}
    >
      <motion.div
        ref={cardRef}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.8, y: 40 }}
        animate={{ opacity: hidden ? 0 : 1, scale: 1, y: 0 }}
        transition={hidden ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 24 }}
        className="relative h-[300px] w-[min(620px,90vw)] overflow-hidden rounded-lg border border-bark-600 bg-bark-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
      >
        <Banner instance={inst} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
        <div className="absolute inset-x-5 bottom-5 flex items-end gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border-[3px] border-white/85 shadow-xl"><Logo instance={inst} /></div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 truncate text-3xl font-extrabold drop-shadow">{inst.name}</div>
            <div className="flex flex-wrap gap-2">
              <VersionChip version={inst.version} />
              <LoaderChip loader={inst.loader} />
              {inst.playTime > 0 && <span className="chip">{formatPlayTime(inst.playTime)} de jeu</span>}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Reste en place une fois confirmé (seulement invisible) : la carte ne bouge pas avant de se froisser */}
      <motion.div
            onMouseDown={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 12 }}
            animate={phase === 'confirm' ? { opacity: 1, y: 0, transition: { delay: 0.08 } } : { opacity: 0, y: 0, transition: { duration: 0.15 } }}
            className={`flex w-[min(620px,90vw)] flex-col items-center gap-4 text-center ${phase === 'confirm' ? '' : 'pointer-events-none'}`}
          >
            <div>
              <div className="text-xl font-bold">Supprimer cette instance ?</div>
              <div className="mt-1 text-sm text-cream-muted">Son dossier (mondes, mods, captures) sera supprimé. Les shaders et packs partagés du profil restent.</div>
            </div>
            <div className="flex gap-3">
              <button className="btn-ghost px-6" onClick={onCancel} autoFocus>Annuler</button>
              <button className="btn-danger px-6" onClick={confirm}><Trash2 className="h-4 w-4" /> Supprimer</button>
            </div>
      </motion.div>

      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[80] h-full w-full" />
    </motion.div>
  )
}
