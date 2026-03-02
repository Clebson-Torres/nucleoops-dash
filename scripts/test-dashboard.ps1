param(
    [string]$OutputRoot = ".\test-results",
    [switch]$SkipE2E
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $OutputRoot "dashboard-$timestamp"
New-Item -ItemType Directory -Path $runDir -Force | Out-Null

function Invoke-Step {
    param(
        [string]$Name,
        [string]$Command
    )
    $logFile = Join-Path $runDir "$Name.log"
    Write-Host "==> $Name"
    $output = cmd /c "$Command 2>&1"
    $output | Tee-Object -FilePath $logFile
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed (exit code: $LASTEXITCODE). See $logFile"
    }
}

try {
    Invoke-Step -Name "npm-ci" -Command "npm ci"
} catch {
    if ($env:CI) {
        throw
    }
    Write-Warning "npm ci falhou em ambiente local; tentando npm install como fallback."
    Invoke-Step -Name "npm-install-fallback" -Command "npm install"
}
Invoke-Step -Name "build" -Command "npm run build"

if (-not $SkipE2E) {
    Invoke-Step -Name "playwright-install" -Command "npx playwright install --with-deps chromium"
    Invoke-Step -Name "e2e" -Command "npm run test:e2e"
}

$summary = @{
    module = "dashboard"
    status = "passed"
    timestamp = (Get-Date).ToString("o")
    logs = @("npm-ci.log", "npm-install-fallback.log", "build.log")
}
if (-not $SkipE2E) {
    $summary.logs += "playwright-install.log"
    $summary.logs += "e2e.log"
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -Path (Join-Path $runDir "summary.json")
Write-Host "Dashboard test artifacts: $runDir"

