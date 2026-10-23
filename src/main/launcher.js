// Préparation et lancement du jeu : Java, version, loader, librairies, ressources, puis démarrage.
// Installation des loaders et des dépendances via @xmcl/installer, lancement via @xmcl/core.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile, spawn } = require('child_process')
const core = require('@xmcl/core')
const installer = require('@xmcl/installer')
const store = require('./store')
const downloads = require('./downloads')

const UA = { 'User-Agent': 'TerraLauncher/0.1.0' }
const VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const JAVA_RUNTIMES = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'
const JAVA_PLATFORM = process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64'

let root = null
let notifyStatus = () => {}
const running = new Map() // instanceId -> { process, startedAt }

function init(dataRoot, onStatus) {
  root = dataRoot
  notifyStatus = onStatus
}

async function getJson(url) {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`Erreur ${res.status} sur ${url}`)
  return res.json()
}

// Exécute une tâche @xmcl en reportant sa progression dans notre tâche de téléchargement
async function runXmcl(task, xmclTask) {
  const baseReceived = task.received
  const baseTotal = task.total
  return xmclTask.startAndWait({
    onUpdate() {
      task.received = baseReceived + xmclTask.progress
      task.total = baseTotal + xmclTask.total
      downloads.notify()
    }
  })
}

async function runXmclSafe(task, t) {
  try { return await runXmcl(task, t) } catch (err) { throw new Error(describe(err)) }
}

// Message lisible pour les erreurs groupées de @xmcl (plusieurs téléchargements en échec)
function describe(err) {
  if (err?.errors?.length) return `${err.errors.length} fichier(s) en échec, ex. : ${describe(err.errors[0])}`
  return err?.message || String(err)
}

// Les processus Java lancés par l'installeur Forge restent sans fenêtre de console
const hiddenSpawn = (cmd, args, opts) => spawn(cmd, args, { ...opts, windowsHide: true })

// ---------- Java ----------

function javaPaths(component) {
  const dir = path.join(root, 'runtime', component)
  return { dir, javaw: path.join(dir, 'bin', 'javaw.exe'), java: path.join(dir, 'bin', 'java.exe'), marker: path.join(dir, '.terralauncher-ok') }
}

// Installe le Java fourni par Mojang pour cette version (ex. java-runtime-delta = Java 21)
async function ensureJava(task, component) {
  const p = javaPaths(component)
  if (fs.existsSync(p.marker) && fs.existsSync(p.javaw)) return p
  task.detail = `Installation de Java (${component})…`
  downloads.notify(true)
  const all = await getJson(JAVA_RUNTIMES)
  const target = all[JAVA_PLATFORM]?.[component]?.[0]
  if (!target) throw new Error(`Java « ${component} » indisponible pour ${JAVA_PLATFORM}.`)
  const manifest = await getJson(target.manifest.url)
  const files = []
  for (const [name, entry] of Object.entries(manifest.files)) {
    const dest = path.join(p.dir, ...name.split('/'))
    if (entry.type === 'directory') fs.mkdirSync(dest, { recursive: true })
    else if (entry.type === 'file') files.push({ url: entry.downloads.raw.url, dest, sha1: entry.downloads.raw.sha1, size: entry.downloads.raw.size })
  }
  const failed = await downloads.downloadFiles(task, files, 8)
  if (failed.length) throw new Error(`Java : ${failed.length} fichier(s) en échec.`)
  fs.writeFileSync(p.marker, target.version.name)
  return p
}

// ---------- Version de base ----------

async function ensureVanilla(task, version) {
  const dir = path.join(root, 'versions', version)
  const jsonPath = path.join(dir, `${version}.json`)
  let json
  if (fs.existsSync(jsonPath)) json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  else {
    const entry = (await getJson(VERSION_MANIFEST)).versions.find((v) => v.id === version)
    if (!entry) throw new Error(`Version de Minecraft « ${version} » introuvable.`)
    json = await getJson(entry.url)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(jsonPath, JSON.stringify(json))
  }
  const client = json.downloads.client
  task.detail = `Minecraft ${version}`
  const failed = await downloads.downloadFiles(task, [{ url: client.url, dest: path.join(dir, `${version}.jar`), sha1: client.sha1, size: client.size }])
  if (failed.length) throw new Error(`Client du jeu : ${failed[0].error}`)
  return json
}

