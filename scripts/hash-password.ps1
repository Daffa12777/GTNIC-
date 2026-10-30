# Generate a salted scrypt hash without putting the password in command history or arguments.
$securePassword = Read-Host 'Kata sandi akun (minimal 12 karakter)' -AsSecureString
$plainPassword = [System.Net.NetworkCredential]::new('', $securePassword).Password
if ($plainPassword.Length -lt 12) { throw 'Gunakan minimal 12 karakter.' }
try {
    $previousOutputEncoding = $OutputEncoding
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $plainPassword | node -e "const c=require('node:crypto'); const p=require('node:fs').readFileSync(0,'utf8').replace(/\r?\n$/, ''); const s=c.randomBytes(16).toString('hex'); c.scrypt(p,s,64,(e,k)=>{if(e)throw e; console.log(s+':'+k.toString('hex'));});"
} finally {
    $OutputEncoding = $previousOutputEncoding
    $plainPassword = $null
    $securePassword.Dispose()
}
