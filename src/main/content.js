// Catalogues Modrinth et CurseForge : recherche, installation de contenu et de modpacks.
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { shell } = require('electron')
const AdmZip = require('adm-zip')
const store = require('./store')
const downloads = require('./downloads')
const settings = require('./settings')
const { insideDir, checkVersion } = require('./paths')

const UA = 'TerraLauncher/0.1.0'
const MR = 'https://api.modrinth.com/v2'
const CF = 'https://api.curseforge.com/v1'
const CF_GAME = 432
const CF_CLASS = { modpack: 4471, mod: 6, shader: 6552, resourcepack: 12 }
const CF_CLASS_DIR = { 6: 'mods', 12: 'resourcepacks', 6552: 'shaderpacks' }
const CF_LOADER = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }
const CF_LOADER_NAME = { 1: 'forge', 4: 'fabric', 5: 'quilt', 6: 'neoforge' }
const TYPE_DIR = { mod: 'mods', shader: 'shaderpacks', resourcepack: 'resourcepacks' }
const LOADER_KEYS = ['fabric', 'forge', 'neoforge', 'quilt']

// Libellés français des catégories Modrinth (les autres gardent leur nom anglais mis en forme)
const FR = {
  adventure: 'Aventure', technology: 'Technologie', magic: 'Magie', optimization: 'Optimisation', multiplayer: 'Multijoueur',
  quests: 'Quêtes', challenging: 'Difficile', combat: 'Combat', 'kitchen-sink': 'Fourre-tout', lightweight: 'Léger',
  cursed: 'Maudit', decoration: 'Décoration', economy: 'Économie', equipment: 'Équipement', food: 'Nourriture',
  'game-mechanics': 'Mécaniques de jeu', library: 'Bibliothèque', management: 'Gestion', minigame: 'Mini-jeux', mobs: 'Créatures',
  social: 'Social', storage: 'Stockage', transportation: 'Transport', utility: 'Utilitaire', worldgen: 'Génération du monde',
  modded: 'Moddé', realistic: 'Réaliste', simplistic: 'Simple', themed: 'Thématique', tweaks: 'Ajustements', 'vanilla-like': 'Façon vanilla',
  audio: 'Sons', blocks: 'Blocs', 'core-shaders': 'Core shaders', entities: 'Entités', environment: 'Environnement', fonts: 'Polices',
  gui: 'Interface', items: 'Objets', locale: 'Langues', models: 'Modèles', cartoon: 'Cartoon', fantasy: 'Fantasy', 'semi-realistic': 'Semi-réaliste',
  atmosphere: 'Atmosphère', bloom: 'Bloom', 'colored-lighting': 'Lumières colorées', foliage: 'Feuillage', 'path-tracing': 'Path tracing',
  pbr: 'PBR', reflections: 'Reflets', shadows: 'Ombres', high: 'Élevé', low: 'Faible', medium: 'Moyen', potato: 'PC modeste', screenshot: 'Captures'
}
const GROUP_FR = { categories: 'Catégories', features: 'Caractéristiques', resolutions: 'Résolution', 'performance impact': 'Impact sur les performances' }
const label = (slug) => FR[slug] || slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())

// Chargeurs proposés en filtre selon le type de contenu (Modrinth)
const LOADER_FILTERS = {
  mod: ['fabric', 'forge', 'neoforge', 'quilt'],
  modpack: ['fabric', 'forge', 'neoforge', 'quilt'],
  shader: ['iris', 'optifine', 'canvas', 'vanilla'],
  resourcepack: []
}

let notifyInstances = () => {}
function onInstancesChanged(fn) { notifyInstances = fn }

// ---------- HTTP ----------

async function mr(pathname) {
  const res = await fetch(MR + pathname, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`Modrinth : erreur ${res.status}`)
  return res.json()
}

function cfKey() {
  const key = settings.curseforgeKey()
  if (!key) throw new Error(settings.devMode() ? 'Ajoute ta clé d’API CurseForge dans Paramètres → Connexions.' : 'CurseForge n’est pas disponible dans cette version du launcher.')
  return key
}

