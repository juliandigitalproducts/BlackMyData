; BlackMyData Windows Installer NSIS Script
; Author: juliandigitalproducts

!include "MUI2.nsh"
!include "FileFunc.nsh"

; Version comes from the build (windows/build.sh passes -DVERSION from tools/version.sh), not from four places in
; this file (code review B32).
!ifndef VERSION
  !error "Build with windows/build.sh (makensis -DVERSION=x.y.z)"
!endif

; General Configuration
Name "BlackMyData"
OutFile "../dist/BlackMyData-Windows-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\BlackMyData"
InstallDirRegKey HKCU "Software\BlackMyData" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

; Branding & Metadata
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "BlackMyData"
VIAddVersionKey "CompanyName" "juliandigitalproducts"
VIAddVersionKey "LegalCopyright" "juliandigitalproducts"
VIAddVersionKey "FileDescription" "BlackMyData - Lokale KI-gestuetzte PDF-Schwaerzung"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

; Icons
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"

; Modern UI Settings
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Willkommen bei BlackMyData"
!define MUI_WELCOMEPAGE_TEXT "BlackMyData schwaerzt Dokumente vollstaendig lokal auf Ihrem Computer mit moderner KI und OCR.$\r$\n$\r$\nEs werden niemals Daten ins Internet oder an fremde Server uebertragen.$\r$\n$\r$\nKlicken Sie auf Weiter, um fortzufahren."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "BlackMyData jetzt starten"
!define MUI_FINISHPAGE_RUN_FUNCTION "LaunchApp"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "German"

Function LaunchApp
    Exec '"$INSTDIR\BlackMyData.exe"'
FunctionEnd

; A running BlackMyData keeps its files open: end it before files are replaced or removed.
!macro StopRunning
    nsExec::Exec 'taskkill /IM BlackMyData.exe /F'
    Pop $0
!macroend

Section "BlackMyData Core" SecCore
    !insertmacro StopRunning
    SetOutPath "$INSTDIR"
    File "icon.ico"
    ; Native starter (windows/launcher): serves the app on http://127.0.0.1 and opens it in Edge/Chrome/the default
    ; browser. Replaces the VBS/BAT starters with the file:// access switch (code review B13).
    File "build/BlackMyData.exe"
    ; Older versions: remove the previous starters and their profile shortcut.
    Delete "$INSTDIR\BlackMyData.bat"
    Delete "$INSTDIR\BlackMyData.vbs"
    Delete "$SMPROGRAMS\BlackMyData\BlackMyData (Konsole).lnk"
    RMDir /r "$INSTDIR\web"

    ; Same standalone file set as the macOS and Android apps (app/static).
    SetOutPath "$INSTDIR\web"
    File "../app/static/index.html"
    File "../app/static/strato_app.js"
    File "../app/static/style.css"
    File "../app/static/pii_engine.js"
    File "../app/static/ocr_utils.js"
    File "../app/static/icon.svg"
    SetOutPath "$INSTDIR\web\vendor"
    File /r /x "*.traineddata" "../app/static/vendor/*.*"
    ; License texts (MIT project license, third-party notices, Apache-2.0 full text)
    SetOutPath "$INSTDIR\web\licenses"
    File /x ".DS_Store" "../app/static/licenses/*.*"
    SetOutPath "$INSTDIR"
    File "../app/static/licenses/LICENSE.txt"
    File "../app/static/licenses/THIRD_PARTY_NOTICES.txt"

    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Registry entries for Add/Remove Programs
    WriteRegStr HKCU "Software\BlackMyData" "InstallDir" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BlackMyData" "DisplayName" "BlackMyData"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BlackMyData" "DisplayIcon" "$INSTDIR\icon.ico"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BlackMyData" "DisplayVersion" "${VERSION}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BlackMyData" "Publisher" "juliandigitalproducts"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BlackMyData" "UninstallString" '"$INSTDIR\Uninstall.exe"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BlackMyData" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BlackMyData" "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BlackMyData" "NoRepair" 1

    ; Shortcuts
    CreateDirectory "$SMPROGRAMS\BlackMyData"
    CreateShortcut "$SMPROGRAMS\BlackMyData\BlackMyData.lnk" "$INSTDIR\BlackMyData.exe" "" "$INSTDIR\icon.ico" 0 SW_SHOWNORMAL "" "Lokale KI-gestuetzte PDF-Schwaerzung"
    CreateShortcut "$SMPROGRAMS\BlackMyData\Uninstall BlackMyData.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\Uninstall.exe" 0
    CreateShortcut "$DESKTOP\BlackMyData.lnk" "$INSTDIR\BlackMyData.exe" "" "$INSTDIR\icon.ico" 0 SW_SHOWNORMAL "" "Lokale KI-gestuetzte PDF-Schwaerzung"
SectionEnd

Section "Uninstall"
    !insertmacro StopRunning
    Delete "$DESKTOP\BlackMyData.lnk"
    Delete "$SMPROGRAMS\BlackMyData\BlackMyData.lnk"
    Delete "$SMPROGRAMS\BlackMyData\BlackMyData (Konsole).lnk"
    Delete "$SMPROGRAMS\BlackMyData\Uninstall BlackMyData.lnk"
    RMDir "$SMPROGRAMS\BlackMyData"

    RMDir /r "$INSTDIR\web"
    Delete "$INSTDIR\icon.ico"
    Delete "$INSTDIR\LICENSE.txt"
    Delete "$INSTDIR\THIRD_PARTY_NOTICES.txt"
    Delete "$INSTDIR\BlackMyData.exe"
    Delete "$INSTDIR\BlackMyData.bat"
    Delete "$INSTDIR\BlackMyData.vbs"
    Delete "$INSTDIR\Uninstall.exe"
    RMDir "$INSTDIR"

    ; The browser profile holds the settings and any AI server API keys (code review B32). Ask; a silent
    ; uninstall (/S) removes it as well.
    IfFileExists "$LOCALAPPDATA\BlackMyData\*.*" 0 done_profile
    MessageBox MB_YESNO|MB_ICONQUESTION "Auch die Einstellungen von BlackMyData loeschen (inklusive gespeicherter API-Schluessel fuer KI-Server)?" /SD IDYES IDNO done_profile
    RMDir /r "$LOCALAPPDATA\BlackMyData"
    done_profile:

    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\BlackMyData"
    DeleteRegKey HKCU "Software\BlackMyData"
SectionEnd
