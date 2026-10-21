const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const store = require('./store')
const downloads = require('./downloads')
const settings = require('./settings')
const auth = require('./auth')
const content = require('./content')
const launcher = require('./launcher')
const { autoUpdater } = require('electron-updater')

const isDev = process.env.VITE_DEV === '1'
const dataRoot = path.join(app.getPath('appData'), '.terralauncher')
const defaultMinecraftDir = path.join(app.getPath('appData'), '.minecraft')

// terra://banner/<instanceId>/<fichier> sert les images de bannière des instances
protocol.registerSchemesAsPrivileged([{ scheme: 'terra', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  })
  if (isDev) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '../../dist/index.html'))
}

// Enregistre un handler IPC qui renvoie { ok, data } ou { ok:false, error }
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) } } catch (err) { return { ok: false, error: err.message } }
  })
}

app.whenReady().then(() => {
  store.init(dataRoot)
  settings.init(dataRoot)
  auth.init(dataRoot)
  launcher.init(dataRoot, (status) => {
    if (!win || win.isDestroyed()) return
    win.webContents.send('game:status', status)
    win.webContents.send('instances:changed')
    if (status.state === 'running' && settings.raw().minimizeOnLaunch) win.minimize()
  })

  protocol.handle('terra', (req) => {
    const url = new URL(req.url)
    const [id, file] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    // terra://banner/<id>/<fichier> ou terra://shot/<id>/<capture>
    const target = url.hostname === 'shot' ? store.folderPath(id, 'screenshots', path.basename(file)) : path.join(store.instanceDir(id), path.basename(file))
    return net.fetch(pathToFileURL(target).toString())
  })

  handle('window:minimize', () => win.minimize())
  handle('window:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()))
  handle('window:close', () => win.close())

  handle('meta:items', () => store.itemList())

  handle('profiles:list', () => store.listProfiles())
  handle('profiles:create', (data) => store.createProfile(data))
  handle('profiles:update', (id, changes) => store.updateProfile(id, changes))
  handle('profiles:delete', (id) => store.deleteProfile(id))
  handle('profiles:openFolder', (id) => shell.openPath(store.profileFilesDir(id)))
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

  handle('instances:list', () => store.listInstances())
  handle('instances:create', (data) => {
    const inst = store.createInstance(data)
    downloads.installVersion(dataRoot, inst.version)
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
  handle('app:openDataFolder', () => shell.openPath(dataRoot))

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
  handle('instances:files', (id, folder) => store.listInstanceFolder(id, folder))
  handle('instances:toggleMod', (id, name) => store.toggleMod(id, name))
  handle('instances:trashFile', (id, folder, name) => shell.trashItem(store.folderPath(id, folder, name)))
  handle('instances:openSubfolder', (id, folder) => {
    const dir = path.join(store.gameDir(id), folder)
    fs.mkdirSync(dir, { recursive: true })
    return shell.openPath(dir)
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
    shell.showItemInFolder(res.filePath)
    return res.filePath
  })
  handle('instances:update', (id, changes) => store.updateInstance(id, changes))
  handle('instances:delete', (id) => store.deleteInstance(id))
  handle('instances:openFolder', (id) => shell.openPath(store.gameDir(id)))
  handle('instances:reapplyProfile', (id, profileId, items) => store.reapplyProfile(id, profileId, items))
  handle('instances:saveToProfile', (id) => store.saveOptionsToProfile(id))
  handle('instances:pickBanner', async (id) => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choisir une image de bannière',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      properties: ['openFile']
    })
    if (res.canceled) return null
    return store.setInstanceBanner(id, res.filePaths[0])
  })

  handle('app:version', () => app.getVersion())
  handle('app:installUpdate', () => autoUpdater.quitAndInstall())

  createWindow()
  setupUpdates()
})

// Mises à jour automatiques depuis les versions publiées sur GitHub (version installée uniquement)
function setupUpdates() {
  if (!app.isPackaged) return
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
