// Paramètres du launcher (settings.json) et secrets chiffrés par Windows (secrets.bin).
const fs = require('fs')
const path = require('path')
const { safeStorage, app } = require('electron')
const config = require('./config')

// En développement (npm run dev) l'onglet Connexions permet de remplacer les clés intégrées
const devMode = () => !app.isPackaged

const DEFAULTS = {
  animations: true,
  startPage: 'library',
  msClientId: '',
  memory: 4096,
  jvmArgs: '',
  gpu: true,
  minimizeOnLaunch: true,
  autoBackup: true,
  serverAddress: 'terranova.ist3rik.com'
}

let file = null
let secretsFile = null
let settings = { ...DEFAULTS }
let secrets = {}

function init(root) {
  file = path.join(root, 'settings.json')
  secretsFile = path.join(root, 'secrets.bin')
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) } } catch {}
  try { secrets = JSON.parse(safeStorage.decryptString(fs.readFileSync(secretsFile))) } catch {}
}

const msClientId = () => (devMode() && settings.msClientId) || config.MS_CLIENT_ID
const curseforgeKey = () => (devMode() && secrets.curseforgeKey) || config.buildSecrets().curseforgeKey || ''

const get = () => ({
  ...settings,
  devMode: devMode(),
  hasMsClientId: !!msClientId(),
  curseforgeKey: secrets.curseforgeKey ? '••••••••' : '',
  hasCurseforgeKey: !!curseforgeKey()
})

// Options Java qui font charger du code à la JVM (agent, bibliothèque native, commande, fichier d'arguments)
const FORBIDDEN_JVM = /^(-javaagent|-agentpath|-agentlib|-Xrun|-XX:OnError|-XX:OnOutOfMemoryError|@)/i

function checkJvmArgs(value) {
  for (const arg of value.split(/\s+/).filter(Boolean)) {
    if (FORBIDDEN_JVM.test(arg.replace(/^["']+/, ''))) throw new Error(`Argument Java refusé : ${arg.slice(0, 60)}`)
  }
}

const isString = (max) => (v) => typeof v === 'string' && v.length <= max
const isBool = (v) => typeof v === 'boolean'

// Seuls réglages modifiables depuis l'interface, avec leur contrôle
const EDITABLE = {
  animations: isBool,
  startPage: (v) => ['library', 'discover', 'profiles'].includes(v),
  msClientId: isString(100),
  memory: (v) => Number.isInteger(v) && v >= 512 && v <= 1048576,
  jvmArgs: (v) => isString(2000)(v) && (checkJvmArgs(v), true),
  gpu: isBool,
  minimizeOnLaunch: isBool,
  autoBackup: isBool,
  serverAddress: (v) => isString(255)(v) && /^([^\s-]\S*)?$/.test(v),
  curseforgeKey: isString(200)
}

function update(input) {
  if (!input || typeof input !== 'object') throw new Error('Réglages refusés')
  const changes = {}
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(EDITABLE, key)) throw new Error(`Réglage inconnu : ${key}`)
    if (value === undefined) continue
    if (!EDITABLE[key](value)) throw new Error(`Valeur refusée pour « ${key} »`)
    changes[key] = value
  }
  const { curseforgeKey, ...rest } = changes
  if (curseforgeKey !== undefined && !curseforgeKey.startsWith('•')) setSecret('curseforgeKey', curseforgeKey.trim())
  settings = { ...settings, ...rest }
  if (typeof settings.msClientId === 'string') settings.msClientId = settings.msClientId.trim()
  fs.writeFileSync(file, JSON.stringify(settings, null, 2))
  return get()
}

function getSecret(key) { return secrets[key] }
function setSecret(key, value) {
  if (value) secrets[key] = value
  else delete secrets[key]
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Chiffrement Windows indisponible')
  fs.writeFileSync(secretsFile, safeStorage.encryptString(JSON.stringify(secrets)))
}

const raw = () => settings

module.exports = { init, get, update, raw, getSecret, setSecret, msClientId, curseforgeKey, devMode }
