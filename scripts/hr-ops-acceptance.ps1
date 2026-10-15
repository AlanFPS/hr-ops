param(
    [Parameter(Mandatory=$true)][ValidateSet('codex','claude')][string]$Client,
    [Parameter(Mandatory=$true)][string]$Workspace,
    [Parameter(Mandatory=$true)][string]$NodeExe,
    [Parameter(Mandatory=$true)][string]$PromptFile
)
$ErrorActionPreference = 'Stop'
$Workspace = (Resolve-Path -LiteralPath $Workspace).Path
$NodeExe = (Resolve-Path -LiteralPath $NodeExe).Path
$PromptFile = (Resolve-Path -LiteralPath $PromptFile).Path
if ($Workspace -eq (Split-Path $PSScriptRoot -Parent)) { throw 'Use a separate acceptance workspace, not the launcher checkout' }
$version = & $NodeExe --version
if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) { throw 'A verified Node >=24 executable is required' }
Set-Location -LiteralPath $Workspace
$env:HR_OPS_ROOT = $Workspace
$env:CAREER_OPS_ROOT = $Workspace
foreach ($key in @('HR_OPS_DATA_DIR','CAREER_OPS_DATA_DIR','CAREER_OPS_TRACKER')) { Remove-Item "Env:$key" -ErrorAction SilentlyContinue }
$env:PATH = (Split-Path $NodeExe -Parent) + ';' + $env:PATH
$doctor = & $NodeExe hr-ops.mjs doctor
if ($LASTEXITCODE -ne 0) { throw 'Doctor failed' }
$state = ($doctor -join "`n") | ConvertFrom-Json
if (-not $state.ok -or $state.prospects -ne 0 -or $state.root -ne $Workspace) { throw 'Acceptance needs a healthy, empty, isolated data root' }
New-Item -ItemType Directory -Force -Path local/acceptance | Out-Null
if (Test-Path -LiteralPath local/acceptance/transcript.jsonl) { throw 'Preserve existing run; use a fresh workspace' }
New-Item -ItemType Directory -Force -Path local/acceptance/tmp | Out-Null
$env:TEMP = Join-Path $Workspace 'local/acceptance/tmp'
$env:TMP = $env:TEMP
$nodeCommand = $NodeExe.Replace('\','/')
$sessionId = if ($Client -eq 'claude') { [guid]::NewGuid().ToString() } else { $null }
@{ client=$Client; session_id=$sessionId; root=$Workspace; node=$version; executable=$NodeExe; started_at=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath local/acceptance/launch.json -Encoding utf8
$promptText = @"
Runtime contract: use the absolute executable "$nodeCommand" for EVERY Node command in your actual shell, including version checks and helper scripts. Never use bare node or npm. Do not rely on inherited PATH. This workspace is $Workspace. Do not operate outside it except reading/executing the pinned runtime. No external messages or CRM writes.

"@ + (Get-Content -LiteralPath $PromptFile -Raw -Encoding utf8)
$promptText | Set-Content -LiteralPath local/acceptance/prompt.txt -Encoding utf8
Get-Command $Client -ErrorAction Stop | Out-Null
# Windows PowerShell 5 treats redirected native stderr as ErrorRecord objects.
# A warning must not abort the pipeline before the actual exit code is saved.
$savedErrorPreference = $ErrorActionPreference
$savedOutputEncoding = $OutputEncoding
$savedConsoleEncoding = [Console]::OutputEncoding
try {
    $ErrorActionPreference = 'Continue'
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    [Console]::OutputEncoding = $OutputEncoding
    if ($Client -eq 'codex') {
        $promptText | & codex --search --ask-for-approval never exec --sandbox danger-full-access --json --output-last-message local/acceptance/final.txt - 2> local/acceptance/stderr.log | Out-File -LiteralPath local/acceptance/transcript.jsonl -Encoding utf8
    } else {
        $allowNode = 'Bash("' + $nodeCommand + '" *)'
        $allowNodeUnquoted = 'Bash(' + $nodeCommand + ' *)'
        $promptText | & claude --print --verbose --output-format stream-json --session-id $sessionId --name 'HR-Ops local edition acceptance' --permission-mode dontAsk --strict-mcp-config --tools 'Bash,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch' --allowedTools 'Read' 'Write' 'Edit' 'Glob' 'Grep' 'WebSearch' 'WebFetch' $allowNode $allowNodeUnquoted 2> local/acceptance/stderr.log | Out-File -LiteralPath local/acceptance/transcript.jsonl -Encoding utf8
    }
    $runExit = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $savedErrorPreference
    $OutputEncoding = $savedOutputEncoding
    [Console]::OutputEncoding = $savedConsoleEncoding
}
@{ exit_code=$runExit; finished_at=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath local/acceptance/exit.json -Encoding utf8
Write-Output "$Client finished with exit code $runExit; logs: $Workspace\local\acceptance"
exit $runExit
