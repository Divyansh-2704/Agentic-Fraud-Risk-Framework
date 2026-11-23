<#
.SYNOPSIS
  Runs every automated test of the Agentic Fraud Risk Framework and writes a summary report.

.DESCRIPTION
  1. Checks Node.js, the .env file and the PostgreSQL connection (creates the test database if missing).
  2. Type-checks the server and the client.
  3. Runs the server tests (Vitest) against the PostgreSQL TEST database:
       - workflow rules (state machines, routing, financial validations)
       - the full alert-to-case lifecycle over the HTTP API
       - the 55-scenario UAT pack (start states and outcomes) and the UAT issues-log regression checks
  4. Runs the UI tests (Playwright, Chromium) against a separate API + UI started on ports 4100 / 5273:
       - every scenario's Start button opens the right record in the right state
       - TC-A01 and TC-A02 end to end through the screens
       - one check per issue in the UAT issues log
  5. Writes test-runs/<date-time>/summary.md (plus the raw JSON results and the Playwright HTML report).

  Your demo data in the main database (DATABASE_URL) is never touched: all tests use TEST_DATABASE_URL.

.EXAMPLE
  npm run test:all
  powershell -ExecutionPolicy Bypass -File scripts/run-all-tests.ps1 -SkipUI
  powershell -ExecutionPolicy Bypass -File scripts/run-all-tests.ps1 -Headed      # watch the browser
  powershell -ExecutionPolicy Bypass -File scripts/run-all-tests.ps1 -Grep "TC-C1"   # only UI tests whose name matches
