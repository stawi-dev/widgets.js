import { describe, it, expect } from "vitest";
import {
  profileObjectToProfileData,
  uiUpdatesToProtoProperties,
} from "../../services/profile-mapper.js";
import { ContactType, ProfileType } from "../../types.js";
import type { ProfileObject } from "../../types.js";

describe("profileObjectToProfileData", () => {
  const makeProto = (
    overrides: Partial<ProfileObject> = {},
  ): ProfileObject => ({
    id: "p1",
    type: ProfileType.PERSON,
    properties: {
      au_name: "Alice",
      au_avater_uri: "https://example.com/avatar.png",
      language: "en",
      country: "KE",
    },
    contacts: [
      {
        id: "c1",
        type: ContactType.EMAIL,
        detail: "alice@example.com",
        verified: true,
        communication_level: 0,
        state: 0,
      },
      {
        id: "c2",
        type: ContactType.MSISDN,
        detail: "+254700123456",
        verified: false,
        communication_level: 0,
        state: 0,
      },
    ],
    addresses: [],
    state: 0,
    ...overrides,
  });

  it("maps properties to UI fields", () => {
    const result = profileObjectToProfileData(makeProto());

    expect(result.id).toBe("p1");
    expect(result.name).toBe("Alice");
    expect(result.picture).toBe("https://example.com/avatar.png");
    expect(result.language).toBe("en");
    expect(result.country).toBe("KE");
  });

  it("maps first verified email as primary email", () => {
    const result = profileObjectToProfileData(makeProto());
    expect(result.email).toBe("alice@example.com");
  });

  it("falls back to unverified email when none are verified", () => {
    const result = profileObjectToProfileData(
      makeProto({
        contacts: [
          {
            id: "c1",
            type: ContactType.EMAIL,
            detail: "unverified@example.com",
            verified: false,
            communication_level: 0,
            state: 0,
          },
        ],
      }),
    );
    expect(result.email).toBe("unverified@example.com");
  });

  it("marks the contact matching primary email as primary", () => {
    const result = profileObjectToProfileData(makeProto());
    const emailContact = result.contacts.find((c) => c.id === "c1");
    expect(emailContact?.primary).toBe(true);

    const phoneContact = result.contacts.find((c) => c.id === "c2");
    expect(phoneContact?.primary).toBe(false);
  });

  it("maps ContactType.EMAIL to 'email' and MSISDN to 'phone'", () => {
    const result = profileObjectToProfileData(makeProto());
    expect(result.contacts[0].type).toBe("email");
    expect(result.contacts[1].type).toBe("phone");
  });

  it("maps contact detail to value", () => {
    const result = profileObjectToProfileData(makeProto());
    expect(result.contacts[0].value).toBe("alice@example.com");
    expect(result.contacts[1].value).toBe("+254700123456");
  });

  it("handles empty contacts", () => {
    const result = profileObjectToProfileData(makeProto({ contacts: [] }));
    expect(result.email).toBe("");
    expect(result.contacts).toEqual([]);
  });

  it("handles missing optional properties", () => {
    const result = profileObjectToProfileData(makeProto({ properties: {} }));
    expect(result.name).toBe("");
    expect(result.picture).toBeUndefined();
    expect(result.language).toBeUndefined();
    expect(result.country).toBeUndefined();
  });
});

describe("uiUpdatesToProtoProperties", () => {
  it("maps name to au_name", () => {
    const result = uiUpdatesToProtoProperties({ name: "Bob" });
    expect(result).toEqual({ au_name: "Bob" });
  });

  it("maps picture to au_avater_uri", () => {
    const result = uiUpdatesToProtoProperties({
      picture: "https://example.com/pic.png",
    });
    expect(result).toEqual({ au_avater_uri: "https://example.com/pic.png" });
  });

  it("passes through language and country", () => {
    const result = uiUpdatesToProtoProperties({
      language: "fr",
      country: "US",
    });
    expect(result).toEqual({ language: "fr", country: "US" });
  });

  it("only includes defined fields", () => {
    const result = uiUpdatesToProtoProperties({ name: "Alice" });
    expect(Object.keys(result)).toEqual(["au_name"]);
  });
});