async function cf(pathname, body) {
  const res = await fetch(CF + pathname, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-api-key': cfKey(), Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA },
    body: body ? JSON.stringify(body) : undefined
  })
  if (res.status === 403) throw new Error('CurseForge a refusé la clé d’API (403). ' + (settings.devMode() ? 'Vérifie-la dans Paramètres → Connexions.' : 'Réessaie plus tard.'))
  if (!res.ok) throw new Error(`CurseForge : erreur ${res.status}`)
  return res.json()
}

// ---------- Recherche ----------

const releaseOnly = (versions) => versions.filter((v) => /^\d+(\.\d+)+$/.test(v))
const sortVersions = (versions) => [...versions].sort((a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0)
  return 0
})

// Filtres : dans un groupe = « ou », entre groupes = « et »
async function searchModrinth({ query, type, categories = [], loaders = [], gameVersions = [], environment, offset }) {
  const facets = [[`project_type:${type}`]]
  if (categories.length) facets.push(...categories.map((c) => [`categories:${c}`]))
  if (loaders.length) facets.push(loaders.map((l) => `categories:${l}`))
  if (gameVersions.length) facets.push(gameVersions.map((v) => `versions:${v}`))
  if (environment) facets.push([`${environment}_side:required`, `${environment}_side:optional`])
  const params = new URLSearchParams({ query: query || '', facets: JSON.stringify(facets), limit: '24', offset: String(offset || 0), index: query ? 'relevance' : 'downloads' })
  const json = await mr(`/search?${params}`)
  return {
    total: json.total_hits,
    hits: json.hits.map((h) => ({
      platform: 'modrinth',
      id: h.project_id,
      slug: h.slug,
      type,
      title: h.title,
      description: h.description,
      author: h.author,
      icon: h.icon_url || null,
      image: h.featured_gallery || h.gallery?.[0] || null,
      downloads: h.downloads,
      gameVersion: sortVersions(releaseOnly(h.versions || []))[0] || h.versions?.[h.versions.length - 1] || null,
      loaders: (h.categories || []).filter((c) => LOADER_KEYS.includes(c)),
      url: `https://modrinth.com/${type}/${h.slug}`
    }))
  }
}

let cfCategories = {}
async function cfCategoryList(type) {
  const classId = CF_CLASS[type]
  if (!cfCategories[classId]) cfCategories[classId] = (await cf(`/categories?gameId=${CF_GAME}&classId=${classId}`)).data
  return cfCategories[classId]
}

function cfHit(m, type) {
  const versions = sortVersions(releaseOnly([...new Set((m.latestFilesIndexes || []).map((f) => f.gameVersion))]))
  return {
    platform: 'curseforge',
    id: m.id,
    slug: m.slug,
    type,
    title: m.name,
    description: m.summary,
    author: m.authors?.[0]?.name || '',
    icon: m.logo?.thumbnailUrl || null,
    image: m.screenshots?.[0]?.url || m.logo?.url || null,
    downloads: m.downloadCount,
    gameVersion: versions[0] || null,
    loaders: [...new Set((m.latestFilesIndexes || []).map((f) => CF_LOADER_NAME[f.modLoader]).filter(Boolean))],
    url: m.links?.websiteUrl || `https://www.curseforge.com/minecraft/search?search=${encodeURIComponent(m.name)}`
  }
}

async function searchCurseforge({ query, type, categories = [], loaders = [], gameVersions = [], offset }) {
  const params = new URLSearchParams({ gameId: String(CF_GAME), classId: String(CF_CLASS[type]), searchFilter: query || '', sortField: '2', sortOrder: 'desc', pageSize: '24', index: String(offset || 0) })
  // CurseForge accepte au plus 10 catégories, 4 versions et 5 chargeurs
  if (categories.length) params.set('categoryIds', JSON.stringify(categories.slice(0, 10).map(Number)))
  if (gameVersions.length) params.set('gameVersions', JSON.stringify(gameVersions.slice(0, 4)))
  const loaderTypes = loaders.map((l) => CF_LOADER[l]).filter(Boolean)
  if (loaderTypes.length) params.set('modLoaderTypes', JSON.stringify(loaderTypes.slice(0, 5)))
  const json = await cf(`/mods/search?${params}`)
  return { total: json.pagination?.totalCount || json.data.length, hits: json.data.map((m) => cfHit(m, type)) }
}

