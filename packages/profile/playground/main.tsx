import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthContext, type AuthContextValue } from "../src/context/auth-context.js";
import { ProfileContext, type ProfileContextValue } from "../src/context/profile-context.js";
import { ProfilePopover } from "../src/components/ProfilePopover.js";
import { AuthGate } from "../src/components/AuthGate.js";
import { widgetStyles } from "../src/styles/styles.js";
import { profileWithPicture, profileWithoutPicture } from "./mock-data.js";
import type { ProfileData, ProfileState } from "../src/types.js";
import type { AuthState } from "@stawi/auth-runtime";

// Replace :host selectors with .aiw-root for regular DOM rendering
const playgroundCss = widgetStyles
  .replace(/:host\([^)]+\)/g, (match) => {
    const inner = match.slice(6, -1); // strip :host( ... )
    return `.aiw-root${inner}`;
  })
  .replace(/:host/g, ".aiw-root");

function makeMockAuth(
  roles: string[] = [],
  authState: AuthState = "authenticated",
): AuthContextValue {
  return {
    authState,
    runtime: {
      getRoles: async () => roles,
      getApiClient: () => ({ fetch: async () => ({}), upload: async () => ({}) }),
      getAccessToken: async () => "mock-token",
    } as AuthContextValue["runtime"],
    ensureAuthenticated: async () => {
      alert("ensureAuthenticated() called — auth flow would start");
    },
    logout: async () => {
      alert("Logout clicked");
    },
  };
}

interface MockWidgetProps {
  profile: ProfileData;
  roles?: string[];
  adminPanelUrl?: string;
}

function MockWidget({ profile: initialProfile, roles = [], adminPanelUrl }: MockWidgetProps) {
  const [profile, setProfile] = useState(initialProfile);

  const state: ProfileState = {
    loading: false,
    error: null,
    profile,
    pendingVerification: null,
  };

  const ctx: ProfileContextValue = {
    state,
    updateProfile: async (updates) => {
      setProfile((p) => ({ ...p, ...updates }));
    },
    uploadAvatar: async () => {
      alert("Avatar upload (mocked)");
    },
    setLanguage: async (language) => {
      setProfile((p) => ({ ...p, language }));
    },
    setCountry: async (country) => {
      setProfile((p) => ({ ...p, country }));
    },
    addContact: async (type, value) => {
      const id = `c-${Date.now()}`;
      setProfile((p) => ({
        ...p,
        contacts: [...p.contacts, { id, type, value, verified: false, primary: false }],
      }));
    },
    removeContact: async (contactId) => {
      setProfile((p) => ({
        ...p,
        contacts: p.contacts.filter((c) => c.id !== contactId),
      }));
    },
    sendVerification: async (contactId) => {
      alert(`Verification code sent for contact ${contactId} (mocked)`);
    },
    verifyContact: async () => {},
    dismissVerification: () => {},
  };

  return (
    <AuthContext.Provider value={makeMockAuth(roles)}>
      <ProfileContext.Provider value={ctx}>
        <ProfilePopover
          adminPanelUrl={adminPanelUrl}
          onLogout={() => alert("Logged out!")}
        />
      </ProfileContext.Provider>
    </AuthContext.Provider>
  );
}

interface MockAuthStateWidgetProps {
  authState: AuthState;
}

function MockAuthStateWidget({ authState }: MockAuthStateWidgetProps) {
  return (
    <AuthContext.Provider value={makeMockAuth([], authState)}>
      <AuthGate />
    </AuthContext.Provider>
  );
}

function App() {
  return (
    <>
      <style>{playgroundCss}</style>
      <div style={{ padding: 40, fontFamily: "'Lora', Georgia, serif" }}>
        <h1 style={{ marginBottom: 24, fontFamily: "'Poppins', system-ui, sans-serif" }}>
          Profile UI — Dev Playground
        </h1>

        <div style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>
          <div>
            <h3 style={{ marginBottom: 12 }}>With profile picture</h3>
            <div className="aiw-root">
              <MockWidget profile={profileWithPicture} />
            </div>
          </div>

          <div>
            <h3 style={{ marginBottom: 12 }}>Without picture (Gravatar)</h3>
            <div className="aiw-root">
              <MockWidget profile={profileWithoutPicture} />
            </div>
          </div>

          <div>
            <h3 style={{ marginBottom: 12 }}>Admin user (with panel link)</h3>
            <div className="aiw-root">
              <MockWidget
                profile={profileWithPicture}
                roles={["admin", "user"]}
                adminPanelUrl="https://admin.example.com"
              />
            </div>
          </div>

          <div>
            <h3 style={{ marginBottom: 12 }}>Logged out</h3>
            <div className="aiw-root">
              <MockAuthStateWidget authState="unauthenticated" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
