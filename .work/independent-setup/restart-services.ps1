$ErrorActionPreference = 'Stop'
$projectBackend = 'D:\Downloads\ardberg_framework\backend'
$pythonExe = $projectBackend + '\.venv\Scripts\python.exe'
& $pythonExe 'D:\ardberg_agent\.work\independent-setup\check-active.py'
if ($LASTEXITCODE -ne 0) { throw 'Active reviews exist or the status check failed; services were not stopped.' }
$pythonProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'python.exe'")
$projectProcesses = @($pythonProcesses | Where-Object {
    $_.ExecutablePath -eq $pythonExe -and $_.CommandLine -match '-m (app.worker|uvicorn app.api:app)'
})
$projectIds = @($projectProcesses | Select-Object -ExpandProperty ProcessId)
$children = @($pythonProcesses | Where-Object { $_.ParentProcessId -in $projectIds })
foreach ($process in @($children) + @($projectProcesses)) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
$logDirectory = 'D:\Downloads\ardberg_framework\.data\service-logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
$apiProcess = Start-Process -FilePath $pythonExe -ArgumentList @('-m','uvicorn','app.api:app','--host','127.0.0.1','--port','8000') -WorkingDirectory $projectBackend -WindowStyle Hidden -PassThru -RedirectStandardOutput ($logDirectory + '\api-' + $stamp + '.out.log') -RedirectStandardError ($logDirectory + '\api-' + $stamp + '.err.log')
$workerProcess = Start-Process -FilePath $pythonExe -ArgumentList @('-m','app.worker') -WorkingDirectory $projectBackend -WindowStyle Hidden -PassThru -RedirectStandardOutput ($logDirectory + '\worker-' + $stamp + '.out.log') -RedirectStandardError ($logDirectory + '\worker-' + $stamp + '.err.log')
[PSCustomObject]@{ApiProcess=$apiProcess.Id;WorkerProcess=$workerProcess.Id;LogPrefix=$stamp} | ConvertTo-Json
