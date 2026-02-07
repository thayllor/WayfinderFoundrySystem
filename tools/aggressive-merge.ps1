$path = 'd:\Foundry\Foundry Virtual Tabletop\Data\systems\Wayfinder\css\wayfinder.css'
$backup = $path + '.aggr.bak'
Copy-Item -LiteralPath $path -Destination $backup -Force
$text = Get-Content -Raw -LiteralPath $path
$re = [regex] '(?ms)([^{}]+)\{([^{}]*)\}'
$matches = $re.Matches($text)
$rules = @()
function NormalizeSelector($s) {
  $n = $s -replace 'html\s+body', '' -replace '\.wayfinder\b', ''
  $n = $n -replace '\s+', ' '
  $n = $n.Trim()
  return $n.ToLower()
}
for ($i=0; $i -lt $matches.Count; $i++) {
  $m = $matches[$i]
  $sel = $m.Groups[1].Value.Trim()
  $body = $m.Groups[2].Value
  $norm = NormalizeSelector($sel)
  $rules += [PSCustomObject]@{ index=$i; selector=$sel; norm=$norm; body=$body; start=$m.Index; length=$m.Length; raw=$m.Value }
}
$groups = $rules | Group-Object -Property norm
$toRemove = New-Object System.Collections.Generic.HashSet[int]
$replacements = @{}
foreach ($g in $groups) {
  if ($g.Count -le 1) { continue }
  # choose canonical: prefer selector without .wayfinder and shortest selector; else first
  $cand = $g.Group | Sort-Object @{Expression = { ($_.selector -notmatch '\.wayfinder') -as [int] } }, @{Expression = { $_.selector.Length }} | Select-Object -First 1
  # merge declarations in file order across all occurrences
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
          if ($propMap.ContainsKey($prop)) { $propOrder = $propOrder | Where-Object { $_ -ne $prop } }
          $propMap[$prop] = $val
          $propOrder += $prop
        }
      }
    }
  }
  $mergedLines = @()
  foreach ($p in $propOrder) { $mergedLines += ('  ' + $p + ': ' + $propMap[$p] + ';') }
  $mergedBody = $mergedLines -join "`r`n"
  $newRule = "$($cand.selector) {`r`n$mergedBody`r`n}`r`n"
  $replacements[$cand.index] = $newRule
  foreach ($r in $g.Group) { if ($r.index -ne $cand.index) { $toRemove.Add($r.index) | Out-Null } }
}
# Reconstruct
$out = ''
$last = 0
for ($i=0; $i -lt $rules.Count; $i++) {
  $r = $rules[$i]
  $out += $text.Substring($last, $r.start - $last)
  if ($replacements.ContainsKey($r.index)) { $out += $replacements[$r.index] }
  elseif ($toRemove.Contains($r.index)) { $out += "/* removed aggr duplicate: $($r.selector) */`r`n" }
  else { $out += $r.raw }
  $last = $r.start + $r.length
}
if ($last -lt $text.Length) { $out += $text.Substring($last) }
Set-Content -LiteralPath $path -Value $out -Force
Write-Output "Aggressive merge complete. Backup: $backup"