function search(opts) {
  return opts.platform === 'curseforge' ? searchCurseforge(opts) : searchModrinth(opts)
}

// Catégories et chargeurs proposés en filtre pour une plateforme et un type de contenu
async function filters(platform, type) {
  if (platform === 'curseforge') {
    const list = (await cfCategoryList(type)).filter((c) => !c.isClass && c.classId === CF_CLASS[type])
    return {
      groups: [{ key: 'categories', label: 'Catégories', items: list.map((c) => ({ key: String(c.id), label: c.name, iconUrl: c.iconUrl })).sort((a, b) => a.label.localeCompare(b.label)) }],
      loaders: type === 'mod' || type === 'modpack' ? ['fabric', 'forge', 'neoforge', 'quilt'] : [],
      environment: false
    }
  }
  if (!mrTags) mrTags = await mr('/tag/category')
  const groups = []
  for (const c of mrTags.filter((t) => t.project_type === type)) {
    let g = groups.find((x) => x.key === c.header)
    if (!g) groups.push((g = { key: c.header, label: GROUP_FR[c.header] || c.header, items: [] }))
    g.items.push({ key: c.name, label: label(c.name), svg: c.icon })
  }
  groups.forEach((g) => g.items.sort((a, b) => a.label.localeCompare(b.label)))
  return { groups, loaders: LOADER_FILTERS[type] || [], environment: type === 'mod' || type === 'modpack' }
}
let mrTags = null

// Versions d'un projet (pour choisir la version d'un modpack)
async function projectVersions(platform, id) {
  if (platform === 'curseforge') {
    const json = await cf(`/mods/${id}/files?pageSize=50`)
    return json.data.map((f) => ({ id: f.id, name: f.displayName, date: f.fileDate, channel: ['', 'release', 'beta', 'alpha'][f.releaseType] || 'release', downloads: f.downloadCount, gameVersions: releaseOnly(f.gameVersions), loaders: f.gameVersions.map((g) => g.toLowerCase()).filter((g) => LOADER_KEYS.includes(g)) }))
  }
  const json = await mr(`/project/${id}/version`)
  return json.map((v) => ({ id: v.id, name: v.name || v.version_number, date: v.date_published, channel: v.version_type, downloads: v.downloads, gameVersions: v.game_versions, loaders: v.loaders }))
}

// Fiche complète d'un projet (page détail dans Découvrir)
async function projectDetails(platform, id) {
  if (platform === 'curseforge') {
    const [{ data: m }, { data: html }] = await Promise.all([cf(`/mods/${id}`), cf(`/mods/${id}/description`)])
    const type = Object.entries(CF_CLASS).find(([, c]) => c === m.classId)?.[0] || 'mod'
    return {
      ...cfHit(m, type),
      body: html,
      bodyFormat: 'html',
      gallery: (m.screenshots || []).map((s) => ({ url: s.url, title: s.title, description: s.description })),
      categories: (m.categories || []).map((c) => c.name),
      updated: m.dateModified,
      followers: null,
      license: null,
      links: { site: m.links?.websiteUrl, source: m.links?.sourceUrl, issues: m.links?.issuesUrl, wiki: m.links?.wikiUrl }
    }
  }
  const p = await mr(`/project/${id}`)
  const team = await mr(`/project/${id}/members`).catch(() => [])
  const owner = team.find((t) => t.role === 'Owner') || team[0]
  return {
    platform: 'modrinth',
    id: p.id,
    slug: p.slug,
    type: p.project_type,
    title: p.title,
    description: p.description,
    author: owner?.user?.username || '',
    icon: p.icon_url,
    image: p.gallery?.find((g) => g.featured)?.url || p.gallery?.[0]?.url || null,
    downloads: p.downloads,
    followers: p.followers,
    gameVersion: sortVersions(releaseOnly(p.game_versions || []))[0] || null,
    loaders: (p.loaders || []).filter((l) => LOADER_KEYS.includes(l)),
    body: p.body,
    bodyFormat: 'markdown',
    gallery: (p.gallery || []).sort((a, b) => a.ordering - b.ordering).map((g) => ({ url: g.url, title: g.title, description: g.description })),
    categories: p.categories || [],
    updated: p.updated,
    license: p.license?.name || p.license?.id || null,
    links: { site: `https://modrinth.com/${p.project_type}/${p.slug}`, source: p.source_url, issues: p.issues_url, wiki: p.wiki_url, discord: p.discord_url },
    url: `https://modrinth.com/${p.project_type}/${p.slug}`
  }
}

