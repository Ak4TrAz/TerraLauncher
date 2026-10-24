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
const { insideDir, isVersion, checkVersion, checkComponent } = require('./paths')

const UA = { 'User-Agent': 'TerraLauncher/0.1.0' }
const VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const JAVA_RUNTIMES = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'
const JAVA_PLATFORM = process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64'

let root = null
let notifyStatus = () => {}
let notifyLog = () => {}
const running = new Map() // instanceId -> { process, startedAt }

function init(dataRoot, onStatus, onLog) {
  root = dataRoot
  notifyStatus = onStatus
  if (onLog) notifyLog = onLog
}

// ---------- Journal du jeu ----------
// Minecraft écrit ses messages sur la sortie standard au format XML de log4j ;
// on les découpe en lignes { t, level, logger, text } pour l'onglet Journal.

const LOG_MAX = 5000
const logs = new Map() // instanceId -> lignes de la dernière partie lancée depuis l'ouverture du launcher

const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const attr = (head, name) => head.match(new RegExp(`${name}="([^"]*)"`))?.[1]
const cdata = (body, tagName) => {
  const m = body.match(new RegExp(`<log4j:${tagName}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</log4j:${tagName}>`))
  return m ? m[1] : null
}

function logParser() {
  let buffer = ''
  const plain = (text) => text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim()).map((l) => ({ t: Date.now(), level: /\b(ERROR|FATAL|Exception|at [\w$.]+\()/.test(l) ? 'ERROR' : /\bWARN/.test(l) ? 'WARN' : 'INFO', logger: null, text: l }))
  // Renvoie les lignes complètes ; garde la fin incomplète pour le morceau suivant
  return (chunk, flush = false) => {
    buffer += chunk
    const out = []
    for (;;) {
      const start = buffer.indexOf('<log4j:Event')
      if (start < 0) {
        const cut = flush ? buffer.length : buffer.lastIndexOf('\n') + 1
        out.push(...plain(buffer.slice(0, cut)))
        buffer = buffer.slice(cut)
        break
      }
      if (start > 0) out.push(...plain(buffer.slice(0, start)))
      const end = buffer.indexOf('</log4j:Event>', start)
      if (end < 0) { buffer = buffer.slice(start); break }
      const block = buffer.slice(start, end)
      buffer = buffer.slice(end + '</log4j:Event>'.length)
      const head = block.slice(0, block.indexOf('>'))
      const message = cdata(block, 'Message') ?? ''
      const throwable = cdata(block, 'Throwable')
      const text = unxml([message, throwable].filter(Boolean).join('\n')).replace(/\r\n?/g, '\n').trimEnd()
      out.push({ t: Number(attr(head, 'timestamp')) || Date.now(), level: attr(head, 'level') || 'INFO', logger: attr(head, 'logger') || null, thread: attr(head, 'thread') || null, text })
    }
    return out
  }
}

// Lignes de la partie en cours ou de la dernière ; sinon relues dans le fichier du launcher
function readLog(instanceId) {
  if (logs.has(instanceId)) return { running: running.has(instanceId), lines: logs.get(instanceId) }
  const file = path.join(store.gameDir(instanceId), 'logs', 'terralauncher-latest.log')
  if (!fs.existsSync(file)) return { running: false, lines: [] }
  const lines = logParser()(fs.readFileSync(file, 'utf8'), true)
  return { running: false, lines: lines.slice(-LOG_MAX), fromFile: true }
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
  const dir = insideDir(path.join(root, 'runtime'), checkComponent(component))
  return { dir, javaw: path.join(dir, 'bin', 'javaw.exe'), java: path.join(dir, 'bin', 'java.exe'), marker: path.join(dir, '.terralauncher-ok') }
}

// Fichiers du Java fourni par Mojang pour cette version (ex. java-runtime-delta = Java 21).
// Renvoie { files, version } ; files est vide si ce Java est déjà installé.
async function javaFiles(component) {
  const p = javaPaths(component)
  if (fs.existsSync(p.marker) && fs.existsSync(p.javaw)) return { files: [], version: null }
  const all = await getJson(JAVA_RUNTIMES)
  const target = all[JAVA_PLATFORM]?.[component]?.[0]
  if (!target) throw new Error(`Java « ${component} » indisponible pour ${JAVA_PLATFORM}.`)
  const manifest = await getJson(target.manifest.url)
  const files = []
  for (const [name, entry] of Object.entries(manifest.files)) {
    const dest = insideDir(p.dir, name)
    if (entry.type === 'directory') fs.mkdirSync(dest, { recursive: true })
    else if (entry.type === 'file') files.push({ url: entry.downloads.raw.url, dest, sha1: entry.downloads.raw.sha1, size: entry.downloads.raw.size })
  }
  return { files, version: target.version.name }
}

