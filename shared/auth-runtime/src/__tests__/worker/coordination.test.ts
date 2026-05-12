import { describe, it, expect } from "vitest";
import { openChannel, withRefreshLock } from "../../worker/coordination.js";

describe("coordination", () => {
  it("broadcasts to peer channels in same ns", async () => {
    const a = openChannel("ns-x");
    const b = openChannel("ns-x");
    const msgs: unknown[] = [];
    b.onmessage = (e) => msgs.push(e.data);
    a.postMessage({ type: "logout" });
    await new Promise((r) => setTimeout(r, 5));
    expect(msgs).toEqual([{ type: "logout" }]);
    a.close(); b.close();
  });

  it("serializes via lock", async () => {
    const order: number[] = [];
    await Promise.all([
      withRefreshLock("ns-y", async () => { order.push(1); await new Promise(r => setTimeout(r, 10)); order.push(2); }),
      withRefreshLock("ns-y", async () => { order.push(3); }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
});
