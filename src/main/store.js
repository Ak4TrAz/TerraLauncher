// Stockage des profils et des instances sur le disque.
// Dossier racine : %APPDATA%\.terralauncher
//   profiles/<id>/profile.json   métadonnées du profil
//   profiles/<id>/files/         options.txt, shaderpacks/, resourcepacks/, servers.dat, config/
//   instances/<id>/instance.json métadonnées de l'instance
//   instances/<id>/minecraft/    dossier de jeu de l'instance
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// Ce qu'un profil peut transmettre à une instance.
// mode "copy" = copie indépendante, "link" = dossier partagé (jonction Windows)
const ITEMS = {
  options: { label: 'Touches et réglages', entries: [{ name: 'options.txt', mode: 'merge' }] },
  shaders: { label: 'Shaders', entries: [{ name: 'shaderpacks', mode: 'link', dir: true }, { name: 'optionsshaders.txt', mode: 'copy' }, { name: 'config/iris.properties', mode: 'copy' }, { name: 'config/oculus.properties', mode: 'copy' }] },
  resourcepacks: { label: 'Resource packs', entries: [{ name: 'resourcepacks', mode: 'link', dir: true }] },
  servers: { label: 'Liste des serveurs', entries: [{ name: 'servers.dat', mode: 'copy' }] },
  config: { label: 'Configs de mods', entries: [{ name: 'config', mode: 'copy', dir: true }] },
  mods: { label: 'Mods', entries: [{ name: 'mods', mode: 'copy', dir: true }] },
  extras: { label: 'Autres fichiers', entries: [] }
}

// Fichiers et dossiers gérés par une catégorie précise ; le reste va dans « Autres fichiers ».
const KNOWN = new Set(['options.txt', 'optionsshaders.txt', 'servers.dat', 'shaderpacks', 'resourcepacks', 'config', 'mods'])
// Jamais proposés à l'import : générés par le jeu ou propres à chaque launcher.
const IGNORED = new Set(['logs', 'crash-reports', 'natives', 'libraries', 'assets', 'versions', '.fabric', '.mixin.out', '.cache', 'downloads', 'usercache.json', 'usernamecache.json', 'launcher_profiles.json', 'instance.json', 'icon.png', 'command_history.txt', 'realms_persistence.json', 'servers.dat_old', 'options.txt.bak'])
// Proposés mais non cochés par défaut (lourds ou propres à une partie).
const HEAVY = new Set(['saves', 'screenshots', 'mods'])

let root = null
const profilesDir = () => path.join(root, 'profiles')
const instancesDir = () => path.join(root, 'instances')

function init(dataRoot) {
  root = dataRoot
  fs.mkdirSync(profilesDir(), { recursive: true })
  fs.mkdirSync(instancesDir(), { recursive: true })
}

const newId = () => crypto.randomBytes(6).toString('hex')
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2))

function isLink(p) {
  try { return fs.lstatSync(p).isSymbolicLink() } catch { return false }
}

// Supprime une jonction sans toucher au dossier ciblé.
function removeLink(p) {
  try { fs.unlinkSync(p) } catch { fs.rmdirSync(p) }
}

function copyRecursive(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.cpSync(src, dest, { recursive: true, force: true })
}

// ---------- options.txt ----------

function parseOptions(text) {
  const map = new Map()
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) map.set(line.slice(0, i), line.slice(i + 1))
  }
  return map
}

// Les réglages du profil remplacent ceux de l'instance, les touches propres
// aux mods de l'instance sont conservées, la version de l'instance aussi.
function mergeOptions(instanceText, profileText, keepBaseVersion = true) {
  const merged = parseOptions(instanceText)
  const keepVersion = merged.get('version')
  for (const [k, v] of parseOptions(profileText)) merged.set(k, v)
  if (keepBaseVersion && keepVersion !== undefined) merged.set('version', keepVersion)
  return [...merged].map(([k, v]) => `${k}:${v}`).join('\n') + '\n'
}

// ---------- Profils ----------

function profilePaths(id) {
  const dir = path.join(profilesDir(), id)
  return { dir, meta: path.join(dir, 'profile.json'), files: path.join(dir, 'files') }
}

function countEntries(dir) {
  try { return fs.readdirSync(dir).length } catch { return 0 }
}