// ---------- Installation dans une instance existante ----------

const instanceLoaders = (inst) => (inst.loader === 'quilt' ? ['quilt', 'fabric'] : [inst.loader])

// Trouve les fichiers à télécharger pour un projet Modrinth + ses dépendances obligatoires
async function resolveModrinth(projectId, type, inst, seen, versionId) {
  if (seen.has(projectId)) return []
  seen.add(projectId)
  let version
  if (versionId) version = await mr(`/version/${versionId}`)
  else {
    const params = new URLSearchParams({ game_versions: JSON.stringify([inst.version]) })
    if (type === 'mod') params.set('loaders', JSON.stringify(instanceLoaders(inst)))
    const versions = await mr(`/project/${projectId}/version?${params}`)
    version = versions[0]
  }
  if (!version) return [{ missing: projectId }]
  const file = version.files.find((f) => f.primary) || version.files[0]
  const out = [{ url: file.url, name: file.filename, sha1: file.hashes?.sha1, size: file.size, dir: TYPE_DIR[type] }]
  for (const dep of version.dependencies || []) {
    if (dep.dependency_type !== 'required' || !dep.project_id) continue
    out.push(...(await resolveModrinth(dep.project_id, 'mod', inst, seen, dep.version_id)))
  }
  return out
}

async function resolveCurseforge(modId, type, inst, seen) {
  if (seen.has(modId)) return []
  seen.add(modId)
  const params = new URLSearchParams({ gameVersion: inst.version, pageSize: '20' })
  if (type === 'mod') params.set('modLoaderType', String(CF_LOADER[inst.loader]))
  const file = (await cf(`/mods/${modId}/files?${params}`)).data[0]
  if (!file) return [{ missing: modId }]
  const out = file.downloadUrl
    ? [{ url: file.downloadUrl, name: file.fileName, sha1: file.hashes?.find((h) => h.algo === 1)?.value, size: file.fileLength, dir: TYPE_DIR[type] }]
    : [{ blocked: file.displayName }]
  for (const dep of file.dependencies || []) if (dep.relationType === 3) out.push(...(await resolveCurseforge(dep.modId, 'mod', inst, seen)))
  return out
}

async function installToInstance(project, instanceId) {
  const inst = store.listInstances().find((i) => i.id === instanceId)
  if (!inst) throw new Error('Instance introuvable.')
  if (project.type === 'mod' && inst.loader === 'vanilla') throw new Error('Les mods nécessitent une instance avec un chargeur (Fabric, Forge, NeoForge ou Quilt).')
  const game = store.gameDir(instanceId)

  return downloads.start(project.title, `Vers « ${inst.name} »`, async (task) => {
    task.detail = 'Recherche d’une version compatible…'
    downloads.notify(true)
    const seen = new Set()
    const items = project.platform === 'curseforge' ? await resolveCurseforge(project.id, project.type, inst, seen) : await resolveModrinth(project.id, project.type, inst, seen)
    if (items[0]?.missing) throw new Error(`Aucune version compatible avec Minecraft ${inst.version}${project.type === 'mod' ? ` (${inst.loader})` : ''}.`)
    if (items[0]?.blocked) throw new Error(`L’auteur bloque le téléchargement depuis les launchers : télécharge « ${items[0].blocked} » sur le site CurseForge.`)
    const files = items.filter((i) => i.url).map((i) => ({ url: i.url, dest: insideDir(game, `${i.dir}/${i.name}`), sha1: i.sha1, size: i.size }))
    const skipped = items.filter((i) => !i.url).length
    task.detail = `${files.length} fichier${files.length > 1 ? 's' : ''}${skipped ? ` · ${skipped} dépendance(s) introuvable(s)` : ''}`
    const failed = await downloads.downloadFiles(task, files)
    if (failed.length) throw new Error(`${failed.length} fichier(s) en échec : ${failed[0].error}`)
    task.detail = `Installé dans « ${inst.name} »`
  })
}

