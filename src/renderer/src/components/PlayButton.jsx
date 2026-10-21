import React from 'react'
import { Play, Square, Loader2 } from 'lucide-react'

// Bouton Jouer selon l'état du jeu : prêt, préparation, lancement, en jeu (cliquer arrête)
const STATE_LABEL = { preparing: 'Préparation…', starting: 'Lancement…', running: 'En jeu' }
export default function PlayButton({ inst, actions, size }) {
  const state = actions.statusOf(inst.id)?.state
  const busy = state === 'preparing' || state === 'starting'
  const live = state === 'running' || state === 'starting'
  const onClick = () => (live ? actions.stop(inst) : !busy && actions.play(inst))
  const icon = busy ? <Loader2 className="h-5 w-5 animate-spin" /> : live ? <Square className="h-5 w-5 fill-white" /> : <Play className={size === 'hero' ? 'h-6 w-6 fill-white' : 'h-5 w-5 fill-white'} />
  const color = live ? 'bg-[#2f8a45] hover:bg-[#3aa155] shadow-none' : ''
  const disabled = inst.installing || (busy && !live)
  if (size === 'hero') {
    return (
      <button className={`btn-primary min-w-[200px] px-8 py-4 text-xl tracking-wide ${color}`} disabled={inst.installing} onClick={onClick} title={live ? 'Arrêter le jeu' : 'Jouer'}>
        {icon} {state ? STATE_LABEL[state] || 'JOUER' : 'JOUER'}
      </button>
    )
  }
  const dim = size === 'card' ? 'h-11 w-11' : 'h-10 w-10'
  return (
    <button className={`btn-primary ${dim} shrink-0 p-0 ${color}`} disabled={disabled} onClick={onClick} title={live ? 'Arrêter le jeu' : state ? STATE_LABEL[state] : 'Jouer'}>
      {icon}
    </button>
  )
}
