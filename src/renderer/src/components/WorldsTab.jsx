import React, { useCallback, useEffect, useState } from 'react'
import { Earth, Archive, ArchiveRestore, History, FolderOpen, Trash2, Loader2, ChevronDown } from 'lucide-react'
import { api } from '../api'

const MODES = ['Survie', 'Créatif', 'Aventure', 'Spectateur']
const fmtSize = (b) => (!b ? '—' : b >= 1e9 ? `${(b / 1e9).toFixed(1)} Go` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`)
const fmtDate = (t) => new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const worldIcon = (id, w) => `terra://world/${id}/${encodeURIComponent(w.name)}?v=${Math.round(w.lastPlayed)}`

// Bouton qui demande une seconde pression avant d'agir (suppression)
function ConfirmButton({ title, confirmLabel, onConfirm, className = '', children }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3500)
    return () => clearTimeout(t)
  }, [armed])
  return armed ? (
    <button className="rounded-lg bg-red-500/15 px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-500/25" onClick={() => { setArmed(false); onConfirm() }}>{confirmLabel}</button>
  ) : (
    <button title={title} className={`rounded-lg p-2 text-cream-muted hover:bg-red-500/10 hover:text-red-400 ${className}`} onClick={() => setArmed(true)}>{children}</button>
  )
}

function WorldIcon({ inst, world }) {
  const [failed, setFailed] = useState(false)
  if (!world.hasIcon || failed) return <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-bark-800"><Earth className="h-7 w-7 text-cream-muted" /></span>
  return <img src={worldIcon(inst.id, world)} onError={() => setFailed(true)} className="pixel h-14 w-14 shrink-0 rounded-lg bg-bark-800 object-cover" alt="" draggable={false} />
}