// ---------- Modpacks ----------

// Le nom du fichier vient de l'API : seul son dernier segment est gardé, en caractères sûrs
async function downloadTemp(task, url, name) {
  const safe = path.basename(String(name || '').replace(/\\/g, '/')).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'modpack'
  const dest = insideDir(path.join(os.tmpdir(), 'terralauncher'), `${Date.now()}-${safe}`)
  await downloads.fetchToFile(task, url, dest)
  return dest
}

function extractOverrides(zip, folders, game) {
  for (const entry of zip.getEntries()) {
    const folder = folders.find((f) => entry.entryName.startsWith(f + '/'))
    if (!folder || entry.isDirectory) continue
    const dest = insideDir(game, entry.entryName.slice(folder.length + 1))
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, entry.getData())
  }
}

async function saveBanner(instanceId, imageUrl) {
  if (!imageUrl) return
  try {
    const res = await fetch(imageUrl, { headers: { 'User-Agent': UA } })
    if (!res.ok) return
    const ext = (path.extname(new URL(imageUrl).pathname) || '.png').slice(0, 5)
    const tmp = path.join(os.tmpdir(), `terra-banner-${instanceId}${ext}`)
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()))
    store.setInstanceImage(instanceId, 'banner', tmp)
    fs.rmSync(tmp, { force: true })
  } catch {}
}

// Crée une instance à partir d'un modpack ; l'installation continue en arrière-plan.
async function installModpack({ project, versionId, name, profileId, items }, dataRoot) {
  const inst = store.createInstance({ name: name || project.title, version: project.gameVersion || 'inconnue', loader: 'vanilla', banner: 5 })
  store.updateInstance(inst.id, { installing: true, source: { platform: project.platform, projectId: project.id, versionId } })
  const game = store.gameDir(inst.id)

  downloads.start(project.title, 'Préparation du modpack…', async (task) => {
    try {
      await saveBanner(inst.id, project.image)
      let warning = null
      if (project.platform === 'curseforge') warning = await installCurseforgePack(task, project, versionId, inst, game)
      else await installModrinthPack(task, project, versionId, inst, game)
      if (profileId) store.reapplyProfile(inst.id, profileId, items)
      store.updateInstance(inst.id, { installing: false, installError: null })
      require('./launcher').prepareInBackground(inst.id)
      task.detail = warning || 'Modpack installé'
    } catch (err) {
      store.updateInstance(inst.id, { installing: false, installError: err.message })
      throw err
    } finally {
      notifyInstances()
    }
  })
  return store.listInstances().find((i) => i.id === inst.id)
}

// Fichiers externes d'un .mrpack : hôtes admis par le format Modrinth, empreinte SHA-1 obligatoire
const PACK_HOSTS = new Set(['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com'])
function packUrlOk(u) {
  try {
    const url = new URL(u)
    return url.protocol === 'https:' && url.port === '' && PACK_HOSTS.has(url.hostname)
  } catch { return false }
}

function packFile(f, game) {
  const urls = (Array.isArray(f.downloads) ? f.downloads : []).filter(packUrlOk)
  if (!urls.length) throw new Error(`Fichier du modpack refusé (adresse non autorisée) : ${f.path}`)
  const sha1 = String(f.hashes?.sha1 || '').toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(sha1)) throw new Error(`Fichier du modpack sans empreinte SHA-1 : ${f.path}`)
  return { url: urls[0], urls, dest: insideDir(game, f.path), sha1, size: f.fileSize }
}

