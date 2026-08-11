import type { ProfileData } from "../src/types.js";

export const profileWithPicture: ProfileData = {
  id: "user-1",
  name: "Alice Johnson",
  email: "alice@example.com",
  picture: "https://i.pravatar.cc/150?u=alice",
  language: "en",
  country: "US",
  contacts: [
    {
      id: "c1",
      type: "email",
      value: "alice@example.com",
      verified: true,
      primary: true,
    },
    {
      id: "c2",
      type: "phone",
      value: "+1 555-0123",
      verified: true,
      primary: false,
    },
    {
      id: "c3",
      type: "email",
      value: "alice.work@corp.com",
      verified: false,
      primary: false,
    },
  ],
};

export const profileWithoutPicture: ProfileData = {
  id: "user-2",
  name: "Bob Smith",
  email: "bob.smith@example.com",
  language: "fr",
  country: "KE",
  contacts: [
    {
      id: "c4",
      type: "email",
      value: "bob.smith@example.com",
      verified: true,
      primary: true,
    },
    {
      id: "c5",
      type: "phone",
      value: "+254 700-123456",
      verified: false,
      primary: false,
    },
  ],
};
