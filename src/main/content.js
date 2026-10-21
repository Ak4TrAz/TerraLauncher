// Catalogues Modrinth et CurseForge : recherche, installation de contenu et de modpacks.
const fs = require('fs')
const path = require('path')
const os = require('os')
const AdmZip = require('adm-zip')
const store = require('./store')
const downloads = require('./downloads')
const settings = require('./settings')

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

// Catégories proposées dans Découvrir : slug Modrinth + mots-clés des noms CurseForge
const CATEGORIES = {
  adventure: { mr: 'adventure', cf: ['Adventure'] },
  technology: { mr: 'technology', cf: ['Tech'] },
  magic: { mr: 'magic', cf: ['Magic'] },
  optimization: { mr: 'optimization', cf: ['Performance', 'Light'] },
  multiplayer: { mr: 'multiplayer', cf: ['Multiplayer', 'Server'] }
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

async function searchModrinth({ query, type, category, offset }) {
  const facets = [[`project_type:${type}`]]
  if (category && CATEGORIES[category]) facets.push([`categories:${CATEGORIES[category].mr}`])
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
async function cfCategoryId(type, category) {
  if (!category || !CATEGORIES[category]) return null
  const classId = CF_CLASS[type]
  if (!cfCategories[classId]) cfCategories[classId] = (await cf(`/categories?gameId=${CF_GAME}&classId=${classId}`)).data
  const words = CATEGORIES[category].cf
  return cfCategories[classId].find((c) => words.some((w) => c.name.includes(w)))?.id || null
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

async function searchCurseforge({ query, type, category, offset }) {
  const params = new URLSearchParams({ gameId: String(CF_GAME), classId: String(CF_CLASS[type]), searchFilter: query || '', sortField: '2', sortOrder: 'desc', pageSize: '24', index: String(offset || 0) })
  const categoryId = await cfCategoryId(type, category)
  if (categoryId) params.set('categoryId', String(categoryId))
  const json = await cf(`/mods/search?${params}`)
  return { total: json.pagination?.totalCount || json.data.length, hits: json.data.map((m) => cfHit(m, type)) }
}

function search(opts) {
  return opts.platform === 'curseforge' ? searchCurseforge(opts) : searchModrinth(opts)
}

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

function insideDir(base, rel) {
  const dest = path.resolve(base, rel)
  if (!dest.startsWith(path.resolve(base) + path.sep)) throw new Error(`Chemin refusé : ${rel}`)
  return dest
}

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

async function downloadTemp(task, url, name) {
  const dest = path.join(os.tmpdir(), 'terralauncher', `${Date.now()}-${name}`)
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
    store.setInstanceBanner(instanceId, tmp)
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
      const current = store.listInstances().find((i) => i.id === inst.id)
      downloads.installVersion(dataRoot, current.version)
      if (profileId) store.reapplyProfile(inst.id, profileId, items)
      store.updateInstance(inst.id, { installing: false, installError: null })
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

async function installModrinthPack(task, project, versionId, inst, game) {
  const version = versionId ? await mr(`/version/${versionId}`) : (await mr(`/project/${project.id}/version`))[0]
  const file = version.files.find((f) => f.filename.endsWith('.mrpack')) || version.files[0]
  task.detail = 'Téléchargement du modpack…'
  const archive = await downloadTemp(task, file.url, file.filename)
  const zip = new AdmZip(archive)
  const index = JSON.parse(zip.readAsText('modrinth.index.json'))
  const deps = index.dependencies || {}
  const loader = deps['fabric-loader'] ? 'fabric' : deps['quilt-loader'] ? 'quilt' : deps.neoforge ? 'neoforge' : deps.forge ? 'forge' : 'vanilla'
  store.updateInstance(inst.id, { version: deps.minecraft, loader, loaderVersion: deps['fabric-loader'] || deps['quilt-loader'] || deps.neoforge || deps.forge || null })
  notifyInstances()

  const files = index.files
    .filter((f) => f.env?.client !== 'unsupported')
    .map((f) => ({ url: f.downloads[0], dest: insideDir(game, f.path), sha1: f.hashes?.sha1, size: f.fileSize }))
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
  store.updateInstance(inst.id, { version: manifest.minecraft.version, loader: LOADER_KEYS.includes(loaderName) ? loaderName : 'vanilla', loaderVersion: rest.join('-') || null })
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

module.exports = { search, projectVersions, projectDetails, installToInstance, installModpack, onInstancesChanged }
