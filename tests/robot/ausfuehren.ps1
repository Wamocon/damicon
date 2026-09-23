<#
.SYNOPSIS
    Startet die Robot-Framework-Tests des Portals.

.DESCRIPTION
    Erwartet einen laufenden Entwicklungsserver unter http://localhost:3000
    und die Demo-Konten in Supabase (npm run db:seed-auth).

    Die Python-Umgebung liegt in .venv-robot und ist nicht im Git. Fehlt sie,
    legt dieses Skript sie an und installiert Robot Framework samt Browser.

.PARAMETER Profil
    Nur ein Geraeteprofil laufen lassen: schreibtisch, mobil-quer, mobil-hoch.

.EXAMPLE
    ./tests/robot/ausfuehren.ps1
    ./tests/robot/ausfuehren.ps1 -Profil mobil-quer
#>
param(
    [ValidateSet('schreibtisch', 'mobil-quer', 'mobil-hoch')]
    [string]$Profil
)

$ErrorActionPreference = 'Stop'
$wurzel = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$venv = Join-Path $wurzel '.venv-robot'
$python = Join-Path $venv 'Scripts\python.exe'

if (-not (Test-Path $python)) {
    Write-Host 'Python-Umgebung fehlt, wird angelegt ...'
    py -m venv $venv
    & $python -m pip install --upgrade pip
    & $python -m pip install -r (Join-Path $PSScriptRoot 'anforderungen.txt')
    & $python -m Browser.entry init
}

# Der Server muss stehen. Ohne ihn scheitert jeder Test an der Anmeldung, und
# die Meldung sagt dann nichts ueber die Oberflaeche aus.
try {
    $antwort = Invoke-WebRequest -Uri 'http://localhost:3000/de' -TimeoutSec 10 -UseBasicParsing
    if ($antwort.StatusCode -ne 200) { throw 'Unerwarteter Status' }
} catch {
    Write-Error 'Kein Entwicklungsserver unter http://localhost:3000. Zuerst "npm run dev" starten.'
    exit 1
}

$ergebnisse = Join-Path $PSScriptRoot 'ergebnisse'
$argumente = @('-m', 'robot', '--outputdir', $ergebnisse)
if ($Profil) { $argumente += @('--include', $Profil) }
$argumente += (Join-Path $PSScriptRoot 'portal.robot')

& $python @argumente
$code = $LASTEXITCODE

Write-Host ''
Write-Host "Bericht:  $ergebnisse\report.html"
Write-Host "Bilder:   $ergebnisse\bilder"
exit $code
