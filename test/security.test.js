// Vérifie les correctifs de sécurité du processus principal et de la page d'un projet.
// Electron, @xmcl et le réseau sont remplacés par des bouchons ; tout se passe dans un dossier temporaire.
//   node test/security.test.js
// La partie « page d'un projet » a besoin de jsdom (TERRA_JSDOM=<dossier de jsdom>) ; sans lui, elle est sautée.
'use strict'
const Module = require('module')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const assert = require('assert/strict')
const { pathToFileURL } = require('url')

const ROOT = path.join(__dirname, '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'terra-securite-'))
const appData = path.join(tmp, 'AppData')
const sysTmp = path.join(tmp, 'Temp')
fs.mkdirSync(appData, { recursive: true })
fs.mkdirSync(sysTmp, { recursive: true })
os.tmpdir = () => sysTmp
const dataRoot = path.join(appData, '.terralauncher')
const APP_URL = pathToFileURL(path.join(ROOT, 'dist', 'index.html')).href
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex')

// ---------- Bouchons ----------

const opened = [] // shell.openExternal
const ipc = {} // canal -> handler
let win = null
let ready = null
let terraProtocol = null

const electron = {
  app: {
    isPackaged: false,
    getPath: (name) => (name === 'appData' ? appData : path.join(tmp, name)),
    whenReady: () => ({ then: (fn) => { ready = fn } }),
    setAppUserModelId() {},
    on() {},
    getVersion: () => '0.0.0-test'
  },
  BrowserWindow: class {
    constructor(opts) {
      this.opts = opts
      this.events = {}
      win = this
      this.webContents = { on: (ev, fn) => { this.events[ev] = fn }, setWindowOpenHandler: (fn) => { this.openHandler = fn }, send() {} }
    }
    loadURL(u) { this.loaded = u }
    loadFile(f) { this.loaded = f }
    isDestroyed() { return false }
    minimize() {}
  },
  ipcMain: { handle: (channel, fn) => { ipc[channel] = fn } },
  dialog: {},
  shell: { openExternal: async (u) => { opened.push(u) }, openPath: async () => '', trashItem: async () => {}, showItemInFolder() {} },
  protocol: { registerSchemesAsPrivileged() {}, handle: (_scheme, fn) => { terraProtocol = fn } },
  net: { fetch: async (u) => new Response('fichier:' + u) },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s), decryptString: (b) => b.toString() },
  contextBridge: { exposeInMainWorld() {} },
  ipcRenderer: { invoke: async () => ({ ok: true }), on() {}, removeListener() {} }
}

let resolvedVersion = null // ce que renvoie Version.parse
const xmclCore = {
  Version: { parse: async () => resolvedVersion },
  DEFAULT_EXTRA_JVM_ARGS: [],
  launch: async () => { throw new Error('pas de lancement pendant le test') },
  createMinecraftProcessWatcher() {}
}
const xmclInstaller = {
  installFabric: async ({ minecraftVersion, version }) => `${minecraftVersion}-fabric${version}`,
  installQuiltVersion: async () => 'quilt',
  installForgeTask: () => ({ startAndWait: async () => 'forge' }),
  installNeoForgedTask: () => ({ startAndWait: async () => 'neoforge' })
}
const stubs = { electron, '@xmcl/core': xmclCore, '@xmcl/installer': xmclInstaller, 'electron-updater': { autoUpdater: {} } }
const load = Module._load
Module._load = function (request, ...rest) {
  return Object.hasOwn(stubs, request) ? stubs[request] : load.call(this, request, ...rest)
}

// Réseau : seules les adresses servies par le test répondent, et chaque requête est notée
const served = new Map()
const fetched = []
const serve = (url, body) => served.set(url, Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))
global.fetch = async (url) => {
  fetched.push(String(url))
  const body = served.get(String(url))
  return body ? new Response(body) : new Response(null, { status: 404 })
}

// ---------- Petit lanceur ----------

const results = []
async function check(point, name, fn) {
  try {
    await fn()
    results.push({ ok: true, point, name })
  } catch (err) {
    results.push({ ok: false, point, name, err })
  }
}

