# Employee usernames

Login now uses a typed username and the employee's existing password. Both normal sign-in and Start cashier shift accept the new username. Reports, petty-cash custody, employee IDs, display names and saved sessions continue using the existing employee identity.

## Format

`firstname` + `lastname` + `access level` + `@ys.sys`

For example, Mica Tambalong with Access Level 1 uses `micatambalong1@ys.sys`. Bea Alcozero with Access Level 2 would use `beaalcozero2@ys.sys`. These are internal usernames, not mailboxes.

- Names are lowercase. Spaces and punctuation are removed, and accented Latin letters are normalized.
- Access Level must be a non-negative whole number. It is read from Employees column F; typing another number never grants access.
- Changing a name or Access Level changes the generated username immediately. The existing password stays the same.
- Duplicate normalized usernames use a middle initial when an optional Middle Name or Middle Initial column exists after column G. If that does not resolve the duplicate, a dot and normalized Employee ID are inserted before the access number, such as `micatambalong.m11@ys.sys` for Employee ID M1 and Access Level 1.
- Inactive accounts are excluded from login choices but retained during duplicate resolution so deactivating a duplicate does not rename another employee's account.
- Unresolvable duplicate IDs/names or invalid access levels cannot authenticate.

## View usernames in Sheets

After pushing the backend and frontend together, reload the spreadsheet and select **POS Automation → Refresh Employee Usernames**. This writes a Username column after the existing seven employee fields, without changing passwords, names, access or employee IDs.

The action uses column H only when empty, or an existing column labelled Username after column G. If H contains other data, add a separate Username header in a free column after G and retry. The action refuses to overwrite unrelated or unlabelled data. It is private to sheet-editor menu execution; it is not a public web RPC.

Usernames are always computed from the employee records for authentication. Login does not write to the spreadsheet. The sheet's Username column is a readable projection; refresh it after name/access edits. Editing that column manually does not change login credentials or permissions.

## Compatibility and rollback

Existing tabs and password reauthentication may still use full employee names during rollout. New login UI requires the username format. Duplicate full names are never resolved to an arbitrary account.

Deploy both sides together and reload open app tabs. No existing identities or historical reports are renamed. Rolling back the frontend/backend together restores the employee selector; the extra Username column may remain because legacy readers use the original seven columns. No data deletion is required.

Verification covers username/password matching, case normalization, role changes, forged suffixes, inactive users, collision resolution, safe sheet projection, normal login, cashier custody and same-day report reuse.
