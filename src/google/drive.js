/* ==========================================================================
   One JSON document, kept in the signed-in user's own Google Drive.

   Deliberately plain REST over fetch: no SDK, nothing to keep up to date, and
   you can read every call here and know exactly what the app does with the
   account it was given.

   Creating content is done in two steps — metadata, then bytes — rather than
   as one multipart upload. Multipart means hand-assembling a MIME body with
   boundaries, which is easy to get subtly wrong and miserable to debug on a
   phone. Two clear calls cost one extra round trip on first run only.
   ========================================================================== */

import { getAccessToken } from "./auth";
import { CONFIG } from "../config";

const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

/* Every Drive call goes through here so the stale-token retry exists in
   exactly one place. */
async function req(url, opts = {}, retry = true) {
  const token = await getAccessToken({ forceFresh: !retry });
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });

  if (res.status === 401 && retry) return req(url, opts, false);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Drive ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    // 403 on a drive.file app almost always means the token lacks the scope —
    // usually because the user approved sign-in but declined the Drive prompt.
    err.needsScope = res.status === 403 && /insufficient|scope/i.test(body);
    throw err;
  }
  return res;
}

const json = async (url, opts) => (await req(url, opts)).json();

/* ---------------------------------------------------------------- lookup -- */

/* Find our file. Under drive.file this only ever searches files this app
   created, so the name cannot collide with anything else the user owns. */
export async function findFile() {
  const params = new URLSearchParams({
    q: `name = '${CONFIG.fileName.replace(/'/g, "\\'")}' and trashed = false`,
    spaces: "drive",
    fields: "files(id, name, modifiedTime)",
    pageSize: "10",
  });
  const data = await json(`${FILES}?${params}`);
  const files = data.files || [];
  // If duplicates ever appear (two devices creating at once), the newest wins
  // and the others are simply left alone rather than silently deleted.
  files.sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
  return files[0] || null;
}

async function createFile(doc) {
  const meta = await json(FILES, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: CONFIG.fileName, mimeType: "application/json" }),
  });
  const modifiedTime = await writeContent(meta.id, doc);
  return { id: meta.id, modifiedTime };
}

async function writeContent(id, doc) {
  const res = await req(`${UPLOAD}/${id}?uploadType=media&fields=modifiedTime`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  });
  const out = await res.json().catch(() => ({}));
  return out.modifiedTime || new Date().toISOString();
}

/* ------------------------------------------------------------------ read -- */

/* Returns { id, doc, modifiedTime }, creating the file on first run. */
export async function loadDoc() {
  const file = await findFile();
  if (!file) {
    const doc = CONFIG.emptyDoc();
    const created = await createFile(doc);
    return { id: created.id, doc, modifiedTime: created.modifiedTime };
  }

  const res = await req(`${FILES}/${file.id}?alt=media`);
  const text = await res.text();
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (_) {
    // Someone hand-edited the file into invalid JSON. Refusing to guess is
    // kinder than silently replacing their data with an empty document.
    const err = new Error("The file in Drive is not valid JSON. Open it and fix or delete it.");
    err.corrupt = true;
    throw err;
  }
  return { id: file.id, doc, modifiedTime: file.modifiedTime };
}

/* ----------------------------------------------------------------- write -- */

/* Saves, but refuses to overwrite work done elsewhere.

   `baseModifiedTime` is what the file looked like when this device last read
   it. If Drive has moved on since — the same account on a tablet, or a hand
   edit — we stop and hand the caller both versions rather than clobbering.
   Drive has no if-match for content uploads, so this check is advisory: it
   closes the window from minutes to milliseconds, not to zero. For one person
   on a couple of devices that is the right trade. */
export async function saveDoc(id, doc, baseModifiedTime, { force = false } = {}) {
  if (!force && baseModifiedTime) {
    const meta = await json(`${FILES}/${id}?fields=modifiedTime`);
    if (meta.modifiedTime && meta.modifiedTime !== baseModifiedTime) {
      const err = new Error("This file changed somewhere else since you last loaded it.");
      err.conflict = true;
      err.remoteModifiedTime = meta.modifiedTime;
      throw err;
    }
  }
  const modifiedTime = await writeContent(id, doc);
  return { modifiedTime };
}

/* A link the user can open to see the actual file. Being able to point at
   "here is your data, in your Drive" is most of the trust this design buys. */
export const fileUrl = (id) => `https://drive.google.com/file/d/${id}/view`;
