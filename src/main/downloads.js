// Gestionnaire de téléchargements avec suivi en temps réel.
// Chaque tâche : { id, title, detail, received, total, speed, status: 'running'|'done'|'error', error }
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

const tasks = new Map()
let listener = () => {}
let timer = null

function onUpdate(fn) { listener = fn }
function list() { return [...tasks.values()].sort((a, b) => b.startedAt - a.startedAt) }

// Regroupe les notifications (au plus 5 par seconde)
function notify(now = false) {
  if (now) { clearTimeout(timer); timer = null; return listener(list()) }
  if (timer) return
  timer = setTimeout(() => { timer = null; listener(list()) }, 200)
}

function clearFinished() {
  for (const [id, t] of tasks) if (t.status !== 'running') tasks.delete(id)
  notify(true)
}

function sha1File(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex')
}

const STALL_MS = 30000

// Télécharge url vers dest (2 essais) en mettant à jour la tâche ; vérifie le sha1 s'il est fourni.
async function fetchToFile(task, url, dest, sha1) {
  if (sha1 && fs.existsSync(dest) && sha1File(dest) === sha1) {
    task.received += fs.statSync(dest).size
    return
  }
  const before = task.received
  try {
    await fetchOnce(task, url, dest, sha1)
  } catch (err) {
    task.received = before
    await fetchOnce(task, url, dest, sha1)
  }
}

async function fetchOnce(task, url, dest, sha1) {
  // Annule si le serveur ne renvoie plus rien pendant STALL_MS
  const ctrl = new AbortController()
  let stall = setTimeout(() => ctrl.abort(), STALL_MS)
  const alive = () => { clearTimeout(stall); stall = setTimeout(() => ctrl.abort(), STALL_MS) }
  try {
    await stream(task, url, dest, sha1, ctrl.signal, alive)
  } catch (err) {
    throw ctrl.signal.aborted ? new Error('Le serveur ne répond plus') : err
  } finally {
    clearTimeout(stall)
  }
}

async function stream(task, url, dest, sha1, signal, alive) {
  const res = await fetch(url, { signal, headers: { 'User-Agent': 'TerraLauncher/0.1.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = dest + '.part'
  const out = fs.createWriteStream(tmp)
  const hash = crypto.createHash('sha1')
  const reader = res.body.getReader()
  let windowStart = Date.now()
  let windowBytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      alive()
      out.write(value)
      hash.update(value)
      task.received += value.length
      windowBytes += value.length
      const elapsed = Date.now() - windowStart
      if (elapsed > 500) {
        task.speed = Math.round((windowBytes * 1000) / elapsed)
        windowStart = Date.now()
        windowBytes = 0
      }
      notify()
    }
  } catch (err) {
    out.destroy()
    fs.rmSync(tmp, { force: true })
    throw err
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())))
  if (sha1 && hash.digest('hex') !== sha1) {
    fs.rmSync(tmp, { force: true })
    throw new Error('Fichier corrompu (empreinte SHA-1 différente)')
  }
  fs.renameSync(tmp, dest)
}

async function run(task, fn) {
  try {
    await fn(task)
    task.status = 'done'
    task.received = task.total || task.received
    task.speed = 0
  } catch (err) {
    task.status = 'error'
    task.error = err.message
  }
  notify(true)
  return task
}

function newTask(title, detail) {
  const task = { id: crypto.randomBytes(5).toString('hex'), title, detail, received: 0, total: 0, speed: 0, status: 'running', error: null, startedAt: Date.now() }
  tasks.set(task.id, task)
  notify(true)
  return task
}

// Télécharge plusieurs fichiers en parallèle dans une même tâche.
// files : [{ url, dest, sha1?, size? }] ; renvoie la liste des fichiers en échec.
async function downloadFiles(task, files, concurrency = 6) {
  task.total += files.reduce((s, f) => s + (f.size || 0), 0)
  notify(true)
  const failed = []
  let next = 0
  const worker = async () => {
    while (next < files.length) {
      const f = files[next++]
      // f.urls : miroirs essayés dans l'ordre si le premier échoue
      const urls = f.urls?.length ? f.urls : [f.url]
      let lastError = null
      for (const url of urls) {
        try {
          await fetchToFile(task, url, f.dest, f.sha1)
          lastError = null
          break
        } catch (err) {
          lastError = err
        }
      }
      if (lastError) failed.push({ ...f, error: lastError.message })
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker))
  return failed
}

// Lance une tâche générique ; fn(task) fait le travail.
function start(title, detail, fn) {
  const task = newTask(title, detail)
  run(task, fn)
  return task
}

// Installe une version de Minecraft (fichier de version + client.jar) dans <root>/versions/<id>/
function installVersion(root, versionId) {
  const running = [...tasks.values()].find((t) => t.version === versionId && t.status === 'running')
  if (running) return running
  const task = newTask(`Minecraft ${versionId}`, 'Récupération des informations…')
  task.version = versionId
  run(task, async (t) => {
    const manifest = await (await fetch(MANIFEST)).json()
    const entry = manifest.versions.find((v) => v.id === versionId)
    if (!entry) throw new Error(`Version ${versionId} introuvable`)
    const dir = path.join(root, 'versions', versionId)
    const jsonPath = path.join(dir, `${versionId}.json`)
    const json = await (await fetch(entry.url)).json()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(jsonPath, JSON.stringify(json))
    const client = json.downloads.client
    t.total = client.size
    t.detail = 'Client du jeu'
    notify(true)
    await fetchToFile(t, client.url, path.join(dir, `${versionId}.jar`), client.sha1)
    t.detail = 'Installé'
  })
  return task
}

module.exports = { onUpdate, list, clearFinished, installVersion, downloadFiles, fetchToFile, start, begin: newTask, notify }
