$path = 'd:\Foundry\Foundry Virtual Tabletop\Data\systems\Wayfinder\css\wayfinder.css'
$backup = $path + '.bak'
Copy-Item -LiteralPath $path -Destination $backup -Force
$text = Get-Content -Raw -LiteralPath $path
$re = [regex] '(?ms)([^{}]+)\{([^{}]*)\}'
$matches = $re.Matches($text)
$seen = @{}
$positionsToKeep = @()
# We'll iterate matches and decide which to keep. Keep first occurrence of each normalized body.
for ($i=0; $i -lt $matches.Count; $i++) {
    $m = $matches[$i]
    $selector = $m.Groups[1].Value.Trim()
    $body = $m.Groups[2].Value
    # normalize body: split declarations, trim, sort
    $decls = $body -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
    $norm = ($decls | Sort-Object) -join ';'
    $key = $norm.ToLower()
    if (-not $seen.ContainsKey($key)) {
        $seen[$key] = @{ selector = $selector; index = $i }
        $positionsToKeep += $i
    } else {
        # If duplicate but the earlier selector is more specific (contains space) prefer non-prefixed version
        $first = $seen[$key].selector
        if ($selector -match '\.wayfinder' -and $first -notmatch '\.wayfinder') {
            # skip this prefixed duplicate
            continue
        }
        # Otherwise keep the first encountered (no-op)
    }
}
# Reconstruct output by walking through the file and removing match ranges not in positionsToKeep
$out = ''
$lastIndex = 0
for ($i=0; $i -lt $matches.Count; $i++) {
    $m = $matches[$i]
    $start = $m.Index
    $length = $m.Length
    # append text between lastIndex and start
    $out += $text.Substring($lastIndex, $start - $lastIndex)
    if ($positionsToKeep -contains $i) {
        # append the original matched text
        $out += $m.Value
    } else {
        # replace with comment indicating removal
        $sel = $m.Groups[1].Value.Trim()
        $out += "/* removed duplicate rule for selector: $sel */\n"
    }
    $lastIndex = $start + $length
}
# append remaining tail
if ($lastIndex -lt $text.Length) { $out += $text.Substring($lastIndex) }
Set-Content -LiteralPath $path -Value $out -Force
Write-Output "Dedup complete. Backup created at: $backup"