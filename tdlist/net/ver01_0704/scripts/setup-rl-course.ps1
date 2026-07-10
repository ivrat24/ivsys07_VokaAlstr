# Setup rl-course experiment environment (Windows PowerShell)
# Run from project root: .\scripts\setup-rl-course.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$VenvDir = Join-Path $Root ".venv-rl-course"
$Python = "python"

Write-Host "Project: $Root"
Write-Host "Venv:    $VenvDir"

if (-not (Get-Command $Python -ErrorAction SilentlyContinue)) {
    throw "python not found. Install Python 3.10+ or Miniconda first."
}

& $Python --version

if (-not (Test-Path $VenvDir)) {
    Write-Host "Creating virtual environment..."
    & $Python -m venv $VenvDir
}

$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"

Write-Host "Upgrading pip..."
& $VenvPython -m pip install -U pip

Write-Host "Installing dependencies..."
& $VenvPip install -r (Join-Path $Root "requirements-rl-course.txt")

Write-Host "Registering Jupyter kernel: rl-course"
& $VenvPython -m ipykernel install --user --name rl-course --display-name "Python (rl-course)"

Write-Host ""
Write-Host "Done. Activate with:"
Write-Host "  $($VenvDir)\Scripts\Activate.ps1"
Write-Host ""
Write-Host "Select kernel 'Python (rl-course)' in Jupyter or VS Code."
