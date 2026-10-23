; Installeur assisté de TerraLauncher : Bienvenue → Dossier d'installation → Installation → Fin.
; (inclus par electron-builder via nsis.include)

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bienvenue dans l'installation de TerraLauncher"
  !define MUI_WELCOMEPAGE_TEXT "Cet assistant va installer TerraLauncher, le launcher Minecraft de la communauté Terranova.$\r$\n$\r$\nProfils de touches et de shaders, modpacks Modrinth et CurseForge, import de tes instances GDLauncher, Modrinth ou CurseForge : tout est prêt en quelques clics.$\r$\n$\r$\nClique sur Suivant pour continuer."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Toujours pour l'utilisateur courant : pas de page « pour qui installer », pas de droits administrateur
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
