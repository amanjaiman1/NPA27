# Attached files

Journal days can carry files: photos of handwritten notes, PDFs, text and
Markdown notes, CSVs, and Word, Excel and PowerPoint files. Goals and Life
Dashboard days can link to those files. This page explains where the files
live, what keeps them private, and how they stay inside Supabase's free plan.

## Where files live

| What | Where | Synced in the snapshot? |
| --- | --- | --- |
| The bytes | Supabase Storage, private bucket `chronicle-attachments`, at `<user id>/<sha-256 of the bytes>` | No |
| A description (`FileRecord`: name, type, size, hash, path, date) | `files` in `chronicle_state.data` | Yes, about 200 bytes each |
| Which day holds which file | `fileIds` on the journal entry | Yes |
| Links from goals and life days | `fileIds` on the goal or life entry | Yes |

No file content, thumbnail or base64 ever goes into the synced data, so a
photo costs the same few hundred bytes of sync whether it is 50 KB or 5 MB.

The network code is in `src/lib/file-storage.ts`. The rules are pure functions
in `src/lib/files.ts`, covered by `tests/files.test.ts`.

## The rules

1. **A file belongs to the journal.** It exists while at least one journal day
   holds it. Goals and Life Dashboard days only point at it.
2. **One file, one copy.** The object is named by its SHA-256, and records are
   unique by hash. Attaching the same file again, on any day or any device,
   reuses the stored copy: the upload is refused as a duplicate and treated as
   success, or skipped entirely when the hash is already known.
3. **Nothing is deleted while something still uses it.** Unlinking a file from a
   goal or a life day only removes the link. Removing it from the last journal
   day that holds it deletes it, and if a goal or life day links to it the
   composer says so before you save.

## Limits

| Limit | Value | Enforced by |
| --- | --- | --- |
| Per file | 5 MB after resizing | the app, and the bucket's `file_size_limit` |
| Types | the list in `FILE_TYPES` | the app (by extension first), and the bucket's `allowed_mime_types` |
| Per journal day | 10 files | the app |
| Per account | 100 MB | the app, checked before every upload |

Photos are resized to at most 2048 px on the long side and re-encoded as WebP
(JPEG where the browser can't write WebP), so a 6 MB phone photo usually
stores as a few hundred KB. GIFs are left as they are. With the free plan's
1 GB of file storage, the per-account allowance leaves room for several
accounts.

The per-account limit is checked by the app, not the database. A modified
client could store more in its own folder, but never in anyone else's.

## Privacy

Four row-level security policies on `storage.objects`
(`supabase/migrations/20261118120000_journal_attachments.sql`) let a signed-in
user read, add, replace and delete objects in their own folder only. A new
object's name must be exactly `<their user id>/<64 hex characters>`. The bucket
isn't public: the app opens a file through a signed link that lasts an hour,
minted with the owner's session and cached in memory for reuse.

Checked by:

- `supabase/tests/rls_isolation.sql` (`npm run test:db`): another user can't
  see, add, move or delete objects in someone else's folder, a name that isn't
  a content hash is refused, anonymous callers see nothing, and the push
  dispatcher's trimmed snapshot carries no file details.
- The e2e run (`npm run test:e2e`, scenario 8): with a real session for another
  account, signing a link to, listing, writing into and deleting from the
  first account's folder all fail.

## Uploading

Uploads start as soon as files are picked or dropped, with a progress bar per
file. Each can be cancelled, a failed one can be retried without picking it
again, and errors say what went wrong (too large, wrong type, offline, session
ended). Nothing joins the day until the entry is saved. Cancelling the composer
deletes objects that edit uploaded, unless another day already used the same
bytes.

## Cleaning up

`FileJanitor` (`components/attachments/file-janitor.tsx`) runs in the
background:

- Objects this device stopped using are queued (`fileTrash`, kept on the device
  only) and deleted from Storage, with a retry whenever the device comes back
  online.
- Once a day, after a successful sync, it deletes objects in the account's
  folder that no record mentions, such as uploads from a composer closed while
  offline. It only touches objects more than two days old, and never runs while
  the account has no file records, so a slow first sync can't be mistaken for
  "nothing is attached".

**Deleting the account** (`/api/account/delete`) deletes every object in the
account's folder with the service role first, then the user. If the files
can't be deleted, the account is kept so the request can be retried.

## Backups

**Download my data** includes the file records but not the files. Restoring a
backup into the same account brings the links back to the stored files.
Restoring one from a different account drops records this account can't open
(`dropForeignFiles`).

## Setup

Run `supabase/migrations/20261118120000_journal_attachments.sql` once in the
Supabase SQL Editor. It is additive and safe to re-run. Until it has run,
attaching fails with a "couldn't be stored" message and everything else works.