const sender = (url) => ({ senderFrame: url === null ? null : { url } })
const invoke = (channel, ...args) => ipc[channel](sender(APP_URL), ...args)
const refused = async (promise, pattern) => {
  const res = await promise
  assert.equal(res.ok, false, `attendu un refus, reçu ${JSON.stringify(res).slice(0, 200)}`)
  if (pattern) assert.match(res.error, pattern)
}
const accepted = async (promise) => {
  const res = await promise
  assert.equal(res.ok, true, `attendu un succès, reçu ${res.error}`)
  return res.data
}
const event = () => {
  const e = { prevented: false, preventDefault() { e.prevented = true } }
  return e
}
const waitTask = async (title) => {
  for (let i = 0; i < 500; i++) {
    const t = downloads.list().find((x) => x.title === title)
    if (t && t.status !== 'running') return t
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`tâche « ${title} » jamais terminée`)
}

// ---------- Démarrage du processus principal avec les bouchons ----------

require(path.join(ROOT, 'src/main/main.js'))
ready()
const store = require(path.join(ROOT, 'src/main/store.js'))
const downloads = require(path.join(ROOT, 'src/main/downloads.js'))
const launcher = require(path.join(ROOT, 'src/main/launcher.js'))
const content = require(path.join(ROOT, 'src/main/content.js'))
const AdmZip = require('adm-zip')