async function installModrinthPack(task, project, versionId, inst, game) {
  const version = versionId ? await mr(`/version/${versionId}`) : (await mr(`/project/${project.id}/version`))[0]
  const file = version.files.find((f) => f.filename.endsWith('.mrpack')) || version.files[0]
  task.detail = 'Téléchargement du modpack…'
  const archive = await downloadTemp(task, file.url, file.filename)
  const zip = new AdmZip(archive)
  const index = JSON.parse(zip.readAsText('modrinth.index.json'))
  const deps = index.dependencies || {}
  const loader = deps['fabric-loader'] ? 'fabric' : deps['quilt-loader'] ? 'quilt' : deps.neoforge ? 'neoforge' : deps.forge ? 'forge' : 'vanilla'
  const loaderVersion = deps['fabric-loader'] || deps['quilt-loader'] || deps.neoforge || deps.forge || null
  checkVersion(deps.minecraft, 'Version de Minecraft du modpack')
  if (loaderVersion) checkVersion(loaderVersion, 'Version du chargeur du modpack')
  store.updateInstance(inst.id, { version: deps.minecraft, loader, loaderVersion })
  notifyInstances()

  const files = index.files
    .filter((f) => f.env?.client !== 'unsupported')
    .map((f) => packFile(f, game))
  task.detail = `${files.length} mods et fichiers`
  const failed = await downloads.downloadFiles(task, files)
  extractOverrides(zip, ['overrides', 'client-overrides'], game)
  fs.rmSync(archive, { force: true })
  if (failed.length) throw new Error(`${failed.length} fichier(s) n’ont pas pu être téléchargés.`)
}

async function installCurseforgePack(task, project, versionId, inst, game) {
  const fileId = versionId || (await cf(`/mods/${project.id}/files?pageSize=1`)).data[0]?.id
  const packFile = (await cf(`/mods/${project.id}/files/${fileId}`)).data
  if (!packFile.downloadUrl) throw new Error('Ce modpack ne peut pas être téléchargé depuis un launcher tiers (choix de l’auteur).')
  task.detail = 'Téléchargement du modpack…'
  const archive = await downloadTemp(task, packFile.downloadUrl, packFile.fileName)
  const zip = new AdmZip(archive)
  const manifest = JSON.parse(zip.readAsText('manifest.json'))
  const primary = manifest.minecraft.modLoaders.find((l) => l.primary) || manifest.minecraft.modLoaders[0]
  const [loaderName, ...rest] = (primary?.id || 'vanilla').split('-')
  const loaderVersion = rest.join('-') || null
  checkVersion(manifest.minecraft.version, 'Version de Minecraft du modpack')
  if (loaderVersion) checkVersion(loaderVersion, 'Version du chargeur du modpack')
  store.updateInstance(inst.id, { version: manifest.minecraft.version, loader: LOADER_KEYS.includes(loaderName) ? loaderName : 'vanilla', loaderVersion })
  notifyInstances()

  const wanted = manifest.files.filter((f) => f.required !== false)
  task.detail = `Résolution de ${wanted.length} mods…`
  downloads.notify(true)
  const filesInfo = []
  const modsInfo = []
  for (let i = 0; i < wanted.length; i += 100) {
    const chunk = wanted.slice(i, i + 100)
    filesInfo.push(...(await cf('/mods/files', { fileIds: chunk.map((f) => f.fileID) })).data)
    modsInfo.push(...(await cf('/mods', { modIds: chunk.map((f) => f.projectID) })).data)
  }
  const classOf = Object.fromEntries(modsInfo.map((m) => [m.id, m.classId]))
  const blocked = filesInfo.filter((f) => !f.downloadUrl)
  const files = filesInfo
    .filter((f) => f.downloadUrl)
    .map((f) => ({ url: f.downloadUrl, dest: insideDir(game, `${CF_CLASS_DIR[classOf[f.modId]] || 'mods'}/${f.fileName}`), sha1: f.hashes?.find((h) => h.algo === 1)?.value, size: f.fileLength }))
  task.detail = `${files.length} mods et fichiers`
  const failed = await downloads.downloadFiles(task, files)
  extractOverrides(zip, [manifest.overrides || 'overrides'], game)
  fs.rmSync(archive, { force: true })
  if (failed.length) throw new Error(`${failed.length} fichier(s) n’ont pas pu être téléchargés.`)
  if (blocked.length) {
    store.updateInstance(inst.id, { blockedFiles: blocked.map((f) => f.displayName) })
    return `Installé · ${blocked.length} mod(s) à télécharger à la main (bloqués par leur auteur)`
  }
  return null
}

