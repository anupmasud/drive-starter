/* ==========================================================================
   Google sign-in — web.

   Same exports as auth.native.js, so nothing above this file knows or cares
   which platform it is on. Metro picks this file for the web build and
   auth.native.js for iOS and Android.

   The native library cannot run in a browser, so this uses Google Identity
   Services directly: a token client that hands back an access token for the
   Drive REST calls in drive.js.

   Tokens live about an hour and there is no refresh token in a browser flow —
   that is by design, since a refresh token sitting in localStorage would be a
   liability. When one runs out we ask for a click rather than firing a popup
   the browser would block, so an expired session is a visible "Reconnect"
   button instead of a silent failure.
   ========================================================================== */

import { CONFIG } from "../config";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const TOKEN_KEY = "drive-starter:web-token";
const USER_KEY = "drive-starter:web-user";

/* The native library asks for email and profile by default; on the web we have
   to say so explicitly, because we read the profile from the userinfo endpoint
   to show who is signed in. */
const WEB_SCOPES = [
  ...CONFIG.scopes,
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

let tokenClient = null;
let token = null;
let expiry = 0;
let user = null;

/* ------------------------------------------------------------- plumbing -- */

function loadGis() {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Not a browser"));
    if (window.google && window.google.accounts) return resolve();

    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Could not load Google sign-in")));
      return;
    }
    const el = document.createElement("script");
    el.src = GIS_SRC;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Could not load Google sign-in"));
    document.head.appendChild(el);
  });
}

const readStored = () => {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
    if (t && t.exp > Date.now() + 60000) { token = t.token; expiry = t.exp; }
    user = JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch (_) { /* ignore */ }
};

const storeToken = () => {
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, exp: expiry })); } catch (_) {}
};

const clearStored = () => {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (_) {}
};

export async function configureGoogle() {
  if (tokenClient) return;
  if (!CONFIG.webClientId) throw new Error("No webClientId in src/config.js");
  await loadGis();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.webClientId,
    scope: WEB_SCOPES.join(" "),
    callback: () => {},
  });
  readStored();
}

/* Always call this from a user gesture: Google's token client opens a popup,
   and browsers block popups that no click asked for. */
function requestToken({ interactive }) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error));
      token = resp.access_token;
      expiry = Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3500 * 1000);
      storeToken();
      resolve(token);
    };
    tokenClient.error_callback = (err) => reject(new Error((err && err.type) || "Sign-in failed"));
    try {
      tokenClient.requestAccessToken({ prompt: interactive ? "consent" : "" });
    } catch (e) { reject(e); }
  });
}

async function fetchUser() {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not read your Google profile");
  const p = await res.json();
  user = { email: p.email, name: p.name, photo: p.picture, id: p.sub };
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch (_) {}
  return user;
}

/* --------------------------------------------------------------- public -- */

/* Restores only from a token we already hold.

   It is tempting to ask Google for a fresh token here instead, but on the web
   that opens a popup, and a popup not triggered by a click is blocked — so the
   "silent" restore would fail noisily on every cold load. Better to restore
   what we have and let a real tap do the rest. */
export async function restoreSession() {
  try {
    await configureGoogle();
    if (token && expiry > Date.now() + 60000) return user || (await fetchUser());
    return null;
  } catch (_) {
    return null;
  }
}

export async function signIn() {
  await configureGoogle();
  try {
    await requestToken({ interactive: true });
  } catch (e) {
    // Closing the Google popup is a choice, not a failure worth shouting about.
    if (/popup_closed|access_denied|cancel/i.test(e.message)) return { cancelled: true, user: null };
    throw e;
  }
  return { cancelled: false, user: await fetchUser() };
}

export async function signOut() {
  token = null; expiry = 0; user = null;
  clearStored();
}

export async function revokeAccess() {
  try {
    if (token && window.google) window.google.accounts.oauth2.revoke(token, () => {});
  } catch (_) {}
  await signOut();
}

/* Browser tokens last about an hour and there is no refresh token to lean on,
   so when one runs out the only way forward is a click. Rather than firing a
   popup the browser will block, say so plainly and let the UI offer a button. */
export async function getAccessToken({ forceFresh = false } = {}) {
  await configureGoogle();
  if (!forceFresh && token && expiry > Date.now() + 60000) return token;

  const err = new Error("Your Google session has expired. Reconnect to keep saving.");
  err.needsSignIn = true;
  throw err;
}

/* Called from a button, so the popup is user-initiated and allowed. */
export const reconnect = signIn;

export const currentUser = () => user;

/* Present only so the native module's export list is matched exactly. */
export const statusCodes = {};
