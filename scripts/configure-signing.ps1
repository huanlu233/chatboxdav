param([string]$GitHubCli = 'gh', [string]$Repository = 'huanlu233/chatboxdav')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$directory = Join-Path $root '.local/signing'
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$metadata = Join-Path $directory 'credentials.json'
$keystore = Join-Path $directory 'chatboxdav-release.jks'
if (-not (Test-Path -LiteralPath $metadata)) {
    if (Test-Path -LiteralPath $keystore) { throw 'Keystore exists without metadata; refusing to overwrite it.' }
    $password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
    $credentials = @{ alias = 'chatboxdav'; storePassword = $password; keyPassword = $password }
    $credentials | ConvertTo-Json | Set-Content -LiteralPath $metadata -Encoding utf8
} else { $credentials = Get-Content -LiteralPath $metadata -Raw | ConvertFrom-Json }
$env:SIGNING_STORE_PASSWORD = $credentials.storePassword
$env:SIGNING_KEY_PASSWORD = $credentials.keyPassword
try {
    if (-not (Test-Path -LiteralPath $keystore)) {
        & keytool -genkeypair -keystore $keystore -storetype PKCS12 -alias $credentials.alias -keyalg RSA -keysize 4096 -validity 10000 -storepass:env SIGNING_STORE_PASSWORD -keypass:env SIGNING_KEY_PASSWORD -dname 'CN=ChatboxDAV, O=ChatboxDAV'
        if ($LASTEXITCODE -ne 0) { throw 'Signing key generation failed' }
    }
    $secrets = @{
        ANDROID_KEYSTORE_BASE64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore))
        ANDROID_KEY_ALIAS = $credentials.alias
        ANDROID_KEYSTORE_PASSWORD = $credentials.storePassword
        ANDROID_KEY_PASSWORD = $credentials.keyPassword
    }
    foreach ($entry in $secrets.GetEnumerator()) {
        $entry.Value | & $GitHubCli secret set $entry.Key --repo $Repository
        if ($LASTEXITCODE -ne 0) { throw "Could not configure $($entry.Key)" }
        Write-Output "Configured $($entry.Key)"
    }
} finally {
    Remove-Item Env:SIGNING_STORE_PASSWORD,Env:SIGNING_KEY_PASSWORD -ErrorAction SilentlyContinue
}
Write-Output 'Persistent release key remains only in .local/signing and encrypted GitHub Actions secrets.'
