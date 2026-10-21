import React, { useEffect, useState } from 'react'
import { Download, Loader2, Check } from 'lucide-react'
import { Modal, Field, Select, VersionChip, LoaderChip } from './ui'
import ProfileImportField from './ProfileImportField'
import Banner from './Banner'
import { api, OFF_BY_DEFAULT } from '../api'

const TYPE_LABEL = { mod: 'le mod', shader: 'le shader', resourcepack: 'le resource pack' }

// Installation d'un modpack (nouvelle instance) ou d'un contenu dans une instance existante.
export default function InstallModal({ hit, onClose, instances, profiles, itemDefs, onDone, onError, preferredInstance }) {
  const isPack = hit?.type === 'modpack'
  const [name, setName] = useState('')
  const [versions, setVersions] = useState([])
  const [versionId, setVersionId] = useState(null)
  const [profileId, setProfileId] = useState(null)
  const [items, setItems] = useState([])
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!hit) return
    setName(hit.title)
    setVersions([])
    setVersionId(null)
    setProfileId(profiles[0]?.id || null)
    setItems(itemDefs.map((i) => i.key).filter((k) => !OFF_BY_DEFAULT.includes(k) && k !== 'config'))
    setTarget(preferredInstance || null)
    if (hit.type === 'modpack') {
      api.content.versions(hit.platform, hit.id).then((v) => { setVersions(v); setVersionId(v[0]?.id || null) }).catch((e) => onError(e.message))
    }
  }, [hit])

  // Instances compatibles d'abord
  const compatible = (inst) => hit?.type !== 'mod' || (inst.loader !== 'vanilla' && (hit.loaders.length === 0 || hit.loaders.includes(inst.loader) || (inst.loader === 'quilt' && hit.loaders.includes('fabric'))))
  const sorted = [...instances].filter((i) => !i.installing).sort((a, b) => compatible(b) - compatible(a))

  const submit = async () => {
    setBusy(true)
    try {
      if (isPack) await api.content.installModpack({ project: hit, versionId, name: name.trim() || hit.title, profileId, items: profileId ? items : [] })
      else await api.content.install(hit, target)
      onDone(isPack ? `Installation du modpack « ${hit.title} » lancée.` : `Installation de « ${hit.title} » lancée.`)
      onClose()
    } catch (e) {
      onError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={!!hit}
      onClose={onClose}
      title={isPack ? `Installer « ${hit?.title || ''} »` : `Installer ${TYPE_LABEL[hit?.type] || ''} « ${hit?.title || ''} »`}
      icon={Download}
      width="max-w-2xl"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={busy || (isPack ? !versionId : !target)} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Installer
          </button>
        </>
      }
    >
      {hit && isPack && (
        <div className="space-y-5">
          <div className="flex gap-4">
            <div className="h-24 w-40 shrink-0 overflow-hidden rounded-tl border border-bark-700">
              {hit.image ? <img src={hit.image} className="h-full w-full object-cover" alt="" /> : <Banner scene={5} />}
            </div>
            <p className="text-sm leading-relaxed text-cream-muted">{hit.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nom de l’instance">
              <input className="input h-11" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            </Field>
            <Field label="Version du modpack">
              <Select
                className="h-11"
                value={versionId}
                onChange={setVersionId}
                placeholder="Chargement…"
                options={versions.map((v) => ({ value: v.id, label: v.name, hint: v.gameVersions?.[0] }))}
              />
            </Field>
          </div>
          <ProfileImportField profiles={profiles} itemDefs={itemDefs} profileId={profileId} setProfileId={setProfileId} items={items} setItems={setItems} />
          <p className="text-xs text-cream-muted/70">Ton profil est appliqué après l’installation : tes touches et shaders passent par-dessus les réglages du modpack.</p>
        </div>
      )}

      {hit && !isPack && (
        <div className="space-y-2">
          <p className="mb-3 text-sm text-cream-muted">Choisis l’instance où installer {TYPE_LABEL[hit.type]}. La version compatible et les dépendances sont trouvées automatiquement.</p>
          {sorted.length === 0 && <p className="rounded-tl border border-dashed border-bark-600 px-4 py-3 text-sm text-cream-muted">Aucune instance. Crée-en une depuis la bibliothèque.</p>}
          {sorted.map((inst) => {
            const ok = compatible(inst)
            return (
              <button
                key={inst.id}
                disabled={!ok}
                onClick={() => setTarget(inst.id)}
                className={`flex w-full items-center gap-3 rounded-tl border p-2.5 text-left transition ${target === inst.id ? 'border-ember-500 bg-ember-500/10' : 'border-bark-700 bg-bark-950/40 hover:border-bark-600'} disabled:opacity-40`}
              >
                <div className="h-11 w-16 shrink-0 overflow-hidden rounded-md"><Banner instance={inst} /></div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{inst.name}</span>
                  {!ok && <span className="block text-xs text-cream-muted">{inst.loader === 'vanilla' ? 'Instance vanilla : pas de mods' : 'Chargeur non pris en charge par ce mod'}</span>}
                </span>
                <VersionChip version={inst.version} />
                <LoaderChip loader={inst.loader} />
                {target === inst.id && <Check className="h-5 w-5 text-ember-400" />}
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