// ---------- Version de base ----------

// Fichier de version de Minecraft (téléchargé une fois, puis relu sur le disque)
async function vanillaJson(version) {
  const dir = insideDir(path.join(root, 'versions'), checkVersion(version, 'Version de Minecraft'))
  const jsonPath = path.join(dir, `${version}.json`)
  if (fs.existsSync(jsonPath)) return JSON.parse(await fs.promises.readFile(jsonPath, 'utf8'))
  const entry = (await getJson(VERSION_MANIFEST)).versions.find((v) => v.id === version)
  if (!entry) throw new Error(`Version de Minecraft « ${version} » introuvable.`)
  const json = await getJson(entry.url)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(jsonPath, JSON.stringify(json))
  return json
}

function clientFile(json, version) {
  const client = json.downloads.client
  return { url: client.url, dest: path.join(root, 'versions', version, `${version}.jar`), sha1: client.sha1, size: client.size }
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
  const mc = checkVersion(inst.version, 'Version de Minecraft')
  let loaderVersion = inst.loaderVersion
  const checked = (v) => checkVersion(v, 'Version du chargeur')
  const forgeOptions = { java: javaExe, spawn: hiddenSpawn }

  switch (inst.loader) {
    case 'fabric': {
      loaderVersion = checked(loaderVersion || await latestFabricLike('https://meta.fabricmc.net/v2', mc))
      task.detail = `Fabric ${loaderVersion}`
      downloads.notify(true)
      return { id: await installer.installFabric({ minecraftVersion: mc, version: loaderVersion, minecraft: root }), loaderVersion }
    }
    case 'quilt': {
      loaderVersion = checked(loaderVersion || await latestFabricLike('https://meta.quiltmc.org/v3', mc))
      task.detail = `Quilt ${loaderVersion}`
      downloads.notify(true)
      return { id: await installer.installQuiltVersion({ minecraftVersion: mc, version: loaderVersion, minecraft: root }), loaderVersion }
    }
    case 'forge': {
      loaderVersion = checked(loaderVersion || await latestForge(mc))
      task.detail = `Forge ${loaderVersion} (peut prendre une minute)`
      downloads.notify(true)
      return { id: await runXmclSafe(task, installer.installForgeTask({ mcversion: mc, version: loaderVersion }, root, forgeOptions)), loaderVersion }
    }
    case 'neoforge': {
      loaderVersion = checked(loaderVersion || await latestNeoForge(mc))
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

// Librairies d'une version résolue ; chaque chemin venu du fichier de version reste dans son dossier
function libraryFiles(resolved) {
  return resolved.libraries
    .filter((l) => l.download?.url)
    .map((l) => ({ url: l.download.url, dest: insideDir(path.join(root, 'libraries'), l.download.path), sha1: l.download.sha1 || undefined, size: l.download.size > 0 ? l.download.size : 0 }))
}

// Index des ressources (téléchargé tout de suite, il est petit), config de logs et objets de ressources.
// L'index n'entre pas dans la progression de la tâche : seul, il la mettrait à 100 % avant le vrai téléchargement.
async function resourceFiles(resolved) {
  const idx = resolved.assetIndex
  const indexPath = insideDir(path.join(root, 'assets', 'indexes'), `${idx.id}.json`)
  const failed = await downloads.downloadFiles({ received: 0, total: 0 }, [{ url: idx.url, dest: indexPath, sha1: idx.sha1, size: idx.size }])
  if (failed.length) throw new Error(`Index des ressources : ${failed[0].error}`)

  const files = []
  const logging = resolved.logging?.client?.file
  if (logging?.url) files.push({ url: logging.url, dest: insideDir(path.join(root, 'assets', 'log_configs'), logging.id), sha1: logging.sha1, size: logging.size })
  const objects = JSON.parse(await fs.promises.readFile(indexPath, 'utf8')).objects || {}
  const seen = new Set()
  for (const { hash, size } of Object.values(objects)) {
    if (seen.has(hash)) continue
    if (!/^[0-9a-f]{40}$/.test(hash)) throw new Error('Index des ressources invalide.')
    seen.add(hash)
    files.push({ url: `${RESOURCES}/${hash.slice(0, 2)}/${hash}`, dest: path.join(root, 'assets', 'objects', hash.slice(0, 2), hash), sha1: hash, size })
  }
  return files
}

async function downloadAll(task, files, what) {
  const failed = await downloads.downloadFiles(task, files, 12)
  if (failed.length) throw new Error(`${what} : ${failed.length} fichier(s) en échec (${failed[0].error})`)
}

// ---------- Préparation complète ----------

// Installe tout ce qu'il faut pour lancer l'instance. force = tout revérifier (« Réparer »).
// Une seule préparation à la fois par instance (création, import et clic sur Jouer peuvent se croiser)
const pending = new Map() // instanceId -> Promise
function prepare(instanceId, options = {}) {
  if (!options.force && pending.has(instanceId)) return pending.get(instanceId)
  const job = doPrepare(instanceId, options).finally(() => pending.delete(instanceId))
  pending.set(instanceId, job)
  return job
}

// Télécharge tout ce qu'il faut pour jouer dès la création/l'import, sans attendre le clic sur Jouer
function prepareInBackground(instanceId) {
  notifyStatus({ instanceId, state: 'preparing' })
  prepare(instanceId)
    .catch(() => {}) // l'erreur reste visible dans les téléchargements ; Jouer réessaiera
    .finally(() => !running.has(instanceId) && notifyStatus({ instanceId, state: 'stopped' }))
}

// La liste complète des fichiers est établie avant de télécharger, puis tout part en un seul lot :
// la progression affichée ne recule pas quand une nouvelle étape commence.
async function doPrepare(instanceId, { force = false } = {}) {
  const inst = store.listInstances().find((i) => i.id === instanceId)
  if (!inst) throw new Error('Instance introuvable.')
  if (inst.installing) throw new Error('Le modpack est encore en cours d’installation.')

  const task = downloads.begin(`Préparation de « ${inst.name} »`, 'Analyse…')
  try {
    // 1. Jeu, Java, librairies de base et ressources : connus d'avance, téléchargés ensemble
    const vanilla = await vanillaJson(inst.version)
    const component = checkComponent(vanilla.javaVersion?.component || 'jre-legacy')
    const java = javaPaths(component)
    const runtime = await javaFiles(component)

    let versionId = inst.preparedVersion
    const jsonOk = isVersion(versionId) && fs.existsSync(path.join(root, 'versions', versionId, `${versionId}.json`))
    const full = force || !jsonOk // version (ou chargeur) pas encore installée, ou réparation
    const files = [clientFile(vanilla, inst.version), ...runtime.files]
    if (full) {
      const base = await core.Version.parse(root, inst.version)
      files.push(...libraryFiles(base), ...(await resourceFiles(base)))
    }
    task.detail = runtime.files.length ? `Minecraft ${inst.version} et Java (${component})` : full ? `Minecraft ${inst.version} et ses ressources` : 'Vérification…'
    downloads.notify(true)
    await downloadAll(task, files, 'Téléchargement')
    if (runtime.version) fs.writeFileSync(java.marker, runtime.version)

    // 2. Chargeur de mods et ses librairies (petits ; celles de la version de base sont déjà là)
    if (full) {
      const loader = await ensureLoader(task, inst, java.java)
      versionId = checkVersion(loader.id, 'Version à lancer')
      store.updateInstance(inst.id, { loaderVersion: loader.loaderVersion })
      const resolved = await core.Version.parse(root, versionId)
      task.detail = 'Librairies du chargeur'
      await downloadAll(task, libraryFiles(resolved), 'Librairies')
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
    const lines = []
    logs.set(instanceId, lines)
    const parse = logParser()
    let pending = [] // envoyées à l'interface par paquets (au plus 4 fois par seconde)
    let flushTimer = null
    const flush = () => { flushTimer = null; if (pending.length) notifyLog({ instanceId, lines: pending }); pending = [] }
    const capture = (chunk) => {
      log.write(chunk)
      tail.push(...chunk.toString().split(/\r?\n/))
      if (tail.length > 80) tail.splice(0, tail.length - 80)
      const parsed = parse(chunk.toString())
      if (!parsed.length) return
      lines.push(...parsed)
      if (lines.length > LOG_MAX) lines.splice(0, lines.length - LOG_MAX)
      pending.push(...parsed)
      if (!flushTimer) flushTimer = setTimeout(flush, 250)
    }
    proc.stdout?.on('data', capture)
    proc.stderr?.on('data', capture)
    notifyLog({ instanceId, reset: true })

    const startedAt = Date.now()
    running.set(instanceId, { process: proc, startedAt })
    store.updateInstance(instanceId, { lastPlayed: startedAt })
    notifyStatus({ instanceId, state: 'starting' })

    const watcher = core.createMinecraftProcessWatcher(proc)
    watcher.on('minecraft-window-ready', () => notifyStatus({ instanceId, state: 'running' }))
    watcher.on('minecraft-exit', ({ code, crashReport, crashReportLocation }) => {
      log.end()
      const last = parse('', true)
      lines.push(...last)
      pending.push(...last)
      clearTimeout(flushTimer)
      flush()
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

module.exports = { init, prepare, prepareInBackground, launch, stop, isRunning, totalMemoryMb, readLog }
