import React, { useEffect, useState } from 'react'
import { Download, FolderOpen, Loader2, Check } from 'lucide-react'
import { Modal, Select } from './ui'
import { api, LOADERS, fetchVersions } from '../api'

const LAUNCHER_COLORS = {
  GDLauncher: 'bg-[#2d6cdf]/20 text-[#8fb4ff]',
  Modrinth: 'bg-[#1bd96a]/15 text-[#6ee7a0]',
  CurseForge: 'bg-[#f16436]/20 text-[#ffa07f]',
  Prism: 'bg-[#a78bfa]/20 text-[#c4b5fd]',
  Dossier: 'bg-bark-700 text-cream-muted'
}

const loaderLabel = (key) => LOADERS.find((l) => l.key === key)?.label || key

// Une instance détectée : case à cocher, et choix de la version quand le launcher ne la donne pas
function Row({ item, checked, onToggle, onChange, versions }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${checked ? 'border-ember-500/50 bg-ember-500/10' : 'border-bark-700 bg-bark-950/40'}`}>
      <button type="button" onClick={onToggle} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-ember-500 bg-ember-500' : 'border-bark-600'}`}>
        {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </button>
      <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{item.name}</span>
          <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${LAUNCHER_COLORS[item.launcher] || LAUNCHER_COLORS.Dossier}`}>{item.launcher}</span>
          {item.imported && <span className="shrink-0 rounded-md bg-bark-800 px-2 py-0.5 text-[11px] text-cream-muted">Déjà importée</span>}
        </div>
        <div className="truncate text-xs text-cream-muted/70">{item.dir}</div>
      </button>
      {item.version && item.launcher !== 'Dossier' ? (
        <span className="shrink-0 text-right text-sm text-cream-muted">
          Minecraft {item.version}<br />
          <span className="text-xs">{loaderLabel(item.loader)}{item.loaderVersion ? ` ${item.loaderVersion}` : ''}</span>
        </span>
      ) : (
        <div className="flex shrink-0 gap-2">
          <Select className="h-10 w-[130px]" value={item.version || ''} onChange={(version) => onChange({ ...item, version })} placeholder="Version" options={versions} />
          <Select className="h-10 w-[125px]" value={item.loader} onChange={(loader) => onChange({ ...item, loader, loaderVersion: null })} options={LOADERS.map((l) => ({ value: l.key, label: l.label }))} />
        </div>
      )}
    </div>
  )
}

export default function ImportInstancesModal({ open, onClose, onDone, toast }) {
  const [items, setItems] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [versions, setVersions] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setItems(null)
    setSelected(new Set())
    api.external.scan()
      .then((list) => { setItems(list); setSelected(new Set(list.filter((x) => !x.imported).map((x) => x.dir))) })
      .catch((e) => { setItems([]); toast(e.message, 'error') })
    fetchVersions().then((v) => setVersions(v.filter((x) => x.type === 'release').map((x) => ({ value: x.id, label: x.id })))).catch(() => {})
  }, [open])

  const toggle = (dir) => setSelected((s) => { const n = new Set(s); n.has(dir) ? n.delete(dir) : n.add(dir); return n })
  const update = (item) => setItems((list) => list.map((x) => (x.dir === item.dir ? item : x)))

  const browse = async () => {
    const dir = await api.importer.pickFolder()
    if (!dir) return
    const item = await api.external.fromFolder(dir)
    setItems((list) => [item, ...(list || []).filter((x) => x.dir.toLowerCase() !== item.dir.toLowerCase())])
    setSelected((s) => new Set(s).add(item.dir))
  }

  const chosen = (items || []).filter((x) => selected.has(x.dir))
  const missing = chosen.filter((x) => !x.version)

  const submit = async () => {
    setBusy(true)
    try {
      for (const item of chosen) await api.external.importInstance(item)
      toast(chosen.length > 1 ? `${chosen.length} instances en cours d’import.` : 'Instance en cours d’import.', 'success')
      onDone()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importer des instances"
      icon={Download}
      width="max-w-3xl"
      footer={
        <>
          <button className="btn-ghost mr-auto" onClick={browse}><FolderOpen className="h-4 w-4" /> Parcourir un dossier…</button>
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={!chosen.length || missing.length > 0 || busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Importer{chosen.length ? ` (${chosen.length})` : ''}
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-cream-muted">
        Instances trouvées dans GDLauncher, Modrinth, CurseForge et Prism. Elles sont copiées (mods, configs, mondes, shaders…) : l’originale n’est pas modifiée.
      </p>
      {items === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-ember-400" /></div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-cream-muted">Aucune instance trouvée. Utilise « Parcourir un dossier… » pour en choisir une à la main.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Row key={item.dir} item={item} checked={selected.has(item.dir)} onToggle={() => toggle(item.dir)} onChange={update} versions={versions} />
          ))}
        </div>
      )}
      {missing.length > 0 && <p className="mt-3 text-sm text-ember-400">Choisis la version de Minecraft des instances cochées sans version.</p>}
    </Modal>
  )
}