function extraEntries(dir) {
  try { return fs.readdirSync(dir).filter((n) => !KNOWN.has(n) && !IGNORED.has(n)) } catch { return [] }
}

function profileSummary(files) {
  return {
    options: fs.existsSync(path.join(files, 'options.txt')),
    shaders: countEntries(path.join(files, 'shaderpacks')),
    resourcepacks: countEntries(path.join(files, 'resourcepacks')),
    servers: fs.existsSync(path.join(files, 'servers.dat')),
    config: countEntries(path.join(files, 'config')),
    mods: countEntries(path.join(files, 'mods')),
    extras: extraEntries(files).length
  }
}

function listProfiles() {
  return fs.readdirSync(profilesDir())
    .filter((id) => fs.existsSync(profilePaths(id).meta))
    .map((id) => {
      const p = profilePaths(id)
      return { ...readJson(p.meta), summary: profileSummary(p.files) }
    })
    .sort((a, b) => a.createdAt - b.createdAt)
}

function createProfile({ name, color, description }) {
  const id = newId()
  const p = profilePaths(id)
  fs.mkdirSync(path.join(p.files, 'shaderpacks'), { recursive: true })
  fs.mkdirSync(path.join(p.files, 'resourcepacks'), { recursive: true })
  const profile = { id, name: name || 'Nouveau profil', color: color || '#f07a1e', description: description || '', createdAt: Date.now() }
  writeJson(p.meta, profile)
  return profile
}

function updateProfile(id, changes) {
  const p = profilePaths(id)
  const profile = { ...readJson(p.meta), ...changes, id }
  writeJson(p.meta, profile)
  return profile
}

function deleteProfile(id) {
  const p = profilePaths(id)
  // Les instances qui partagent les dossiers de ce profil reçoivent une copie avant suppression.
  for (const inst of listInstances()) {
    const game = instancePaths(inst.id).game
    for (const name of ['shaderpacks', 'resourcepacks']) {
      const target = path.join(game, name)
      if (isLink(target) && fs.realpathSync(target).startsWith(fs.realpathSync(p.files))) {
        const src = fs.realpathSync(target)
        removeLink(target)
        copyRecursive(src, target)
      }
    }
    if (inst.profileId === id) writeJson(instancePaths(inst.id).meta, { ...inst, profileId: null })
  }
  fs.rmSync(p.dir, { recursive: true, force: true })
}

