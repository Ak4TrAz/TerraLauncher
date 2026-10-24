const { contextBridge, ipcRenderer } = require('electron')

const call = async (channel, ...args) => {
  const res = await ipcRenderer.invoke(channel, ...args)
  if (!res.ok) throw new Error(res.error)
  return res.data
}

// Un fichier glissé sur la fenêtre ne doit pas remplacer l'interface
window.addEventListener('dragover', (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'none' })
window.addEventListener('drop', (e) => e.preventDefault())

contextBridge.exposeInMainWorld('terra', {
  window: {
    minimize: () => call('window:minimize'),
    maximize: () => call('window:maximize'),
    close: () => call('window:close')
  },
  items: () => call('meta:items'),
  profiles: {
    list: () => call('profiles:list'),
    create: (data) => call('profiles:create', data),
    update: (id, changes) => call('profiles:update', id, changes),
    remove: (id) => call('profiles:delete', id),
    openFolder: (id) => call('profiles:openFolder', id)
  },
  downloads: {
    list: () => call('downloads:list'),
    clear: () => call('downloads:clear'),
    onUpdate: (fn) => {
      const listener = (_e, list) => fn(list)
      ipcRenderer.on('downloads:update', listener)
      return () => ipcRenderer.removeListener('downloads:update', listener)
    }
  },
  settings: {
    get: () => call('settings:get'),
    update: (changes) => call('settings:update', changes)
  },
  app: {
    openExternal: (url) => call('app:openExternal', url),
    openDataFolder: () => call('app:openDataFolder'),
    version: () => call('app:version'),
    installUpdate: () => call('app:installUpdate'),
    onUpdate: (fn) => {
      const listener = (_e, info) => fn(info)
      ipcRenderer.on('app:update', listener)
      return () => ipcRenderer.removeListener('app:update', listener)
    }
  },
  accounts: {
    list: () => call('accounts:list'),
    login: () => call('accounts:login'),
    cancel: () => call('accounts:cancel'),
    setActive: (uuid) => call('accounts:setActive', uuid),
    remove: (uuid) => call('accounts:remove', uuid)
  },
  content: {
    search: (opts) => call('content:search', opts),
    versions: (platform, id) => call('content:versions', platform, id),
    details: (platform, id) => call('content:details', platform, id),
    filters: (platform, type) => call('content:filters', platform, type),
    install: (project, instanceId) => call('content:install', project, instanceId),
    installModpack: (opts) => call('content:installModpack', opts),
    checkModUpdates: (instanceId) => call('content:checkModUpdates', instanceId),
    updateMods: (instanceId, names) => call('content:updateMods', instanceId, names)
  },
  game: {
    launch: (id, opts) => call('game:launch', id, opts),
    stop: (id) => call('game:stop', id),
    repair: (id) => call('game:repair', id),
    totalMemory: () => call('system:memory'),
    onStatus: (fn) => {
      const listener = (_e, status) => fn(status)
      ipcRenderer.on('game:status', listener)
      return () => ipcRenderer.removeListener('game:status', listener)
    }
  },
  onInstancesChanged: (fn) => {
    const listener = () => fn()
    ipcRenderer.on('instances:changed', listener)
    return () => ipcRenderer.removeListener('instances:changed', listener)
  },
  importer: {
    sources: () => call('import:sources'),
    pickFolder: () => call('import:pickFolder'),
    scan: (dir) => call('import:scan', dir),
    run: (profileId, dir, paths) => call('import:run', profileId, dir, paths)
  },
  external: {
    scan: () => call('external:scan'),
    fromFolder: (dir) => call('external:fromFolder', dir),
    importInstance: (item) => call('external:import', item)
  },
  instances: {
    list: () => call('instances:list'),
    create: (data) => call('instances:create', data),
    update: (id, changes) => call('instances:update', id, changes),
    remove: (id) => call('instances:delete', id),
    openFolder: (id) => call('instances:openFolder', id),
    reapplyProfile: (id, profileId, items) => call('instances:reapplyProfile', id, profileId, items),
    saveToProfile: (id) => call('instances:saveToProfile', id),
    pickImage: (id, kind) => call('instances:pickImage', id, kind),
    resetImage: (id, kind) => call('instances:resetImage', id, kind),
    files: (id, folder) => call('instances:files', id, folder),
    toggleMod: (id, name) => call('instances:toggleMod', id, name),
    trashFile: (id, folder, name) => call('instances:trashFile', id, folder, name),
    openSubfolder: (id, folder) => call('instances:openSubfolder', id, folder),
    duplicate: (id, name) => call('instances:duplicate', id, name),
    exportZip: (id) => call('instances:export', id)
  }
})
