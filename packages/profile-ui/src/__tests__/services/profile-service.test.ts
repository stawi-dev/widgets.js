import { describe, it, expect, vi } from "vitest";
import {
  getProfile,
  updateProfile,
  addContact,
  createContactVerification,
  checkVerification,
  removeContact,
} from "../../services/profile-service.js";
import { ContactType } from "../../types.js";

const mockFetch = vi.fn();
const api = { fetch: mockFetch, upload: vi.fn() } as unknown as import("@antinvestor/auth-runtime").ApiClient;

const SVC = "/profile.v1.ProfileService";

describe("profile-service", () => {
  beforeEach(() => mockFetch.mockReset());

  it("getProfile sends GetById RPC", async () => {
    const expected = { data: { id: "p1" } };
    mockFetch.mockResolvedValueOnce(expected);

    const res = await getProfile(api, "p1");

    expect(mockFetch).toHaveBeenCalledWith(`${SVC}/GetById`, {
      method: "POST",
      body: JSON.stringify({ id: "p1" }),
    });
    expect(res).toEqual(expected);
  });

  it("updateProfile sends Update RPC", async () => {
    mockFetch.mockResolvedValueOnce({ data: { id: "p1" } });

    await updateProfile(api, "p1", { au_name: "Alice" });

    expect(mockFetch).toHaveBeenCalledWith(`${SVC}/Update`, {
      method: "POST",
      body: JSON.stringify({ id: "p1", properties: { au_name: "Alice" } }),
    });
  });

  it("addContact sends AddContact RPC", async () => {
    mockFetch.mockResolvedValueOnce({
      data: { id: "p1" },
      verification_id: "v1",
    });

    await addContact(api, "p1", ContactType.EMAIL, "test@example.com");

    expect(mockFetch).toHaveBeenCalledWith(`${SVC}/AddContact`, {
      method: "POST",
      body: JSON.stringify({
        profile_id: "p1",
        type: ContactType.EMAIL,
        detail: "test@example.com",
      }),
    });
  });

  it("createContactVerification sends CreateContactVerification RPC", async () => {
    mockFetch.mockResolvedValueOnce({ id: "v1", success: true });

    await createContactVerification(api, "c1");

    expect(mockFetch).toHaveBeenCalledWith(
      `${SVC}/CreateContactVerification`,
      {
        method: "POST",
        body: JSON.stringify({ contact_id: "c1" }),
      },
    );
  });

  it("checkVerification sends CheckVerification RPC", async () => {
    mockFetch.mockResolvedValueOnce({ id: "v1", success: true });

    await checkVerification(api, "v1", "123456");

    expect(mockFetch).toHaveBeenCalledWith(`${SVC}/CheckVerification`, {
      method: "POST",
      body: JSON.stringify({ verification_id: "v1", code: "123456" }),
    });
  });

  it("removeContact sends RemoveContact RPC", async () => {
    mockFetch.mockResolvedValueOnce(undefined);

    await removeContact(api, "c1");

    expect(mockFetch).toHaveBeenCalledWith(`${SVC}/RemoveContact`, {
      method: "POST",
      body: JSON.stringify({ contact_id: "c1" }),
    });
  });
});