// ---------- Import depuis une instance existante ----------

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .map((d) => ({ name: d.name, dir: d.isDirectory() || isLink(path.join(dir, d.name)) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch { return [] }
}

function dirSize(p) {
  try {
    const st = fs.statSync(p)
    if (!st.isDirectory()) return st.size
    return fs.readdirSync(p).reduce((sum, n) => sum + dirSize(path.join(p, n)), 0)
  } catch { return 0 }
}

// Contenu importable d'un dossier de jeu, regroupé par catégorie.
// Chaque élément : { path (relatif), label, size, checked }
function scanSource(sourceDir) {
  if (!fs.existsSync(sourceDir)) throw new Error('Dossier introuvable : ' + sourceDir)
  const file = (rel, label, checked = true) => {
    const full = path.join(sourceDir, rel)
    return fs.existsSync(full) ? [{ path: rel, label, size: dirSize(full), checked }] : []
  }
  const children = (folder, checked = true) =>
    listDir(path.join(sourceDir, folder)).map((e) => ({ path: `${folder}/${e.name}`, label: e.name, size: dirSize(path.join(sourceDir, folder, e.name)), checked }))

  const groups = [
    { key: 'options', label: 'Touches et réglages', items: file('options.txt', 'options.txt (touches, FOV, son, graphismes)') },
    { key: 'shaders', label: 'Shaders', items: [...children('shaderpacks'), ...file('optionsshaders.txt', 'optionsshaders.txt (réglages des shaders)')] },
    { key: 'resourcepacks', label: 'Resource packs', items: children('resourcepacks') },
    { key: 'servers', label: 'Liste des serveurs', items: file('servers.dat', 'servers.dat') },
    { key: 'config', label: 'Configs de mods', items: children('config') },
    { key: 'mods', label: 'Mods', items: children('mods', false) },
    {
      key: 'extras',
      label: 'Autres fichiers',
      items: extraEntries(sourceDir).map((n) => ({ path: n, label: n, size: dirSize(path.join(sourceDir, n)), checked: !HEAVY.has(n) }))
    }
  ]
  return { dir: sourceDir, groups: groups.filter((g) => g.items.length) }
}

// Copie dans le profil les éléments choisis (chemins relatifs renvoyés par scanSource).
function importSelection(id, sourceDir, paths) {
  const { files } = profilePaths(id)
  const filesReal = fs.realpathSync(files)
  let count = 0
  for (const rel of paths) {
    const parts = rel.split('/')
    if (parts.some((p) => p === '..' || p === '')) continue
    const src = path.join(sourceDir, ...parts)
    const dest = path.join(files, ...parts)
    if (!fs.existsSync(src)) continue
    // Une instance liée à ce profil partage déjà ses dossiers : rien à copier.
    if (fs.realpathSync(src).startsWith(filesReal)) continue
    if (rel === 'options.txt' && fs.existsSync(dest)) {
      fs.writeFileSync(dest, mergeOptions(fs.readFileSync(dest, 'utf8'), fs.readFileSync(src, 'utf8'), false))
    } else {
      copyRecursive(src, dest)
    }
    count++
  }
  return count
}

// Instances des autres launchers installés sur ce PC.
function detectSources(appData, home) {
  const sources = []
  const add = (launcher, name, dir) => fs.existsSync(dir) && sources.push({ launcher, name, dir })
  const subdirs = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { return [] } }

  for (const inst of listInstances()) add('TerraLauncher', inst.name, instancePaths(inst.id).game)
  add('Minecraft', '.minecraft (launcher officiel)', path.join(appData, '.minecraft'))
  for (const base of [path.join(appData, 'gdlauncher_carbon', 'data', 'instances'), path.join(appData, 'gdlauncher_next', 'instances')]) {
    for (const n of subdirs(base)) {
      const game = fs.existsSync(path.join(base, n, 'instance')) ? path.join(base, n, 'instance') : path.join(base, n)
      let name = n
      try { name = readJson(path.join(base, n, 'instance.json')).name || n } catch {}
      add('GDLauncher', name, game)
    }
  }
  for (const base of [path.join(appData, 'ModrinthApp', 'profiles'), path.join(appData, 'com.modrinth.theseus', 'profiles')]) {
    for (const n of subdirs(base)) add('Modrinth', n, path.join(base, n))
  }
  const prism = path.join(appData, 'PrismLauncher', 'instances')
  for (const n of subdirs(prism)) {
    const game = [path.join(prism, n, '.minecraft'), path.join(prism, n, 'minecraft')].find((d) => fs.existsSync(d))
    if (game) add('Prism', n, game)
  }
  const cf = path.join(home, 'curseforge', 'minecraft', 'Instances')
  for (const n of subdirs(cf)) add('CurseForge', n, path.join(cf, n))
  return sources
}

function profileFilesDir(id) {
  return profilePaths(id).files
}

// ---------- Instances ----------

function instancePaths(id) {
  const dir = path.join(instancesDir(), id)
  return { dir, meta: path.join(dir, 'instance.json'), game: path.join(dir, 'minecraft') }
}

function listInstances() {
  return fs.readdirSync(instancesDir())
    .filter((id) => fs.existsSync(instancePaths(id).meta))
    .map((id) => readJson(instancePaths(id).meta))
}

// Applique un profil sur le dossier de jeu d'une instance.
function applyProfile(instanceId, profileId, items) {
  const files = profilePaths(profileId).files
  const game = instancePaths(instanceId).game
  const applied = []
  for (const key of items) {
    const item = ITEMS[key]
    if (!item) continue
    const entries = key === 'extras' ? extraEntries(files).map((name) => ({ name, mode: 'copy' })) : item.entries
    for (const entry of entries) {
      const src = path.join(files, entry.name)
      const dest = path.join(game, entry.name)
      if (entry.mode === 'link') {
        fs.mkdirSync(src, { recursive: true })
        if (fs.existsSync(dest) || isLink(dest)) {
          if (isLink(dest)) removeLink(dest)
          else {
            // Fichiers déjà présents dans l'instance : on les verse dans le profil avant de partager.
            copyRecursive(dest, src)
            fs.rmSync(dest, { recursive: true, force: true })
          }
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.symlinkSync(src, dest, 'junction')
      } else if (!fs.existsSync(src)) {
        continue
      } else if (entry.mode === 'merge') {
        const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : ''
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, mergeOptions(current, fs.readFileSync(src, 'utf8')))
      } else {
        copyRecursive(src, dest)
      }
    }
    applied.push(key)
  }
  return applied
}

function createInstance({ name, version, loader, banner, profileId, items }) {
  const id = newId()
  const p = instancePaths(id)
  fs.mkdirSync(p.game, { recursive: true })
  const instance = {
    id,
    name: name || 'Nouvelle instance',
    version,
    loader: loader || 'vanilla',
    banner: banner ?? Math.floor(Math.random() * 4),
    profileId: profileId || null,
    imported: [],
    createdAt: Date.now(),
    lastPlayed: null
  }
  if (profileId) instance.imported = applyProfile(id, profileId, items || Object.keys(ITEMS))
  writeJson(p.meta, instance)
  return instance
}

function updateInstance(id, changes) {
  const p = instancePaths(id)
  const instance = { ...readJson(p.meta), ...changes, id }
  writeJson(p.meta, instance)
  return instance
}

function reapplyProfile(id, profileId, items) {
  const imported = applyProfile(id, profileId, items)
  return updateInstance(id, { profileId, imported })
}

// Renvoie les touches/réglages de l'instance vers son profil.
function saveOptionsToProfile(id) {
  const inst = readJson(instancePaths(id).meta)
  if (!inst.profileId) throw new Error("Cette instance n'est liée à aucun profil.")
  const src = path.join(instancePaths(id).game, 'options.txt')
  if (!fs.existsSync(src)) throw new Error("L'instance n'a pas encore de options.txt (lance-la une fois).")
  const dest = path.join(profilePaths(inst.profileId).files, 'options.txt')
  const current = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : ''
  fs.writeFileSync(dest, mergeOptions(current, fs.readFileSync(src, 'utf8')))
  return true
}

function deleteInstance(id) {
  const p = instancePaths(id)
  for (const name of ['shaderpacks', 'resourcepacks']) {
    const target = path.join(p.game, name)
    if (isLink(target)) removeLink(target)
  }
  fs.rmSync(p.dir, { recursive: true, force: true })
}

function setInstanceBanner(id, imagePath) {
  const p = instancePaths(id)
  const dest = path.join(p.dir, 'banner' + path.extname(imagePath).toLowerCase())
  for (const f of fs.readdirSync(p.dir)) if (f.startsWith('banner.')) fs.rmSync(path.join(p.dir, f))
  fs.copyFileSync(imagePath, dest)
  return updateInstance(id, { bannerFile: path.basename(dest), bannerRev: Date.now() })
}

function instanceDir(id) {
  return instancePaths(id).dir
}

function gameDir(id) {
  return instancePaths(id).game
}

// ---------- Contenu d'une instance (page détail) ----------

const FOLDERS = { mods: 'mods', resourcepacks: 'resourcepacks', shaderpacks: 'shaderpacks', screenshots: 'screenshots' }
const modMetaCache = new Map()

// Nom et version lus dans le .jar (Fabric, Quilt, Forge/NeoForge)
function readModMeta(file) {
  const st = fs.statSync(file)
  const key = `${file}:${st.mtimeMs}`
  if (modMetaCache.has(key)) return modMetaCache.get(key)
  let meta = {}
  try {
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(file)
    const fabric = zip.getEntry('fabric.mod.json') || zip.getEntry('quilt.mod.json')
    if (fabric) {
      const j = JSON.parse(zip.readAsText(fabric).replace(/^﻿/, ''))
      const q = j.quilt_loader?.metadata
      meta = { name: j.name || q?.name || j.id || j.quilt_loader?.id, version: j.version || j.quilt_loader?.version, description: j.description || q?.description }
    } else {
      const toml = zip.getEntry('META-INF/neoforge.mods.toml') || zip.getEntry('META-INF/mods.toml')
      if (toml) {
        const t = zip.readAsText(toml)
        const pick = (k) => t.match(new RegExp(`^\\s*${k}\\s*=\\s*["']([^"']+)["']`, 'm'))?.[1]
        meta = { name: pick('displayName') || pick('modId'), version: pick('version'), description: pick('description') }
        if (meta.version?.includes('${')) meta.version = null
      }
    }
  } catch {}
  modMetaCache.set(key, meta)
  return meta
}

function listInstanceFolder(id, folder) {
  if (!FOLDERS[folder]) throw new Error('Dossier inconnu')
  const dir = path.join(instancePaths(id).game, FOLDERS[folder])
  let names = []
  try { names = fs.readdirSync(dir) } catch { return [] }
  return names
    .filter((n) => (folder === 'screenshots' ? /\.(png|jpe?g)$/i.test(n) : folder === 'mods' ? /\.jar(\.disabled)?$/i.test(n) : true))
    .map((n) => {
      const full = path.join(dir, n)
      const st = fs.statSync(full)
      const entry = { name: n, size: st.isDirectory() ? 0 : st.size, mtime: st.mtimeMs, enabled: !n.endsWith('.disabled') }
      if (folder === 'mods') {
        const meta = readModMeta(full)
        Object.assign(entry, { title: meta.name || null, version: meta.version || null, description: meta.description || null })
      }
      return entry
    })
    .sort((a, b) => (folder === 'screenshots' ? b.mtime - a.mtime : (a.name || '').localeCompare(b.name || '')))
}

function folderPath(id, folder, name) {
  if (!FOLDERS[folder] || name.includes('/') || name.includes('\\') || name.startsWith('..')) throw new Error('Nom de fichier refusé')
  return path.join(instancePaths(id).game, FOLDERS[folder], name)
}

// Active ou désactive un mod (ajoute ou retire « .disabled »)
function toggleMod(id, name) {
  const from = folderPath(id, 'mods', name)
  const to = name.endsWith('.disabled') ? from.slice(0, -'.disabled'.length) : `${from}.disabled`
  fs.renameSync(from, to)
  return path.basename(to)
}

// Copie complète d'une instance ; les dossiers partagés avec un profil restent partagés
function duplicateInstance(id, name) {
  const src = instancePaths(id)
  const inst = readJson(src.meta)
  const copy = { ...inst, id: newId(), name: name || `${inst.name} (copie)`, createdAt: Date.now(), lastPlayed: null, playTime: 0 }
  const dest = instancePaths(copy.id)
  fs.mkdirSync(dest.game, { recursive: true })
  for (const entry of fs.readdirSync(src.game)) {
    const from = path.join(src.game, entry)
    const to = path.join(dest.game, entry)
    if (isLink(from)) fs.symlinkSync(fs.realpathSync(from), to, 'junction')
    else copyRecursive(from, to)
  }
  for (const f of fs.readdirSync(src.dir)) if (f.startsWith('banner.')) fs.copyFileSync(path.join(src.dir, f), path.join(dest.dir, f))
  writeJson(dest.meta, copy)
  return copy
}

// Archive .zip de l'instance (fichiers de jeu, dossiers partagés inclus)
function exportInstance(id, zipPath) {
  const AdmZip = require('adm-zip')
  const p = instancePaths(id)
  const inst = readJson(p.meta)
  const zip = new AdmZip()
  zip.addFile('terralauncher-instance.json', Buffer.from(JSON.stringify({ name: inst.name, version: inst.version, loader: inst.loader, loaderVersion: inst.loaderVersion || null }, null, 2)))
  const skip = new Set(['logs', 'crash-reports', 'natives'])
  for (const entry of fs.readdirSync(p.game)) {
    if (skip.has(entry)) continue
    const full = fs.realpathSync(path.join(p.game, entry))
    if (fs.statSync(full).isDirectory()) zip.addLocalFolder(full, `minecraft/${entry}`)
    else zip.addLocalFile(full, 'minecraft')
  }
  zip.writeZip(zipPath)
  return zipPath
}

const itemList = () => Object.entries(ITEMS).map(([key, v]) => ({ key, label: v.label }))

module.exports = {
  init, itemList, mergeOptions,
  listProfiles, createProfile, updateProfile, deleteProfile, profileFilesDir, scanSource, importSelection, detectSources,
  listInstances, createInstance, updateInstance, deleteInstance, reapplyProfile, saveOptionsToProfile,
  setInstanceBanner, instanceDir, gameDir,
  listInstanceFolder, folderPath, toggleMod, duplicateInstance, exportInstance
}
