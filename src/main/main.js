const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL, fileURLToPath } = require('url')
const store = require('./store')
const downloads = require('./downloads')
const settings = require('./settings')
const auth = require('./auth')
const content = require('./content')
const launcher = require('./launcher')
const external = require('./external')
const worlds = require('./worlds')
const { autoUpdater } = require('electron-updater')

const isDev = process.env.VITE_DEV === '1'
const dataRoot = path.join(app.getPath('appData'), '.terralauncher')
const defaultMinecraftDir = path.join(app.getPath('appData'), '.minecraft')

// Seule page autorisée dans la fenêtre : l'interface du launcher
const DEV_ORIGIN = 'http://localhost:5173'
const APP_FILE = path.join(__dirname, '../../dist/index.html')
function isAppUrl(url) {
  try {
    const u = new URL(url)
    if (isDev) return u.origin === DEV_ORIGIN
    return u.protocol === 'file:' && path.resolve(fileURLToPath(u)).toLowerCase() === path.resolve(APP_FILE).toLowerCase()
  } catch { return false }
}

// L'Explorateur ne voit pas les dossiers redirigés (application empaquetée) : on lui passe le chemin réel
const realPath = (p) => { try { return fs.realpathSync.native(p) } catch { return p } }
const openFolder = (p) => shell.openPath(realPath(p))

// terra://banner/<instanceId>/<fichier> sert les images de bannière des instances
protocol.registerSchemesAsPrivileged([{ scheme: 'terra', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

// Fichiers de l'animation de suppression (papier froissé), servis depuis l'interface construite
const ASSETS = new Set(['crumple/vertex_animation_textures1_mesh.fbx', 'crumple/vertex_animation_textures1_pos.exr'])

let win

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1020,
    minHeight: 680,
    frame: false,
    backgroundColor: '#140e0a',
    icon: path.join(__dirname, isDev || !app.isPackaged ? '../renderer/public/icon.png' : '../../dist/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true }
  })
  // La fenêtre ne quitte jamais l'interface ; les liens https s'ouvrent dans le navigateur
  const guard = (e, url) => { if (!isAppUrl(e.url || url)) e.preventDefault() }
  win.webContents.on('will-navigate', guard)
  win.webContents.on('will-redirect', guard)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (isDev) win.loadURL(DEV_ORIGIN)
  else win.loadFile(APP_FILE)
}

// Enregistre un handler IPC qui renvoie { ok, data } ou { ok:false, error }.
// Seule la page du launcher peut appeler.
function handle(channel, fn) {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!isAppUrl(e.senderFrame?.url)) return { ok: false, error: 'Appel refusé' }
    try { return { ok: true, data: await fn(...args) } } catch (err) { return { ok: false, error: err.message } }
  })
}

// Même identifiant que les raccourcis créés par l'installeur : icône et regroupement corrects dans la barre des tâches
app.setAppUserModelId('fr.terranova.terralauncher')

