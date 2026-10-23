import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, LayoutGrid, List, ArrowUpDown, Play, MoreVertical, Plus, Clock, FolderOpen, Image, RefreshCw, Save, Trash2, Sparkles, Loader2, AlertTriangle, Wrench, Server, Info, ImagePlus, RotateCcw, Download } from 'lucide-react'
import Banner, { Logo } from '../components/Banner'
import PlayButton from '../components/PlayButton'
import { Menu, Select, VersionChip, LoaderChip, ProfileChip, CubesIcon, formatPlayTime } from '../components/ui'

const SORTS = [
  { key: 'lastPlayed', label: 'Dernière utilisation' },
  { key: 'name', label: 'Nom' },
  { key: 'createdAt', label: 'Date de création' }
]

function sortInstances(list, sort) {
  const recent = (i) => i.lastPlayed || i.createdAt
  if (sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name))
  if (sort === 'createdAt') return [...list].sort((a, b) => b.createdAt - a.createdAt)
  return [...list].sort((a, b) => recent(b) - recent(a))
}

function PageTitle({ onCreate, onImport }) {
  return (
    <div className="flex items-center gap-4">
      <CubesIcon />
      <div className="flex-1">
        <h1 className="text-3xl font-extrabold xl:text-[34px] leading-tight tracking-tight">Votre bibliothèque</h1>
        <p className="text-[15px] text-orange-50/60">Gérez et lancez vos instances Minecraft Java.</p>
      </div>
      <button className="btn-ghost px-5 py-3 text-base" onClick={onImport}>
        <Download className="h-5 w-5" /> Importer
      </button>
      <button className="btn-primary px-6 py-3 text-base" onClick={onCreate}>
        <Plus className="h-5 w-5" /> Créer une instance
      </button>
    </div>
  )
}

// Bandeau sur l'image pendant l'installation d'un modpack, ou en cas d'échec
function InstallBadge({ inst }) {
  if (inst.installing) return <span className="chip absolute left-3 top-3 bg-ember-500/90 font-semibold text-white"><Loader2 className="h-4 w-4 animate-spin" /> Installation…</span>
  if (inst.installError) return <span title={inst.installError} className="chip absolute left-3 top-3 bg-red-900/90 font-semibold text-red-100"><AlertTriangle className="h-4 w-4" /> Installation incomplète</span>
  return null
}

export function instanceMenu(inst, a) {
  return [
    { icon: Info, label: 'Détails de l’instance', onClick: () => a.open(inst) },
    { icon: Server, label: 'Rejoindre Terranova', onClick: () => a.join(inst) },
    '-',
    { icon: FolderOpen, label: 'Ouvrir le dossier', onClick: () => a.openFolder(inst) },
    { icon: ImagePlus, label: 'Changer le logo', onClick: () => a.changeImage(inst, 'logo') },
    { icon: Image, label: 'Changer la bannière', onClick: () => a.changeImage(inst, 'banner') },
    (inst.logoFile || inst.bannerFile) && { icon: RotateCcw, label: 'Images par défaut', onClick: () => a.resetImages(inst) },
    { icon: Wrench, label: 'Réparer l’instance', onClick: () => a.repair(inst) },
    '-',
    { icon: RefreshCw, label: 'Appliquer un profil…', onClick: () => a.reapply(inst) },
    inst.profileId && { icon: Save, label: 'Enregistrer mes touches dans le profil', onClick: () => a.saveToProfile(inst) },
    '-',
    { icon: Trash2, label: 'Supprimer', danger: true, onClick: () => a.remove(inst) }
  ]
}

function Hero({ inst, profile, actions }) {
  return (
    <motion.div layout className="group relative h-[290px] overflow-hidden rounded-2xl border border-bark-700/80 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
      <div className="absolute inset-0 transition duration-700 group-hover:scale-[1.03]">
        <Banner instance={inst} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/20" />
      {inst.installing || inst.installError ? (
        <div className="absolute left-2 top-2"><InstallBadge inst={inst} /></div>
      ) : (
        <span className="chip absolute left-5 top-5 bg-white/15 font-semibold uppercase tracking-wide">
          <Clock className="h-4 w-4" /> {inst.lastPlayed ? 'Dernière partie' : 'Récente'}
        </span>
      )}
      <div className="absolute inset-x-5 bottom-5 flex items-end gap-5">
        <div className="h-[110px] w-[110px] shrink-0 cursor-pointer overflow-hidden rounded-xl border-[3px] border-white/85 shadow-xl" onClick={() => actions.open(inst)}>
          <Logo instance={inst} />
        </div>
        <div className="min-w-0 flex-1 pb-1">
          <h2 className="mb-3 cursor-pointer truncate text-3xl font-extrabold drop-shadow hover:underline" onClick={() => actions.open(inst)}>{inst.name}</h2>
          <div className="flex flex-wrap gap-2">
            <VersionChip version={inst.version} />
            <LoaderChip loader={inst.loader} />
            <ProfileChip profile={profile} />
          </div>
        </div>
        <PlayButton inst={inst} actions={actions} size="hero" />
        <Menu items={instanceMenu(inst, actions)}>
          <button className="flex h-[60px] w-12 items-center justify-center rounded-xl bg-black/45 text-white backdrop-blur hover:bg-black/60">
            <MoreVertical className="h-5 w-5" />
          </button>
        </Menu>
      </div>
    </motion.div>
  )
}

