import React, { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, FileText, Puzzle, Image as ImageIcon, Sparkles, Camera, Settings2, MoreVertical, ChevronRight, FolderOpen, Copy, Upload, MemoryStick, Server, Trash2, Plus, Search, Wrench, Loader2, X } from 'lucide-react'
import Banner from '../components/Banner'
import PlayButton from '../components/PlayButton'
import { Menu, VersionChip, LoaderChip, ProfileChip, GrassBlock, formatPlayTime } from '../components/ui'
import { api, LOADERS } from '../api'

const TABS = [
  { key: 'overview', label: 'Aperçu', icon: FileText },
  { key: 'mods', label: 'Mods', icon: Puzzle },
  { key: 'resourcepacks', label: 'Packs de ressources', icon: ImageIcon },
  { key: 'shaderpacks', label: 'Shaders', icon: Sparkles },
  { key: 'screenshots', label: 'Captures', icon: Camera },
  { key: 'settings', label: 'Paramètres', icon: Settings2 }
]

const fmtSize = (b) => (!b ? '' : b >= 1e6 ? `${(b / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(b / 1e3))} Ko`)
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')
const shotUrl = (id, name) => `terra://shot/${id}/${encodeURIComponent(name)}`

function InfoCard({ icon, title, value, onClick }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-4 rounded-tl-lg border border-bark-700 bg-bark-850/85 px-5 py-4 text-left transition enabled:hover:border-ember-500/50">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block truncate text-sm text-cream-muted">{value}</span>
      </span>
      {onClick && <ChevronRight className="h-5 w-5 text-cream-muted" />}
    </button>
  )
}

