$path = 'd:\Foundry\Foundry Virtual Tabletop\Data\systems\Wayfinder\css\wayfinder.css'
$backup = $path + '.mediaroot.bak'
Copy-Item -LiteralPath $path -Destination $backup -Force
$text = Get-Content -Raw -LiteralPath $path
function Extract-Blocks($text, $token) {
  $idx = 0
  $blocks = @()
  while ($true) {
    $pos = $text.IndexOf($token, $idx, [StringComparison]::OrdinalIgnoreCase)
    if ($pos -lt 0) { break }
    $open = $text.IndexOf('{', $pos)
    if ($open -lt 0) { break }
    $cond = $text.Substring($pos, $open - $pos).Trim()
    $i = $open + 1
    $count = 1
    while ($i -lt $text.Length -and $count -gt 0) {
      switch ($text[$i]) {
        '{' { $count++ }
        '}' { $count-- }
      }
      $i++
    }
    $end = $i
    $len = $end - $pos
    $inner = $text.Substring($open + 1, ($end - 1) - ($open + 1))
    $blocks += [PSCustomObject]@{ condition=$cond; inner=$inner; pos=$pos; start=$pos; length=$len }
    $idx = $end
  }
  return $blocks
}
# Extract @media blocks
$mediaBlocks = Extract-Blocks $text '@media'
# Extract :root blocks
$rootBlocks = Extract-Blocks $text ':root'
# Helper to merge groups and reconstruct text
function Merge-Groups($text, $blocks, $isMedia) {
  if ($blocks.Count -le 1) { return $text }
  $groups = @{ }
  foreach ($b in $blocks) {
    $key = $b.condition.Trim()
    if (-not $groups.ContainsKey($key)) { $groups[$key] = @() }
    $groups[$key] += $b
  }
  $toReplace = @{}
  foreach ($k in $groups.Keys) {
    $list = $groups[$k]
    if ($list.Count -le 1) { continue }
    $canonical = $list[0]
    $mergedInner = ''
    foreach ($item in $list) { $mergedInner += "`r`n" + $item.inner.Trim() + "`r`n" }
    if ($isMedia) {
      $newBlock = "$($canonical.condition) {`r`n$mergedInner`r`n}`r`n"
    } else {
      # :root
      $newBlock = ":root {`r`n$mergedInner`r`n}`r`n"
    }
    $toReplace[$canonical.pos] = @{ new=$newBlock; keepPos=$canonical.pos }
    foreach ($rem in $list[1..($list.Count-1)]) { $toReplace[$rem.pos] = @{ remove = $true } }
  }
  if ($toReplace.Count -eq 0) { return $text }
  # Reconstruct
  $ordered = $toReplace.GetEnumerator() | Sort-Object -Property Name | ForEach-Object { $_.Key }
  $out = ''
  $last = 0
  $allBlocks = $blocks | Sort-Object -Property pos
  foreach ($b in $allBlocks) {
    $out += $text.Substring($last, $b.pos - $last)
    if ($toReplace.ContainsKey($b.pos)) {
      $entry = $toReplace[$b.pos]
      if ($entry.remove) {
        # skip
        $out += "/* removed duplicate block at pos $($b.pos) */`r`n"
      } else {
        $out += $entry.new
      }
    } else {
      # keep original
      $out += $text.Substring($b.pos, $b.length)
    }
    $last = $b.pos + $b.length
  }
  if ($last -lt $text.Length) { $out += $text.Substring($last) }
  return $out
}
# Merge media blocks
$text = Merge-Groups $text $mediaBlocks $true
# Re-extract root blocks (positions changed)
$rootBlocks = Extract-Blocks $text ':root'
$text = Merge-Groups $text $rootBlocks $false
Set-Content -LiteralPath $path -Value $text -Force
Write-Output "Merge media/:root complete. Backup: $backup"