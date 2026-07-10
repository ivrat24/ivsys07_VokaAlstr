# Voka GitHub publish script
# Usage:
#   .\publish.ps1 -Username <user> -Token <pat> -Repo <repo-name> [-CreateRepo] [-EnablePages]

param(
    [Parameter(Mandatory = $true)]
    [string]$Username,

    [Parameter(Mandatory = $true)]
    [string]$Token,

    [Parameter(Mandatory = $false)]
    [string]$Repo = "voka-home",

    [switch]$CreateRepo,
    [switch]$EnablePages
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
$WorkflowDir = Join-Path $ProjectRoot ".github\workflows"

function Write-Step($msg) { Write-Host ">> $msg" -ForegroundColor Cyan }

function Invoke-GitHubApi {
    param(
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers,
        [string]$Body = $null
    )

    try {
        if ($Body) {
            return Invoke-RestMethod -Uri $Uri -Headers $Headers -Method $Method -Body $Body
        }
        return Invoke-RestMethod -Uri $Uri -Headers $Headers -Method $Method
    } catch {
        $statusCode = $null
        $detail = $_.Exception.Message
        $response = $_.Exception.Response
        if ($response) {
            $statusCode = [int]$response.StatusCode
            try {
                $stream = $response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $raw = $reader.ReadToEnd()
                    if ($raw) {
                        $parsed = $raw | ConvertFrom-Json
                        if ($parsed.message) {
                            $detail = [string]$parsed.message
                        }
                        if ($parsed.errors) {
                            $errorMessages = @($parsed.errors | ForEach-Object {
                                if ($_.message) { [string]$_.message }
                            } | Where-Object { $_ })
                            if ($errorMessages.Count -gt 0) {
                                $detail = ($errorMessages -join "; ")
                            }
                        }
                    }
                }
            } catch {
                # keep default detail
            }
        }
        return @{
            Error = $true
            StatusCode = $statusCode
            Message = $detail
        }
    }
}

function Test-RepositoryAlreadyExistsMessage {
    param([string]$Message)
    if (-not $Message) { return $false }
    return $Message -match 'already exists|Repository creation failed|name already exists'
}

function Invoke-Git {
    [CmdletBinding()]
    param(
        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$GitCommandArgs
    )

    if (-not $GitCommandArgs -or $GitCommandArgs.Count -eq 0) {
        throw "Invoke-Git requires git arguments"
    }

    & git @GitCommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitCommandArgs -join ' ') failed (exit $LASTEXITCODE)"
    }
}

function Initialize-GitHttpSettings {
    Write-Step "Tuning git HTTP settings for large/slow uploads ..."
    git config http.version HTTP/1.1
    git config http.postBuffer 524288000
    git config http.lowSpeedLimit 0
    git config http.lowSpeedTime 999999
    if ($env:HTTPS_PROXY) {
        git config http.proxy $env:HTTPS_PROXY
    } elseif ($env:HTTP_PROXY) {
        git config http.proxy $env:HTTP_PROXY
    }
}

function Invoke-GitPushWithRetry {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$PushArgs,
        [int]$MaxAttempts = 3
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        Write-Step "Pushing to GitHub (attempt $attempt/$MaxAttempts) ..."
        & git @PushArgs
        if ($LASTEXITCODE -eq 0) {
            return
        }

        if ($attempt -lt $MaxAttempts) {
            Write-Step "Push failed, retrying in 5 seconds ..."
            Start-Sleep -Seconds 5
        }
    }

    throw "git $($PushArgs -join ' ') failed after $MaxAttempts attempts. This is usually a network timeout (HTTP 408). Try VPN/stable network, or run 'git push' manually in PowerShell."
}

