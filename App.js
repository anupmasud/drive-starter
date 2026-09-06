/* ==========================================================================
   Demo screen.

   Deliberately small: it exists to show the four things the pattern gives you
   — sign in, a document that saves itself, honest sync status, and a way out
   (sign out / revoke). Replace the middle with your own app.
   ========================================================================== */

import { useState } from "react";
import {
  ActivityIndicator, Linking, Pressable, SafeAreaView, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

import { useCloudDoc } from "./src/store/useCloudDoc";
import { CONFIG } from "./src/config";

const STATUS_TEXT = {
  starting: "Starting…",
  loading: "Loading from Drive…",
  saving: "Saving…",
  ready: "Saved to your Drive",
  offline: "Offline — will retry",
  conflict: "Changed somewhere else",
  expired: "Tap to reconnect",
  error: "Something went wrong",
};

export default function App() {
  const {
    user, doc, status, error, conflict, configured,
    update, syncNow, resolveConflict, signIn, signOut, disconnect, fileUrl, folderUrl,
  } = useCloudDoc();

  const [draft, setDraft] = useState("");

  /* ---------------------------------------------------------- unconfigured */
  if (!configured) {
    return (
      <Shell>
        <Text style={s.h1}>Almost there</Text>
        <Text style={s.body}>
          Add your Google OAuth client IDs to{" "}
          <Text style={s.code}>src/config.js</Text>, then rebuild. The README walks
          through creating them in Google Cloud.
        </Text>
      </Shell>
    );
  }

  /* ------------------------------------------------------------- signed out */
  if (status === "signed-out" || status === "starting") {
    return (
      <Shell>
        <Text style={s.h1}>Drive Starter</Text>
        <Text style={s.body}>
          Sign in with Google. Your data is kept as a single file in
          {" "}{CONFIG.folderPath.length ? CONFIG.folderPath.join(" / ") : "My Drive"}
          {" "}on your own Drive — this app can only see files it created there,
          nothing else.
        </Text>
        {status === "starting" ? (
          <ActivityIndicator style={{ marginTop: 24 }} />
        ) : (
          <Button label="Sign in with Google" onPress={signIn} primary />
        )}
        {!!error && <Text style={s.error}>{error}</Text>}
      </Shell>
    );
  }

  /* ------------------------------------------------------------ not allowed */
  if (status === "not-allowed") {
    return (
      <Shell>
        <Text style={s.h1}>Not on the list</Text>
        <Text style={s.body}>
          {user?.email} isn’t one of the accounts this build allows.
        </Text>
        <Button label="Sign out" onPress={signOut} />
      </Shell>
    );
  }

  /* --------------------------------------------------------------- conflict */
  if (status === "conflict") {
    return (
      <Shell>
        <Text style={s.h1}>Two versions</Text>
        <Text style={s.body}>
          This file changed somewhere else — another device, or an edit made
          directly in Drive — since this phone last loaded it. Nothing has been
          overwritten yet.
        </Text>
        <View style={s.compare}>
          <Text style={s.compareLabel}>On this device</Text>
          <Text style={s.compareBody} numberOfLines={4}>
            {summarise(conflict?.mine)}
          </Text>
        </View>
        <View style={s.compare}>
          <Text style={s.compareLabel}>In Drive</Text>
          <Text style={s.compareBody} numberOfLines={4}>
            {conflict?.theirs ? summarise(conflict.theirs) : "Could not be read"}
          </Text>
        </View>
        <Button label="Keep this device’s version" onPress={() => resolveConflict("mine")} primary />
        <Button label="Use the version in Drive" onPress={() => resolveConflict("theirs")} />
      </Shell>
    );
  }

  /* ---------------------------------------------------------------- loading */
  /* Without this, "loading" and "error" fell through to the main screen with
     no document to draw — which renders as a blank white page and looks like
     a crash. Every status now has somewhere to land. */
  if (!doc) {
    return (
      <Shell>
        <Text style={s.h1}>
          {status === "expired" ? "Session expired" : status === "error" ? "Couldn’t load" : "Loading…"}
        </Text>
        {status === "error" || status === "expired" ? (
          <>
            <Text style={s.body}>
              Signed in as {user?.email || "—"}, but the file in Drive couldn’t be read.
            </Text>
            {!!error && <Text style={s.error}>{error}</Text>}
            <Button label={status === "expired" ? "Reconnect" : "Try again"} onPress={syncNow} primary />
            <Button label="Sign out" onPress={signOut} />
          </>
        ) : (
          <ActivityIndicator style={{ marginTop: 8 }} />
        )}
      </Shell>
    );
  }

  /* ------------------------------------------------------------------ ready */
  const items = doc?.items || [];

  const addItem = () => {
    const text = draft.trim();
    if (!text) return;
    update((d) => ({ ...d, items: [...(d.items || []), { id: String(Date.now()), text }] }));
    setDraft("");
  };

  return (
    <Shell scroll>
      <View style={s.userRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.userName}>{user?.name || user?.email}</Text>
          <Text style={s.userMail}>{user?.email}</Text>
        </View>
        <Pressable onPress={syncNow} hitSlop={8}>
          <Text style={[s.status, (status === "offline" || status === "expired") && s.statusWarn, status === "error" && s.statusBad]}>
            {STATUS_TEXT[status] || status}
          </Text>
        </Pressable>
      </View>

      <Text style={s.label}>Notes</Text>
      <TextInput
        style={[s.input, s.multiline]}
        multiline
        placeholder="Anything at all — it saves as you type"
        value={doc?.notes || ""}
        onChangeText={(t) => update((d) => ({ ...d, notes: t }))}
      />

      <Text style={s.label}>Items</Text>
      <View style={s.addRow}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          placeholder="Add one"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addItem}
          returnKeyType="done"
        />
        <Button label="Add" onPress={addItem} compact />
      </View>

      {items.length === 0 && <Text style={s.empty}>Nothing yet.</Text>}
      {items.map((it) => (
        <View key={it.id} style={s.item}>
          <Text style={s.itemText}>{it.text}</Text>
          <Pressable
            hitSlop={10}
            onPress={() => update((d) => ({ ...d, items: d.items.filter((x) => x.id !== it.id) }))}
          >
            <Text style={s.remove}>✕</Text>
          </Pressable>
        </View>
      ))}

      {!!error && <Text style={s.error}>{error}</Text>}

      <View style={s.footer}>
        {!!folderUrl && (
          <Pressable onPress={() => Linking.openURL(folderUrl)}>
            <Text style={s.link}>
              Open {CONFIG.folderPath.join(" / ") || "My Drive"} in Drive
            </Text>
          </Pressable>
        )}
        {!!fileUrl && (
          <Pressable onPress={() => Linking.openURL(fileUrl)}>
            <Text style={s.link}>Open {CONFIG.fileName}</Text>
          </Pressable>
        )}
        <Button label="Sign out" onPress={signOut} />
        <Button label="Disconnect this app from Google" onPress={disconnect} danger />
      </View>
    </Shell>
  );
}