async function main() {
  // ===== 1. Fenêtre principale =====

  await check(1, 'sandbox et isolation déclarés', () => {
    assert.equal(win.opts.webPreferences.sandbox, true)
    assert.equal(win.opts.webPreferences.contextIsolation, true)
  })

  await check(1, 'will-navigate refuse une page extérieure, accepte l’interface', () => {
    for (const url of ['http://127.0.0.1:8080/p.html', 'https://modrinth.com/', 'file:///C:/Windows/win.ini', pathToFileURL(path.join(ROOT, 'evil.html')).href]) {
      const e = event()
      win.events['will-navigate'](e, url)
      assert.equal(e.prevented, true, url)
    }
    const ok = event()
    win.events['will-navigate'](ok, APP_URL + '?noanim#x')
    assert.equal(ok.prevented, false)
  })

  await check(1, 'will-redirect refuse une redirection extérieure', () => {
    const e = event()
    win.events['will-redirect'](e, 'http://127.0.0.1:8080/p.html')
    assert.equal(e.prevented, true)
  })

  await check(1, 'nouvelles fenêtres refusées, liens https envoyés au navigateur', () => {
    opened.length = 0
    assert.deepEqual(win.openHandler({ url: 'http://127.0.0.1:8080/p.html' }), { action: 'deny' })
    assert.deepEqual(win.openHandler({ url: 'file:///C:/x.html' }), { action: 'deny' })
    assert.deepEqual(opened, [])
    assert.deepEqual(win.openHandler({ url: 'https://modrinth.com/mod/sodium' }), { action: 'deny' })
    assert.deepEqual(opened, ['https://modrinth.com/mod/sodium'])
  })

  await check(1, 'handle() refuse un expéditeur qui n’est pas l’interface', async () => {
    await refused(ipc['app:version'](sender('http://127.0.0.1:8080/p.html'), ''), /Appel refusé/)
    await refused(ipc['app:version'](sender('https://evil.example/'), ''), /Appel refusé/)
    await refused(ipc['app:version'](sender(null)), /Appel refusé/)
    assert.equal(await accepted(invoke('app:version')), '0.0.0-test')
  })

  await check(1, 'CSP injectée seulement au build', () => {
    const config = require(path.join(ROOT, 'vite.config.js'))
    const plugin = config.plugins.find((p) => p && p.name === 'terra-csp')
    assert.ok(plugin, 'plugin CSP absent')
    assert.equal(plugin.apply, 'build')
    const [tag] = plugin.transformIndexHtml()
    assert.equal(tag.attrs['http-equiv'], 'Content-Security-Policy')
    for (const d of ["script-src 'self'", "object-src 'none'", "frame-src 'none'", "base-uri 'none'"]) assert.ok(tag.attrs.content.includes(d), d)
    const built = path.join(ROOT, 'dist', 'index.html')
    if (fs.existsSync(built)) {
      const html = fs.readFileSync(built, 'utf8')
      assert.match(html, /http-equiv="Content-Security-Policy"/)
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'script en ligne dans le build')
    }
  })

  await check(1, 'glisser-déposer de fichiers bloqué', () => {
    const listeners = {}
    global.window = { addEventListener: (type, fn) => { listeners[type] = fn } }
    require(path.join(ROOT, 'src/main/preload.js'))
    delete global.window
    const drop = event()
    listeners.drop(drop)
    assert.equal(drop.prevented, true)
    const over = Object.assign(event(), { dataTransfer: { dropEffect: 'copy' } })
    listeners.dragover(over)
    assert.equal(over.prevented, true)
    assert.equal(over.dataTransfer.dropEffect, 'none')
  })

  // ===== 1 et 2. Page d'un projet (DOMPurify et clics) =====
  await projectPageChecks()

  // ===== 3. IPC =====

  const inst = await accepted(invoke('instances:create', { name: 'Survie', version: '1.20.1', loader: 'vanilla' }))
  const other = await accepted(invoke('instances:create', { name: 'À supprimer', version: '1.20.1', loader: 'vanilla' }))
  const profile = await accepted(invoke('profiles:create', { name: 'Profil' }))

  await check(3, 'settings:update refuse les options Java qui chargent du code', async () => {
    for (const jvmArgs of ['-javaagent:C:\\evil.jar', '-Xmx4G -agentpath:C:\\evil.dll', '-agentlib:jdwp=transport=dt_socket', '-XX:OnError=calc.exe', '-XX:OnOutOfMemoryError=calc', '@C:\\args.txt', '"-javaagent:x.jar"', '-Xrunjdwp:server=y']) {
      await refused(invoke('settings:update', { jvmArgs }), /Argument Java refusé/)
    }
    const file = path.join(dataRoot, 'settings.json')
    if (fs.existsSync(file)) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /javaagent|agentpath|OnError/)
  })

  await check(3, 'settings:update refuse les clés inconnues et les mauvais types', async () => {
    await refused(invoke('settings:update', { devMode: true }), /Réglage inconnu/)
    await refused(invoke('settings:update', { __proto__: { x: 1 }, foo: 1 }), /Réglage inconnu/)
    await refused(invoke('settings:update', { memory: '4096' }), /Valeur refusée/)
    await refused(invoke('settings:update', { serverAddress: '--demo' }), /Valeur refusée/)
    await refused(invoke('settings:update', 'texte'), /refusés/)
  })

  await check(3, 'settings:update accepte l’enregistrement normal de la page Paramètres', async () => {
    const changes = { animations: true, startPage: 'discover', msClientId: '', memory: 6144, jvmArgs: '-XX:+UseG1GC -Dfile.encoding=UTF-8', gpu: true, minimizeOnLaunch: false, serverAddress: 'terranova.ist3rik.com:25565', curseforgeKey: '' }
    const saved = await accepted(invoke('settings:update', changes))
    assert.equal(saved.memory, 6144)
    assert.equal(saved.jvmArgs, '-XX:+UseG1GC -Dfile.encoding=UTF-8')
    assert.equal(saved.startPage, 'discover')
    await accepted(invoke('settings:update', { animations: false }))
  })

  await check(3, 'instances:update refuse les champs hors liste', async () => {
    await refused(invoke('instances:update', inst.id, { installing: true }), /non modifiable/)
    await refused(invoke('instances:update', inst.id, { version: '../instances/x/minecraft/v' }), /non modifiable/)
    await refused(invoke('instances:update', inst.id, { preparedVersion: 'x' }), /non modifiable/)
    await refused(invoke('instances:update', inst.id, { memory: -1 }), /Valeur refusée/)
    await refused(invoke('instances:update', inst.id, { name: '   ' }), /Valeur refusée/)
  })

  await check(3, 'instances:update accepte nom, description et mémoire', async () => {
    const updated = await accepted(invoke('instances:update', inst.id, { name: 'Survie 2', memory: 6144 }))
    assert.equal(updated.name, 'Survie 2')
    await accepted(invoke('instances:update', inst.id, { description: 'Notre monde', memory: null }))
    assert.ok(fs.existsSync(path.join(dataRoot, 'instances', 'Survie 2', 'instance.json')))
  })

  await check(3, 'instances:delete et profiles:delete refusent un chemin à la place d’un identifiant', async () => {
    const victim = path.join(appData, 'victim-dir')
    const victimProf = path.join(appData, 'victim-prof')
    for (const d of [victim, victimProf]) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'temoin.txt'), 'x') }
    await refused(invoke('instances:delete', '../../victim-dir'), /Identifiant refusé/)
    await refused(invoke('instances:delete', '..\\..\\victim-dir'), /Identifiant refusé/)
    await refused(invoke('profiles:delete', '../../victim-prof'), /Identifiant refusé/)
    await refused(invoke('instances:delete', 'aaaaaaaaaaaa'), /introuvable/)
    await refused(invoke('profiles:delete', 'bbbbbbbbbbbb'), /introuvable/)
    await refused(invoke('profiles:openFolder', '../../victim-prof'), /Identifiant refusé/)
    assert.ok(fs.existsSync(path.join(victim, 'temoin.txt')))
    assert.ok(fs.existsSync(path.join(victimProf, 'temoin.txt')))
  })

  await check(3, 'suppression normale d’une instance et d’un profil', async () => {
    await accepted(invoke('instances:delete', other.id))
    assert.ok(!store.listInstances().some((i) => i.id === other.id))
    await accepted(invoke('profiles:delete', profile.id))
    assert.ok(!fs.existsSync(path.join(dataRoot, 'profiles', profile.id)))
  })

  await check(3, 'openSubfolder limité à mods, resourcepacks, shaderpacks, screenshots', async () => {
    await refused(invoke('instances:openSubfolder', inst.id, '../../../escape'), /Dossier inconnu/)
    await refused(invoke('instances:openSubfolder', inst.id, 'saves'), /Dossier inconnu/)
    await refused(invoke('instances:openSubfolder', inst.id, 'constructor'), /Dossier inconnu/)
    assert.ok(!fs.existsSync(path.join(dataRoot, 'escape')))
    await refused(invoke('instances:openSubfolder', '../../x', 'mods'), /Identifiant refusé/)
    await accepted(invoke('instances:openSubfolder', inst.id, 'shaderpacks'))
    assert.ok(fs.existsSync(path.join(store.gameDir(inst.id), 'shaderpacks')))
  })

  await check(3, 'kind limité à banner ou logo', async () => {
    await refused(invoke('instances:resetImage', inst.id, '../../x'), /Type d’image inconnu/)
    await refused(invoke('instances:resetImage', inst.id, 'minecraft/options'), /Type d’image inconnu/)
    await refused(invoke('instances:resetImage', '../../x', 'logo'), /Identifiant refusé/)
    await accepted(invoke('instances:resetImage', inst.id, 'logo'))
  })

  await check(3, 'setInstanceImage impose une extension d’image', () => {
    const exe = path.join(tmp, 'evil.exe')
    const png = path.join(tmp, 'image.PNG')
    fs.writeFileSync(exe, 'MZ')
    fs.writeFileSync(png, 'png')
    assert.throws(() => store.setInstanceImage(inst.id, 'banner', exe), /Format d’image refusé/)
    assert.throws(() => store.setInstanceImage(inst.id, 'banner', path.join(tmp, 'sans-extension')), /Format d’image refusé/)
    const updated = store.setInstanceImage(inst.id, 'banner', png)
    assert.equal(updated.bannerFile, 'banner.png')
    assert.ok(fs.existsSync(path.join(store.instanceDir(inst.id), 'banner.png')))
  })

  await check(3, 'terra:// répond 404 pour un identifiant refusé', async () => {
    const bad = await terraProtocol({ url: 'terra://banner/..%2F..%2Fvictim-dir/banner.png' })
    assert.equal(bad.status, 404)
    const ok = await terraProtocol({ url: `terra://banner/${inst.id}/banner.png` })
    assert.equal(ok.status, 200)
  })

  // ===== 4. Versions et chemins de lancement =====

  const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
  const RUNTIMES = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'
  const platform = process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64'
  const blob = (name) => { const b = Buffer.from('contenu ' + name); serve(`https://files.test/${name}`, b); return { url: `https://files.test/${name}`, sha1: sha1(b), size: b.length } }
  const versionJson = (component) => ({ id: '1.20.1', downloads: { client: blob('client.jar') }, javaVersion: { component } })
  serve(MANIFEST, { versions: [{ id: '1.20.1', url: 'https://files.test/1.20.1.json' }, { id: '1.20.4', url: 'https://files.test/1.20.4.json' }] })
  serve('https://files.test/1.20.1.json', versionJson('java-runtime-gamma'))
  serve('https://files.test/1.20.4.json', versionJson('../../escape-runtime'))
  serve(RUNTIMES, { [platform]: { 'java-runtime-gamma': [{ manifest: { url: 'https://files.test/jre.json' }, version: { name: '17' } }] } })
  const javaw = blob('javaw.exe')
  serve('https://files.test/jre.json', { files: { bin: { type: 'directory' }, 'bin/javaw.exe': { type: 'file', downloads: { raw: javaw } }, 'bin/java.exe': { type: 'file', downloads: { raw: javaw } } } })
  const asset = Buffer.from('son')
  serve(`https://resources.download.minecraft.net/${sha1(asset).slice(0, 2)}/${sha1(asset)}`, asset)
  const assetIndex = Buffer.from(JSON.stringify({ objects: { 'minecraft/sounds/a.ogg': { hash: sha1(asset), size: asset.length } } }))
  serve('https://files.test/index.json', assetIndex)
  const goodResolved = () => ({
    libraries: [{ download: { ...blob('lib.jar'), path: 'org/test/lib/1.0/lib-1.0.jar' } }],
    assetIndex: { id: '5', url: 'https://files.test/index.json', sha1: sha1(assetIndex), size: assetIndex.length },
    logging: { client: { file: { id: 'client-1.12.xml', ...blob('log.xml') } } }
  })
  const setVersion = (fields) => store.updateInstance(inst.id, { preparedVersion: null, loader: 'vanilla', loaderVersion: null, ...fields })

  await check(4, 'version de Minecraft en forme de chemin refusée (ancienne attaque du modpack)', async () => {
    const planted = path.join(store.gameDir(inst.id), 'v')
    fs.mkdirSync(planted, { recursive: true })
    fs.writeFileSync(path.join(planted, 'v.json'), JSON.stringify(versionJson('jre-legacy')))
    for (const version of [`../instances/${path.basename(store.instanceDir(inst.id))}/minecraft/v`, '..', '.hidden', 'a\\..\\b', 'C:x', '']) {
      setVersion({ version })
      await assert.rejects(launcher.prepare(inst.id, { force: true }), /refusée/, JSON.stringify(version))
    }
  })

  await check(4, 'préparation normale d’une instance vanilla', async () => {
    setVersion({ version: '1.20.1' })
    resolvedVersion = goodResolved()
    const { versionId, java } = await launcher.prepare(inst.id, { force: true })
    assert.equal(versionId, '1.20.1')
    assert.equal(java.javaw, path.join(dataRoot, 'runtime', 'java-runtime-gamma', 'bin', 'javaw.exe'))
    for (const f of ['versions/1.20.1/1.20.1.jar', 'libraries/org/test/lib/1.0/lib-1.0.jar', 'assets/indexes/5.json', 'assets/log_configs/client-1.12.xml', `assets/objects/${sha1(asset).slice(0, 2)}/${sha1(asset)}`]) {
      assert.ok(fs.existsSync(path.join(dataRoot, f)), f)
    }
  })

  await check(4, 'composant Java en forme de chemin refusé', async () => {
    setVersion({ version: '1.20.4' })
    resolvedVersion = goodResolved()
    await assert.rejects(launcher.prepare(inst.id, { force: true }), /Composant Java refusé/)
    assert.ok(!fs.existsSync(path.join(dataRoot, '..', 'escape-runtime')))
  })

  await check(4, 'version du chargeur en forme de chemin refusée', async () => {
    setVersion({ version: '1.20.1', loader: 'fabric', loaderVersion: '../../../x' })
    await assert.rejects(launcher.prepare(inst.id, { force: true }), /Version du chargeur refusée/)
    setVersion({ version: '1.20.1', loader: 'fabric', loaderVersion: '0.15.7' })
    resolvedVersion = goodResolved()
    const { versionId } = await launcher.prepare(inst.id, { force: true })
    assert.equal(versionId, '1.20.1-fabric0.15.7')
  })

  await check(4, 'chemins du fichier de version confinés (libraries, assets, log_configs)', async () => {
    const cases = [
      ['libraries', (r) => { r.libraries[0].download.path = '../../planted-lib.txt' }],
      ['libraries absolu', (r) => { r.libraries[0].download.path = path.join(tmp, 'planted-abs.txt') }],
      ['index', (r) => { r.assetIndex.id = '../../../planted-index' }],
      ['log_configs', (r) => { r.logging.client.file.id = '../../../planted-log.xml' }]
    ]
    for (const [label, mutate] of cases) {
      setVersion({ version: '1.20.1' })
      resolvedVersion = goodResolved()
      mutate(resolvedVersion)
      await assert.rejects(launcher.prepare(inst.id, { force: true }), /Chemin refusé/, label)
    }
    for (const f of ['planted-lib.txt', 'planted-abs.txt', 'planted-index.json', 'planted-log.xml']) {
      assert.ok(!fs.existsSync(path.join(appData, f)) && !fs.existsSync(path.join(tmp, f)), f)
    }
  })

  await check(4, 'empreinte d’objet de ressource mal formée refusée', async () => {
    const badIndex = Buffer.from(JSON.stringify({ objects: { a: { hash: '../../../../planted', size: 1 } } }))
    serve('https://files.test/bad-index.json', badIndex)
    setVersion({ version: '1.20.1' })
    resolvedVersion = { ...goodResolved(), assetIndex: { id: '6', url: 'https://files.test/bad-index.json', sha1: sha1(badIndex), size: badIndex.length } }
    await assert.rejects(launcher.prepare(inst.id, { force: true }), /Index des ressources invalide/)
  })

  await check(4, 'import depuis un autre launcher : versions validées', async () => {
    const src = path.join(tmp, 'autre-launcher')
    fs.mkdirSync(src, { recursive: true })
    fs.writeFileSync(path.join(src, 'options.txt'), 'fov:1')
    const item = { launcher: 'Prism', name: 'Importée', dir: src, version: '1.20.1', loader: 'fabric', loaderVersion: '0.15.7' }
    await refused(invoke('external:import', { ...item, version: '../instances/x/minecraft/v' }), /refusée/)
    await refused(invoke('external:import', { ...item, loaderVersion: '..\\..\\x' }), /refusée/)
    const imported = await accepted(invoke('external:import', item))
    assert.equal(imported.version, '1.20.1')
  })

  // ===== 5 et 6. Modpacks Modrinth =====

  let packNo = 0
  async function installPack({ files = [], deps = { minecraft: '1.20.1' }, filename = 'pack.mrpack', overrides = {} }) {
    packNo++
    const zip = new AdmZip()
    zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify({ formatVersion: 1, game: 'minecraft', dependencies: deps, files })))
    for (const [name, body] of Object.entries(overrides)) zip.addFile(`overrides/${name}`, Buffer.from(body))
    const packUrl = `https://cdn.modrinth.com/data/pack${packNo}/${packNo}.mrpack`
    serve(packUrl, zip.toBuffer())
    serve(`https://api.modrinth.com/v2/version/v${packNo}`, { files: [{ filename, url: packUrl }] })
    const title = `Pack ${packNo}`
    const created = await content.installModpack({ project: { platform: 'modrinth', id: `p${packNo}`, title, gameVersion: '1.20.1', image: null }, versionId: `v${packNo}`, name: title }, dataRoot)
    const task = await waitTask(title)
    return { task, game: store.gameDir(created.id) }
  }
  const mod = (name, url, hashes) => {
    const body = Buffer.from('jar ' + name)
    if (url) serve(url, body)
    return { path: `mods/${name}`, downloads: url ? [url] : [], hashes: hashes === undefined ? { sha1: sha1(body), sha512: 'x' } : hashes, fileSize: body.length, env: { client: 'required' } }
  }

  await check(5, 'fichier de .mrpack hors des hôtes autorisés refusé', async () => {
    for (const url of ['http://127.0.0.1:9999/evil.jar', 'http://cdn.modrinth.com/evil.jar', 'https://evil.example/evil.jar', 'https://cdn.modrinth.com.evil.example/evil.jar', 'https://cdn.modrinth.com:8443/evil.jar', 'file:///C:/evil.jar']) {
      fetched.length = 0
      const { task, game } = await installPack({ files: [mod('evil.jar', url)] })
      assert.equal(task.status, 'error', url)
      assert.match(task.error, /adresse non autorisée/)
      assert.ok(!fs.existsSync(path.join(game, 'mods', 'evil.jar')))
      assert.ok(!fetched.includes(url), `requête envoyée à ${url}`)
    }
  })

  await check(5, 'fichier de .mrpack sans empreinte ou avec une mauvaise empreinte refusé', async () => {
    const missing = await installPack({ files: [mod('nohash.jar', 'https://cdn.modrinth.com/data/a/nohash.jar', {})] })
    assert.match(missing.task.error, /sans empreinte SHA-1/)
    const short = await installPack({ files: [mod('short.jar', 'https://cdn.modrinth.com/data/a/short.jar', { sha1: 'abc' })] })
    assert.match(short.task.error, /sans empreinte SHA-1/)
    const wrong = await installPack({ files: [mod('wrong.jar', 'https://cdn.modrinth.com/data/a/wrong.jar', { sha1: 'a'.repeat(40) })] })
    assert.equal(wrong.task.status, 'error')
    assert.ok(!fs.existsSync(path.join(wrong.game, 'mods', 'wrong.jar')))
    assert.ok(!fs.existsSync(path.join(wrong.game, 'mods', 'wrong.jar.part')))
  })

  await check(5, 'version de Minecraft du .mrpack en forme de chemin refusée', async () => {
    const { task } = await installPack({ deps: { minecraft: '../instances/Pack/minecraft/v' }, overrides: { 'v/v.json': '{}' } })
    assert.match(task.error, /Version de Minecraft du modpack refusée/)
    const loader = await installPack({ deps: { minecraft: '1.20.1', 'fabric-loader': '../../x' } })
    assert.match(loader.task.error, /Version du chargeur du modpack refusée/)
  })

  await check(5, 'installation normale d’un .mrpack', async () => {
    const files = [
      mod('sodium.jar', 'https://cdn.modrinth.com/data/AANobbMI/versions/1/sodium.jar'),
      mod('github.jar', 'https://github.com/owner/repo/releases/download/v1/github.jar'),
      { ...mod('mirror.jar', 'https://raw.githubusercontent.com/o/r/main/mirror.jar'), downloads: ['http://127.0.0.1/mirror.jar', 'https://raw.githubusercontent.com/o/r/main/mirror.jar'] },
      mod('gitlab.jar', 'https://gitlab.com/o/r/-/raw/main/gitlab.jar')
    ]
    const { task, game } = await installPack({ files, deps: { minecraft: '1.20.1', 'fabric-loader': '0.15.7' }, overrides: { 'config/a.txt': 'a' } })
    assert.equal(task.status, 'done', task.error)
    for (const f of ['mods/sodium.jar', 'mods/github.jar', 'mods/mirror.jar', 'mods/gitlab.jar', 'config/a.txt']) assert.ok(fs.existsSync(path.join(game, f)), f)
    assert.ok(!fetched.includes('http://127.0.0.1/mirror.jar'), 'miroir non autorisé contacté')
  })

  await check(6, 'nom distant du modpack réduit à un nom de fichier sûr dans le dossier temporaire', async () => {
    const dests = []
    const real = downloads.fetchToFile
    downloads.fetchToFile = (task, url, dest, hash) => { dests.push(dest); return real(task, url, dest, hash) }
    try {
      for (const filename of ['x/../../../escape-a.mrpack', 'a\\..\\..\\..\\escape-b.mrpack', '..', 'C:\\Windows\\escape-c.mrpack', 'nom avec espaces & accents é.mrpack']) {
        await installPack({ filename })
      }
    } finally {
      downloads.fetchToFile = real
    }
    const tmpRoot = path.join(sysTmp, 'terralauncher') + path.sep
    for (const d of dests) {
      assert.ok(d.startsWith(tmpRoot), d)
      assert.match(path.basename(d), /^\d+-[A-Za-z0-9._-]+$/)
    }
    assert.match(path.basename(dests[0]), /-escape-a\.mrpack$/)
    assert.match(path.basename(dests[1]), /-escape-b\.mrpack$/)
    for (const f of ['escape-a.mrpack', 'escape-b.mrpack']) assert.ok(!fs.existsSync(path.join(tmp, f)) && !fs.existsSync(path.join(sysTmp, f)), f)
  })

  // ---------- Bilan ----------
  let failed = 0
  let point = null
  for (const r of results) {
    if (r.point !== point) { point = r.point; console.log(`\nPoint ${point}`) }
    console.log(`  ${r.ok ? 'OK    ' : 'ÉCHEC '} ${r.name}`)
    if (!r.ok) { failed++; console.log('        ' + String(r.err && r.err.stack || r.err).split('\n').slice(0, 4).join('\n        ')) }
  }
  console.log(`\n${results.length - failed}/${results.length} vérifications réussies`)
  fs.rmSync(tmp, { recursive: true, force: true })
  process.exit(failed ? 1 : 0)
}

