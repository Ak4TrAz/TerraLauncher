import React, { useEffect, useMemo, useState } from 'react'
import { Download, FolderSearch, ChevronRight, ChevronDown, ArrowLeft, Loader2, Check, Minus } from 'lucide-react'
import { Modal } from './ui'
import { api } from '../api'

const LAUNCHER_COLORS = { TerraLauncher: '#e46b1a', GDLauncher: '#3d8bf0', Modrinth: '#1bd96a', Prism: '#8a5cf0', CurseForge: '#f16436', Minecraft: '#5dbb46' }

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} Ko`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} Mo`
  return `${(bytes / 1024 ** 3).toFixed(1)} Go`
}

function Box({ state }) {
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${state ? 'border-ember-500 bg-ember-500' : 'border-bark-600 bg-bark-950/50'}`}>
      {state === true && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      {state === 'some' && <Minus className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
    </span>
  )
}

// Étape 1 : choix de l'instance source
function SourcePicker({ onPick }) {
  const [sources, setSources] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { api.importer.sources().then(setSources) }, [])

  const browse = async () => {
    try {
      const dir = await api.importer.pickFolder()
      if (dir) onPick({ launcher: 'Dossier', name: dir.split(/[\\/]/).pop(), dir })
    } catch (e) { setError(e.message) }
  }

  if (!sources) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ember-400" /></div>

  return (
    <div className="space-y-2">
      <p className="mb-3 text-sm text-cream-muted">Choisis l'instance dont tu veux récupérer les fichiers. Les instances des autres launchers installés sont détectées automatiquement.</p>
      {sources.map((s) => (
        <button key={s.dir} onClick={() => onPick(s)} className="group flex w-full items-center gap-3 rounded-tl border border-bark-700 bg-bark-950/40 px-4 py-3 text-left transition hover:border-ember-500/60 hover:bg-ember-500/5">
          <span className="rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: LAUNCHER_COLORS[s.launcher] || '#5c4736' }}>{s.launcher}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{s.name}</div>
            <div className="truncate text-xs text-cream-muted/70">{s.dir}</div>
          </div>
          <ChevronRight className="h-5 w-5 text-cream-muted/50 transition group-hover:translate-x-0.5 group-hover:text-ember-400" />
        </button>
      ))}
      {sources.length === 0 && <p className="rounded-tl border border-dashed border-bark-600 px-4 py-3 text-sm text-cream-muted">Aucune instance détectée automatiquement.</p>}
      <button onClick={browse} className="flex w-full items-center gap-3 rounded-tl border border-dashed border-bark-600 px-4 py-3 text-left text-cream-muted transition hover:border-ember-500/60 hover:text-cream">
        <FolderSearch className="h-5 w-5 text-ember-400" />
        <span className="font-semibold">Parcourir un autre dossier…</span>
      </button>
      {error && <p className="text-sm text-[#df7164]">{error}</p>}
    </div>
  )
}

// Étape 2 : cases à cocher de ce qu'on récupère
function Selection({ scan, selected, setSelected }) {
  const [open, setOpen] = useState({})
  const toggleItem = (p) => setSelected((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n })
  const groupState = (g) => {
    const n = g.items.filter((i) => selected.has(i.path)).length
    return n === 0 ? false : n === g.items.length ? true : 'some'
  }
  const toggleGroup = (g) => setSelected((s) => {
    const n = new Set(s)
    const all = groupState(g) === true
    g.items.forEach((i) => (all ? n.delete(i.path) : n.add(i.path)))
    return n
  })

  return (
    <div className="space-y-2.5">
      {scan.groups.map((g) => {
        const single = g.items.length === 1
        const expanded = open[g.key]
        const size = g.items.filter((i) => selected.has(i.path)).reduce((s, i) => s + i.size, 0)
        return (
          <div key={g.key} className="overflow-hidden rounded-tl border border-bark-700 bg-bark-950/40">
            <div className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => toggleGroup(g)} className="flex flex-1 items-center gap-3 text-left">
                <Box state={groupState(g)} />
                <span className="font-semibold">{g.label}</span>
                <span className="text-xs text-cream-muted/70">
                  {single ? g.items[0].label : `${g.items.filter((i) => selected.has(i.path)).length}/${g.items.length} sélectionnés`}
                </span>
              </button>
              <span className="text-xs text-cream-muted/60">{formatSize(size)}</span>
              {!single && (
                <button onClick={() => setOpen((o) => ({ ...o, [g.key]: !o[g.key] }))} className="rounded-lg p-1 text-cream-muted hover:bg-bark-800 hover:text-cream">
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              )}
            </div>
            {!single && expanded && (
              <div className="max-h-64 overflow-y-auto border-t border-bark-700/70 py-1">
                {g.items.map((i) => (
                  <button key={i.path} onClick={() => toggleItem(i.path)} className="flex w-full items-center gap-3 px-4 py-1.5 pl-12 text-left text-sm hover:bg-bark-800/60">
                    <Box state={selected.has(i.path)} />
                    <span className="min-w-0 flex-1 truncate">{i.label}</span>
                    <span className="text-xs text-cream-muted/60">{formatSize(i.size)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Fenêtre « Importer depuis une instance » d'un profil
export default function ImportModal({ profile, onClose, onDone }) {
  const [source, setSource] = useState(null)
  const [scan, setScan] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { if (profile) { setSource(null); setScan(null); setError(null) } }, [profile])

  const pick = async (s) => {
    setSource(s)
    setScan(null)
    setError(null)
    try {
      const res = await api.importer.scan(s.dir)
      setScan(res)
      setSelected(new Set(res.groups.flatMap((g) => g.items.filter((i) => i.checked).map((i) => i.path))))
    } catch (e) { setError(e.message) }
  }

  const all = useMemo(() => (scan ? scan.groups.flatMap((g) => g.items) : []), [scan])
  const totalSize = all.filter((i) => selected.has(i.path)).reduce((s, i) => s + i.size, 0)

  const run = async () => {
    setBusy(true)
    try {
      const count = await api.importer.run(profile.id, scan.dir, [...selected])
      onDone(count, source)
      onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal
      open={!!profile}
      onClose={onClose}
      title={source ? `Importer depuis « ${source.name} »` : `Importer dans « ${profile?.name || ''} »`}
      icon={Download}
      width="max-w-2xl"
      footer={
        source && scan ? (
          <>
            <span className="mr-auto self-center text-sm text-cream-muted">{selected.size} élément{selected.size > 1 ? 's' : ''} · {formatSize(totalSize) || '0 o'}</span>
            <button className="btn-ghost" onClick={() => setSource(null)}><ArrowLeft className="h-4 w-4" /> Retour</button>
            <button className="btn-primary" disabled={!selected.size || busy} onClick={run}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Importer
            </button>
          </>
        ) : null
      }
    >
      {!source && <SourcePicker onPick={pick} />}
      {source && !scan && !error && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ember-400" /></div>}
      {source && scan && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <p className="flex-1 truncate text-xs text-cream-muted/70">{scan.dir}</p>
            <button className="text-sm font-semibold text-ember-400 hover:text-ember-300" onClick={() => setSelected(new Set(all.map((i) => i.path)))}>Tout cocher</button>
            <span className="text-bark-600">·</span>
            <button className="text-sm font-semibold text-cream-muted hover:text-cream" onClick={() => setSelected(new Set())}>Tout décocher</button>
          </div>
          {scan.groups.length ? <Selection scan={scan} selected={selected} setSelected={setSelected} /> : <p className="text-sm text-cream-muted">Rien à importer dans ce dossier.</p>}
        </>
      )}
      {error && <p className="mt-3 text-sm text-[#df7164]">{error}</p>}
    </Modal>
  )
}
