# Caderneta do Bar - atualiza a partir do GitHub (roda no notebook do bar).
#
# Se houver versao nova no GitHub: faz backup do banco, baixa o codigo e
# reconstroi o container. Se nao houver, nao faz nada.
#   -Forcar  reconstroi mesmo sem versao nova
#
# (texto sem acentos de proposito: o PowerShell 5.1 le arquivos sem BOM como ANSI)

param([switch]$Forcar)

# 'Continue': no PowerShell 5.1, 'Stop' trata qualquer texto do git/docker no stderr como erro;
# as falhas reais sao detectadas pelo codigo de saida (Executar).
$ErrorActionPreference = 'Continue'
$Raiz = Split-Path -Parent $PSScriptRoot
Set-Location $Raiz

$Logs = Join-Path $Raiz 'logs'
New-Item -ItemType Directory -Force $Logs | Out-Null
$Log = Join-Path $Logs 'atualizacao.log'

function Registrar([string]$msg) {
    $linha = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $msg
    Add-Content -Path $Log -Value $linha
    Write-Host $linha
}

# roda um comando externo e para se ele falhar
function Executar([string]$descricao, [scriptblock]$comando) {
    & $comando
    if ($LASTEXITCODE -ne 0) { throw "$descricao falhou (codigo $LASTEXITCODE)" }
}

try {
    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Registrar 'Docker Desktop nao esta rodando; tento de novo na proxima vez.'
        exit 1
    }

    git fetch --quiet origin 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Registrar 'Sem acesso ao GitHub (internet?); tento de novo na proxima vez.'
        exit 1
    }

    $atual = (git rev-parse HEAD).Trim()
    $nova = (git rev-parse '@{u}').Trim()
    if ($atual -eq $nova -and -not $Forcar) { exit 0 }

    if ($atual -ne $nova) {
        Registrar ('Versao nova: ' + $atual.Substring(0, 7) + ' -> ' + $nova.Substring(0, 7))
    } else {
        Registrar 'Reconstruindo (forcado).'
    }

    # backup do banco antes de mexer (se ele ja estiver rodando)
    $banco = (docker compose ps -q db 2>$null)
    if ($banco) {
        $pasta = Join-Path $Raiz 'backups'
        New-Item -ItemType Directory -Force $pasta | Out-Null
        $arquivo = Join-Path $pasta ('caderneta-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
        Executar 'Backup' { docker compose exec -T db pg_dump -U bar_will -f /tmp/backup.sql bar_will }
        Executar 'Copia do backup' { docker compose cp db:/tmp/backup.sql $arquivo }
        Registrar ('Backup: ' + $arquivo)
        # guarda so os 30 mais recentes
        Get-ChildItem $pasta -Filter 'caderneta-*.sql' | Sort-Object Name -Descending | Select-Object -Skip 30 | Remove-Item
    }

    Executar 'git pull' { git pull --ff-only --quiet }
    Executar 'Docker' { docker compose up -d --build --wait }
    Registrar ('Atualizado para ' + (git log -1 --format='%h %s'))
    exit 0
}
catch {
    Registrar ('ERRO: ' + $_.Exception.Message)
    exit 1
}
