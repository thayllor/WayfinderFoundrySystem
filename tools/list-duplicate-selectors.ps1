$path = 'd:\Foundry\Foundry Virtual Tabletop\Data\systems\Wayfinder\css\wayfinder.css'
$text = Get-Content -Raw -LiteralPath $path
$matches = [regex]::Matches($text,'(?m)^[^{\n]+(?=\{)')
$counts = @{}
foreach($m in $matches) {
  $s = $m.Value.Trim()
  if ($s -ne '') {
    if (-not $counts.ContainsKey($s)) { $counts[$s] = 0 }
    $counts[$s] = $counts[$s] + 1
  }
}
$dups = $counts.GetEnumerator() | Where-Object { $_.Value -gt 1 } | Sort-Object -Property Value -Descending
if ($dups.Count -eq 0) { Write-Output 'No duplicate selectors found.' } else { $dups | ForEach-Object { Write-Output ("$($_.Value) x : $($_.Key)") } }
