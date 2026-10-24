import React, { useCallback, useEffect, useState } from 'react'
import { PackageCheck, Loader2, RefreshCw, Download, Archive } from 'lucide-react'
import { api } from '../api'
import { useTasks } from '../useTasks'

// Modpack d'origine de l'instance : version installée, mise à jour disponible
export default function ModpackCard({ inst, toast }) {
  const [info, setInfo] = useState(undefined) // undefined = vérification en cours, null = échec
  const [confirming, setConfirming] = useState(false)
  const check = useCallback(() => {
    setInfo(undefined)
    api.content.checkModpackUpdate(inst.id).then(setInfo).catch(() => setInfo(null))
  }, [inst.id])
  useEffect(() => { check() }, [check])

  const [running, track] = useTasks(useCallback((done) => {
    for (const t of done) toast(t.status === 'error' ? t.error : `Modpack mis à jour · ${t.detail}`, t.status === 'error' ? 'error' : 'success')
    check()
  }, [check, toast]))

  // Sauvegarde proposée par défaut selon Paramètres → Jeu → Sauvegardes des mondes
  const [backup, setBackup] = useState(true)
  useEffect(() => { if (confirming) api.settings.get().then((s) => setBackup(s.autoBackup !== false)).catch(() => {}) }, [confirming])

  const update = async (withBackup) => {
    setConfirming(false)
    try { track(await api.content.updateModpack(inst.id, info.latest.id, { backup: withBackup })) } catch (e) { toast(e.message, 'error') }
  }

  const latest = info?.latest
  const newGame = latest?.gameVersions?.length && !latest.gameVersions.includes(inst.version) ? latest.gameVersions[0] : null

  return (
    <div className="rounded-tl-lg border border-bark-700 bg-bark-850/85 px-5 py-4">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center"><PackageCheck className="h-8 w-8 text-ember-400" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Modpack</div>
          <div className="truncate text-sm text-cream-muted">Version {inst.source.versionName || info?.current || 'inconnue'}</div>
        </div>
        {(running.length > 0 || inst.installing) && <Loader2 className="h-5 w-5 animate-spin text-ember-400" />}
        {!running.length && !inst.installing && info === undefined && <Loader2 className="h-4 w-4 animate-spin text-cream-muted" />}
        {!running.length && !inst.installing && info && !latest && (
          <button className="flex items-center gap-1.5 text-sm text-cream-muted hover:text-cream" title="Vérifier à nouveau" onClick={check}><RefreshCw className="h-3.5 w-3.5" /> À jour</button>
        )}
        {!running.length && !inst.installing && info === null && (
          <button className="flex items-center gap-1.5 text-sm text-cream-muted hover:text-cream" onClick={check}><RefreshCw className="h-3.5 w-3.5" /> Réessayer</button>
        )}
      </div>
      {latest && !running.length && !inst.installing && (
        <div className="mt-3 border-t border-bark-700 pt-3">
          <div className="mb-2 text-sm">
            <span className="font-semibold text-ember-400">Version {latest.name} disponible</span>
            {newGame && <span className="text-cream-muted"> · passe à Minecraft {newGame}</span>}
          </div>
          {confirming && newGame ? (
            <div className="space-y-2">
              <p className="text-sm text-cream-muted">
                Tes mondes vont passer de Minecraft {inst.version} à {newGame}. Une fois ouverts dans la nouvelle version, ils ne peuvent plus revenir en arrière.
                {' '}<span className="font-semibold text-cream">Créer une sauvegarde de tes mondes avant ?</span> Tu pourras la supprimer une fois que tout fonctionne.
              </p>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary px-4 py-2 text-sm" onClick={() => update(true)}><Archive className="h-4 w-4" /> Oui, sauvegarder</button>
                <button className="btn-ghost px-4 py-2 text-sm" onClick={() => update(false)}>Non, sans sauvegarde</button>
                <button className="px-3 py-2 text-sm text-cream-muted hover:text-cream" onClick={() => setConfirming(false)}>Annuler</button>
              </div>
            </div>
          ) : confirming ? (
            <div className="space-y-3">
              <p className="text-sm text-cream-muted">
                Tes touches (options.txt) et ta liste de serveurs sont gardées.{' '}
                {inst.source.packFiles || inst.source.versionId
                  ? 'Les mods ajoutés à la main restent.'
                  : 'La version installée est inconnue : les mods actuels seront mis de côté dans le dossier des sauvegardes de l’instance.'}
              </p>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#e46b1a]" checked={backup} onChange={(e) => setBackup(e.target.checked)} />
                Sauvegarder mes mondes avant
              </label>
              <div className="flex gap-2">
                <button className="btn-primary px-4 py-2 text-sm" onClick={() => update(backup)}><Download className="h-4 w-4" /> Mettre à jour</button>
                <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setConfirming(false)}>Annuler</button>
              </div>
            </div>
          ) : (
            <button className="btn-primary px-4 py-2 text-sm" onClick={() => setConfirming(true)}><Download className="h-4 w-4" /> Mettre à jour le modpack</button>
          )}
        </div>
      )}
    </div>
  )
}
