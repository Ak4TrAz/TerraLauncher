const { contextBridge, ipcRenderer } = require('electron')

const call = async (channel, ...args) => {
  const res = await ipcRenderer.invoke(channel, ...args)
  if (!res.ok) throw new Error(res.error)
  return res.data
}

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
    openDataFolder: () => call('app:openDataFolder')
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
    install: (project, instanceId) => call('content:install', project, instanceId),
    installModpack: (opts) => call('content:installModpack', opts)
  },
  game: {
    launch: (id) => call('game:launch', id),
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
  instances: {
    list: () => call('instances:list'),
    create: (data) => call('instances:create', data),
    update: (id, changes) => call('instances:update', id, changes),
    remove: (id) => call('instances:delete', id),
    openFolder: (id) => call('instances:openFolder', id),
    reapplyProfile: (id, profileId, items) => call('instances:reapplyProfile', id, profileId, items),
    saveToProfile: (id) => call('instances:saveToProfile', id),
    pickBanner: (id) => call('instances:pickBanner', id)
  }
})
