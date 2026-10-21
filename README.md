# TerraLauncher

Launcher Minecraft: Java Edition pour la communauté **Terranova**.

## Fonctionnalités

- **Profils réutilisables** : touches (`options.txt`), shaders, resource packs, serveurs, configs de mods. Un profil s'importe à la création de chaque instance ; les shaders et resource packs sont partagés sans être dupliqués.
- **Import depuis d'autres launchers** : GDLauncher, Modrinth App, Prism, CurseForge, `.minecraft`, avec choix fichier par fichier.
- **Découvrir** : recherche et installation de modpacks, mods, shaders et resource packs depuis **Modrinth** et **CurseForge**, dépendances comprises.
- **Connexion Microsoft** officielle (OAuth dans le navigateur, PKCE). Le launcher vérifie que le compte possède Minecraft Java et n'a **aucun mode hors ligne** : la connexion est obligatoire pour jouer.
- Téléchargements suivis en temps réel, avec vérification SHA-1.

## Sécurité

- Le launcher ne demande jamais le mot de passe Microsoft : la connexion se fait sur la page officielle de Microsoft.
- Les jetons de connexion et la clé CurseForge sont chiffrés par Windows (`safeStorage`) sur le PC de l'utilisateur.
- Aucune clé ni aucun secret n'est stocké dans ce dépôt.

## Développement

Prérequis : Node.js 20+.

```bash
npm install
npm run dev
```

Le Client ID Azure et la clé d'API CurseForge se renseignent dans l'application : **Paramètres → Connexions**.

## Technologies

Electron, React, Tailwind CSS, Framer Motion, adm-zip.
