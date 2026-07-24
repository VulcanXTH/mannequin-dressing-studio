; Force-close any running instance (and its child/renderer/GPU processes)
; BEFORE electron-builder's built-in "app is running" check / old-version uninstall step.
; Without this, NSIS raises the dialog:
;   "Mannequin Dressing Studio cannot be closed. Please close it manually
;    and click Retry to continue."
; ${APP_EXECUTABLE_FILENAME} expands to "Mannequin Dressing Studio.exe" (spaces handled
; by the double quotes inside the single-quoted nsExec string). /T kills the whole tree, /F forces it.
!macro customInit
  nsExec::Exec 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  Sleep 500
!macroend
