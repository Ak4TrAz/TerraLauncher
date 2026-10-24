// Mondes (dossier saves) d'une instance et leurs sauvegardes .zip.
// Sauvegardes rangées hors du dossier de jeu : instances/<nom>/backups/<monde>/<date>[-auto|-version].zip
// -auto : avant une mise à jour de mods (les plus anciennes partent à la corbeille) ; -version : avant un changement
// de version de Minecraft (gardée jusqu'à ce que le joueur la supprime) ; sans suffixe : faite à la main.
// Les archives sont faites par tar.exe, fourni avec Windows 10 et 11 : rien n'est chargé en mémoire.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { execFile } = require('child_process')
const { shell } = require('electron')
const store = require('./store')

const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
const AUTO_KEEP = 3 // sauvegardes automatiques gardées par monde (un monde peut peser plusieurs Go)
const BACKUP_FILE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-auto|-version)?\.zip$/
const kindOf = (file) => (file.endsWith('-auto.zip') ? 'auto' : file.endsWith('-version.zip') ? 'version' : 'manual')

const savesDir = (id) => path.join(store.gameDir(id), 'saves')
const backupsRoot = (id) => path.join(store.instanceDir(id), 'backups')

// Nom de monde : un dossier qui existe dans saves, jamais un chemin
function checkName(name) {
  if (typeof name !== 'string' || !name || name.length > 200 || name !== path.basename(name) || name.startsWith('.') || /[<>:"/\\|?*\x00-\x1f]/.test(name)) throw new Error('Monde refusé.')
  return name
}

function worldDir(id, name) {
  const dir = path.join(savesDir(id), checkName(name))
  if (!fs.existsSync(path.join(dir, 'level.dat'))) throw new Error('Monde introuvable.')
  return dir
}

function backupDir(id, name) {
  return path.join(backupsRoot(id), checkName(name))
}

function backupPath(id, name, file) {
  if (typeof file !== 'string' || !BACKUP_FILE.test(file)) throw new Error('Sauvegarde refusée.')
  const full = path.join(backupDir(id, name), file)
  if (!fs.existsSync(full)) throw new Error('Sauvegarde introuvable.')
  return full
}

// ---------- Lecture de level.dat (NBT compressé) ----------
// On cherche directement les balises utiles : nom du monde, mode de jeu, hardcore, dernière partie, version.

function tag(buf, type, name, from = 0) {
  const key = Buffer.concat([Buffer.from([type, 0, Buffer.byteLength(name)]), Buffer.from(name)])
  const i = buf.indexOf(key, from)
  return i < 0 ? -1 : i + key.length
}

function readString(buf, at) {
  if (at < 0) return null
  const len = buf.readUInt16BE(at)
  return buf.toString('utf8', at + 2, at + 2 + len)
}

function readLevel(dir) {
  try {
    const buf = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'level.dat')))
    const gameType = tag(buf, 3, 'GameType')
    const hardcore = tag(buf, 1, 'hardcore')
    const lastPlayed = tag(buf, 4, 'LastPlayed')
    const version = tag(buf, 10, 'Version')
    return {
      title: readString(buf, tag(buf, 8, 'LevelName')),
      gameType: gameType < 0 ? null : buf.readInt32BE(gameType),
      hardcore: hardcore < 0 ? false : buf[hardcore] === 1,
      lastPlayed: lastPlayed < 0 ? null : Number(buf.readBigInt64BE(lastPlayed)),
      version: version < 0 ? null : readString(buf, tag(buf, 8, 'Name', version))
    }
  } catch {
    return {}
  }
}

async function sizeOf(p) {
  try {
    const st = await fs.promises.lstat(p)
    if (!st.isDirectory()) return st.size
    const names = await fs.promises.readdir(p)
    let total = 0
    for (const n of names) total += await sizeOf(path.join(p, n))
    return total
  } catch { return 0 }
}

// ---------- Sauvegardes ----------

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

function listBackups(id, name) {
  const dir = backupDir(id, name)
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => BACKUP_FILE.test(f)) } catch { return [] }
  return files
    .map((file) => {
      const st = fs.statSync(path.join(dir, file))
      return { file, date: st.mtimeMs, size: st.size, kind: kindOf(file), auto: kindOf(file) === 'auto' }
    })
    .sort((a, b) => b.date - a.date)
}

function tar(args) {
  return new Promise((resolve, reject) => {
    execFile(TAR, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) reject(new Error(`Archive impossible : ${(stderr || err.message).toString().trim().split(/\r?\n/)[0]}`))
      else resolve()
    })
  })
}

