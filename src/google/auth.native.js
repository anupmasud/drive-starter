/* ==========================================================================
   Google sign-in.

   Wraps @react-native-google-signin/google-signin so the rest of the app only
   ever deals with "who is signed in" and "give me a token". The library keeps
   the refresh token in the platform keychain itself, so there is no token
   storage to write — and nothing sensitive for us to mishandle.

   This needs a development build. It contains native code, so it cannot run
   in Expo Go; see the README.
   ========================================================================== */

import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { CONFIG } from "../config";

let configured = false;

export function configureGoogle() {
  if (configured) return;
  GoogleSignin.configure({
    iosClientId: CONFIG.iosClientId || undefined,
    webClientId: CONFIG.webClientId || undefined,
    scopes: CONFIG.scopes,
    // Asks for an auth code as well as a token. Harmless if you have no
    // server; the moment you add one, it can mint its own refresh token.
    offlineAccess: true,
  });
  configured = true;
}

const userFrom = (response) => {
  const u = (response && response.data && response.data.user) || null;
  return u ? { email: u.email, name: u.name, photo: u.photo, id: u.id } : null;
};

/* Restores the previous session without showing any UI. Returns null when
   nobody is signed in, which is the normal cold-start path. */
export async function restoreSession() {
  configureGoogle();
  try {
    const res = await GoogleSignin.signInSilently();
    return res.type === "success" ? userFrom(res) : null;
  } catch (_) {
    return null;
  }
}

export async function signIn() {
  configureGoogle();
  if (Platform_isAndroid()) await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const res = await GoogleSignin.signIn();
  if (res.type === "cancelled") return { cancelled: true, user: null };
  return { cancelled: false, user: userFrom(res) };
}

export async function signOut() {
  try { await GoogleSignin.signOut(); } catch (_) { /* already gone */ }
}

/* Removes the app's access to the account entirely, not just this session.
   Worth offering somewhere in your settings — it is the honest counterpart to
   asking for a Drive scope in the first place. */
export async function revokeAccess() {
  try { await GoogleSignin.revokeAccess(); } catch (_) {}
  await signOut();
}

/* An access token for calling Google's REST APIs.

   Tokens go stale, and the library hands back a cached one. The documented
   remedy is to clear that specific token and ask again, which is what
   `forceFresh` does after a 401 comes back from Drive. */
export async function getAccessToken({ forceFresh = false } = {}) {
  configureGoogle();
  const { accessToken } = await GoogleSignin.getTokens();
  if (!forceFresh) return accessToken;

  await GoogleSignin.clearCachedAccessToken(accessToken);
  const fresh = await GoogleSignin.getTokens();
  return fresh.accessToken;
}

/* The web build needs this to recover from an expired browser token; on native
   the library refreshes silently, so it is only ever a no-op re-affirmation. */
export const reconnect = signIn;

export const currentUser = () => {
  const u = GoogleSignin.getCurrentUser();
  return u && u.user ? { email: u.user.email, name: u.user.name, photo: u.user.photo, id: u.user.id } : null;
};

export { statusCodes };

/* Kept local so this module has no react-native import just for one check. */
function Platform_isAndroid() {
  // eslint-disable-next-line global-require
  return require("react-native").Platform.OS === "android";
}
