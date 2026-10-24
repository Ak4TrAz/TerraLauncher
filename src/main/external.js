// Instances des autres launchers (GDLauncher, Modrinth, CurseForge, Prism/MultiMC),
// lues depuis leurs propres fichiers puis copiées dans la bibliothèque.
const fs = require('fs')
const path = require('path')
const store = require('./store')
const downloads = require('./downloads')
const { checkVersion } = require('./paths')

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null } }
const subdirs = (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { return [] } }
const existing = (...files) => files.find((f) => f && fs.existsSync(f)) || null

function normLoader(name) {
  const n = String(name || '').toLowerCase().replace(/[^a-z]/g, '')
  if (n.includes('neoforge') || n === 'neoforged') return 'neoforge'
  if (n.includes('quilt')) return 'quilt'
  if (n.includes('fabric')) return 'fabric'
  if (n.includes('forge')) return 'forge'
  return 'vanilla'
}

// Dernier recours quand un launcher ne dit rien : « Fabric 1.20.1 » dans le nom du dossier
function guess(name) {
  const version = String(name).match(/\b(1\.\d+(?:\.\d+)?|2\d\.\d+(?:\.\d+)?)\b/)?.[1] || null
  return { version, loader: normLoader(name) }
}

// ---------- GDLauncher ----------
function gdlauncher(appData) {
  const found = []
  const carbon = path.join(appData, 'gdlauncher_carbon', 'data', 'instances')
  for (const n of subdirs(carbon)) {
    const meta = readJson(path.join(carbon, n, 'instance.json'))
    const game = path.join(carbon, n, 'instance')
    if (!meta || !fs.existsSync(game)) continue
    const v = meta.game_configuration?.version || {}
    const ml = v.modloaders?.[0]
    found.push({
      launcher: 'GDLauncher', name: meta.name || n, dir: game,
      version: v.release || null, loader: normLoader(ml?.type), loaderVersion: ml?.version || null,
      icon: typeof meta.icon === 'string' ? existing(path.join(carbon, n, meta.icon)) : null,
      playTime: (meta.seconds_played || 0) * 1000
    })
  }
  const legacy = path.join(appData, 'gdlauncher_next', 'instances')
  for (const n of subdirs(legacy)) {
    const loader = readJson(path.join(legacy, n, 'config.json'))?.loader || {}
    found.push({
      launcher: 'GDLauncher', name: n, dir: path.join(legacy, n),
      version: loader.mcVersion || null, loader: normLoader(loader.loaderType), loaderVersion: loader.loaderVersion || null
    })
  }
  return found
}

// ---------- Modrinth (base SQLite app.db) ----------
let sqlPromise = null
async function readModrinthDb(dbFile) {
  if (!fs.existsSync(dbFile)) return []
  sqlPromise ||= require('sql.js')()
  const SQL = await sqlPromise
  const db = new SQL.Database(fs.readFileSync(dbFile))
  const rows = (sql) => {
    try {
      const r = db.exec(sql)[0]
      return r ? r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) : []
    } catch { return [] }
  }
  try {
    // Schéma récent : instances + instance_content_sets ; ancien : profiles
    const recent = rows(`SELECT i.path, i.name, i.icon_path, i.submitted_time_played AS played, c.game_version, c.loader, c.loader_version
      FROM instances i LEFT JOIN instance_content_sets c ON c.id = i.applied_content_set_id`)
    if (recent.length) return recent
    return rows('SELECT path, name, icon_path, game_version, mod_loader AS loader, mod_loader_version AS loader_version FROM profiles')
  } finally {
    db.close()
  }
}

async function modrinth(appData) {
  const found = []
  for (const base of [path.join(appData, 'ModrinthApp'), path.join(appData, 'com.modrinth.theseus')]) {
    const profiles = path.join(base, 'profiles')
    const known = new Map()
    try {
      for (const r of await readModrinthDb(path.join(base, 'app.db'))) known.set(String(r.path).toLowerCase(), r)
    } catch {}
    for (const n of subdirs(profiles)) {
      const r = known.get(n.toLowerCase())
      const g = guess(n)
      found.push({
        launcher: 'Modrinth', name: r?.name || n, dir: path.join(profiles, n),
        version: r?.game_version || g.version,
        loader: r ? normLoader(r.loader) : g.loader,
        loaderVersion: r?.loader_version || null,
        icon: r?.icon_path ? existing(r.icon_path) : null,
        playTime: (r?.played || 0) * 1000
      })
    }
  }
  return found
}

