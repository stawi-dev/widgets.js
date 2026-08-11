import { describe, it, expect, vi } from "vitest";
import {
  getProfile,
  updateProfile,
  addContact,
  removeContact,
} from "../../services/profile-service.js";
import { ContactType } from "../../types.js";

function runtimeWith(response: unknown) {
  return { fetch: vi.fn().mockResolvedValue(response) } as any;
}

describe("profile-service", () => {
  it("getProfile calls /profile.v1.ProfileService/GetById via runtime.fetch", async () => {
    const rt = runtimeWith({ data: { id: "1" } });
    await getProfile(rt, "1");
    expect(rt.fetch).toHaveBeenCalledWith(
      "/profile/profile.v1.ProfileService/GetById",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": expect.any(String),
        }),
      }),
    );
  });
  it("addContact posts typed body", async () => {
    const rt = runtimeWith({ data: { id: "1" }, verification_id: "v" });
    await addContact(rt, "p1", ContactType.EMAIL, "a@b");
    const body = JSON.parse((rt.fetch.mock.calls[0][1] as any).body);
    expect(body).toEqual({ profile_id: "p1", type: 0, detail: "a@b" });
  });
  it("removeContact posts contact_id", async () => {
    const rt = runtimeWith(undefined);
    await removeContact(rt, "c1");
    const call = rt.fetch.mock.calls[0];
    expect(call[0]).toBe("/profile/profile.v1.ProfileService/RemoveContact");
    expect(JSON.parse((call[1] as any).body)).toEqual({ contact_id: "c1" });
  });
  it("updateProfile posts id + properties", async () => {
    const rt = runtimeWith({ data: { id: "p1" } });
    await updateProfile(rt, "p1", { au_name: "Alice" });
    const call = rt.fetch.mock.calls[0];
    expect(call[0]).toBe("/profile/profile.v1.ProfileService/Update");
    expect(JSON.parse((call[1] as any).body)).toEqual({
      id: "p1",
      properties: { au_name: "Alice" },
    });
  });
});
