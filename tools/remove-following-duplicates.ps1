param(
  [string[]] $selectors = @(".effect-collapsible",".wayfinder.sheet.item .sheet-body",".wayfinder .skills-table td",".wayfinder.sheet.item .sheet-header",".inventory-card")
)
$path = 'd:\Foundry\Foundry Virtual Tabletop\Data\systems\Wayfinder\css\wayfinder.css'
$backup = $path + '.rmdedupe.bak'
Copy-Item -LiteralPath $path -Destination $backup -Force
$text = Get-Content -Raw -LiteralPath $path
foreach ($sel in $selectors) {
  # build a regex to find blocks that start with selector (allow optional whitespace/newlines before brace)
  $pattern = [regex]::Escape($sel) + '\s*\{'
  $matches = [regex]::Matches($text, $pattern)
  if ($matches.Count -le 1) { continue }
  # find positions of full blocks for each match
  $occurrences = @()
  $idx = 0
  while ($true) {
    $m = [regex]::Match($text, $pattern, [System.Text.RegularExpressions.RegexOptions]::None, [ref]$idx)
    if (-not $m.Success) { break }
    $open = $text.IndexOf('{', $m.Index)
    $i = $open + 1
    $count = 1
    while ($i -lt $text.Length -and $count -gt 0) {
      switch ($text[$i]) { '{' { $count++ } '}' { $count-- } }
      $i++
    }
    $end = $i
    $len = $end - $m.Index
    $occurrences += [PSCustomObject]@{ pos=$m.Index; start=$m.Index; length=$len; text=$text.Substring($m.Index,$len) }
    $idx = $end
  }
  # keep first, replace others with comment
  for ($j=1; $j -lt $occurrences.Count; $j++) {
    $o = $occurrences[$j]
    $comment = "/* removed duplicate selector: $sel (kept first) */`r`n"
    $text = $text.Substring(0,$o.pos) + $comment + $text.Substring($o.pos + $o.length)
    # adjust subsequent occurrence positions by reducing text length
  }
}
Set-Content -LiteralPath $path -Value $text -Force
Write-Output "Removed following duplicates for selectors: $($selectors -join ', '). Backup: $backup"