// ---------- Loaders ----------

async function latestFabricLike(meta, mc) {
  const list = await getJson(`${meta}/versions/loader/${encodeURIComponent(mc)}`)
  if (!list.length) throw new Error(`Aucun loader disponible pour Minecraft ${mc}.`)
  return (list.find((x) => x.loader.stable !== false) || list[0]).loader.version
}

async function latestForge(mc) {
  const promos = (await getJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')).promos
  const v = promos[`${mc}-recommended`] || promos[`${mc}-latest`]
  if (!v) throw new Error(`Forge n’existe pas pour Minecraft ${mc}.`)
  return v
}

async function latestNeoForge(mc) {
  const { versions } = await getJson('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge')
  const [a, b, c] = mc.split('.')
  // 1.21.1 -> 21.1.x ; 1.21 -> 21.0.x ; 26.1 -> 26.1.x (nouvelle numérotation)
  const prefix = a === '1' ? `${b}.${c || 0}.` : `${mc}.`
  const match = versions.filter((v) => v.startsWith(prefix))
  const stable = match.filter((v) => !/beta|alpha/i.test(v))
  const pick = (stable.length ? stable : match).pop()
  if (!pick) throw new Error(`NeoForge n’existe pas pour Minecraft ${mc}.`)
  return pick
}

// Installe le loader et renvoie l'identifiant de version à lancer
async function ensureLoader(task, inst, javaExe) {
  const mc = inst.version
  let loaderVersion = inst.loaderVersion
  const forgeOptions = { java: javaExe, spawn: hiddenSpawn }

  switch (inst.loader) {
    case 'fabric': {
      loaderVersion ||= await latestFabricLike('https://meta.fabricmc.net/v2', mc)
      task.detail = `Fabric ${loaderVersion}`
      downloads.notify(true)
      return { id: await installer.installFabric({ minecraftVersion: mc, version: loaderVersion, minecraft: root }), loaderVersion }
    }
    case 'quilt': {
      loaderVersion ||= await latestFabricLike('https://meta.quiltmc.org/v3', mc)
      task.detail = `Quilt ${loaderVersion}`
      downloads.notify(true)
      return { id: await installer.installQuiltVersion({ minecraftVersion: mc, version: loaderVersion, minecraft: root }), loaderVersion }
    }
    case 'forge': {
      loaderVersion ||= await latestForge(mc)
      task.detail = `Forge ${loaderVersion} (peut prendre une minute)`
      downloads.notify(true)
      return { id: await runXmclSafe(task, installer.installForgeTask({ mcversion: mc, version: loaderVersion }, root, forgeOptions)), loaderVersion }
    }
    case 'neoforge': {
      loaderVersion ||= await latestNeoForge(mc)
      task.detail = `NeoForge ${loaderVersion} (peut prendre une minute)`
      downloads.notify(true)
      return { id: await runXmclSafe(task, installer.installNeoForgedTask('neoforge', loaderVersion, root, forgeOptions)), loaderVersion }
    }
    default:
      return { id: mc, loaderVersion: null }
  }
}

// ---------- Librairies et ressources ----------

const RESOURCES = 'https://resources.download.minecraft.net'

// Télécharge librairies, index et objets de ressources, et config de logs de la version résolue
async function ensureDependencies(task, resolved) {
  const libs = resolved.libraries
    .filter((l) => l.download?.url)
    .map((l) => ({ url: l.download.url, dest: path.join(root, 'libraries', ...l.download.path.split('/')), sha1: l.download.sha1 || undefined, size: l.download.size > 0 ? l.download.size : 0 }))
  task.detail = `Librairies (${libs.length})`
  downloads.notify(true)
  let failed = await downloads.downloadFiles(task, libs, 8)
  if (failed.length) throw new Error(`Librairies : ${failed.length} fichier(s) en échec (${failed[0].error})`)

  const idx = resolved.assetIndex
  const indexPath = path.join(root, 'assets', 'indexes', `${idx.id}.json`)
  failed = await downloads.downloadFiles(task, [{ url: idx.url, dest: indexPath, sha1: idx.sha1, size: idx.size }])
  if (failed.length) throw new Error(`Index des ressources : ${failed[0].error}`)

  const logging = resolved.logging?.client?.file
  if (logging?.url) await downloads.downloadFiles(task, [{ url: logging.url, dest: path.join(root, 'assets', 'log_configs', logging.id), sha1: logging.sha1, size: logging.size }])

  const objects = JSON.parse(fs.readFileSync(indexPath, 'utf8')).objects || {}
  const seen = new Set()
  const assets = []
  for (const { hash, size } of Object.values(objects)) {
    if (seen.has(hash)) continue
    seen.add(hash)
    assets.push({ url: `${RESOURCES}/${hash.slice(0, 2)}/${hash}`, dest: path.join(root, 'assets', 'objects', hash.slice(0, 2), hash), sha1: hash, size })
  }
  task.detail = `Ressources du jeu (${assets.length} fichiers)`
  downloads.notify(true)
  failed = await downloads.downloadFiles(task, assets, 12)
  if (failed.length) throw new Error(`Ressources : ${failed.length} fichier(s) en échec (${failed[0].error})`)
}

// ---------- Préparation complète ----------

// Installe tout ce qu'il faut pour lancer l'instance. force = tout revérifier (« Réparer »).
async function prepare(instanceId, { force = false } = {}) {
  const inst = store.listInstances().find((i) => i.id === instanceId)
  if (!inst) throw new Error('Instance introuvable.')
  if (inst.installing) throw new Error('Le modpack est encore en cours d’installation.')

  const task = downloads.begin(`Préparation de « ${inst.name} »`, 'Vérification…')
  try {
    const vanilla = await ensureVanilla(task, inst.version)
    const component = vanilla.javaVersion?.component || 'jre-legacy'
    const java = await ensureJava(task, component)

    let versionId = inst.preparedVersion
    const jsonOk = versionId && fs.existsSync(path.join(root, 'versions', versionId, `${versionId}.json`))
    if (force || !jsonOk) {
      const loader = await ensureLoader(task, inst, java.java)
      versionId = loader.id
      store.updateInstance(inst.id, { loaderVersion: loader.loaderVersion })
    }

    if (force || inst.preparedVersion !== versionId) {
      const resolved = await core.Version.parse(root, versionId)
      await ensureDependencies(task, resolved)
      store.updateInstance(inst.id, { preparedVersion: versionId, javaComponent: component })
    }

    task.status = 'done'
    task.detail = 'Prêt à jouer'
    task.received = task.total
    downloads.notify(true)
    return { versionId, java }
  } catch (err) {
    task.status = 'error'
    task.error = err.message
    downloads.notify(true)
    throw err
  }
}

// ---------- Carte graphique ----------

// Demande à Windows d'utiliser la carte graphique haute performance (NVIDIA/AMD dédiée) pour ce programme.
function forceHighPerformanceGpu(exe) {
  return new Promise((resolve) => {
    execFile('reg', ['add', 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences', '/v', exe, '/t', 'REG_SZ', '/d', 'GpuPreference=2;', '/f'], { windowsHide: true }, () => resolve())
  })
}

// ---------- Lancement ----------

function isRunning(instanceId) {
  return running.has(instanceId)
}

// Minecraft 1.20+ utilise « Quick Play », les versions plus anciennes --server/--port
function joinOptions(version, address) {
  if (!address) return {}
  const [host, port] = address.trim().split(':')
  const [a, b] = version.split('.').map(Number)
  const modern = a > 1 || b >= 20
  return modern ? { quickPlayMultiplayer: port ? `${host}:${port}` : host } : { server: { ip: host, port: port ? Number(port) : undefined } }
}

async function launch(instanceId, session, options, { join } = {}) {
  if (running.has(instanceId)) throw new Error('Cette instance est déjà en cours d’exécution.')
  notifyStatus({ instanceId, state: 'preparing' })
  try {
    const { versionId, java } = await prepare(instanceId)
    const inst = store.listInstances().find((i) => i.id === instanceId)
    const game = store.gameDir(instanceId)

    // Chemins réels : si le dossier est redirigé (ex. application empaquetée), Fabric ne reconnaît
    // plus ses propres jars et plante (« trying to load FabricLoaderImpl from target class loader »)
    const real = (p) => { try { return fs.realpathSync.native(p) } catch { return p } }

    // Windows associe la préférence GPU au chemin exact de l'exécutable lancé
    if (options.gpu !== false) {
      for (const exe of new Set([java.javaw, java.java, real(java.javaw), real(java.java)])) await forceHighPerformanceGpu(exe)
    }

    const maxMemory = Math.max(1024, Number(inst.memory || options.memory || 4096))
    // Les arguments par défaut de @xmcl contiennent -Xmx2G, qui écraserait la RAM choisie
    const extraJVMArgs = [...core.DEFAULT_EXTRA_JVM_ARGS.filter((a) => !/^-Xm[sx]/.test(a)), ...(options.jvmArgs || '').split(/\s+/).filter(Boolean)]

    const proc = await core.launch({
      gamePath: real(game),
      resourcePath: real(root),
      javaPath: real(java.javaw),
      version: versionId,
      gameProfile: { name: session.name, id: session.uuid },
      accessToken: session.accessToken,
      userType: 'mojang',
      launcherName: 'TerraLauncher',
      launcherBrand: 'TerraLauncher',
      maxMemory,
      minMemory: Math.min(1024, maxMemory),
      extraJVMArgs,
      ...(join ? joinOptions(inst.version, options.serverAddress) : {})
    })

    // Journal du launcher dans le dossier de l'instance
    fs.mkdirSync(path.join(game, 'logs'), { recursive: true })
    const log = fs.createWriteStream(path.join(game, 'logs', 'terralauncher-latest.log'))
    const tail = []
    const capture = (chunk) => {
      log.write(chunk)
      tail.push(...chunk.toString().split(/\r?\n/))
      if (tail.length > 80) tail.splice(0, tail.length - 80)
    }
    proc.stdout?.on('data', capture)
    proc.stderr?.on('data', capture)

    const startedAt = Date.now()
    running.set(instanceId, { process: proc, startedAt })
    store.updateInstance(instanceId, { lastPlayed: startedAt })
    notifyStatus({ instanceId, state: 'starting' })

    const watcher = core.createMinecraftProcessWatcher(proc)
    watcher.on('minecraft-window-ready', () => notifyStatus({ instanceId, state: 'running' }))
    watcher.on('minecraft-exit', ({ code, crashReport, crashReportLocation }) => {
      log.end()
      running.delete(instanceId)
      const current = store.listInstances().find((i) => i.id === instanceId)
      store.updateInstance(instanceId, { playTime: (current?.playTime || 0) + (Date.now() - startedAt) })
      const crashed = code !== 0 && code !== null
      notifyStatus({
        instanceId,
        state: crashed ? 'crashed' : 'stopped',
        code,
        crashReport: crashed ? (crashReport || tail.slice(-25).join('\n')).slice(-4000) : null,
        crashReportLocation: crashReportLocation || null
      })
    })
    watcher.on('error', (err) => notifyStatus({ instanceId, state: 'crashed', crashReport: String(err?.message || err) }))
    return true
  } catch (err) {
    notifyStatus({ instanceId, state: 'stopped' })
    throw err
  }
}

function stop(instanceId) {
  running.get(instanceId)?.process.kill()
}

const totalMemoryMb = () => Math.round(os.totalmem() / 1024 / 1024)

module.exports = { init, prepare, launch, stop, isRunning, totalMemoryMb }
