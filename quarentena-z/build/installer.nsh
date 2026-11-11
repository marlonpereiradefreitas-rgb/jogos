!macro customInstall
  SetOutPath "$INSTDIR"
  SetShellVarContext current

  ; Força a criação do atalho na Área de Trabalho do usuário atual ($DESKTOP),
  ; mesmo em atualizações/reinstalações (--updated) onde o template padrão pula o atalho.
  CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ClearErrors

  ; Garante a criação também na pasta Desktop do OneDrive (comum no Windows 10/11)
  ReadEnvStr $0 "USERPROFILE"
  ${if} $0 != ""
    ${if} ${FileExists} "$0\OneDrive\Desktop\*.*"
      CreateShortCut "$0\OneDrive\Desktop\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$0\OneDrive\Desktop\${SHORTCUT_NAME}.lnk" "${APP_ID}"
      ClearErrors
    ${endIf}
    ${if} ${FileExists} "$0\Desktop\*.*"
      CreateShortCut "$0\Desktop\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
    ${endIf}
  ${endIf}

  ${if} $installMode == "all"
    SetShellVarContext all
  ${endIf}

  ; Atualiza o Windows Explorer para o ícone aparecer imediatamente na Área de Trabalho
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    SetShellVarContext current
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ReadEnvStr $0 "USERPROFILE"
    ${if} $0 != ""
      Delete "$0\OneDrive\Desktop\${SHORTCUT_NAME}.lnk"
      Delete "$0\Desktop\${SHORTCUT_NAME}.lnk"
    ${endIf}
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endIf}
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${endIf}
!macroend