// ---------- Page d'un projet : DOMPurify et gestionnaire de clic, dans un faux navigateur ----------
async function projectPageChecks() {
  let JSDOM
  try { ({ JSDOM } = require(process.env.TERRA_JSDOM || 'jsdom')) } catch {
    results.push({ ok: true, point: 2, name: 'SAUTÉ : jsdom introuvable (TERRA_JSDOM)' })
    return
  }
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'file:///C:/TerraLauncher/dist/index.html', pretendToBeVisual: true })
  const w = dom.window
  const openedUi = []
  const body = [
    '[Lien https](https://example.com/page)',
    '[Lien local](http://127.0.0.1:8080/p.html)',
    '',
    '<img src="https://cdn.modrinth.com/x.png" usemap="#m" alt="image"><map name="m"><area shape="default" href="http://127.0.0.1:8080/p.html"></map>',
    '<div class="fixed inset-0 z-50 btn-primary" id="update" name="n" data-action="x">Mise à jour disponible</div>',
    '<a href="https://example.com/svg-parent"><svg><a href="https://example.com/svg"><text>svg</text></a></svg></a>'
  ].join('\n')
  w.terra = {
    content: { details: async () => ({ platform: 'modrinth', id: 'p', title: 'Projet', author: 'a', description: '', downloads: 1, body, bodyFormat: 'markdown', gallery: [], links: {} }), versions: async () => [] },
    app: { openExternal: async (u) => { openedUi.push(u) } }
  }
  const globals = { window: w, document: w.document, navigator: w.navigator, HTMLElement: w.HTMLElement, SVGElement: w.SVGElement, Element: w.Element, Node: w.Node, getComputedStyle: w.getComputedStyle.bind(w), requestAnimationFrame: w.requestAnimationFrame, cancelAnimationFrame: w.cancelAnimationFrame, IS_REACT_ACT_ENVIRONMENT: true }
  for (const [k, value] of Object.entries(globals)) Object.defineProperty(global, k, { value, configurable: true, writable: true })

  // ProjectPage.jsx transformé en CommonJS par esbuild (dépendance de Vite)
  const esbuild = require('esbuild')
  const file = path.join(ROOT, 'src/renderer/src/pages/ProjectPage.jsx')
  const out = esbuild.buildSync({
    entryPoints: [file], bundle: true, write: false, format: 'cjs', platform: 'browser', jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'framer-motion', 'marked', 'dompurify', 'lucide-react'], logLevel: 'silent'
  })
  const m = new Module(file, module)
  m.filename = file
  m.paths = Module._nodeModulePaths(path.dirname(file))
  m._compile(out.outputFiles[0].text, file)
  const ProjectPage = m.exports.default

  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const container = w.document.getElementById('root')
  const root = createRoot(container)
  await React.act(async () => { root.render(React.createElement(ProjectPage, { hit: { platform: 'modrinth', id: 'p', title: 'Projet' }, onBack() {}, onInstall() {} })) })
  await React.act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  const prose = container.querySelector('.prose-terra')

  await check(2, 'DOMPurify retire map, area, class, id, name et data-*', () => {
    assert.ok(prose, 'description absente')
    assert.equal(prose.querySelectorAll('map, area').length, 0)
    for (const el of prose.querySelectorAll('*')) {
      for (const attr of el.getAttributeNames()) assert.ok(!['class', 'id', 'name'].includes(attr) && !attr.startsWith('data-'), `${el.tagName} garde ${attr}`)
    }
    assert.ok(prose.textContent.includes('Mise à jour disponible'), 'le texte reste affiché')
    assert.ok(prose.querySelector('a[href="https://example.com/page"]'), 'lien normal conservé')
    assert.ok(prose.querySelector('img[src="https://cdn.modrinth.com/x.png"]'), 'image normale conservée')
  })

  const fire = (el, type, button = 0) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, button }))

  await check(1, 'clic gauche : lien https vers le navigateur, lien local bloqué', () => {
    openedUi.length = 0
    const https = prose.querySelector('a[href="https://example.com/page"]')
    const local = prose.querySelector('a[href="http://127.0.0.1:8080/p.html"]')
    assert.equal(fire(https, 'click'), false, 'navigation non bloquée')
    assert.equal(fire(local, 'click'), false, 'navigation locale non bloquée')
    assert.deepEqual(openedUi, ['https://example.com/page'])
  })

  await check(1, 'clic du milieu (auxclick) traité comme un clic', () => {
    openedUi.length = 0
    const local = prose.querySelector('a[href="http://127.0.0.1:8080/p.html"]')
    const https = prose.querySelector('a[href="https://example.com/page"]')
    assert.equal(fire(local, 'auxclick', 1), false, 'clic du milieu non bloqué')
    assert.equal(fire(https, 'auxclick', 1), false)
    assert.equal(fire(https, 'auxclick', 2), true, 'le clic droit n’ouvre rien')
    assert.deepEqual(openedUi, ['https://example.com/page'])
  })

  await check(1, 'élément area traité par le gestionnaire de clic', () => {
    openedUi.length = 0
    // Une zone qui aurait échappé au nettoyage reste bloquée
    const map = w.document.createElement('map')
    const area = w.document.createElement('area')
    area.setAttribute('href', 'http://127.0.0.1:8080/p.html')
    map.appendChild(area)
    prose.appendChild(map)
    assert.equal(fire(area, 'click'), false, 'clic sur area non bloqué')
    assert.equal(fire(area, 'auxclick', 1), false)
    area.setAttribute('href', 'https://example.com/area')
    fire(area, 'click')
    assert.deepEqual(openedUi, ['https://example.com/area'])
    map.remove()
  })

  // Le faux DOM reste en place : framer-motion a encore des images d'animation planifiées
  await React.act(async () => root.unmount())
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