// ---------- Mises à jour des mods d'une instance ----------
// Modrinth reconnaît un fichier à son SHA-1, CurseForge à son empreinte MurmurHash2 :
// on retrouve ainsi un mod quelle que soit sa provenance (modpack, import, ajout à la main).

async function mrPost(pathname, body) {
  const res = await fetch(MR + pathname, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Modrinth : erreur ${res.status}`)
  return res.json()
}

// Empreinte CurseForge : MurmurHash2 (graine 1) du fichier sans tabulations, retours à la ligne ni espaces
function cfFingerprint(buf) {
  const data = buf.filter((b) => b !== 9 && b !== 10 && b !== 13 && b !== 32)
  const m = 0x5bd1e995
  let len = data.length
  let h = (1 ^ len) >>> 0
  let i = 0
  while (len >= 4) {
    let k = data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24)
    k = Math.imul(k, m)
    k ^= k >>> 24
    k = Math.imul(k, m)
    h = Math.imul(h, m) ^ k
    i += 4
    len -= 4
  }
  switch (len) {
    case 3: h ^= data[i + 2] << 16 // fallthrough
    case 2: h ^= data[i + 1] << 8 // fallthrough
    case 1: h ^= data[i]; h = Math.imul(h, m)
  }
  h ^= h >>> 13
  h = Math.imul(h, m)
  h ^= h >>> 15
  return h >>> 0
}

const modUpdates = new Map() // instanceId -> { fichier actuel -> mise à jour trouvée }

async function checkModUpdates(instanceId) {
  const inst = store.listInstances().find((i) => i.id === instanceId)
  if (!inst || inst.loader === 'vanilla') return { updates: {}, icons: {} }
  const dir = path.join(store.gameDir(instanceId), 'mods')
  let names = []
  try { names = fs.readdirSync(dir).filter((n) => /\.jar(\.disabled)?$/i.test(n)) } catch { return { updates: {}, icons: {} } }
  const loaders = inst.loader === 'quilt' ? ['quilt', 'fabric'] : [inst.loader]
  const mods = names.map((name) => {
    const buf = fs.readFileSync(path.join(dir, name))
    return { name, sha1: crypto.createHash('sha1').update(buf).digest('hex'), buf }
  })
  const found = {}
  const icons = {} // fichier -> logo du projet (pour les mods sans logo intégré)

  // Modrinth : une seule requête pour tous les fichiers
  const known = new Set()
  try {
    const latest = await mrPost('/version_files/update', { hashes: mods.map((x) => x.sha1), algorithm: 'sha1', loaders, game_versions: [inst.version] })
    const current = await mrPost('/version_files', { hashes: mods.map((x) => x.sha1), algorithm: 'sha1' })
    const ids = [...new Set(Object.values(current).map((v) => v.project_id))]
    if (ids.length) {
      const projects = new Map((await mr(`/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`)).map((p) => [p.id, p.icon_url]))
      for (const mod of mods) if (current[mod.sha1] && projects.get(current[mod.sha1].project_id)) icons[mod.name] = projects.get(current[mod.sha1].project_id)
    }
    for (const mod of mods) {
      if (current[mod.sha1]) known.add(mod.name)
      const v = latest[mod.sha1]
      const file = v && (v.files.find((f) => f.primary) || v.files[0])
      const now = current[mod.sha1]
      if (!file || file.hashes.sha1 === mod.sha1 || v.id === now?.id) continue
      if (now && new Date(v.date_published) <= new Date(now.date_published)) continue // jamais de retour en arrière
      found[mod.name] = { platform: 'modrinth', version: v.version_number, file: file.filename, url: file.url, sha1: file.hashes.sha1, size: file.size }
    }
  } catch {}

  // CurseForge : pour les fichiers que Modrinth ne connaît pas
  const rest = mods.filter((x) => !known.has(x.name))
  if (rest.length && settings.curseforgeKey()) {
    try {
      const prints = new Map(rest.map((x) => [cfFingerprint(x.buf), x]))
      const res = await cf('/fingerprints/432', { fingerprints: [...prints.keys()] })
      const params = new URLSearchParams({ gameVersion: inst.version, pageSize: '1' })
      if (CF_LOADER[inst.loader]) params.set('modLoaderType', String(CF_LOADER[inst.loader]))
      const matches = res.data?.exactMatches || []
      if (matches.length) {
        const logos = new Map((await cf('/mods', { modIds: matches.map((x) => x.id) })).data.map((m) => [m.id, m.logo?.thumbnailUrl]))
        for (const match of matches) {
          const mod = prints.get(match.file.fileFingerprint)
          if (mod && logos.get(match.id)) icons[mod.name] = logos.get(match.id)
        }
      }
      await Promise.all(matches.map(async (match) => {
        const mod = prints.get(match.file.fileFingerprint)
        if (!mod) return
        const newest = (await cf(`/mods/${match.id}/files?${params}`)).data?.[0]
        if (!newest || newest.id === match.file.id || new Date(newest.fileDate) <= new Date(match.file.fileDate)) return
        found[mod.name] = {
          platform: 'curseforge', version: newest.displayName, file: newest.fileName, url: newest.downloadUrl, size: newest.fileLength,
          sha1: newest.hashes?.find((h) => h.algo === 1)?.value || null
        }
      }))
    } catch {}
  }

  modUpdates.set(instanceId, found)
  return {
    updates: Object.fromEntries(Object.entries(found).map(([name, u]) => [name, { version: u.version, file: u.file, blocked: !u.url }])),
    icons
  }
}

// Remplace les fichiers par leur nouvelle version (une fois téléchargée, l'ancienne part à la corbeille)
function updateMods(instanceId, names) {
  const inst = store.listInstances().find((i) => i.id === instanceId)
  const updates = modUpdates.get(instanceId) || {}
  const chosen = names.filter((n) => updates[n]?.url)
  if (!inst || !chosen.length) throw new Error('Aucune mise à jour disponible pour ces mods.')
  const dir = path.join(store.gameDir(instanceId), 'mods')
  const title = chosen.length > 1 ? `Mise à jour de ${chosen.length} mods` : `Mise à jour de ${updates[chosen[0]].file}`
  return downloads.start(title, `« ${inst.name} »`, async (task) => {
    const files = chosen.map((name) => {
      const u = updates[name]
      return { name, url: u.url, sha1: u.sha1, size: u.size, dest: insideDir(dir, u.file + (name.endsWith('.disabled') ? '.disabled' : '')) }
    })
    const failed = await downloads.downloadFiles(task, files)
    const failedSet = new Set(failed.map((f) => f.dest))
    for (const f of files) {
      if (failedSet.has(f.dest) || path.basename(f.dest) === f.name) continue
      try { await shell.trashItem(path.join(dir, f.name)) } catch { fs.rmSync(path.join(dir, f.name), { force: true }) }
      delete updates[f.name]
    }
    if (failed.length) throw new Error(`${failed.length} mod(s) en échec : ${failed[0].error}`)
    task.detail = `${files.length} mod${files.length > 1 ? 's' : ''} à jour`
  })
}

module.exports = { search, filters, projectVersions, projectDetails, installToInstance, installModpack, onInstancesChanged, checkModUpdates, updateMods }
