# Interactive user task. A Windows service in Session 0 cannot open USB cameras or play to the speakers.
# This file was not executed on a Windows PC in this workspace.
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$node = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute $node -Argument "scripts\gate-agent.js" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
Register-ScheduledTask -TaskName "SMZ Gate Agent" -Action $action -Trigger $trigger -Settings $settings -User $env:USERNAME -Force | Out-Null
Write-Output "SMZ Gate Agent is scheduled for the signed-in user. It is not a Windows service."
