// Pont vers le processus Electron (window.terra).
// Dans un simple navigateur (aperçu de dev), une version simulée stockée en localStorage prend le relais.

const ITEMS = [
  { key: 'options', label: 'Touches et réglages' },
  { key: 'shaders', label: 'Shaders' },
  { key: 'resourcepacks', label: 'Resource packs' },
  { key: 'servers', label: 'Liste des serveurs' },
  { key: 'config', label: 'Configs de mods' },
  { key: 'mods', label: 'Mods' },
  { key: 'extras', label: 'Autres fichiers' }
]

// Catégories non cochées par défaut quand on importe un profil dans une nouvelle instance
export const OFF_BY_DEFAULT = ['mods']

const MOCK_SCAN = {
  dir: 'C:\\exemple\\instance',
  groups: [
    { key: 'options', label: 'Touches et réglages', items: [{ path: 'options.txt', label: 'options.txt (touches, FOV, son, graphismes)', size: 6200, checked: true }] },
    { key: 'shaders', label: 'Shaders', items: [{ path: 'shaderpacks/ComplementaryReimagined.zip', label: 'ComplementaryReimagined.zip', size: 2.1e6, checked: true }, { path: 'shaderpacks/BSL_v8.zip', label: 'BSL_v8.zip', size: 1.4e6, checked: true }] },
    { key: 'resourcepacks', label: 'Resource packs', items: [{ path: 'resourcepacks/Fresh Animations.zip', label: 'Fresh Animations.zip', size: 8.3e6, checked: true }] },
    { key: 'servers', label: 'Liste des serveurs', items: [{ path: 'servers.dat', label: 'servers.dat', size: 900, checked: true }] },
    { key: 'mods', label: 'Mods', items: [{ path: 'mods/sodium.jar', label: 'sodium.jar', size: 1.1e6, checked: false }, { path: 'mods/iris.jar', label: 'iris.jar', size: 2.4e6, checked: false }] },
    { key: 'extras', label: 'Autres fichiers', items: [{ path: 'xaero', label: 'xaero', size: 3.2e5, checked: true }, { path: 'saves', label: 'saves', size: 2.4e8, checked: false }] }
  ]
}

