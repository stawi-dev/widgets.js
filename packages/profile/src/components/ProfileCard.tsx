import { useCallback, useEffect, useState } from "react";
import { useProfile } from "../hooks/use-profile.js";
import { AvatarEditor } from "./AvatarEditor.js";
import { LanguageSelector } from "./LanguageSelector.js";
import { CountrySelector } from "./CountrySelector.js";
import { ContactMethods } from "./ContactMethods.js";
import { AdminPanelButton } from "./AdminPanelButton.js";
import { LogoutButton } from "./LogoutButton.js";
import { LoadingSpinner } from "./LoadingSpinner.js";
import { VerifyDialog } from "./VerifyDialog.js";
import { VerifyBanner } from "./VerifyBanner.js";

interface ProfileCardProps {
  adminPanelUrl?: string;
  onLogout?: () => void;
}

export function ProfileCard({ adminPanelUrl, onLogout }: ProfileCardProps) {
  const { state } = useProfile();
  const pending = state.pendingVerification;
  const [dialogOpen, setDialogOpen] = useState(false);
  const pendingId = pending?.verificationId ?? null;

  // When a new pendingVerification arrives, auto-open the dialog.
  // When it's cleared, close the dialog.
  useEffect(() => {
    if (pendingId) {
      setDialogOpen(true);
    } else {
      setDialogOpen(false);
    }
  }, [pendingId]);

  const handleMinimize = useCallback(() => setDialogOpen(false), []);
  const handleEnterCode = useCallback(() => setDialogOpen(true), []);

  if (state.loading) {
    return <LoadingSpinner />;
  }

  if (state.error) {
    return (
      <div className="aiw-error" role="status" aria-live="polite">
        {state.error}
      </div>
    );
  }

  const profile = state.profile;
  if (!profile) return null;

  return (
    <>
      <div className="aiw-profile-header">
        <AvatarEditor />
        <div className="aiw-profile-info">
          <div className="aiw-profile-name">{profile.name}</div>
          <div className="aiw-profile-email">{profile.email}</div>
        </div>
      </div>

      <div className="aiw-section">
        <LanguageSelector />
        <CountrySelector />
      </div>

      <ContactMethods />

      {adminPanelUrl && <AdminPanelButton adminPanelUrl={adminPanelUrl} />}

      <LogoutButton onLogout={onLogout} />

      {pending && !dialogOpen && (
        <VerifyBanner onEnterCode={handleEnterCode} />
      )}
      <VerifyDialog open={dialogOpen} onMinimize={handleMinimize} />
    </>
  );
}
