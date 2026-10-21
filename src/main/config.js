// Configuration intégrée au launcher distribué.
const fs = require('fs')
const path = require('path')

// Client ID de l'application Azure TerraLauncher. Ce n'est pas un secret :
// il apparaît dans l'adresse de connexion Microsoft à chaque login.
const MS_CLIENT_ID = 'fe60716c-2c6f-4fb4-9e60-c5a75bd85ab5'

// Clé CurseForge : jamais dans le dépôt. Elle est écrite dans build-secrets.json
// (ignoré par git) au moment de fabriquer l'installeur : npm run secrets
function buildSecrets() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'build-secrets.json'), 'utf8')) } catch { return {} }
}

module.exports = { MS_CLIENT_ID, buildSecrets }