if ($CreateRepo) {
    Write-Step "Checking/creating repository $Username/$Repo ..."
    $headers = @{
        Authorization = "Bearer $Token"
        Accept        = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
    }

    $check = Invoke-GitHubApi -Method Get -Uri "https://api.github.com/repos/$Username/$Repo" -Headers $headers
    if ($check.Error) {
        if ($check.StatusCode -eq 404) {
            $body = @{
                name        = $Repo
                description = "Voka personal homepage and project hub"
                private     = $false
                auto_init   = $false
            } | ConvertTo-Json
            $created = Invoke-GitHubApi -Method Post -Uri "https://api.github.com/user/repos" -Headers $headers -Body $body
            if ($created.Error) {
                if ($created.StatusCode -eq 422 -and (Test-RepositoryAlreadyExistsMessage $created.Message)) {
                    Write-Step "Repository already exists on GitHub, continuing with push ..."
                } else {
                    throw "Failed to create repository ($($created.StatusCode)): $($created.Message). If the repo already exists, uncheck auto-create and sync again."
                }
            } else {
                Write-Step "Repository created"
            }
        } else {
            throw "GitHub API error ($($check.StatusCode)): $($check.Message)"
        }
    } else {
        Write-Step "Repository already exists, skipping creation"
    }
}

Set-Location $ProjectRoot
if (-not (Test-Path ".git")) {
    Write-Step "Initializing Git repository ..."
    Invoke-Git init
    Invoke-Git branch -M main
}

if (-not (Test-Path ".gitignore")) {
    @"
raw_src/neko/
.env
**/.credentials
"@ | Set-Content ".gitignore" -Encoding UTF8
}

$remoteUrl = "https://${Username}:${Token}@github.com/${Username}/${Repo}.git"
$remotes = @(git remote 2>$null)
if ($remotes -contains "origin") {
    Invoke-Git remote set-url origin $remoteUrl
} else {
    Invoke-Git remote add origin $remoteUrl
}

Write-Step "Staging and committing files ..."
Invoke-Git add .
git add -u 2>$null | Out-Null
$status = git status --porcelain
if ($status) {
    Invoke-Git commit -m "feat: Voka homepage ver01_0704 - site update"
} else {
    Write-Step "No local changes, skipping commit"
}

Initialize-GitHttpSettings
Write-Step "Pushing to origin/main ..."
Invoke-GitPushWithRetry -PushArgs @("push", "-u", "origin", "main", "--force")

if ($EnablePages) {
    Write-Step "Configuring GitHub Pages (Actions) ..."
    if (-not (Test-Path $WorkflowDir)) {
        New-Item -ItemType Directory -Path $WorkflowDir -Force | Out-Null
    }

    $workflow = @"
name: Deploy Voka Site

on:
  push:
    branches: [main]
    paths:
      - 'tdlist/net/ver01_0704/site/**'
      - '.github/workflows/pages.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: `${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: tdlist/net/ver01_0704/site
      - id: deployment
        uses: actions/deploy-pages@v4
"@

    $workflow | Set-Content (Join-Path $WorkflowDir "pages.yml") -Encoding UTF8
    Invoke-Git add .github/workflows/pages.yml
    git commit -m "ci: add GitHub Pages workflow for ver01_0704 site" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Invoke-GitPushWithRetry -PushArgs @("push", "origin", "main")
    }

    $ghAvailable = $null -ne (Get-Command gh -ErrorAction SilentlyContinue)
    if ($ghAvailable) {
        $env:GH_TOKEN = $Token
        gh api repos/$Username/$Repo/pages -X POST -f build_type=workflow -f source[branch]=main -f source[path]=/ 2>$null
        Write-Step "Pages configured via gh CLI"
    } else {
        Write-Step "Open repo Settings > Pages and choose Source: GitHub Actions"
    }
}

Invoke-Git remote set-url origin "https://github.com/${Username}/${Repo}.git"

$pagesUrl = if ($Repo -eq "${Username}.github.io") {
    "https://${Username}.github.io/"
} else {
    "https://${Username}.github.io/${Repo}/"
}

Write-Host ""
Write-Host "Publish complete!" -ForegroundColor Green
Write-Host "Repository: https://github.com/$Username/$Repo"
Write-Host "Pages URL (after Actions deploy): $pagesUrl"
Write-Host "If this is the first deploy, confirm Settings > Pages uses GitHub Actions."
