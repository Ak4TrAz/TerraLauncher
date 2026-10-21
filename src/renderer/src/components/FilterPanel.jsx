import React, { useEffect, useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { ChevronDown, ChevronRight, Globe, FolderOpen, Puzzle, Gamepad2, Monitor, Server, Search, Check, RotateCcw, Loader2 } from 'lucide-react'
import { LOADERS, fetchVersions } from '../api'

const PLATFORMS = [
  { key: 'curseforge', label: 'CurseForge', color: '#f16436' },
  { key: 'modrinth', label: 'Modrinth', color: '#1bd96a' }
]
const SHADER_LOADERS = { iris: 'Iris', optifine: 'OptiFine', canvas: 'Canvas', vanilla: 'Vanilla' }

function Box({ checked, round }) {
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center border transition ${round ? 'rounded-full' : 'rounded-md'} ${checked ? 'border-ember-500 bg-ember-500' : 'border-bark-600 bg-bark-950/50'}`}>
      {checked && (round ? <span className="h-2 w-2 rounded-full bg-white" /> : <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />)}
    </span>
  )
}

function Option({ checked, round, onClick, icon, label }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-[15px] text-cream/90 hover:bg-bark-800/70">
      <Box checked={checked} round={round} />
      {icon && <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>}
      <span className="truncate">{label}</span>
    </button>
  )
}

function Section({ icon: Icon, title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-bark-700/70 py-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-1 py-1 text-left text-sm font-bold uppercase tracking-wider text-cream-muted hover:text-cream">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Icon className="h-[18px] w-[18px]" />
        <span className="flex-1">{title}</span>
        {count > 0 && <span className="rounded-full bg-ember-500 px-2 text-xs text-white">{count}</span>}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative mb-2">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-muted" />
      <input className="input h-9 py-1 pl-9 text-sm" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

// Icône de catégorie : SVG Modrinth (nettoyé) ou image CurseForge
function CategoryIcon({ item }) {
  const svg = useMemo(() => (item.svg ? DOMPurify.sanitize(item.svg, { USE_PROFILES: { svg: true } }) : null), [item.svg])
  if (svg) return <span className="h-4 w-4 text-cream-muted [&>svg]:h-4 [&>svg]:w-4" dangerouslySetInnerHTML={{ __html: svg }} />
  if (item.iconUrl) return <img src={item.iconUrl} className="h-5 w-5 object-contain" alt="" loading="lazy" />
  return null
}

const toggle = (list, key) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key])

export default function FilterPanel({ platform, setPlatform, defs, loading, filters, setFilters }) {
  const [loaderQuery, setLoaderQuery] = useState('')
  const [versionQuery, setVersionQuery] = useState('')
  const [versions, setVersions] = useState([])
  useEffect(() => { fetchVersions().then((v) => setVersions(v.filter((x) => x.type === 'release').map((x) => x.id))) }, [])

  const set = (changes) => setFilters((f) => ({ ...f, ...changes }))
  const active = filters.categories.length + filters.loaders.length + filters.gameVersions.length + (filters.environment ? 1 : 0)
  const loaders = (defs?.loaders || []).filter((k) => (LOADERS.find((l) => l.key === k)?.label || SHADER_LOADERS[k] || k).toLowerCase().includes(loaderQuery.toLowerCase()))
  const shownVersions = versions.filter((v) => v.includes(versionQuery.trim()))

  return (
    <aside className="panel sticky top-0 max-h-[calc(100vh-150px)] overflow-y-auto px-4 pb-3 pt-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-lg font-bold">Filtres</span>
        {active > 0 && (
          <button onClick={() => setFilters({ categories: [], loaders: [], gameVersions: [], environment: null })} className="flex items-center gap-1.5 text-xs font-semibold text-ember-400 hover:text-ember-300">
            <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser ({active})
          </button>
        )}
      </div>

      <Section icon={Globe} title="Plateforme">
        {PLATFORMS.map((p) => (
          <Option key={p.key} round checked={platform === p.key} onClick={() => setPlatform(p.key)} label={p.label} icon={<span className="h-3 w-3 rounded-full" style={{ background: p.color }} />} />
        ))}
      </Section>

      {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-ember-400" /></div>}

      {!loading && defs?.groups.map((g) => (
        <Section key={g.key} icon={FolderOpen} title={g.label} count={g.items.filter((i) => filters.categories.includes(i.key)).length} defaultOpen={g.key === 'categories'}>
          <div className="max-h-64 overflow-y-auto pr-1">
            {g.items.map((item) => (
              <Option key={item.key} checked={filters.categories.includes(item.key)} onClick={() => set({ categories: toggle(filters.categories, item.key) })} icon={<CategoryIcon item={item} />} label={item.label} />
            ))}
          </div>
        </Section>
      ))}

      {!loading && defs?.loaders.length > 0 && (
        <Section icon={Puzzle} title="Chargeurs" count={filters.loaders.length}>
          {defs.loaders.length > 4 && <SearchBox value={loaderQuery} onChange={setLoaderQuery} placeholder="Chercher un chargeur…" />}
          {loaders.map((k) => {
            const l = LOADERS.find((x) => x.key === k)
            return <Option key={k} checked={filters.loaders.includes(k)} onClick={() => set({ loaders: toggle(filters.loaders, k) })} icon={l ? <img src={l.icon} className="h-5 w-5 object-contain" alt="" /> : null} label={l?.label || SHADER_LOADERS[k] || k} />
          })}
        </Section>
      )}

      <Section icon={Gamepad2} title="Versions du jeu" count={filters.gameVersions.length} defaultOpen={false}>
        <SearchBox value={versionQuery} onChange={setVersionQuery} placeholder="Ex. 1.20.1" />
        <div className="max-h-56 overflow-y-auto pr-1">
          {shownVersions.map((v) => (
            <Option key={v} checked={filters.gameVersions.includes(v)} onClick={() => set({ gameVersions: toggle(filters.gameVersions, v) })} label={v} />
          ))}
        </div>
        {platform === 'curseforge' && filters.gameVersions.length > 4 && <p className="mt-2 text-xs text-cream-muted">CurseForge ne prend en compte que 4 versions à la fois.</p>}
      </Section>

      {!loading && defs?.environment && (
        <Section icon={Monitor} title="Environnement" count={filters.environment ? 1 : 0}>
          <Option round checked={filters.environment === 'server'} onClick={() => set({ environment: filters.environment === 'server' ? null : 'server' })} icon={<Server className="h-4 w-4" />} label="Serveur" />
          <Option round checked={filters.environment === 'client'} onClick={() => set({ environment: filters.environment === 'client' ? null : 'client' })} icon={<Monitor className="h-4 w-4" />} label="Client" />
        </Section>
      )}
    </aside>
  )
}
