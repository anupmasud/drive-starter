/* ==========================================================================
   The whole pattern, as one hook.

     const { doc, update, status, user, signIn, signOut } = useCloudDoc();

   Local-first: the cached copy paints immediately, so the app is usable on a
   train. Drive is the durable copy and the thing that survives a lost phone.

   The cache is keyed by account, so signing in as someone else on a shared
   device never shows them the previous person's data.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { CONFIG, isAllowed } from "../config";
import * as Auth from "../google/auth";
import * as Drive from "../google/drive";

const SAVE_DELAY = 1200;
const cacheKey = (email) => `drive-starter:doc:${email || "anon"}`;

export function useCloudDoc() {
  const [user, setUser] = useState(null);
  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState("starting");  // starting | signed-out | not-allowed
                                                     // | loading | ready | saving | offline
                                                     // | conflict | error
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(null);    // { mine, theirs }

  const fileId = useRef(null);
  const folderId = useRef(null);
  const baseTime = useRef(null);     // modifiedTime this device last saw
  const timer = useRef(null);
  const latest = useRef(null);       // newest doc, even mid-render

  /* ------------------------------------------------------------- helpers -- */

  const cache = useCallback(async (email, value) => {
    try { await AsyncStorage.setItem(cacheKey(email), JSON.stringify(value)); } catch (_) {}
  }, []);

  const readCache = useCallback(async (email) => {
    try {
      const raw = await AsyncStorage.getItem(cacheKey(email));
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }, []);

  /* --------------------------------------------------------------- load -- */

  const load = useCallback(async (u) => {
    if (!isAllowed(u.email)) { setStatus("not-allowed"); return; }

    // Paint from cache first so there is no blank screen while Drive answers.
    const cached = await readCache(u.email);
    if (cached) { setDoc(cached); latest.current = cached; }
    setStatus(cached ? "ready" : "loading");

    try {
      const { id, folderId: fid, doc: remote, modifiedTime } = await Drive.loadDoc();
      fileId.current = id;
      folderId.current = fid;
      baseTime.current = modifiedTime;
      setDoc(remote);
      latest.current = remote;
      await cache(u.email, remote);
      setStatus("ready");
      setError("");
    } catch (e) {
      // With a cached copy in hand this is a soft failure: keep working
      // offline and let the next save try again.
      setError(e.message);
      setStatus(e.needsSignIn ? "expired" : cached ? "offline" : "error");
    }
  }, [cache, readCache]);

  /* --------------------------------------------------------------- boot -- */

  useEffect(() => {
    let alive = true;
    (async () => {
      const u = await Auth.restoreSession();
      if (!alive) return;
      if (!u) { setStatus("signed-out"); return; }
      setUser(u);
      await load(u);
    })();
    return () => { alive = false; };
  }, [load]);

  /* --------------------------------------------------------------- save -- */

  const push = useCallback(async () => {
    if (!fileId.current || !latest.current || !user) return;
    setStatus("saving");
    try {
      const { modifiedTime } = await Drive.saveDoc(fileId.current, latest.current, baseTime.current);
      baseTime.current = modifiedTime;
      setStatus("ready");
      setError("");
    } catch (e) {
      if (e.conflict) {
        // Fetch the other side so the user can actually compare, rather than
        // being asked to choose blind.
        try {
          const { doc: theirs } = await Drive.loadDoc();
          setConflict({ mine: latest.current, theirs });
        } catch (_) {
          setConflict({ mine: latest.current, theirs: null });
        }
        setStatus("conflict");
        return;
      }
      setError(e.message);
      setStatus(e.needsSignIn ? "expired" : "offline");
    }
  }, [user]);

  const update = useCallback((mutator) => {
    setDoc((prev) => {
      const next = typeof mutator === "function" ? mutator(prev) : mutator;
      latest.current = next;
      if (user) cache(user.email, next);
      clearTimeout(timer.current);
      timer.current = setTimeout(push, SAVE_DELAY);
      return next;
    });
  }, [cache, push, user]);

  /* Retry after an offline stretch, or force a fresh pull. */
  const syncNow = useCallback(async () => {
    if (!user) return;
    clearTimeout(timer.current);
    // An expired browser token can only be renewed from a real click, and this
    // is one — so reconnecting is the right thing to do rather than retrying.
    if (status === "expired") {
      try {
        const { cancelled } = await Auth.reconnect();
        if (cancelled) return;
      } catch (e) { setError(e.message); return; }
    }
    if (status === "offline" && latest.current) await push();
    else await load(user);
  }, [load, push, status, user]);

  const resolveConflict = useCallback(async (keep) => {
    if (!conflict) return;
    if (keep === "theirs" && conflict.theirs) {
      setDoc(conflict.theirs);
      latest.current = conflict.theirs;
      if (user) await cache(user.email, conflict.theirs);
      const meta = folderId.current ? await Drive.findFile(folderId.current) : null;
      baseTime.current = meta ? meta.modifiedTime : null;
      setConflict(null);
      setStatus("ready");
      return;
    }
    // Keeping mine means deliberately overwriting the other side.
    setConflict(null);
    setStatus("saving");
    try {
      const { modifiedTime } = await Drive.saveDoc(fileId.current, latest.current, null, { force: true });
      baseTime.current = modifiedTime;
      setStatus("ready");
    } catch (e) {
      setError(e.message);
      setStatus("offline");
    }
  }, [cache, conflict, user]);

  /* ------------------------------------------------------------ session -- */

  const signIn = useCallback(async () => {
    setError("");
    try {
      const { cancelled, user: u } = await Auth.signIn();
      if (cancelled || !u) return;
      setUser(u);
      await load(u);
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  }, [load]);

  const signOut = useCallback(async () => {
    clearTimeout(timer.current);
    await Auth.signOut();
    setUser(null);
    setDoc(null);
    latest.current = null;
    fileId.current = null;
    folderId.current = null;
    baseTime.current = null;
    setConflict(null);
    setStatus("signed-out");
  }, []);

  /* Cuts the app's Drive access off at Google's end, not just locally. */
  const disconnect = useCallback(async () => {
    clearTimeout(timer.current);
    if (user) { try { await AsyncStorage.removeItem(cacheKey(user.email)); } catch (_) {} }
    await Auth.revokeAccess();
    setUser(null);
    setDoc(null);
    latest.current = null;
    setStatus("signed-out");
  }, [user]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    user, doc, status, error, conflict,
    update, syncNow, resolveConflict,
    signIn, signOut, disconnect,
    fileUrl: fileId.current ? Drive.fileUrl(fileId.current) : null,
    folderUrl: folderId.current ? Drive.folderUrl(folderId.current) : null,
    configured: !!(CONFIG.iosClientId || CONFIG.webClientId),
  };
}
