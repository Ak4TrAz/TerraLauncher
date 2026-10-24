import React, { useState } from 'react'
import { Archive, Trash2, Check, Loader2 } from 'lucide-react'
import { api } from '../api'

// Sauvegarde faite avant un changement de version de Minecraft : une fois les mondes vérifiés dans la nouvelle
// version, le joueur la supprime (place libérée) ou la garde (elle rejoint les sauvegardes de l'onglet Mondes).
export default function PendingBackups({ inst, toast }) {
  const [busy, setBusy] = useState(null)
  const pending = inst.pendingBackups
  if (!pending?.files?.length) return null
  const n = pending.files.length
  const played = inst.lastPlayed && inst.lastPlayed > pending.at

  const resolve = async (remove) => {
    setBusy(remove ? 'remove' : 'keep')
    try {
      await api.worlds.resolvePending(inst.id, remove)
      toast(remove ? 'Sauvegarde déplacée dans la corbeille.' : 'Sauvegarde gardée dans l’onglet Mondes.', 'success')
    } catch (e) {
      toast(e.message, 'error')
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-tl-lg border border-ember-500/40 bg-ember-500/10 px-5 py-4">
      <Archive className="h-7 w-7 shrink-0 text-ember-400" />
      <div className="min-w-[260px] flex-1">
        <div className="font-semibold">
          Sauvegarde de {n} monde{n > 1 ? 's' : ''} faite avant le passage de Minecraft {pending.from} à {pending.to}
        </div>
        <div className="text-sm text-cream-muted">
          {played
            ? 'Tu as relancé le jeu depuis. Si tes mondes fonctionnent bien, tu peux supprimer cette sauvegarde.'
            : 'Lance le jeu et vérifie tes mondes dans la nouvelle version avant de supprimer cette sauvegarde.'}
        </div>
      </div>
      <button className="btn-ghost px-4 py-2 text-sm" disabled={!!busy} onClick={() => resolve(false)}>
        {busy === 'keep' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} La garder
      </button>
      <button className="btn-primary px-4 py-2 text-sm" disabled={!!busy} onClick={() => resolve(true)}>
        {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Mes mondes fonctionnent, supprimer
      </button>
    </div>
  )
}
