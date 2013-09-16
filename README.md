PPD is a simple password manager.

Passwords are put in a PGP-encrypted file that gets backed up in your Dropbox
account.

You can then access your passwords with a web browser from any device.

**Q: Why don't you just use 1Password / LastPass / $PASSWORD_MANAGER?**

**A**:

* I can access my passwords using any device that has a web browser. And
  everything work fine on Linux, where the state of password managers is
  terrible.

* This is Free, Open-Source software. And it's simple: the code does almost
  nothing, only encrypting/decrypting stuff and reading/writing data with the
  Dropbox API.

**Q: Can I see a demo?**

**A**: No. You need to deploy it yourself, because you shouldn't trust me with
a) access to your Dropbox account and b) access to your decrypted password
database :)

## Installation

The webapp is a simple single-page app that can be deployed as a static
website. **You must host that website over HTTPS or the Dropbox client won't
work**.

First, create a [dropbox app](https://www.dropbox.com/developers/apps).
Select the "Full Dropbox" permission type.

Note the app key. The secret isn't useful for client-side apps.

Set the URL where you'll deploy it as OAuth redirect URI. Example:
`https://ppd.example.com/` or `https://example.com/ppd/`.

Then just serve the root of this repository as a static website.
