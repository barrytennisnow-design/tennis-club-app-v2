import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { notifyPlayer, notifyPlayers } from "../../lib/notifications.ts";

// Minimal stub standing in for the Supabase admin client -- just
// enough surface (.from().insert()) to capture what would have been
// written, without a real database.
function makeStubAdmin(opts: { throwOnInsert?: boolean } = {}) {
  const inserted: any[] = [];
  return {
    calls: inserted,
    client: {
      from(_table: string) {
        return {
          async insert(rows: any) {
            if (opts.throwOnInsert) throw new Error("boom");
            inserted.push(...(Array.isArray(rows) ? rows : [rows]));
            return { error: null };
          },
        };
      },
    },
  };
}

describe("notifyPlayer", () => {
  test("writes a single row with the given fields", async () => {
    const stub = makeStubAdmin();
    await notifyPlayer({
      admin: stub.client,
      playerId: "p1",
      type: "match_proposed",
      title: "New match proposal",
      body: "Tap to respond.",
      matchId: "m1",
    });
    assert.equal(stub.calls.length, 1);
    assert.deepEqual(stub.calls[0], {
      player_id: "p1",
      type: "match_proposed",
      title: "New match proposal",
      body: "Tap to respond.",
      match_id: "m1",
    });
  });

  test("defaults body/matchId to null when omitted", async () => {
    const stub = makeStubAdmin();
    await notifyPlayer({ admin: stub.client, playerId: "p1", type: "match_confirmed", title: "Confirmed" });
    assert.equal(stub.calls[0].body, null);
    assert.equal(stub.calls[0].match_id, null);
  });

  test("swallows insert errors rather than throwing -- must never block the email it's paired with", async () => {
    const stub = makeStubAdmin({ throwOnInsert: true });
    await assert.doesNotReject(
      notifyPlayer({ admin: stub.client, playerId: "p1", type: "match_cancelled", title: "Cancelled" })
    );
  });
});

describe("notifyPlayers", () => {
  test("writes one row per player id, all sharing the same event fields", async () => {
    const stub = makeStubAdmin();
    await notifyPlayers({
      admin: stub.client,
      playerIds: ["p1", "p2", "p3"],
      type: "match_reminder",
      title: "Reminder",
      matchId: "m1",
    });
    assert.equal(stub.calls.length, 3);
    assert.deepEqual(stub.calls.map((c) => c.player_id), ["p1", "p2", "p3"]);
    assert.ok(stub.calls.every((c) => c.type === "match_reminder" && c.match_id === "m1"));
  });

  test("does nothing (no insert call at all) for an empty player list", async () => {
    const stub = makeStubAdmin();
    await notifyPlayers({ admin: stub.client, playerIds: [], type: "match_reminder", title: "Reminder" });
    assert.equal(stub.calls.length, 0);
  });

  test("swallows insert errors rather than throwing", async () => {
    const stub = makeStubAdmin({ throwOnInsert: true });
    await assert.doesNotReject(
      notifyPlayers({ admin: stub.client, playerIds: ["p1"], type: "match_reminder", title: "Reminder" })
    );
  });
});
