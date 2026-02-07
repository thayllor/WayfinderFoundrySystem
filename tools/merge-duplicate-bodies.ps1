$path = 'd:\Foundry\Foundry Virtual Tabletop\Data\systems\Wayfinder\css\wayfinder.css'
$backup = $path + '.merge.bak'
Copy-Item -LiteralPath $path -Destination $backup -Force
$text = Get-Content -Raw -LiteralPath $path
$re = [regex] '(?ms)([^{}]+)\{([^{}]*)\}'
$matches = $re.Matches($text)
$rules = @()
for ($i=0; $i -lt $matches.Count; $i++) {
  $m = $matches[$i]
  $sel = $m.Groups[1].Value.Trim()
  $body = $m.Groups[2].Value
  $rules += [PSCustomObject]@{ index=$i; selector=$sel; body=$body; start=$m.Index; length=$m.Length; raw=$m.Value }
}
# Group by selector exact match
$groups = $rules | Group-Object -Property selector
$toRemove = New-Object System.Collections.Generic.HashSet[int]
$replacements = @{}
foreach ($g in $groups) {
  if ($g.Count -le 1) { continue }
  # Merge declarations in file order; later declarations overwrite earlier ones
  $propMap = @{}
  $propOrder = @()
  foreach ($r in $g.Group) {
    $decls = $r.body -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    foreach ($d in $decls) {
      $m2 = [regex]::Match($d, '^([^:]+):\s*(.*)$')
      if ($m2.Success) {
        $prop = $m2.Groups[1].Value.Trim()
        $val = $m2.Groups[2].Value.Trim()
        if ($prop -ne '') {
          # If property existed, remove old order entry
          if ($propMap.ContainsKey($prop)) {
            $propOrder = $propOrder | Where-Object { $_ -ne $prop }
          }
          $propMap[$prop] = $val
          $propOrder += $prop
        }
      }
    }
  }
  # Build merged body text
  $mergedLines = @()
  foreach ($p in $propOrder) { $mergedLines += ('  ' + $p + ': ' + $propMap[$p] + ';') }
  $mergedBody = $mergedLines -join "`r`n"
  $canonical = $g.Group | Select-Object -First 1
  $newRule = "$($canonical.selector) {`r`n$mergedBody`r`n}`r`n"
  $replacements[$canonical.index] = $newRule
  foreach ($r in $g.Group) { if ($r.index -ne $canonical.index) { $toRemove.Add($r.index) | Out-Null } }
}
# Reconstruct output
$out = ''
$last = 0
for ($i=0; $i -lt $rules.Count; $i++) {
  $r = $rules[$i]
  $out += $text.Substring($last, $r.start - $last)
  if ($replacements.ContainsKey($r.index)) {
    $out += $replacements[$r.index]
  } elseif ($toRemove.Contains($r.index)) {
    $out += "/* removed duplicate selector occurrence: $($r.selector) */`r`n"
  } else {
    $out += $r.raw
  }
  $last = $r.start + $r.length
}
if ($last -lt $text.Length) { $out += $text.Substring($last) }
Set-Content -LiteralPath $path -Value $out -Force
Write-Output "Merge complete. Backup: $backup"