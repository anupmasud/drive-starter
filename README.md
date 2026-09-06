# Drive Starter

**Web demo: [anupmasud.github.io/drive-starter](https://anupmasud.github.io/drive-starter/)**

A starting point for apps where **each person's data lives in their own Google
Drive**, and signing in with Google is the whole of the access control.

One Expo codebase, two outputs: an **iPhone app** and a **web app**. No backend,
no database, no server of yours holding anyone's data — which is the point.

## Why this shape

Most small apps end up needing three things they'd rather not build: sign-in,
somewhere to put the data, and a story for who can see what. This pattern gets
all three from Google at once:

| You'd normally build | Here |
|---|---|
| Accounts, passwords, resets | Google Sign-In |
| A database | One JSON file in the user's Drive |
| Per-user isolation | Automatic — each file is in its own account |
| Backups, export, portability | It's a file in their Drive. They already have it |

The user can open the file, read it, back it up, or delete it. If you abandon
the app tomorrow, their data is still theirs and still readable.

### What the access control actually is

Worth being precise, because it's easy to talk yourself into a false sense of it.

**The real boundary is Drive.** Each person reads and writes a file in their own
account, using a token issued to them. Google enforces that server-side. There is
no shared store, so there is no query that could return someone else's rows — the
usual way small apps leak data simply doesn't exist here.

**The scope matters more than anything you write.** This template asks for
`drive.file`, which lets the app see *only files it created itself*. Not the
user's documents, not their photos, not anything else. If you widen it to `drive`
you take on the ability to read their entire Drive, and Google's restricted-scope
verification along with it. Don't, unless you truly need to open files the user
picks.

**An email allowlist is a signpost, not a lock.** `config.js` has an optional
`allowedEmails`. It's genuinely useful for keeping a private build tidy, and it's
bypassable by anyone who can edit the JS — which, on a phone app, is anyone
determined. It is safe here only because it isn't load-bearing: someone who
patched it out would sign in as themselves and see their own empty file. Never
make it your only defence for something that matters.

## Setup

### 1. Google Cloud

In the [console](https://console.cloud.google.com/):

1. Create a project, then **APIs & Services → Library → enable "Google Drive API"**.
2. Configure the **OAuth consent screen**. While it's in *Testing*, add your own
   address under **Test users** or sign-in is refused.
3. **Credentials → Create credentials → OAuth client ID**, three times:

   | Type | What you need | Where it goes |
   |---|---|---|
   | **iOS** | bundle ID from `app.json` (`ios.bundleIdentifier`) | its *reversed* client ID → `app.json` `iosUrlScheme`; the ID itself → `config.js` |
   | **Web application** | nothing extra | `config.js` `webClientId` |
   | **Android** | package name + SHA-1 fingerprint | nowhere — Google matches it by app signature |

   The reversed client ID is just the ID backwards:
   `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc`.

   For the Android SHA-1, `npx expo credentials` or `eas credentials` will show
   the fingerprint of the keystore your build actually uses. A debug build and a
   release build have different ones, and both need registering.

### 1b. Authorised origins (web only)

For the web build, the **Web application** client also needs every origin it will
be served from, under **Authorised JavaScript origins** — origins only, no paths:

```
https://anupmasud.github.io
http://localhost:8081
```

Get this wrong and sign-in fails with `origin_mismatch`. The iOS app does not use
origins at all; it is matched by bundle ID.

### 2. This project

Fill in `src/config.js`:

```js
iosClientId: "123-abc.apps.googleusercontent.com",
webClientId: "123-xyz.apps.googleusercontent.com",
```

and `app.json` → the `iosUrlScheme` placeholder.

Then set your own identity while you're there: `name`, `slug`, `scheme`,
`ios.bundleIdentifier`, `android.package`. The bundle ID must match what you
registered above.

### 3. Build and run

Google Sign-In contains native code, so **Expo Go will not work**. You need a
development build — which is what you'd want for a real app anyway.

```bash
npx expo prebuild --clean
npx expo run:ios        # or: npx expo run:android
```

Or build in the cloud with EAS if you'd rather not have Xcode/Android Studio set
up locally:

```bash
npx eas build --profile development --platform ios
```

After the first native build, day-to-day work is just `npx expo start --dev-client`.

## How it fits together

```
App.js                     demo screen — replace with your app
src/config.js              client IDs, scope, folder path, file name, empty doc
src/google/auth.native.js  sign-in on iOS and Android
src/google/auth.web.js     sign-in in a browser
src/google/drive.js        folders and files — shared by both platforms
src/store/useCloudDoc.js   the hook that ties it together
```

Metro picks `auth.native.js` or `auth.web.js` by platform, so nothing above them
knows which it is on and `drive.js` is shared verbatim. The two differ because
the native Google library cannot run in a browser.

Everything you'd actually reuse is the three files under `src/`. `App.js` is a
demo and is meant to be deleted.

### The hook

```js
const { doc, update, status, user, signIn, signOut } = useCloudDoc();

update((d) => ({ ...d, notes: "hello" }));   // saves itself, ~1.2s after you stop
```

- **Local-first.** An AsyncStorage cache paints immediately, so the app is usable
  before Drive answers and stays usable on a train. Drive is the durable copy.
- **The cache is keyed by account**, so signing in as someone else on a shared
  phone never shows them the previous person's data.
- **Debounced saves**, so typing doesn't mean one request per keystroke.
- **Stale-token retry** in one place: a 401 clears the cached token and retries
  once, which is the documented remedy and otherwise bites you after an hour.

### Conflicts

Before overwriting, `saveDoc` checks whether Drive's `modifiedTime` still matches
what this device last read. If not, it refuses and hands both versions back, and
the demo screen asks which to keep.

Be clear about the limit: Drive has no if-match for content uploads, so this is
advisory. It shrinks the window from minutes to milliseconds, not to zero. For
one person on a couple of devices that's the right trade; if you need real
multi-writer safety you want a different backend, not a patch on this one.

### Changing the data shape

Change `CONFIG.emptyDoc()`, and put a `version` in the document. When you need to
migrate, read `doc.version` on load and upgrade in place — the file is plain JSON
and people may have hand-edited it, so be forgiving about what you accept.

## Where the data goes

`CONFIG.folderPath` — default `["Apps", "Drive Starter"]` — puts the file in
My Drive → Apps → Drive Starter rather than loose in the root. Set it to `[]` to
keep it at the top level.

**The app creates these folders.** Because of the `drive.file` scope it cannot
see folders it did not make, so it cannot offer you a picker of folders you
already have. Once created you can rename the folder or drag it anywhere in your
Drive and nothing breaks — it is remembered by id, not by path. Deleting it is
the only thing that invalidates that, and the app recreates it.

## Deploying the web build

```bash
npm run deploy:web
```

Builds and force-pushes `dist/` to the `gh-pages` branch. The commit is built
from inside `dist/`, so the branch can only ever contain what was exported —
the `gh-pages` npm package seeds a new branch from your current one, which
quietly drags repo-root files onto a branch serving a public site.

`scripts/postexport.mjs` does the two things GitHub Pages needs: writes
`.nojekyll` (without it Pages hides the `_expo/` folder, and you get a blank
page with a 404 for the bundle) and rewrites asset paths to the project
subdirectory. Change `BASE` there if you rename the repo.

## Notes

- **Node**: Expo wants ≥ 20.19.4. This was built and bundled on 20.16.0 with only
  a warning, but upgrade if you hit anything strange.
- **Verified so far**: the project bundles cleanly (`npx expo export`). The live
  Google sign-in round trip can't be exercised without real client IDs and a
  device, so treat the first run as the real test.
- **Web sessions expire after about an hour.** Browser OAuth has no refresh
  token by design — one sitting in `localStorage` would be a liability — and a
  popup that no click asked for is blocked. So an expired web session shows a
  **Reconnect** button rather than failing silently. The iOS app refreshes on
  its own and never shows this.