function createMock() {
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || [] } catch { return [] } }
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
  const id = () => Math.random().toString(16).slice(2, 14)
  const desktopOnly = async () => { throw new Error("Disponible uniquement dans l'application TerraLauncher.") }
  // Téléchargements simulés pour l'aperçu navigateur
  let dl = []
  const dlListeners = new Set()
  const dlEmit = () => dlListeners.forEach((fn) => fn([...dl]))
  const fakeDownload = (version) => {
    const t = { id: id(), title: /^\d/.test(version) ? `Minecraft ${version}` : version, detail: 'Client du jeu', received: 0, total: 28e6, speed: 0, status: 'running', error: null, startedAt: Date.now() }
    dl = [t, ...dl]
    const tick = setInterval(() => {
      t.speed = 3e6 + Math.random() * 2e6
      t.received = Math.min(t.total, t.received + t.speed / 5)
      if (t.received >= t.total) { t.status = 'done'; t.speed = 0; t.detail = 'Installé'; clearInterval(tick) }
      dl = dl.map((x) => (x.id === t.id ? { ...t } : x))
      dlEmit()
    }, 200)
    dlEmit()
  }
  const summary = { options: false, shaders: 0, resourcepacks: 0, servers: false, config: 0, mods: 0, extras: 0 }

  return {
    mock: true,
    window: { minimize: async () => {}, maximize: async () => {}, close: async () => {} },
    items: async () => ITEMS,
    profiles: {
      list: async () => load('mock.profiles').map((p) => ({ ...p, summary })),
      create: async (data) => {
        const p = { id: id(), name: data.name || 'Nouveau profil', color: data.color || '#f07a1e', description: data.description || '', createdAt: Date.now() }
        save('mock.profiles', [...load('mock.profiles'), p])
        return p
      },
      update: async (pid, changes) => {
        const list = load('mock.profiles').map((p) => (p.id === pid ? { ...p, ...changes } : p))
        save('mock.profiles', list)
        return list.find((p) => p.id === pid)
      },
      remove: async (pid) => {
        save('mock.profiles', load('mock.profiles').filter((p) => p.id !== pid))
        save('mock.instances', load('mock.instances').map((i) => (i.profileId === pid ? { ...i, profileId: null } : i)))
      },
      openFolder: desktopOnly
    },
    settings: {
      get: async () => ({ devMode: true, hasMsClientId: false, animations: true, startPage: 'library', msClientId: '', curseforgeKey: '', hasCurseforgeKey: false, ...JSON.parse(localStorage.getItem('mock.settings') || '{}') }),
      update: async (changes) => {
        const next = { ...JSON.parse(localStorage.getItem('mock.settings') || '{}'), ...changes }
        if (changes.curseforgeKey) { next.hasCurseforgeKey = true; next.curseforgeKey = '••••••••' }
        localStorage.setItem('mock.settings', JSON.stringify(next))
        return next
      }
    },
    app: { openExternal: async (url) => window.open(url, '_blank'), openDataFolder: desktopOnly, version: async () => 'aperçu', installUpdate: async () => {}, onUpdate: () => () => {} },
    accounts: { list: async () => [], login: desktopOnly, cancel: async () => {}, setActive: async () => [], remove: async () => [] },
    content: {
      search: async (opts) => {
        if (opts.platform === 'curseforge') throw new Error('CurseForge : disponible dans l’application (clé d’API requise).')
        const facets = [[`project_type:${opts.type}`]]
        if (opts.category) facets.push([`categories:${opts.category}`])
        const p = new URLSearchParams({ query: opts.query || '', facets: JSON.stringify(facets), limit: '24', offset: String(opts.offset || 0), index: opts.query ? 'relevance' : 'downloads' })
        const json = await (await fetch(`https://api.modrinth.com/v2/search?${p}`)).json()
        return {
          total: json.total_hits,
          hits: json.hits.map((h) => ({ platform: 'modrinth', id: h.project_id, slug: h.slug, type: opts.type, title: h.title, description: h.description, author: h.author, icon: h.icon_url, image: h.featured_gallery || h.gallery?.[0] || null, downloads: h.downloads, gameVersion: h.versions?.filter((v) => /^\d+(\.\d+)+$/.test(v)).pop() || null, loaders: h.categories.filter((c) => ['fabric', 'forge', 'neoforge', 'quilt'].includes(c)), url: `https://modrinth.com/${opts.type}/${h.slug}` }))
        }
      },
      details: async (_p, pid) => {
        const p = await (await fetch(`https://api.modrinth.com/v2/project/${pid}`)).json()
        const team = await (await fetch(`https://api.modrinth.com/v2/project/${pid}/members`)).json().catch(() => [])
        return { platform: 'modrinth', id: p.id, slug: p.slug, type: p.project_type, title: p.title, description: p.description, author: team[0]?.user?.username || '', icon: p.icon_url, image: p.gallery?.[0]?.url || null, downloads: p.downloads, followers: p.followers, gameVersion: (p.game_versions || []).filter((v) => /^d+(.d+)+$/.test(v)).pop() || null, loaders: (p.loaders || []).filter((l) => ['fabric', 'forge', 'neoforge', 'quilt'].includes(l)), body: p.body, bodyFormat: 'markdown', gallery: (p.gallery || []).map((g) => ({ url: g.url, title: g.title })), categories: p.categories, updated: p.updated, license: p.license?.name, links: { source: p.source_url, issues: p.issues_url, wiki: p.wiki_url, discord: p.discord_url }, url: `https://modrinth.com/${p.project_type}/${p.slug}` }
      },
      versions: async (_p, pid) => (await (await fetch(`https://api.modrinth.com/v2/project/${pid}/version`)).json()).map((v) => ({ id: v.id, name: v.name, date: v.date_published, channel: v.version_type, downloads: v.downloads, gameVersions: v.game_versions, loaders: v.loaders })),
      install: async (project) => { fakeDownload(project.title); return null },
      installModpack: async ({ project, name }) => {
        const inst = { id: id(), name: name || project.title, version: project.gameVersion, loader: project.loaders[0] || 'vanilla', banner: 5, profileId: null, imported: [], createdAt: Date.now(), lastPlayed: null }
        save('mock.instances', [...load('mock.instances'), inst])
        fakeDownload(project.title)
        return inst
      }
    },
    onInstancesChanged: () => () => {},
    game: { launch: desktopOnly, stop: async () => {}, repair: desktopOnly, totalMemory: async () => 16384, onStatus: () => () => {} },
    downloads: {
      list: async () => [...dl],
      clear: async () => { dl = dl.filter((t) => t.status === 'running'); dlEmit() },
      onUpdate: (fn) => { dlListeners.add(fn); return () => dlListeners.delete(fn) }
    },
    importer: {
      sources: async () => [
        ...load('mock.instances').map((i) => ({ launcher: 'TerraLauncher', name: i.name, dir: 'terra/' + i.id })),
        { launcher: 'GDLauncher', name: 'Terranova', dir: 'C:\\...\\gdlauncher_carbon\\data\\instances\\Terranova\\instance' },
        { launcher: 'Modrinth', name: 'Fabric 26.3 1.0.0', dir: 'C:\\...\\ModrinthApp\\profiles\\Fabric 26.3 1.0.0' }
      ],
      pickFolder: desktopOnly,
      scan: async (dir) => ({ ...MOCK_SCAN, dir }),
      run: async (_pid, _dir, paths) => paths.length
    },
    instances: {
      list: async () => load('mock.instances'),
      create: async (data) => {
        const inst = { id: id(), name: data.name || 'Nouvelle instance', version: data.version, loader: data.loader || 'vanilla', banner: data.banner ?? 0, profileId: data.profileId || null, imported: data.profileId ? data.items : [], createdAt: Date.now(), lastPlayed: null }
        save('mock.instances', [...load('mock.instances'), inst])
        fakeDownload(inst.version)
        return inst
      },
      update: async (iid, changes) => {
        const list = load('mock.instances').map((i) => (i.id === iid ? { ...i, ...changes } : i))
        save('mock.instances', list)
        return list.find((i) => i.id === iid)
      },
      remove: async (iid) => save('mock.instances', load('mock.instances').filter((i) => i.id !== iid)),
      openFolder: desktopOnly,
      reapplyProfile: async (iid, profileId, items) => {
        const list = load('mock.instances').map((i) => (i.id === iid ? { ...i, profileId, imported: items } : i))
        save('mock.instances', list)
        return list.find((i) => i.id === iid)
      },
      saveToProfile: desktopOnly,
      pickBanner: desktopOnly,
      files: async (_id, folder) => (folder === 'mods' ? [{ name: 'sodium-fabric-0.5.13.jar', title: 'Sodium', version: '0.5.13', size: 980000, enabled: true }, { name: 'iris-1.7.6.jar.disabled', title: 'Iris', version: '1.7.6', size: 2400000, enabled: false }] : []),
      toggleMod: async () => {},
      trashFile: async () => {},
      openSubfolder: desktopOnly,
      duplicate: desktopOnly,
      exportZip: desktopOnly
    }
  }
}

export const api = window.terra || createMock()
export const isDesktop = !!window.terra

export const LOADERS = [
  { key: 'vanilla', label: 'Vanilla', icon: './loaders/vanilla.png' },
  { key: 'fabric', label: 'Fabric', icon: './loaders/fabric.png' },
  { key: 'forge', label: 'Forge', icon: './loaders/forge.png' },
  { key: 'neoforge', label: 'NeoForge', icon: './loaders/neoforge.png' },
  { key: 'quilt', label: 'Quilt', icon: './loaders/quilt.svg' }
]

const FALLBACK_VERSIONS = ['1.21.4', '1.21.3', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2', '1.8.9'].map((id) => ({ id, type: 'release' }))

let versionsCache = null
export async function fetchVersions() {
  if (versionsCache) return versionsCache
  try {
    const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
    const json = await res.json()
    versionsCache = json.versions.map((v) => ({ id: v.id, type: v.type }))
  } catch {
    versionsCache = FALLBACK_VERSIONS
  }
  return versionsCache
}
