# Importa um backup (.sql) da Caderneta PHP antiga para o banco da Caderneta nova.
#
#   powershell -ExecutionPolicy Bypass -File windows\importar-backup-php.ps1 -Backup C:\caderneta-backup.sql
#   (acrescente -Substituir para apagar os dados do banco novo antes; usuarios e senhas ficam)
#
# O banco de destino vem do arquivo .env.neon na pasta do projeto (DATABASE_URL=...).
# Precisa de Docker e Node. Sobe um MySQL temporario, carrega o backup, copia e apaga o MySQL.
# (texto sem acentos de proposito: o PowerShell 5.1 le arquivos sem BOM como ANSI)

param(
    [Parameter(Mandatory = $true)][string]$Backup,
    [switch]$Substituir,
    [string]$Destino = '.env.neon'
)

$ErrorActionPreference = 'Continue'
$Raiz = Split-Path -Parent $PSScriptRoot
Set-Location $Raiz
$Container = 'caderneta-mysql-import'

if (-not (Test-Path -LiteralPath $Backup)) { Write-Host "Nao achei o arquivo $Backup"; exit 1 }
if (-not (Test-Path -LiteralPath $Destino)) { Write-Host "Nao achei $Destino com DATABASE_URL=... do banco novo"; exit 1 }

try {
    Write-Host 'Subindo MySQL temporario...'
    docker rm -f $Container *> $null
    docker run -d --name $Container -e MYSQL_ROOT_PASSWORD=importar -e MYSQL_DATABASE=bar_will -p 127.0.0.1:3307:3306 mysql:8.4 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Nao consegui subir o MySQL (Docker ligado? porta 3307 livre?)' }
    $pronto = $false
    for ($i = 0; $i -lt 90; $i++) {
        docker exec $Container mysql -uroot -pimportar -e 'SELECT 1' bar_will *> $null
        if ($LASTEXITCODE -eq 0) { $pronto = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $pronto) { throw 'O MySQL temporario nao ficou pronto' }

    Write-Host 'Carregando o backup...'
    $arquivo = (Resolve-Path -LiteralPath $Backup).Path
    # cmd: o redirecionamento do PowerShell 5.1 estragaria os acentos
    cmd /c "docker exec -i $Container mysql -uroot -pimportar bar_will < `"$arquivo`""
    if ($LASTEXITCODE -ne 0) { throw 'O backup nao carregou (e um arquivo do mysqldump?)' }

    $env:MYSQL_URL = 'mysql://root:importar@127.0.0.1:3307/bar_will'
    $argumentos = @("--env-file=$Destino", 'scripts/importar-caderneta-php.mjs')
    if ($Substituir) { $argumentos += '--substituir' }
    node @argumentos
    $codigo = $LASTEXITCODE
}
catch {
    Write-Host ('ERRO: ' + $_.Exception.Message)
    $codigo = 1
}
finally {
    docker rm -f $Container *> $null
    Remove-Item Env:MYSQL_URL -ErrorAction SilentlyContinue
}
exit $codigo