// ---------- CurseForge ----------
function curseforge(home) {
  const found = []
  for (const base of [path.join(home, 'curseforge', 'minecraft', 'Instances'), path.join(home, 'Documents', 'curseforge', 'minecraft', 'Instances')]) {
    for (const n of subdirs(base)) {
      const meta = readJson(path.join(base, n, 'minecraftinstance.json'))
      if (!meta) continue
      // baseModLoader.name : « forge-47.2.0 », « neoforge-21.1.77 », « fabric-0.15.7-1.20.1 »
      const m = String(meta.baseModLoader?.name || '').match(/^([a-z]+)-(.+)$/i)
      const version = meta.gameVersion || meta.baseModLoader?.minecraftVersion || null
      found.push({
        launcher: 'CurseForge', name: meta.name || n, dir: path.join(base, n),
        version,
        loader: m ? normLoader(m[1]) : 'vanilla',
        loaderVersion: m ? m[2].replace(new RegExp(`-${String(version).replace(/\./g, '\\.')}$`), '') : null,
        icon: existing(path.join(base, n, 'profileImage.png'))
      })
    }
  }
  return found
}

// ---------- Prism Launcher / MultiMC ----------
const PRISM_LOADERS = { 'net.fabricmc.fabric-loader': 'fabric', 'org.quiltmc.quilt-loader': 'quilt', 'net.minecraftforge': 'forge', 'net.neoforged': 'neoforge' }
function prism(appData) {
  const found = []
  for (const base of [path.join(appData, 'PrismLauncher', 'instances'), path.join(appData, 'MultiMC', 'instances')]) {
    for (const n of subdirs(base)) {
      const game = existing(path.join(base, n, '.minecraft'), path.join(base, n, 'minecraft'))
      if (!game) continue
      const components = readJson(path.join(base, n, 'mmc-pack.json'))?.components || []
      const cfg = fs.existsSync(path.join(base, n, 'instance.cfg')) ? fs.readFileSync(path.join(base, n, 'instance.cfg'), 'utf8') : ''
      const loader = components.find((c) => PRISM_LOADERS[c.uid])
      found.push({
        launcher: 'Prism', name: cfg.match(/^name=(.*)$/m)?.[1]?.trim() || n, dir: game,
        version: components.find((c) => c.uid === 'net.minecraft')?.version || null,
        loader: loader ? PRISM_LOADERS[loader.uid] : 'vanilla',
        loaderVersion: loader?.version || null
      })
    }
  }
  return found
}

async function scan(appData, home) {
  const imported = new Set(store.listInstances().map((i) => i.importedFrom?.toLowerCase()).filter(Boolean))
  const all = [...gdlauncher(appData), ...(await modrinth(appData)), ...curseforge(home), ...prism(appData)]
  return all.map((x) => ({ ...x, imported: imported.has(x.dir.toLowerCase()) }))
}

// Fichiers propres au launcher d'origine ou régénérés par le jeu : jamais copiés
const SKIP = new Set(['logs', 'crash-reports', 'natives', 'libraries', 'assets', 'versions', '.fabric', '.mixin.out', '.cache', 'downloads',
  'instance.json', 'minecraftinstance.json', 'mmc-pack.json', 'instance.cfg', 'profile.json', 'launcher_profiles.json', 'profileImage.png'])

async function listFiles(dir, rel = '', top = true) {
  const out = []
  let entries = []
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (top && SKIP.has(e.name)) continue
    const full = path.join(dir, e.name)
    let stat
    try { stat = await fs.promises.stat(full) } catch { continue } // lien cassé
    if (stat.isDirectory()) out.push(...(await listFiles(full, path.join(rel, e.name), false)))
    else out.push({ full, rel: path.join(rel, e.name), size: stat.size })
  }
  return out
}

// Copie une instance d'un autre launcher ; la copie continue en arrière-plan (suivie dans les téléchargements)
function importInstance({ launcher, name, dir, version, loader, loaderVersion, icon, playTime }, notifyInstances) {
  if (!fs.existsSync(dir)) throw new Error('Ce dossier n’existe plus.')
  if (!version) throw new Error('Choisis la version de Minecraft de cette instance.')
  checkVersion(version, 'Version de Minecraft')
  if (loaderVersion) checkVersion(loaderVersion, 'Version du chargeur')
  const inst = store.createInstance({ name, version, loader, banner: 5 })
  store.updateInstance(inst.id, { installing: true, importedFrom: dir, loaderVersion: loaderVersion || undefined, playTime: playTime || 0 })
  if (icon) try { store.setInstanceImage(inst.id, 'logo', icon) } catch {}
  const game = store.gameDir(inst.id)

  downloads.start(name, `Import depuis ${launcher}…`, async (task) => {
    try {
      const files = await listFiles(dir)
      task.total = files.reduce((n, f) => n + f.size, 0)
      for (const f of files) {
        const dest = path.join(game, f.rel)
        await fs.promises.mkdir(path.dirname(dest), { recursive: true })
        await fs.promises.copyFile(f.full, dest)
        task.received += f.size
        downloads.notify()
      }
      store.updateInstance(inst.id, { installing: false, installError: null })
      task.detail = `${files.length} fichiers importés depuis ${launcher}`
      require('./launcher').prepareInBackground(inst.id)
    } catch (err) {
      store.updateInstance(inst.id, { installing: false, installError: err.message })
      throw err
    } finally {
      notifyInstances()
    }
  })
  return store.listInstances().find((i) => i.id === inst.id)
}

module.exports = { scan, importInstance, normLoader, guess }