#>
param(
  [switch]$SkipUnit,
  [switch]$SkipUI,
  [switch]$Headed,
  [string]$Grep = ''
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
# Node installed with winget is not always on the PATH of a new shell.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + $env:Path

$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$out = Join-Path $root "test-runs\$stamp"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$results = [ordered]@{}
$started = Get-Date

function Step($title) { Write-Host ''; Write-Host "==== $title ====" -ForegroundColor Cyan }
function Record($name, $ok, $detail) {
  $results[$name] = [pscustomobject]@{ ok = $ok; detail = $detail }
  if ($ok) { Write-Host "  PASS  $name  $detail" -ForegroundColor Green } else { Write-Host "  FAIL  $name  $detail" -ForegroundColor Red }
}

# ---------- 1. Environment ----------
Step '1. Environment'
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { Write-Host 'Node.js not found. Install it with: winget install OpenJS.NodeJS.LTS' -ForegroundColor Red; exit 1 }
Write-Host "  Node $(node -v)"
if (-not (Test-Path (Join-Path $root 'node_modules'))) { Write-Host '  Installing dependencies (npm install)...'; npm install --no-audit --no-fund | Out-Null }
if (-not (Test-Path (Join-Path $root '.env'))) {
  Write-Host '  No .env file: copy .env.example to .env and set your PostgreSQL password, then run this script again.' -ForegroundColor Red
  exit 1
} else {
  Write-Host '  Checking PostgreSQL and creating the test database if needed...'
  $setup = npm run db:setup 2>&1
  $ok = $LASTEXITCODE -eq 0
  $setup | Out-File -Encoding utf8 (Join-Path $out 'db-setup.log')
  Record 'PostgreSQL connection' $ok ($(if ($ok) { 'fraud_detection + fraud_detection_test ready' } else { 'see db-setup.log' }))
  if (-not $ok) { $setup | Select-Object -Last 5 | ForEach-Object { Write-Host "    $_" } }
}

# ---------- 2. Type check ----------
Step '2. Type check (server + client)'
$tc = npm run typecheck 2>&1
$tc | Out-File -Encoding utf8 (Join-Path $out 'typecheck.log')
Record 'Type check' ($LASTEXITCODE -eq 0) ($(if ($LASTEXITCODE -eq 0) { 'no errors' } else { 'see typecheck.log' }))

# ---------- 3. Server tests ----------
if (-not $SkipUnit) {
  Step '3. Server tests (Vitest): workflow rules, API lifecycle, 55-scenario pack, issues-log checks'
  $unitJson = Join-Path $out 'server-tests.json'
  npm run test -w server -- --reporter=default --reporter=json "--outputFile=$unitJson" 2>&1 | Tee-Object -FilePath (Join-Path $out 'server-tests.log') | Select-String -Pattern 'Test database|Test Files|Tests  |FAIL' | ForEach-Object { Write-Host "  $($_.Line.Trim())" }
  $unitOk = $LASTEXITCODE -eq 0
  $detail = ''
  if (Test-Path $unitJson) {
    $j = Get-Content $unitJson -Raw | ConvertFrom-Json
    $detail = "$($j.numPassedTests)/$($j.numTotalTests) passed"
    $failedUnit = @($j.testResults | ForEach-Object { $_.assertionResults } | Where-Object { $_.status -eq 'failed' } | ForEach-Object { $_.fullName })
  }
  Record 'Server tests' $unitOk $detail
}

# ---------- 4. UI tests ----------
if (-not $SkipUI) {
  Step '4. UI tests (Playwright, Chromium): scenario starts, end-to-end journeys, issues-log checks'
  npx playwright install chromium 2>&1 | Out-Null
  $pwArgs = @('playwright', 'test', '--reporter=list,json,html')
  if ($Headed) { $pwArgs += '--headed' }
  if ($Grep) { $pwArgs += @('--grep', $Grep) }
  $env:PLAYWRIGHT_JSON_OUTPUT_NAME = Join-Path $out 'ui-tests.json'
  $env:PLAYWRIGHT_HTML_REPORT = Join-Path $out 'ui-report'
  $env:PLAYWRIGHT_HTML_OPEN = 'never'
  & npx @pwArgs 2>&1 | Tee-Object -FilePath (Join-Path $out 'ui-tests.log') | Select-String -Pattern '^\s*\d+ (passed|failed|flaky|skipped)|\) \[chromium\]' | ForEach-Object { Write-Host "  $($_.Line.Trim())" }
  $uiOk = $LASTEXITCODE -eq 0
  $detail = ''
  $uiJson = Join-Path $out 'ui-tests.json'
  if (Test-Path $uiJson) {
    $j = Get-Content $uiJson -Raw | ConvertFrom-Json
    $detail = "$($j.stats.expected)/$($j.stats.expected + $j.stats.unexpected + $j.stats.flaky) passed"
    $failedUi = @()
    function Walk($suite, $prefix) {
      foreach ($s in @($suite.suites)) { if ($s) { Walk $s "$prefix$($s.title) > " } }
      foreach ($sp in @($suite.specs)) { if ($sp -and -not $sp.ok) { $script:failedUi += "$prefix$($sp.title)" } }
    }
    foreach ($s in @($j.suites)) { Walk $s '' }
  }
  Record 'UI tests' $uiOk $detail
}

# ---------- 5. Summary ----------
$allOk = -not ($results.Values | Where-Object { -not $_.ok })
$mins = [math]::Round(((Get-Date) - $started).TotalMinutes, 1)
$lines = @(
  '# Test run summary',
  '',
  "Run: $stamp | Duration: $mins min | Result: **$(if ($allOk) { 'ALL PASSED' } else { 'FAILURES' })**",
  '',
  '| Check | Result | Detail |',
  '|---|---|---|'
)
foreach ($k in $results.Keys) { $lines += "| $k | $(if ($results[$k].ok) { 'PASS' } else { 'FAIL' }) | $($results[$k].detail) |" }
if ($failedUnit) { $lines += @('', '## Failed server tests', ''); $lines += ($failedUnit | ForEach-Object { "- $_" }) }
if ($failedUi) { $lines += @('', '## Failed UI tests', ''); $lines += ($failedUi | ForEach-Object { "- $_" }) }
$lines += @('', '## Files', '', '- server-tests.log / server-tests.json: Vitest output', '- ui-tests.log / ui-tests.json: Playwright output', '- ui-report/index.html: Playwright HTML report (screenshots and traces of any failure)', '- typecheck.log, db-setup.log')
$lines | Out-File -Encoding utf8 (Join-Path $out 'summary.md')

Step 'Summary'
foreach ($k in $results.Keys) { $r = $results[$k]; Write-Host ("  {0,-24} {1,-5} {2}" -f $k, $(if ($r.ok) { 'PASS' } else { 'FAIL' }), $r.detail) -ForegroundColor $(if ($r.ok) { 'Green' } else { 'Red' }) }
Write-Host ''
Write-Host "  Report: $out\summary.md"
if (-not $SkipUI) { Write-Host "  UI report: $out\ui-report\index.html" }
if ($allOk) { Write-Host '  ALL TESTS PASSED' -ForegroundColor Green; exit 0 } else { Write-Host '  SOME TESTS FAILED' -ForegroundColor Red; exit 1 }