// Liste des fichiers d'un dossier de l'instance (mods, packs, shaders)
function FileList({ inst, folder, onAdd, toast }) {
  const [files, setFiles] = useState(null)
  const [query, setQuery] = useState('')
  const load = useCallback(() => api.instances.files(inst.id, folder).then(setFiles).catch(() => setFiles([])), [inst.id, folder])
  useEffect(() => { load() }, [load])

  const shown = (files || []).filter((f) => `${f.title || ''} ${f.name}`.toLowerCase().includes(query.toLowerCase()))
  const isMods = folder === 'mods'
  const enabled = (files || []).filter((f) => f.enabled).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cream-muted" />
          <input className="input h-11 pl-12" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {onAdd && <button className="btn-primary" onClick={onAdd}><Plus className="h-4 w-4" /> Ajouter</button>}
        <button className="btn-ghost" onClick={() => api.instances.openSubfolder(inst.id, folder).catch((e) => toast(e.message, 'error'))}><FolderOpen className="h-4 w-4" /> Ouvrir le dossier</button>
      </div>
      {files && <p className="text-sm text-cream-muted">{files.length} élément{files.length > 1 ? 's' : ''}{isMods ? ` · ${enabled} activé${enabled > 1 ? 's' : ''}` : ''}</p>}
      {!files && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-ember-400" /></div>}
      {files && files.length === 0 && <div className="panel px-6 py-12 text-center text-cream-muted">Rien ici pour l’instant.</div>}
      <div className="space-y-2">
        {shown.map((f) => (
          <div key={f.name} className={`flex items-center gap-4 rounded-tl border border-bark-700 bg-bark-850/85 px-4 py-3 ${f.enabled ? '' : 'opacity-55'}`}>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{f.title || f.name.replace(/\.disabled$/, '')}</div>
              <div className="truncate text-xs text-cream-muted">{[f.version, f.title ? f.name : null, fmtSize(f.size)].filter(Boolean).join(' · ')}</div>
            </div>
            {isMods && (
              <button
                title={f.enabled ? 'Désactiver' : 'Activer'}
                onClick={async () => { await api.instances.toggleMod(inst.id, f.name); load() }}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${f.enabled ? 'bg-ember-500' : 'bg-bark-700'}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${f.enabled ? 'left-6' : 'left-1'}`} />
              </button>
            )}
            <button title="Mettre à la corbeille" onClick={async () => { await api.instances.trashFile(inst.id, folder, f.name); toast(`« ${f.title || f.name} » déplacé dans la corbeille.`); load() }} className="rounded-lg p-2 text-cream-muted hover:bg-red-500/10 hover:text-red-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Screenshots({ inst, limit, onOpen, toast }) {
  const [shots, setShots] = useState([])
  useEffect(() => { api.instances.files(inst.id, 'screenshots').then(setShots).catch(() => {}) }, [inst.id])
  const list = limit ? shots.slice(0, limit) : shots
  if (!shots.length) return limit ? null : <div className="panel px-6 py-12 text-center text-cream-muted">Aucune capture. Appuie sur F2 en jeu pour en prendre une.</div>
  return (
    <div className="space-y-3">
      {!limit && <button className="btn-ghost" onClick={() => api.instances.openSubfolder(inst.id, 'screenshots').catch((e) => toast(e.message, 'error'))}><FolderOpen className="h-4 w-4" /> Ouvrir le dossier</button>}
      <div className={`grid gap-4 ${limit ? 'grid-cols-2' : 'grid-cols-2 xl:grid-cols-3'}`}>
        {list.map((s) => (
          <button key={s.name} onClick={() => onOpen(s)} className="group overflow-hidden rounded-tl border border-bark-700">
            <img src={shotUrl(inst.id, s.name)} className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105" alt="" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  )
}

function Overview({ inst, actions, onOpenShot, toast, setTab }) {
  const [about, setAbout] = useState(inst.description || '')
  useEffect(() => setAbout(inst.description || ''), [inst.id])
  const loader = LOADERS.find((l) => l.key === inst.loader)
  const memory = inst.memory ? `${(inst.memory / 1024).toFixed(1).replace('.0', '')} Go (${inst.memory} Mo)` : 'Réglage global'

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_440px]">
      <div className="panel space-y-5 p-6">
        <h2 className="text-3xl font-bold">À propos de cette instance</h2>
        <textarea
          className="input min-h-[90px] resize-y text-[16px] leading-relaxed"
          placeholder="Décris ton aventure, tes objectifs, le serveur…"
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          onBlur={() => about !== (inst.description || '') && actions.update(inst, { description: about })}
        />
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-tl bg-bark-950/50 p-3"><div className="text-cream-muted">Temps de jeu</div><div className="text-lg font-semibold">{inst.playTime ? formatPlayTime(inst.playTime) : '—'}</div></div>
          <div className="rounded-tl bg-bark-950/50 p-3"><div className="text-cream-muted">Dernière partie</div><div className="text-lg font-semibold">{fmtDate(inst.lastPlayed)}</div></div>
          <div className="rounded-tl bg-bark-950/50 p-3"><div className="text-cream-muted">Créée le</div><div className="text-lg font-semibold">{fmtDate(inst.createdAt)}</div></div>
        </div>
        <Screenshots inst={inst} limit={2} onOpen={onOpenShot} toast={toast} />
      </div>
      <div className="space-y-3">
        <InfoCard icon={<GrassBlock className="h-10 w-10" />} title="Version du jeu" value={`Minecraft Java ${inst.version}`} />
        <InfoCard icon={<img src={loader?.icon} className="h-9 w-9 object-contain" alt="" />} title="Chargeur" value={`${loader?.label || 'Vanilla'}${inst.loaderVersion ? ` ${inst.loaderVersion}` : ''}`} />
        <InfoCard icon={<MemoryStick className="h-8 w-8" />} title="Mémoire allouée" value={memory} onClick={() => setTab('settings')} />
        <InfoCard icon={<FolderOpen className="h-8 w-8" />} title="Ouvrir le dossier" value="Afficher le dossier de cette instance" onClick={() => actions.openFolder(inst)} />
        <InfoCard icon={<Server className="h-8 w-8 text-ember-400" />} title="Rejoindre Terranova" value="Lancer le jeu directement sur le serveur" onClick={() => actions.join(inst)} />
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-ghost py-3.5" onClick={() => actions.duplicate(inst)}><Copy className="h-5 w-5" /> Dupliquer</button>
          <button className="btn-ghost py-3.5" onClick={() => actions.exportZip(inst)}><Upload className="h-5 w-5" /> Exporter</button>
        </div>
      </div>
    </div>
  )
}

function InstanceSettings({ inst, actions, totalMemory }) {
  const [name, setName] = useState(inst.name)
  const [custom, setCustom] = useState(!!inst.memory)
  const [memory, setMemory] = useState(inst.memory || 4096)
  useEffect(() => { setName(inst.name); setCustom(!!inst.memory); setMemory(inst.memory || 4096) }, [inst.id])
  const max = Math.max(2048, Math.floor((totalMemory * 0.75) / 512) * 512)
  const save = () => actions.update(inst, { name: name.trim() || inst.name, memory: custom ? memory : null }, 'Réglages de l’instance enregistrés.')

  return (
    <div className="space-y-5">
      <div className="panel space-y-5 p-6">
        <div>
          <div className="mb-1.5 font-semibold">Nom de l’instance</div>
          <input className="input h-11 max-w-lg" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
        <div>
          <label className="mb-3 flex cursor-pointer items-center gap-3 font-semibold">
            <input type="checkbox" className="h-5 w-5 accent-[#e46b1a]" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
            Mémoire propre à cette instance
          </label>
          {custom ? (
            <div className="max-w-lg">
              <div className="mb-2 text-2xl font-bold text-ember-400">{(memory / 1024).toFixed(1).replace('.0', '')} Go</div>
              <input type="range" min={1024} max={max} step={512} value={Math.min(memory, max)} onChange={(e) => setMemory(Number(e.target.value))} className="w-full accent-[#e46b1a]" />
            </div>
          ) : (
            <p className="text-sm text-cream-muted">Utilise la mémoire réglée dans Paramètres → Java.</p>
          )}
        </div>
        <button className="btn-primary" onClick={save}>Enregistrer</button>
      </div>
      <div className="panel flex flex-wrap gap-3 p-6">
        <button className="btn-ghost" onClick={() => actions.changeBanner(inst)}><ImageIcon className="h-4 w-4" /> Changer la bannière</button>
        <button className="btn-ghost" onClick={() => actions.repair(inst)}><Wrench className="h-4 w-4" /> Réparer l’instance</button>
        <button className="btn-ghost ml-auto text-red-400 hover:text-red-300" onClick={() => actions.remove(inst)}><Trash2 className="h-4 w-4" /> Supprimer l’instance</button>
      </div>
    </div>
  )
}

export default function InstanceDetail({ inst, profile, actions, menuItems, onBack, onAddContent, toast }) {
  const [tab, setTab] = useState('overview')
  const [shot, setShot] = useState(null)
  const [totalMemory, setTotalMemory] = useState(16384)
  useEffect(() => { api.game.totalMemory().then(setTotalMemory).catch(() => {}) }, [])
  useEffect(() => setTab('overview'), [inst?.id])
  if (!inst) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-5 text-[16px]">
        <button onClick={onBack} className="flex items-center gap-2 font-medium hover:text-ember-400"><ArrowLeft className="h-5 w-5" /> Retour</button>
        <span className="h-6 w-px bg-bark-700" />
        <span className="text-cream-muted">Bibliothèque <span className="mx-2">/</span> <span className="font-semibold text-cream">{inst.name}</span></span>
      </div>

      <div className="relative h-[270px] overflow-hidden rounded-tl-lg border border-bark-700/80">
        <Banner instance={inst} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className="absolute inset-x-5 bottom-5 flex items-end gap-5">
          <div className="h-[115px] w-[115px] shrink-0 overflow-hidden rounded-xl border-[3px] border-white/85 shadow-xl"><Banner instance={inst} /></div>
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="mb-3 truncate text-4xl font-extrabold drop-shadow">{inst.name}</h1>
            <div className="flex flex-wrap gap-2">
              <VersionChip version={inst.version} />
              <LoaderChip loader={inst.loader} />
              <ProfileChip profile={profile} />
            </div>
          </div>
          <PlayButton inst={inst} actions={actions} size="hero" />
          <Menu items={menuItems}>
            <button className="flex h-[60px] w-12 items-center justify-center rounded-xl bg-black/45 text-white backdrop-blur hover:bg-black/60"><MoreVertical className="h-5 w-5" /></button>
          </Menu>
        </div>
      </div>

      <div className="flex gap-1 border-b border-bark-700">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`relative flex items-center gap-2.5 px-5 py-3.5 text-[16px] transition ${tab === t.key ? 'text-ember-400' : 'text-cream/80 hover:text-cream'}`}>
            <t.icon className="h-5 w-5" /> {t.label}
            {tab === t.key && <motion.span layoutId="instance-tab" className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-ember-500" />}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview inst={inst} actions={actions} onOpenShot={setShot} toast={toast} setTab={setTab} />}
      {tab === 'mods' && <FileList inst={inst} folder="mods" toast={toast} onAdd={inst.loader !== 'vanilla' ? () => onAddContent('mod') : null} />}
      {tab === 'resourcepacks' && <FileList inst={inst} folder="resourcepacks" toast={toast} onAdd={() => onAddContent('resourcepack')} />}
      {tab === 'shaderpacks' && <FileList inst={inst} folder="shaderpacks" toast={toast} onAdd={() => onAddContent('shader')} />}
      {tab === 'screenshots' && <Screenshots inst={inst} onOpen={setShot} toast={toast} />}
      {tab === 'settings' && <InstanceSettings inst={inst} actions={actions} totalMemory={totalMemory} />}

      {shot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-10" onClick={() => setShot(null)}>
          <img src={shotUrl(inst.id, shot.name)} className="max-h-full max-w-full rounded-tl shadow-2xl" alt="" />
          <button className="absolute right-6 top-6 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"><X className="h-6 w-6" /></button>
        </div>
      )}
    </div>
  )
}
