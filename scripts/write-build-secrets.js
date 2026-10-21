// Écrit src/main/build-secrets.json à partir de la variable d'environnement CURSEFORGE_API_KEY.
// À lancer avant de fabriquer l'installeur. Le fichier est ignoré par git.
const fs = require('fs')
const path = require('path')

const key = (process.env.CURSEFORGE_API_KEY || '').trim()
if (!key) {
  console.error('Variable CURSEFORGE_API_KEY absente : CurseForge sera indisponible dans cette version.')
  process.exit(1)
}
fs.writeFileSync(path.join(__dirname, '..', 'src', 'main', 'build-secrets.json'), JSON.stringify({ curseforgeKey: key }))
console.log('build-secrets.json écrit.')
