// Paramètres du launcher (settings.json) et secrets chiffrés par Windows (secrets.bin).
const fs = require('fs')
const path = require('path')
const { safeStorage } = require('electron')

const DEFAULTS = {
  animations: true,
  startPage: 'library',
  msClientId: ''
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

const get = () => ({ ...settings, curseforgeKey: secrets.curseforgeKey ? '••••••••' : '' , hasCurseforgeKey: !!secrets.curseforgeKey })

function update(changes) {
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

module.exports = { init, get, update, raw, getSecret, setSecret }
