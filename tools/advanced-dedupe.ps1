$path = 'd:\Foundry\Foundry Virtual Tabletop\Data\systems\Wayfinder\css\wayfinder.css'
$backup = $path + '.advdedupe.bak'
Copy-Item -LiteralPath $path -Destination $backup -Force
$text = Get-Content -Raw -LiteralPath $path
$re = [regex] '(?ms)([^{}]+)\{([^{}]*)\}'
$matches = $re.Matches($text)
$rules = @()
for ($i=0; $i -lt $matches.Count; $i++) {
    $m = $matches[$i]
    $selector = $m.Groups[1].Value.Trim()
    $body = $m.Groups[2].Value
    $decls = $body -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    $norm = ($decls | Sort-Object) -join ';'
    $rules += [PSCustomObject]@{ index=$i; selector=$selector; body=$body; norm=$norm; start=$m.Index; length=$m.Length; text=$m.Value }
}
$groups = $rules | Group-Object -Property norm
$toRemove = New-Object System.Collections.Generic.HashSet[int]
foreach ($g in $groups) {
    if ($g.Count -le 1) { continue }
    # choose canonical rule: prefer selector without '.wayfinder', then shortest selector, then first
    $cand = $g.Group | Sort-Object @{Expression = { ($_.selector -notmatch '\.wayfinder') -as [int] } }, @{Expression = { $_.selector.Length }} -Descending:$false
    $canonical = $null
    # Try to find one without .wayfinder
    $without = $g.Group | Where-Object { $_.selector -notmatch '\.wayfinder' }
    if ($without.Count -gt 0) {
        $canonical = $without | Sort-Object { $_.selector.Length } | Select-Object -First 1
    } else {
        $canonical = $g.Group | Sort-Object { $_.selector.Length } | Select-Object -First 1
    }
    foreach ($r in $g.Group) {
        if ($r.index -ne $canonical.index) { $toRemove.Add($r.index) | Out-Null }
    }
}
# Reconstruct output
$out = ''
$lastIndex = 0
for ($i=0; $i -lt $rules.Count; $i++) {
    $r = $rules[$i]
    $start = $r.start
    $len = $r.length
    $out += $text.Substring($lastIndex, $start - $lastIndex)
    if ($toRemove.Contains($r.index)) {
        $out += "/* removed duplicate (advanced) for selector: $($r.selector) */`r`n"
    } else {
        $out += $r.text
    }
    $lastIndex = $start + $len
}
if ($lastIndex -lt $text.Length) { $out += $text.Substring($lastIndex) }
Set-Content -LiteralPath $path -Value $out -Force
Write-Output "Advanced dedupe complete. Backup: $backup"