// Archive .zip d'un monde ; les automatiques au-delà de AUTO_KEEP partent à la corbeille
async function backupWorld(id, name, { kind = 'manual' } = {}) {
  const auto = kind === 'auto'
  worldDir(id, name)
  const dir = backupDir(id, name)
  fs.mkdirSync(dir, { recursive: true })
  const file = `${stamp()}${kind === 'manual' ? '' : `-${kind}`}.zip`
  const dest = path.join(dir, file)
  if (!fs.existsSync(dest)) { // même seconde : l'archive vient d'être faite
    const tmp = dest + '.part'
    try {
      await tar(['-c', '--format', 'zip', '--options', 'zip:hdrcharset=UTF-8', '-f', tmp, '-C', savesDir(id), name])
      fs.renameSync(tmp, dest)
    } catch (err) {
      fs.rmSync(tmp, { force: true })
      throw err
    }
  }
  if (auto) {
    for (const old of listBackups(id, name).filter((b) => b.auto).slice(AUTO_KEEP)) {
      try { await shell.trashItem(path.join(dir, old.file)) } catch { fs.rmSync(path.join(dir, old.file), { force: true }) }
    }
  }
  return { file, size: fs.statSync(dest).size }
}

// Dernière modification d'un monde : level.dat est réécrit à chaque sauvegarde du jeu
const modifiedAt = (id, name) => { try { return fs.statSync(path.join(savesDir(id), name, 'level.dat')).mtimeMs } catch { return 0 } }

// Sauvegarde avant une opération risquée ; renvoie [{ world, file }].
// kind 'auto' (mise à jour de mods) : seuls les mondes modifiés depuis leur dernière sauvegarde sont archivés,
// les gros mondes ne sont pas recopiés pour rien. kind 'version' : tous les mondes, archive gardée à part.
async function backupAll(id, task, { kind = 'auto' } = {}) {
  const names = worldNames(id).filter((name) => kind !== 'auto' || (listBackups(id, name)[0]?.date || 0) < modifiedAt(id, name))
  const out = []
  for (let i = 0; i < names.length; i++) {
    if (task) {
      task.detail = `Sauvegarde des mondes (${i + 1}/${names.length}) : ${names[i]}`
      require('./downloads').notify(true)
    }
    out.push({ world: names[i], file: (await backupWorld(id, names[i], { kind })).file })
  }
  return out
}

// Une sauvegarde redevient un monde à part (« Monde (restauré) ») : le monde actuel n'est jamais écrasé
async function restoreBackup(id, name, file) {
  const zip = backupPath(id, name, file)
  const work = path.join(backupsRoot(id), `.restauration-${Date.now()}`)
  fs.mkdirSync(work, { recursive: true })
  try {
    await tar(['-x', '-f', zip, '-C', work])
    const extracted = path.join(work, name)
    if (!fs.existsSync(path.join(extracted, 'level.dat'))) throw new Error('Cette sauvegarde ne contient pas de monde.')
    let target = fs.existsSync(path.join(savesDir(id), name)) ? `${name} (restauré)` : name // monde supprimé : il reprend son nom
    for (let n = 2; fs.existsSync(path.join(savesDir(id), target)); n++) target = `${name} (restauré ${n})`
    fs.mkdirSync(savesDir(id), { recursive: true })
    fs.renameSync(extracted, path.join(savesDir(id), target))
    return target
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

// ---------- Liste ----------

function worldNames(id) {
  try {
    return fs.readdirSync(savesDir(id), { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(savesDir(id), d.name, 'level.dat')))
      .map((d) => d.name)
  } catch { return [] }
}

async function list(id) {
  const out = []
  for (const name of worldNames(id)) {
    const dir = path.join(savesDir(id), name)
    const level = readLevel(dir)
    out.push({
      name,
      title: level.title || name,
      gameType: level.gameType,
      hardcore: level.hardcore,
      version: level.version,
      lastPlayed: level.lastPlayed || fs.statSync(path.join(dir, 'level.dat')).mtimeMs,
      size: await sizeOf(dir),
      hasIcon: fs.existsSync(path.join(dir, 'icon.png')),
      backups: listBackups(id, name)
    })
  }
  // Mondes supprimés dont il reste des sauvegardes : on peut encore les restaurer
  const present = new Set(out.map((w) => w.name.toLowerCase()))
  let saved = []
  try { saved = fs.readdirSync(backupsRoot(id), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name) } catch {}
  for (const name of saved) {
    if (present.has(name.toLowerCase())) continue
    let backups
    try { backups = listBackups(id, name) } catch { continue }
    if (!backups.length) continue
    out.push({ name, title: name, deleted: true, lastPlayed: backups[0].date, size: 0, hasIcon: false, backups })
  }
  return out.sort((a, b) => (a.deleted === b.deleted ? b.lastPlayed - a.lastPlayed : a.deleted ? 1 : -1))
}

const trashWorld = (id, name) => shell.trashItem(worldDir(id, name))
const trashBackup = (id, name, file) => shell.trashItem(backupPath(id, name, file))
const worldIcon = (id, name) => path.join(worldDir(id, name), 'icon.png')

module.exports = { list, backupWorld, backupAll, restoreBackup, trashWorld, trashBackup, worldDir, backupDir, worldIcon, savesDir }
