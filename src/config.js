/* ==========================================================================
   Everything you need to change to make this your app.
   ========================================================================== */

export const CONFIG = {
  /* ---- Google OAuth client IDs -------------------------------------------
     From Google Cloud → APIs & Services → Credentials. You need two or three:

       iosClientId    an "iOS" client, bundle ID matching app.json
       webClientId    a "Web application" client — required for offlineAccess
                      and used by Android
       Android        an "Android" client, package name + SHA-1 fingerprint.
                      It has no ID to paste here; Google matches it by
                      signature at runtime.

     The README walks through creating them.                                */
  iosClientId: "432206356046-0ujmkctdc5rb3hobfp0chjvt5kgt4849.apps.googleusercontent.com",
  webClientId: "432206356046-umf1ranbpqnttj4beulm9q79a1g6b5gf.apps.googleusercontent.com",

  /* ---- What the app may touch on Drive -----------------------------------
     drive.file is deliberately the narrowest useful scope: the app can only
     see files it created itself. It cannot list, read or even know about the
     rest of someone's Drive. Widening this to `drive` or `drive.readonly`
     would let the app read every document the person owns, and would drag you
     into Google's restricted-scope verification. Do not widen it unless you
     genuinely need to open files the user picked.                           */
  scopes: ["https://www.googleapis.com/auth/drive.file"],

  /* ---- The document ------------------------------------------------------
     One JSON file per user, in their own Drive. Because each person signs in
     as themselves and the file is created under their account, isolation is
     automatic: there is no shared database that could leak between users, and
     no server of yours holding anyone's data.                               */
  fileName: "drive-starter-data.json",

  /* The shape a brand-new user starts with. Replace with your app's data. */
  emptyDoc: () => ({
    version: 1,
    createdAt: new Date().toISOString(),
    notes: "",
    items: [],
  }),

  /* ---- Optional: restrict who may use the app ----------------------------
     Be clear-eyed about what this is. A list checked on the device is a
     signpost, not a lock — the code ships to the phone and can be bypassed by
     anyone determined enough.

     The real boundary is Drive itself: every user reads and writes a file in
     their own account, so even someone who patched this list out would only
     ever see their own data, never yours or anyone else's. Google enforces
     that server-side, and it holds no matter what the client does.

     So use this to keep a private build tidy — a friendly "not on the list"
     screen — and never as your only defence for something that matters.

     Leave empty to let any Google account sign in.                          */
  allowedEmails: [],
};

export const isAllowed = (email) =>
  CONFIG.allowedEmails.length === 0 ||
  CONFIG.allowedEmails.map((e) => e.toLowerCase()).includes(String(email || "").toLowerCase());
