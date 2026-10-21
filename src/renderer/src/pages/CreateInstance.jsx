import React, { useEffect, useState } from 'react'
import { ChevronLeft, Loader2, Box as BoxIcon } from 'lucide-react'
import Banner, { FOX_BANNER } from '../components/Banner'
import ProfileImportField from '../components/ProfileImportField'
import { GrassBlock, CubesIcon, Select } from '../components/ui'
import { LOADERS, OFF_BY_DEFAULT, fetchVersions } from '../api'

const LOADER_INFO = {
  vanilla: 'Sans mods',
  fabric: 'Léger et rapide',
  forge: 'Le plus populaire',
  neoforge: 'Moderne et stable',
  quilt: 'Compatible Fabric'
}

function Stepper() {
  return (
    <div className="flex items-center gap-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ember-500 font-bold text-white">1</span>
      <span className="font-medium">Configuration</span>
      <span className="h-px w-40 bg-bark-600" />
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-bark-600 font-bold text-cream-muted">2</span>
      <span className="text-cream-muted">Installation</span>
    </div>
  )
}

export default function CreateInstance({ profiles, itemDefs, onCancel, onCreate, onCreateProfile }) {
  const [name, setName] = useState('')
  const [versions, setVersions] = useState([])
  const [snapshots, setSnapshots] = useState(false)
  const [version, setVersion] = useState('')
  const [loader, setLoader] = useState('vanilla')
  const [profileId, setProfileId] = useState(profiles[0]?.id || null)
  const [items, setItems] = useState(() => itemDefs.map((i) => i.key).filter((k) => !OFF_BY_DEFAULT.includes(k)))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchVersions().then((v) => {
      setVersions(v)
      setVersion((cur) => cur || v.find((x) => x.type === 'release')?.id || '')
    })
  }, [])

  const shown = versions.filter((v) => snapshots || v.type === 'release')
  const loaderLabel = LOADERS.find((l) => l.key === loader)?.label
  const profile = profiles.find((p) => p.id === profileId)

  const submit = async () => {
    setBusy(true)
    try {
      await onCreate({ name: name.trim() || `Instance ${version}`, version, loader, banner: FOX_BANNER, profileId, items: profileId ? items : [] })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <button onClick={onCancel} className="flex items-center gap-1 text-sm text-cream-muted hover:text-cream">
        <ChevronLeft className="h-4 w-4" /> Bibliothèque <span className="mx-1.5 text-bark-600">/</span> <span className="text-cream">Nouvelle instance</span>
      </button>

      <div className="flex items-center gap-6">
        <CubesIcon />
        <h1 className="flex-1 text-3xl font-extrabold xl:text-[38px] tracking-tight">Créer une instance</h1>
        <Stepper />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_520px]">
        <div className="panel space-y-6 p-6">
          <div>
            <h2 className="mb-2 text-xl font-bold">Nom de l’instance</h2>
            <input className="input h-12" autoFocus placeholder="Mon aventure" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            <p className="mt-2 text-sm text-cream-muted">Ce nom apparaîtra dans votre bibliothèque.</p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-bold">Version de Minecraft</h2>
            <Select
              className="h-12"
              value={version}
              onChange={setVersion}
              placeholder="Choisir une version"
              options={shown.map((v) => ({ value: v.id, label: v.id, hint: v.type === 'release' ? null : v.type === 'snapshot' ? 'snapshot' : v.type }))}
            />
            <label className="mt-3 flex cursor-pointer items-center gap-3 text-cream-muted">
              <input type="checkbox" checked={snapshots} onChange={(e) => setSnapshots(e.target.checked)} className="h-5 w-5 accent-[#e46b1a]" /> Afficher les snapshots
            </label>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold">Chargeur de mods</h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(165px,1fr))] gap-3">
              {LOADERS.map((l) => (
                <button key={l.key} type="button" onClick={() => setLoader(l.key)} className={`relative flex items-center gap-3 rounded-tl border p-3 text-left transition ${loader === l.key ? 'border-ember-500 bg-ember-500/10' : 'border-bark-700 bg-bark-950/40 hover:border-bark-600'}`}>
                  <img src={l.icon} className="h-9 w-9 shrink-0 object-contain" alt="" draggable={false} />
                  <span className="min-w-0 pr-5">
                    <span className="block font-semibold">{l.label}</span>
                    <span className="block text-xs text-cream-muted">{LOADER_INFO[l.key]}</span>
                  </span>
                  <span className={`absolute right-2.5 top-2.5 h-4 w-4 rounded-full border-2 ${loader === l.key ? 'border-ember-500 bg-ember-500 ring-2 ring-inset ring-bark-900' : 'border-bark-600'}`} />
                </button>
              ))}
            </div>
          </div>

          <ProfileImportField profiles={profiles} itemDefs={itemDefs} profileId={profileId} setProfileId={setProfileId} items={items} setItems={setItems} onCreateProfile={onCreateProfile} />
        </div>

        <div className="panel flex flex-col p-6">
          <h2 className="mb-3 text-xl font-bold">Aperçu</h2>
          <div className="aspect-[16/10] overflow-hidden rounded-tl border border-bark-700">
            <Banner scene={FOX_BANNER} />
          </div>
          <div className="mt-5 flex items-center gap-4 border-b border-bark-700 pb-5">
            <GrassBlock className="h-12 w-12" />
            <div className="min-w-0">
              <div className="truncate text-2xl font-bold">{name.trim() || 'Mon aventure'}</div>
              <div className="text-cream-muted">Minecraft {version || '…'} · {loaderLabel}</div>
            </div>
          </div>
          <p className="mt-5 leading-relaxed text-cream-muted">
            {profile
              ? `Le profil « ${profile.name} » sera importé : ${itemDefs.filter((i) => items.includes(i.key)).map((i) => i.label.toLowerCase()).join(', ') || 'rien de coché'}.`
              : 'Une instance vierge, sans profil importé. Tu pourras en appliquer un plus tard depuis le menu de l’instance.'}
          </p>
        </div>
      </div>

      <div className="flex justify-between pb-2">
        <button className="btn-ghost px-10 py-3" onClick={onCancel}>Annuler</button>
        <button className="btn-primary px-10 py-3 text-base" disabled={!version || busy} onClick={submit}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <BoxIcon className="h-5 w-5" />} Créer l’instance
        </button>
      </div>
    </div>
  )
}
