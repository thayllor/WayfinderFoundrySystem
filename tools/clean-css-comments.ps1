$path = 'd:\Foundry\Foundry Virtual Tabletop\Data\systems\Wayfinder\css\wayfinder.css'
$backup = $path + '.clean.bak'
Copy-Item -LiteralPath $path -Destination $backup -Force
$text = Get-Content -Raw -LiteralPath $path
# Remove removal comments inserted by previous steps
$text = $text -replace '/\* removed duplicate rule for selector: [^*]*\*/\s*',''
$text = $text -replace '/\* Duplicate .* removed here[\s\S]*?\*/\s*',''
# Remove empty rulesets like `.foo { }` or `{}`
$text = $text -replace '(?ms)[^\{]+\{\s*\}\s*',''
# Collapse multiple blank lines
$text = $text -replace '(\r?\n){3,}',"`r`n`r`n"
Set-Content -LiteralPath $path -Value $text -Force
Write-Output "Clean complete. Backup created at: $backup"