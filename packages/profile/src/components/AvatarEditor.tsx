import { useCallback, useRef } from "react";
import { useProfile } from "../hooks/use-profile.js";
import { useGravatarUrl } from "../hooks/use-gravatar.js";
import { getInitials } from "../utils/get-initials.js";

export function AvatarEditor() {
  const { state, uploadAvatar } = useProfile();
  const inputRef = useRef<HTMLInputElement>(null);

  const profile = state.profile;
  const gravatarUrl = useGravatarUrl(profile?.email, 112);

  const handleClick = useCallback(() => inputRef.current?.click(), []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadAvatar(file).catch(console.error);
      }
      e.target.value = "";
    },
    [uploadAvatar],
  );

  if (!profile) return null;

  const avatarSrc = profile.picture || gravatarUrl;

  return (
    <>
      <div
        className="aiw-avatar-large"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label="Change avatar"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleClick();
        }}
      >
        {avatarSrc ? (
          <img src={avatarSrc} alt={profile.name} />
        ) : (
          <span className="aiw-avatar-initials">
            {getInitials(profile.name)}
          </span>
        )}
        <div className="aiw-avatar-overlay">Edit</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="aiw-hidden-input"
        onChange={handleChange}
        tabIndex={-1}
      />
    </>
  );
}
