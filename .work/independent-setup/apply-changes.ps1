$ErrorActionPreference = 'Stop'
$stageRoot = 'D:\ardberg_agent\.work\independent-setup'
$projectRoot = 'D:\Downloads\ardberg_framework'
$changedFiles = @(
    'README.md',
    'backend/app/baseline.py',
    'backend/app/setup_recipe.py',
    'backend/app/inspection.py',
    'backend/app/review_runner.py',
    'backend/app/review.py',
    'backend/app/report.py',
    'backend/app/flow.py',
    'backend/app/workflow.py',
    'backend/app/worker.py',
    'backend/tests/test_independent_setup.py',
    'backend/tests/manual_independent_setup_smoke.py'
)
$original = Get-Content -LiteralPath ($stageRoot + '\original-hashes.json') -Raw | ConvertFrom-Json
foreach ($relative in $changedFiles) {
    $destination = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
    if (-not $destination.StartsWith($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Destination outside project: $destination"
    }
    $known = $original.PSObject.Properties[$relative]
    if ($known) {
        if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $known.Value) {
            throw "Concurrent edit detected: $relative"
        }
    } elseif (Test-Path -LiteralPath $destination) {
        throw "New file already exists: $relative"
    }
}
foreach ($relative in $changedFiles) {
    Copy-Item -LiteralPath (Join-Path $stageRoot $relative) -Destination (Join-Path $projectRoot $relative)
}
Write-Output ('Applied ' + $changedFiles.Count + ' tested files; unrelated files were not changed.')
