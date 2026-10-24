import React, { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, LayoutGrid, List, ArrowUpDown, Play, MoreVertical, Plus, Clock, FolderOpen, Image, RefreshCw, Save, Trash2, Sparkles, Loader2, AlertTriangle, Wrench, Server, Info, ImagePlus, RotateCcw, Download, LibraryBig } from 'lucide-react'
import Banner, { Logo } from '../components/Banner'
import PlayButton from '../components/PlayButton'
import { Menu, Select, VersionChip, LoaderChip, ProfileChip, EditableName, formatPlayTime } from '../components/ui'

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
      <LibraryBig className="h-14 w-14 shrink-0 text-ember-500" strokeWidth={2.25} />
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

// Barre qui défile en bas d'une instance tant qu'elle se prépare (téléchargements) ou s'installe
function WorkingBar({ inst, actions }) {
  const state = actions.statusOf(inst.id)?.state
  if (!inst.installing && state !== 'preparing') return null
  return <div className="working-bar absolute inset-x-0 bottom-0 z-10 h-1 bg-black/40" title="Préparation en cours (détail dans les téléchargements)" />
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

// Une carte supprimée s'efface (le froissement se joue dans la fenêtre de suppression, au premier plan) ;
// une carte qui change seulement de place (elle devient la grande carte du haut) disparaît sans animation.
const removal = (id) => ({ exit: (alive) => (alive?.has(id) ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.92, transition: { duration: 0.2 } }) })
// Les autres cartes glissent doucement à sa place
const GLIDE = { layout: { type: 'spring', stiffness: 260, damping: 30 } }

const Hero = React.forwardRef(function Hero({ inst, profile, actions }, ref) {
  return (
    <motion.div ref={ref} layout transition={GLIDE} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit="exit" variants={removal(inst.id)} className="group relative h-[200px] overflow-hidden rounded-2xl border border-bark-700/80 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
      <div className="absolute inset-0 transition duration-700 group-hover:scale-[1.03]">
        <Banner instance={inst} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/20" />
      {inst.installing || inst.installError ? (
        <div className="absolute left-2 top-2"><InstallBadge inst={inst} /></div>
      ) : (
        <span className="chip absolute left-4 top-4 bg-white/15 font-semibold uppercase tracking-wide">
          <Clock className="h-4 w-4" /> {inst.lastPlayed ? 'Dernière partie' : 'Récente'}
        </span>
      )}
      <div className="absolute inset-x-5 bottom-4 flex items-end gap-5">
        <div className="h-[88px] w-[88px] shrink-0 cursor-pointer overflow-hidden rounded-xl border-[3px] border-white/85 shadow-xl" onClick={() => actions.open(inst)}>
          <Logo instance={inst} />
        </div>
        <div className="min-w-0 flex-1 pb-1">
          <EditableName name={inst.name} onOpen={() => actions.open(inst)} onSave={(name) => actions.update(inst, { name }, `Instance renommée en « ${name} ».`)} wrapperClassName="mb-2" className="text-3xl font-extrabold drop-shadow" icon="h-5 w-5" />
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
      <WorkingBar inst={inst} actions={actions} />
    </motion.div>
  )
})

const Card = React.forwardRef(function Card({ inst, profile, actions, index }, ref) {
  return (
    <motion.div
      ref={ref}
      layout
      transition={GLIDE}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0, transition: { delay: index * 0.04 } }}
      exit="exit"
      variants={removal(inst.id)}
      whileHover={{ y: -4 }}
      // Pas de transition CSS sur la position : elle contrarierait les animations (glissement, suppression)
      className="group relative overflow-hidden rounded-2xl border border-bark-700/80 bg-bark-900/90 transition-[border-color,box-shadow] duration-200 hover:border-ember-500/40 hover:shadow-[0_16px_40px_-16px_rgba(240,122,30,0.35)]"
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
            <EditableName as="h3" name={inst.name} onOpen={() => actions.open(inst)} onSave={(name) => actions.update(inst, { name }, `Instance renommée en « ${name} ».`)} wrapperClassName="mb-2.5" className="text-xl font-bold" />
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
      <WorkingBar inst={inst} actions={actions} />
    </motion.div>
  )
})

const Row = React.forwardRef(function Row({ inst, profile, actions }, ref) {
  return (
    <motion.div ref={ref} layout transition={GLIDE} exit="exit" variants={removal(inst.id)} className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-bark-700/80 bg-bark-900/90 p-3 transition-colors hover:border-ember-500/40">
      <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg"><Banner instance={inst} /></div>
      <div className="min-w-0 flex-1">
        <EditableName as="h3" name={inst.name} onOpen={() => actions.open(inst)} onSave={(name) => actions.update(inst, { name }, `Instance renommée en « ${name} ».`)} className="text-lg font-bold" />
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
      <WorkingBar inst={inst} actions={actions} />
    </motion.div>
  )
})

export default function Library({ instances, profiles, actions }) {
  const [query, setQuery] = useState('')
  const [view, setViewState] = useState(() => { try { return localStorage.getItem('terra.libraryView') || 'grid' } catch { return 'grid' } })
  const setView = (v) => { setViewState(v); try { localStorage.setItem('terra.libraryView', v) } catch {} }
  const [sort, setSort] = useState('lastPlayed')
  const profileOf = (inst) => profiles.find((p) => p.id === inst.profileId)
  const alive = useMemo(() => new Set(instances.map((i) => i.id)), [instances])

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
          <AnimatePresence mode="wait" custom={alive}>
            {hero && <Hero key={hero.id} inst={hero} profile={profileOf(hero)} actions={actions} />}
          </AnimatePresence>
          {view === 'grid' ? (
            <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
              <AnimatePresence mode="popLayout" custom={alive}>
                {rest.map((inst, i) => <Card key={inst.id} inst={inst} profile={profileOf(inst)} actions={actions} index={i} />)}
              </AnimatePresence>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout" custom={alive}>
                {rest.map((inst) => <Row key={inst.id} inst={inst} profile={profileOf(inst)} actions={actions} />)}
              </AnimatePresence>
            </div>
          )}
          {filtered.length === 0 && <p className="py-10 text-center text-orange-50/50">Aucune instance ne correspond à « {query} ».</p>}
        </>
      )}
    </div>
  )
}
