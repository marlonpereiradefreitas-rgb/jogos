$wsh = New-Object -ComObject WScript.Shell

$desktops = @(
    'C:\Users\marlo\OneDrive\Desktop',
    [Environment]::GetFolderPath('Desktop'),
    'C:\Users\marlo\Desktop'
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$installerPath = 'C:\Users\marlo\Downloads\quarentena-z-v19-4\INSTALADOR_WINDOWS\Instalar_Quarentena_Z.exe'
$portablePath  = 'C:\Users\marlo\Downloads\quarentena-z-v19-4\INSTALADOR_WINDOWS\Quarentena_Z_Portatil.exe'
$iconPath      = 'C:\Users\marlo\Downloads\quarentena-z-v19-4\assets\icon.ico'
$workingDir    = 'C:\Users\marlo\Downloads\quarentena-z-v19-4\INSTALADOR_WINDOWS'

foreach ($desk in $desktops) {
    # 1. Atalho Oficial do Instalador (.lnk) na Área de Trabalho
    $lnkInstaller = Join-Path $desk 'Instalar Quarentena Z.lnk'
    $sc1 = $wsh.CreateShortcut($lnkInstaller)
    $sc1.TargetPath = $installerPath
    $sc1.WorkingDirectory = $workingDir
    if (Test-Path $iconPath) { $sc1.IconLocation = "$iconPath,0" }
    $sc1.Description = 'Instalador Oficial de Quarentena Z'
    $sc1.Save()
    Write-Output "Atalho do Instalador criado em: $lnkInstaller"

    # 2. Atalho Direto para Jogar a Versão Portátil (.lnk)
    $lnkPortable = Join-Path $desk 'Quarentena Z (Jogar Direto).lnk'
    $sc2 = $wsh.CreateShortcut($lnkPortable)
    $sc2.TargetPath = $portablePath
    $sc2.WorkingDirectory = $workingDir
    if (Test-Path $iconPath) { $sc2.IconLocation = "$iconPath,0" }
    $sc2.Description = 'Jogar Quarentena Z (Versão Portátil sem Instalação)'
    $sc2.Save()
    Write-Output "Atalho Portátil criado em: $lnkPortable"

    # 3. Link de Download / Abertura Rápida (.url)
    $urlPath = Join-Path $desk 'Link de Download - Quarentena Z.url'
    $urlContent = @"
[InternetShortcut]
URL=file:///$($installerPath.Replace('\', '/'))
IconFile=$iconPath
IconIndex=0
"@
    Set-Content -Path $urlPath -Value $urlContent -Encoding UTF8
    Write-Output "Link de Download criado em: $urlPath"
}