export default function WorldsTab({ inst, running, toast }) {
  const [worlds, setWorlds] = useState(null)
  const [busy, setBusy] = useState({}) // monde -> action en cours
  const [opened, setOpened] = useState(null) // monde dont les sauvegardes sont affichées

  const load = useCallback(() => api.worlds.list(inst.id).then(setWorlds).catch(() => setWorlds([])), [inst.id])
  useEffect(() => { load() }, [load])

  const act = async (name, label, fn, success) => {
    setBusy((b) => ({ ...b, [name]: label }))
    try {
      const res = await fn()
      if (success) toast(typeof success === 'function' ? success(res) : success, 'success')
      await load()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[name]; return n })
    }
  }

  const openFolder = (name) => api.worlds.openFolder(inst.id, name).catch((e) => toast(e.message, 'error'))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-cream-muted">
          Avant une mise à jour de mods, les mondes modifiés depuis leur dernière sauvegarde sont sauvegardés automatiquement (3 gardées par monde) ; réglable dans Paramètres → Jeu. Avant une mise à jour du modpack, la question est posée.
        </p>
        <button className="btn-ghost" onClick={() => openFolder(null)}><FolderOpen className="h-4 w-4" /> Ouvrir le dossier</button>
      </div>
      {running && <div className="rounded-tl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">Minecraft est lancé : ferme le jeu pour sauvegarder, restaurer ou supprimer un monde.</div>}
      {!worlds && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-ember-400" /></div>}
      {worlds && worlds.length === 0 && <div className="panel px-6 py-12 text-center text-cream-muted">Aucun monde pour l’instant. Crée-en un en jeu.</div>}
      <div className="space-y-2">
        {(worlds || []).map((w) => (
          <div key={w.name} className={`rounded-tl border border-bark-700 bg-bark-850/85 ${w.deleted ? 'opacity-70' : ''}`}>
            <div className="flex items-center gap-4 px-4 py-3">
              <WorldIcon inst={inst} world={w} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{w.title}{w.title !== w.name && <span className="ml-2 text-xs font-normal text-cream-muted">{w.name}</span>}</div>
                <div className="truncate text-xs text-cream-muted">
                  {w.deleted
                    ? `Monde supprimé · il reste ${w.backups.length} sauvegarde${w.backups.length > 1 ? 's' : ''}`
                    : [w.hardcore ? 'Hardcore' : MODES[w.gameType], w.version && `Minecraft ${w.version}`, `Joué le ${fmtDate(w.lastPlayed)}`, fmtSize(w.size)].filter(Boolean).join(' · ')}
                </div>
              </div>
              {busy[w.name] ? (
                <span className="flex items-center gap-2 px-2 text-sm text-ember-400"><Loader2 className="h-4 w-4 animate-spin" /> {busy[w.name]}</span>
              ) : w.deleted ? (
                <button className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:bg-white/5 ${opened === w.name ? 'text-ember-400' : 'text-cream-muted'}`} onClick={() => setOpened(opened === w.name ? null : w.name)}>
                  <History className="h-4 w-4" /> {w.backups.length} <ChevronDown className={`h-3.5 w-3.5 transition ${opened === w.name ? 'rotate-180' : ''}`} />
                </button>
              ) : (
                <>
                  <button className="btn-ghost px-3 py-1.5 text-sm" disabled={running} onClick={() => act(w.name, 'Sauvegarde…', () => api.worlds.backup(inst.id, w.name), `« ${w.title} » sauvegardé.`)}>
                    <Archive className="h-4 w-4" /> Sauvegarder
                  </button>
                  <button className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:bg-white/5 ${opened === w.name ? 'text-ember-400' : 'text-cream-muted'}`} onClick={() => setOpened(opened === w.name ? null : w.name)}>
                    <History className="h-4 w-4" /> {w.backups.length} <ChevronDown className={`h-3.5 w-3.5 transition ${opened === w.name ? 'rotate-180' : ''}`} />
                  </button>
                  <button title="Ouvrir le dossier du monde" className="rounded-lg p-2 text-cream-muted hover:bg-white/5 hover:text-cream" onClick={() => openFolder(w.name)}><FolderOpen className="h-4 w-4" /></button>
                  {!running && (
                    <ConfirmButton title="Mettre le monde à la corbeille" confirmLabel="Confirmer ?" onConfirm={() => act(w.name, 'Suppression…', () => api.worlds.trash(inst.id, w.name), `« ${w.title} » déplacé dans la corbeille.`)}>
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  )}
                </>
              )}
            </div>
            {opened === w.name && (
              <div className="space-y-1 border-t border-bark-700 px-4 py-3">
                {w.backups.length === 0 && <div className="text-sm text-cream-muted">Aucune sauvegarde de ce monde.</div>}
                {w.backups.map((b) => (
                  <div key={b.file} className="flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-white/[0.03]">
                    <Archive className="h-4 w-4 shrink-0 text-cream-muted" />
                    <span className="flex-1">
                      {fmtDate(b.date)}
                      {b.kind === 'auto' && <span className="ml-2 rounded bg-bark-700 px-1.5 py-0.5 text-[11px] text-cream-muted">auto</span>}
                      {b.kind === 'version' && <span className="ml-2 rounded bg-ember-500/15 px-1.5 py-0.5 text-[11px] text-ember-400">avant changement de version</span>}
                    </span>
                    <span className="text-cream-muted">{fmtSize(b.size)}</span>
                    <button className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-ember-400 hover:bg-ember-500/10 disabled:opacity-40" disabled={running || !!busy[w.name]} title="Recrée ce monde à côté de l’actuel, sans l’écraser"
                      onClick={() => act(w.name, 'Restauration…', () => api.worlds.restore(inst.id, w.name, b.file), (name) => `Sauvegarde restaurée dans le monde « ${name} ».`)}>
                      <ArchiveRestore className="h-4 w-4" /> Restaurer
                    </button>
                    <ConfirmButton title="Mettre la sauvegarde à la corbeille" confirmLabel="Confirmer ?" onConfirm={() => act(w.name, 'Suppression…', () => api.worlds.trashBackup(inst.id, w.name, b.file), 'Sauvegarde déplacée dans la corbeille.')}>
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  </div>
                ))}
                <button className="mt-1 flex items-center gap-1.5 px-2 text-xs text-cream-muted hover:text-cream" onClick={() => api.worlds.openBackups(inst.id, w.name).catch((e) => toast(e.message, 'error'))}>
                  <FolderOpen className="h-3.5 w-3.5" /> Ouvrir le dossier des sauvegardes
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