app.whenReady().then(() => {
  store.init(dataRoot)
  settings.init(dataRoot)
  auth.init(dataRoot)
  launcher.init(dataRoot, (status) => {
    if (!win || win.isDestroyed()) return
    win.webContents.send('game:status', status)
    win.webContents.send('instances:changed')
    if (status.state === 'running' && settings.raw().minimizeOnLaunch) win.minimize()
  }, (log) => win && !win.isDestroyed() && win.webContents.send('game:log', log))

  protocol.handle('terra', (req) => {
    const notFound = () => new Response(null, { status: 404 })
    try {
      const url = new URL(req.url)
      const [id, file] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      // terra://modicon/<id>/<fichier du mod> : logo lu dans le .jar
      if (url.hostname === 'modicon') {
        const icon = store.modIcon(id, path.basename(file))
        return icon ? new Response(icon.data, { headers: { 'Content-Type': icon.type, 'Cache-Control': 'max-age=3600' } }) : notFound()
      }
      // terra://asset/crumple/<fichier> : liste fixe de fichiers de l'interface
      if (url.hostname === 'asset') {
        const rel = url.pathname.replace(/^\//, '')
        if (!ASSETS.has(rel)) return notFound()
        return net.fetch(pathToFileURL(path.join(path.dirname(APP_FILE), rel)).toString()).then((res) => new Response(res.body, { headers: { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' } }))
      }
      // terra://world/<id>/<monde> : icône du monde (icon.png dans son dossier)
      if (url.hostname === 'world') {
        const icon = worlds.worldIcon(id, file)
        return fs.existsSync(icon) ? net.fetch(pathToFileURL(icon).toString()) : notFound()
      }
      // terra://banner/<id>/<banner.x|logo.x> ou terra://shot/<id>/<capture>
      if (url.hostname !== 'shot' && !/^(banner|logo)\./.test(path.basename(file))) return notFound()
      const target = url.hostname === 'shot' ? store.folderPath(id, 'screenshots', path.basename(file)) : path.join(store.instanceDir(id), path.basename(file))
      return net.fetch(pathToFileURL(target).toString())
    } catch {
      return notFound() // identifiant ou fichier refusé
    }
  })

  handle('window:minimize', () => win.minimize())
  handle('window:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()))
  handle('window:close', () => win.close())
  // Capture d'une zone de la fenêtre (en pixels de l'interface) : sert de texture à l'animation de suppression
  handle('window:capture', async (rect) => {
    const n = (v) => Math.round(Number(v))
    const r = { x: n(rect?.left), y: n(rect?.top), width: n(rect?.width), height: n(rect?.height) }
    if (Object.values(r).some((v) => !Number.isFinite(v)) || r.width < 1 || r.height < 1 || r.width > 8000 || r.height > 8000) throw new Error('Zone refusée.')
    return (await win.webContents.capturePage(r)).toDataURL()
  })

  handle('meta:items', () => store.itemList())

  handle('profiles:list', () => store.listProfiles())
  handle('profiles:create', (data) => store.createProfile(data))
  handle('profiles:update', (id, changes) => store.updateProfile(id, changes))
  handle('profiles:delete', (id) => store.deleteProfile(id))
  handle('profiles:openFolder', (id) => openFolder(store.profileFilesDir(id)))
  handle('import:sources', () => store.detectSources(app.getPath('appData'), app.getPath('home')))
  handle('import:pickFolder', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choisir le dossier de jeu d’une instance',
      defaultPath: fs.existsSync(defaultMinecraftDir) ? defaultMinecraftDir : app.getPath('appData'),
      properties: ['openDirectory']
    })
    return res.canceled ? null : res.filePaths[0]
  })
  handle('import:scan', (dir) => store.scanSource(dir))
  handle('import:run', (profileId, dir, paths) => store.importSelection(profileId, dir, paths))

  // Instances complètes des autres launchers → bibliothèque
  const notifyInstances = () => win && !win.isDestroyed() && win.webContents.send('instances:changed')
  handle('external:scan', () => external.scan(app.getPath('appData'), app.getPath('home')))
  handle('external:fromFolder', async (dir) => {
    const known = (await external.scan(app.getPath('appData'), app.getPath('home'))).find((x) => x.dir.toLowerCase() === dir.toLowerCase())
    return known || { launcher: 'Dossier', name: path.basename(dir), dir, ...external.guess(path.basename(dir)), loaderVersion: null, imported: false }
  })
  handle('external:import', (item) => external.importInstance(item, notifyInstances))

  handle('instances:list', () => store.listInstances())
  // Mods apportés par un profil : adaptés à la version et au chargeur de l'instance
  const adaptProfileMods = (inst, items) => {
    if (!Array.isArray(items) || !items.includes('mods') || inst.loader === 'vanilla') return
    if (!fs.existsSync(path.join(store.gameDir(inst.id), 'mods'))) return
    try { content.adaptModsTask(inst.id) } catch {}
  }
  handle('instances:create', (data) => {
    const inst = store.createInstance(data)
    if (inst.profileId) adaptProfileMods(inst, data.items)
    launcher.prepareInBackground(inst.id)
    return inst
  })

  downloads.onUpdate((list) => win && !win.isDestroyed() && win.webContents.send('downloads:update', list))
  handle('downloads:list', () => downloads.list())
  handle('downloads:clear', () => downloads.clearFinished())

  handle('settings:get', () => settings.get())
  handle('settings:update', (changes) => settings.update(changes))
  handle('app:openExternal', (url) => {
    if (!/^https:\/\//.test(url)) throw new Error('Lien refusé')
    return shell.openExternal(url)
  })
  handle('app:openDataFolder', () => openFolder(dataRoot))

  handle('accounts:list', () => auth.list())
  handle('accounts:login', () => auth.login(settings.msClientId()))
  handle('accounts:cancel', () => auth.cancelLogin())
  handle('accounts:setActive', (uuid) => auth.setActive(uuid))
  handle('accounts:remove', (uuid) => auth.remove(uuid))

  content.onInstancesChanged(() => win && !win.isDestroyed() && win.webContents.send('instances:changed'))
  handle('game:launch', async (instanceId, opts) => {
    const session = await auth.activeSession(settings.msClientId())
    return launcher.launch(instanceId, session, settings.raw(), opts || {})
  })
  handle('game:stop', (instanceId) => launcher.stop(instanceId))
  handle('game:repair', async (instanceId) => { await launcher.prepare(instanceId, { force: true }); return true })
  handle('system:memory', () => launcher.totalMemoryMb())

  handle('content:search', (opts) => content.search(opts))
  handle('content:versions', (platform, id) => content.projectVersions(platform, id))
  handle('content:filters', (platform, type) => content.filters(platform, type))
  handle('content:details', (platform, id) => content.projectDetails(platform, id))
  handle('content:install', async (project, instanceId) => (await content.installToInstance(project, instanceId)).id)
  handle('content:installModpack', (opts) => content.installModpack(opts, dataRoot))
  handle('content:checkModUpdates', (instanceId) => content.checkModUpdates(instanceId))
  handle('content:updateMods', (instanceId, names) => content.updateMods(instanceId, names).id)
  handle('instances:files', (id, folder) => store.listInstanceFolder(id, folder))
  handle('instances:toggleMod', (id, name) => store.toggleMod(id, name))
  handle('instances:trashFile', (id, folder, name) => shell.trashItem(store.folderPath(id, folder, name)))
  handle('instances:openSubfolder', (id, folder) => {
    const dir = store.subfolderDir(id, folder)
    fs.mkdirSync(dir, { recursive: true })
    return openFolder(dir)
  })
  handle('instances:duplicate', (id, name) => store.duplicateInstance(id, name))
  handle('instances:export', async (id) => {
    const inst = store.listInstances().find((i) => i.id === id)
    const res = await dialog.showSaveDialog(win, {
      title: 'Exporter l’instance',
      defaultPath: path.join(app.getPath('downloads'), `${inst.name.replace(/[^\w .-]+/g, '_')}.zip`),
      filters: [{ name: 'Archive ZIP', extensions: ['zip'] }]
    })
    if (res.canceled) return null
    store.exportInstance(id, res.filePath)
    shell.showItemInFolder(realPath(res.filePath))
    return res.filePath
  })
  handle('instances:update', (id, changes) => store.editInstance(id, changes))
  handle('instances:delete', (id) => store.deleteInstance(id))
  handle('instances:openFolder', (id) => openFolder(store.gameDir(id)))
  handle('instances:reapplyProfile', (id, profileId, items) => {
    const inst = store.reapplyProfile(id, profileId, items)
    adaptProfileMods(inst, items)
    return inst
  })
  handle('instances:openLogs', (id) => {
    const dir = path.join(store.gameDir(id), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    return openFolder(dir)
  })

  // Journal du jeu, mondes et sauvegardes
  handle('game:log', (id) => launcher.readLog(id))
  const notRunning = (id) => { if (launcher.isRunning(id)) throw new Error('Ferme d’abord Minecraft : le monde est en cours d’utilisation.') }
  handle('worlds:list', (id) => worlds.list(id))
  handle('worlds:backup', (id, name) => { notRunning(id); return worlds.backupWorld(id, name) })
  handle('worlds:restore', (id, name, file) => { notRunning(id); return worlds.restoreBackup(id, name, file) })
  handle('worlds:trash', (id, name) => { notRunning(id); return worlds.trashWorld(id, name) })
  handle('worlds:trashBackup', (id, name, file) => worlds.trashBackup(id, name, file))
  handle('worlds:openFolder', (id, name) => {
    if (name == null) {
      fs.mkdirSync(worlds.savesDir(id), { recursive: true })
      return openFolder(worlds.savesDir(id))
    }
    return openFolder(worlds.worldDir(id, name))
  })
  // Sauvegarde faite avant un changement de version de Minecraft : supprimée (remove) ou gardée, une fois les mondes vérifiés
  handle('worlds:resolvePending', async (id, remove) => {
    const pending = store.listInstances().find((i) => i.id === id)?.pendingBackups
    if (pending && remove === true) {
      for (const f of pending.files || []) { try { await worlds.trashBackup(id, f.world, f.file) } catch {} }
    }
    const inst = store.updateInstance(id, { pendingBackups: null })
    notifyInstances()
    return inst
  })
  handle('worlds:openBackups', (id, name) => {
    const dir = worlds.backupDir(id, name)
    fs.mkdirSync(dir, { recursive: true })
    return openFolder(dir)
  })

  // Modpacks et compatibilité des mods
  handle('content:checkModpackUpdate', (id) => content.checkModpackUpdate(id))
  handle('content:updateModpack', (id, versionId, opts) => content.updateModpack(id, versionId, { backup: opts?.backup === true }).id)
  handle('content:adaptMods', (id) => content.adaptModsTask(id).id)
  handle('instances:saveToProfile', (id) => store.saveOptionsToProfile(id))
  // kind : 'banner' ou 'logo'
  handle('instances:pickImage', async (id, kind) => {
    const res = await dialog.showOpenDialog(win, {
      title: kind === 'logo' ? 'Choisir un logo' : 'Choisir une image de bannière',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      properties: ['openFile']
    })
    if (res.canceled) return null
    return store.setInstanceImage(id, kind, res.filePaths[0])
  })
  handle('instances:resetImage', (id, kind) => store.setInstanceImage(id, kind))

  handle('app:version', () => app.getVersion())
  handle('app:installUpdate', () => autoUpdater.quitAndInstall())

  createWindow()
  setupUpdates()
})

// Mises à jour automatiques depuis les versions publiées sur GitHub (version installée uniquement)
function setupUpdates() {
  // Pas de mise à jour pour la copie de test du dossier de build : elle s'installerait au mauvais endroit
  if (!app.isPackaged || /[\\/]win-unpacked[\\/]/i.test(process.execPath)) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  const send = (state, info) => win && !win.isDestroyed() && win.webContents.send('app:update', { state, version: info?.version })
  autoUpdater.on('update-available', (info) => send('downloading', info))
  autoUpdater.on('update-downloaded', (info) => send('ready', info))
  autoUpdater.on('error', () => {})
  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000)
}

app.on('window-all-closed', () => app.quit())
