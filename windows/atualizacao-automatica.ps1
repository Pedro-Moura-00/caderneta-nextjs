# Liga ou desliga a atualizacao automatica (tarefa agendada a cada 15 minutos).
#   atualizacao-automatica.ps1 -Ligar
#   atualizacao-automatica.ps1 -Desligar

param([switch]$Ligar, [switch]$Desligar)

$ErrorActionPreference = 'Stop'
$Nome = 'Caderneta - atualizar'

if ($Desligar) {
    Unregister-ScheduledTask -TaskName $Nome -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host 'Atualizacao automatica desligada.'
    exit 0
}

$script = Join-Path $PSScriptRoot 'atualizar-caderneta.ps1'
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $script + '"')
$gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 15) -RepetitionDuration (New-TimeSpan -Days 3650)
$opcoes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $Nome -Action $acao -Trigger $gatilho -Settings $opcoes `
    -Description 'Busca versao nova da Caderneta no GitHub e atualiza o Docker.' -Force | Out-Null
Write-Host 'Atualizacao automatica ligada: a cada 15 minutos o notebook confere o GitHub.'
Write-Host ('Registro em: ' + (Join-Path (Split-Path -Parent $PSScriptRoot) 'logs\atualizacao.log'))
