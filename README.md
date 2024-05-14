# Dependencies
- duplicity
- nodejs
- npm
- gnupg
- sshfs

# GPG

```bash
gpg --full-generate-key # RSA and RSA, 4096 bits, passphrase
gpg --armor --export <KEY_ID> > public.gpg
gpg --armor --export-secret-key <KEY_ID> > private.gpg
```