function Card({ inst, profile, actions, index }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="group overflow-hidden rounded-2xl border border-bark-700/80 bg-bark-900/90 transition hover:-translate-y-1 hover:border-ember-500/40 hover:shadow-[0_16px_40px_-16px_rgba(240,122,30,0.35)]"
    >
      <div className="relative h-[170px] cursor-pointer overflow-hidden" onClick={() => actions.open(inst)}>
        <div className="h-full w-full transition duration-500 group-hover:scale-105">
          <Banner instance={inst} />
        </div>
        <InstallBadge inst={inst} />
      </div>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="mb-2.5 cursor-pointer truncate text-xl font-bold hover:underline" onClick={() => actions.open(inst)}>{inst.name}</h3>
            {inst.playTime > 0 && <p className="-mt-1.5 mb-2 text-xs text-cream-muted">{formatPlayTime(inst.playTime)} de jeu</p>}
            <div className="flex flex-wrap gap-1.5">
              <VersionChip version={inst.version} />
              <LoaderChip loader={inst.loader} />
              <ProfileChip profile={profile} />
            </div>
          </div>
          <PlayButton inst={inst} actions={actions} size="card" />
          <Menu items={instanceMenu(inst, actions)}>
            <button className="flex h-11 w-9 items-center justify-center rounded-xl bg-bark-800 text-orange-50/80 hover:bg-bark-700">
              <MoreVertical className="h-5 w-5" />
            </button>
          </Menu>
        </div>
      </div>
    </motion.div>
  )
}

function Row({ inst, profile, actions }) {
  return (
    <motion.div layout className="flex items-center gap-4 rounded-2xl border border-bark-700/80 bg-bark-900/90 p-3 transition hover:border-ember-500/40">
      <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg"><Banner instance={inst} /></div>
      <div className="min-w-0 flex-1">
        <h3 className="cursor-pointer truncate text-lg font-bold hover:underline" onClick={() => actions.open(inst)}>{inst.name}</h3>
        {inst.playTime > 0 && <p className="text-xs text-cream-muted">{formatPlayTime(inst.playTime)} de jeu</p>}
      </div>
      <div className="flex gap-1.5">
        <VersionChip version={inst.version} />
        <LoaderChip loader={inst.loader} />
        <ProfileChip profile={profile} />
      </div>
      <PlayButton inst={inst} actions={actions} size="row" />
      <Menu items={instanceMenu(inst, actions)}>
        <button className="flex h-10 w-9 items-center justify-center rounded-xl bg-bark-800 hover:bg-bark-700"><MoreVertical className="h-5 w-5" /></button>
      </Menu>
    </motion.div>
  )
}

export default function Library({ instances, profiles, actions }) {
  const [query, setQuery] = useState('')
  const [view, setViewState] = useState(() => { try { return localStorage.getItem('terra.libraryView') || 'grid' } catch { return 'grid' } })
  const setView = (v) => { setViewState(v); try { localStorage.setItem('terra.libraryView', v) } catch {} }
  const [sort, setSort] = useState('lastPlayed')
  const profileOf = (inst) => profiles.find((p) => p.id === inst.profileId)

  const sorted = useMemo(() => sortInstances(instances, sort), [instances, sort])
  const filtered = sorted.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()))
  // La grande bannière de la dernière partie n'existe qu'en affichage grille
  const hero = view === 'grid' && !query && sort === 'lastPlayed' ? filtered[0] : null
  const rest = hero ? filtered.slice(1) : filtered

  return (
    <div className="space-y-6">
      <PageTitle onCreate={actions.create} onImport={actions.importInstances} />

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-orange-50/50" />
          <input className="input h-12 pl-12" placeholder="Rechercher une instance…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex rounded-xl border border-bark-700 bg-bark-950/70 p-1">
          {[['grid', LayoutGrid], ['list', List]].map(([k, Icon]) => (
            <button key={k} onClick={() => setView(k)} className={`flex w-14 items-center justify-center rounded-lg transition ${view === k ? 'bg-ember-500/20 text-ember-400 ring-1 ring-ember-500/60' : 'text-orange-50/55 hover:text-orange-50'}`}>
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
        <Select className="h-12 w-[290px]" icon={ArrowUpDown} value={sort} onChange={setSort} options={SORTS.map((s) => ({ value: s.key, label: s.label }))} />
      </div>

      {instances.length === 0 ? (
        <div className="panel flex flex-col items-center gap-4 px-6 py-16 text-center">
          <Sparkles className="h-10 w-10 text-ember-400" />
          <div>
            <h2 className="text-xl font-bold">Aucune instance pour l'instant</h2>
            <p className="mt-1 text-orange-50/55">Crée ta première instance et importe ton profil pour retrouver tes touches et tes shaders.</p>
          </div>
          <div className="flex gap-3">
            <button className="btn-ghost" onClick={actions.importInstances}><Download className="h-5 w-5" /> Importer depuis un autre launcher</button>
            <button className="btn-primary" onClick={actions.create}><Plus className="h-5 w-5" /> Créer une instance</button>
          </div>
        </div>
      ) : (
        <>
          {hero && <Hero inst={hero} profile={profileOf(hero)} actions={actions} />}
          {view === 'grid' ? (
            <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
              {rest.map((inst, i) => <Card key={inst.id} inst={inst} profile={profileOf(inst)} actions={actions} index={i} />)}
            </div>
          ) : (
            <div className="space-y-3">
              {rest.map((inst) => <Row key={inst.id} inst={inst} profile={profileOf(inst)} actions={actions} />)}
            </div>
          )}
          {filtered.length === 0 && <p className="py-10 text-center text-orange-50/50">Aucune instance ne correspond à « {query} ».</p>}
        </>
      )}
    </div>
  )
}