/* ------------------------------------------------------------------ bits -- */

const summarise = (d) =>
  !d ? "—" : `${(d.items || []).length} item(s)\n${(d.notes || "").slice(0, 120) || "(no notes)"}`;

function Shell({ children, scroll }) {
  const Inner = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <Inner
        style={s.screen}
        contentContainerStyle={scroll ? s.scrollPad : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </Inner>
    </SafeAreaView>
  );
}

function Button({ label, onPress, primary, danger, compact }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        primary && s.btnPrimary,
        danger && s.btnDanger,
        compact && s.btnCompact,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[s.btnText, primary && s.btnTextPrimary, danger && s.btnTextDanger]}>{label}</Text>
    </Pressable>
  );
}

const INK = "#1F1A15";
const MUTED = "#6B6055";
const RULE = "#E4DACB";

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FBF7F0" },
  screen: { flex: 1, paddingHorizontal: 22 },
  scrollPad: { paddingVertical: 18, paddingBottom: 60 },

  h1: { fontSize: 30, fontWeight: "700", color: INK, marginTop: 60, marginBottom: 10 },
  body: { fontSize: 15, lineHeight: 22, color: MUTED, marginBottom: 22 },
  code: { fontFamily: "Courier", color: INK },

  userRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  userName: { fontSize: 17, fontWeight: "600", color: INK },
  userMail: { fontSize: 12, color: MUTED, marginTop: 1 },
  status: { fontSize: 11, fontWeight: "600", color: "#3F7D5B" },
  statusWarn: { color: "#B5761E" },
  statusBad: { color: "#B4443A" },

  label: { fontSize: 12, fontWeight: "700", color: MUTED, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: RULE, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: INK,
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center" },

  empty: { color: MUTED, fontSize: 14, paddingVertical: 14 },
  item: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: RULE,
  },
  itemText: { flex: 1, fontSize: 15, color: INK },
  remove: { color: MUTED, fontSize: 15 },

  btn: {
    borderWidth: 1, borderColor: RULE, backgroundColor: "#fff",
    borderRadius: 10, paddingVertical: 13, paddingHorizontal: 18,
    alignItems: "center", marginTop: 10,
  },
  btnCompact: { paddingVertical: 10, marginTop: 0 },
  btnPrimary: { backgroundColor: INK, borderColor: INK },
  btnDanger: { borderColor: "#B4443A", backgroundColor: "transparent" },
  btnText: { fontSize: 15, fontWeight: "600", color: INK },
  btnTextPrimary: { color: "#FBF7F0" },
  btnTextDanger: { color: "#B4443A" },

  compare: {
    borderWidth: 1, borderColor: RULE, borderRadius: 10,
    padding: 12, marginBottom: 10, backgroundColor: "#fff",
  },
  compareLabel: { fontSize: 11, fontWeight: "700", color: MUTED, marginBottom: 4 },
  compareBody: { fontSize: 13, color: INK, lineHeight: 19 },

  error: { color: "#B4443A", fontSize: 13, marginTop: 16, lineHeight: 19 },
  link: { color: "#2F6D8C", fontSize: 14, marginBottom: 6 },
  footer: { marginTop: 34, borderTopWidth: 1, borderTopColor: RULE, paddingTop: 18 },
});
