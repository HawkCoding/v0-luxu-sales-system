Copy-Item -Path "$PSScriptRoot\git-hooks\pre-push" -Destination "$PSScriptRoot\..\.git\hooks\pre-push" -Force
Write-Output "Git hooks installed."
