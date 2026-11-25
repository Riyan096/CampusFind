// Run with: npm test (Node's built-in runner; Node 23.6+ strips TS types natively).
// Mirrors the cases in functions/test/resolveItem.emulator.test.js, minus the
// Firestore transaction itself, which step 2 tests against the emulator.
import assert from "node:assert/strict";
import {test} from "node:test";

import {
  decideReportAward,
  decideResolve,
  normalizeStats,
  updateStreak,
  validateReportAwardRequest,
  validateResolveRequest,
  type ResolveInput,
} from "../src/resolution.ts";

const now = new Date("2026-11-24T12:00:00.000Z");
const reporter = {
  uid: "reporter", displayName: "Rae", points: 0, itemsReported: 1, itemsReturned: 0, itemsClaimed: 0,
  unlockedAchievements: [{achievementId: "first_report", unlockedAt: "2026-11-01T00:00:00.000Z", progress: 100}],
};
const finder = {uid: "finder", displayName: "Finn", points: 0};
const admin = {uid: "admin", displayName: "Ada", isAdmin: true};
const finderChat = {createdBy: "finder", participantIds: ["finder", "reporter"]};

const resolve = (over: Partial<ResolveInput>) => decideResolve({
  uid: "finder",
  itemId: "item1",
  newStatus: "RETURNED",
  item: {reportedBy: "reporter", type: "FOUND", status: "PENDING_CLAIM"},
  actor: finder,
  reporter,
  itemChats: [finderChat],
  awardExists: false,
  now,
  ...over,
});

const denied = (decision: ReturnType<typeof decideResolve>, code: string) => {
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.code, code);
};

test("request validation rejects missing or malformed fields", () => {
  assert.equal(validateResolveRequest(null), null);
  assert.equal(validateResolveRequest({itemId: "  ", newStatus: "RETURNED"}), null);
  assert.equal(validateResolveRequest({itemId: "item1", newStatus: 5}), null);
  assert.deepEqual(validateResolveRequest({itemId: "item1", newStatus: "RETURNED"}), {itemId: "item1", newStatus: "RETURNED"});
});

test("reporter can make legal non-final transitions without points", () => {
  const decision = resolve({
    uid: "reporter", actor: reporter, newStatus: "PENDING_CLAIM",
    item: {reportedBy: "reporter", type: "FOUND", status: "AVAILABLE"},
  });
  assert.ok(decision.ok);
  if (!decision.ok) return;
  assert.equal(decision.response.pointsAwarded, 0);
  assert.deepEqual(decision.writes[0], {op: "update", path: "items/item1", data: {status: "PENDING_CLAIM"}});
  assert.ok(!decision.writes.some((w) => w.op === "create"));
});

test("illegal transitions are rejected", () => {
  denied(resolve({
    uid: "reporter", actor: reporter, newStatus: "UNCLAIMED",
    item: {reportedBy: "reporter", type: "FOUND", status: "AVAILABLE"},
  }), "failed-precondition");
});

test("chat starter confirming a return awards the reporter once", () => {
  const decision = resolve({});
  assert.ok(decision.ok);
  if (!decision.ok) return;
  assert.equal(decision.response.pointsAwarded, 50);
  assert.deepEqual(decision.response.newAchievements, [], "finder must not see the reporter's achievements");
  const paths = decision.writes.map((w) => `${w.op}:${w.path}`);
  assert.deepEqual(paths, [
    "update:items/item1",
    "merge:users/reporter",
    "merge:publicProfiles/reporter",
    "create:users/reporter/pointAwards/item1_return",
  ]);
  const stats = decision.writes[1].data;
  assert.equal(stats.points, 50);
  assert.equal(stats.itemsReturned, 1);
});

test("an existing award means no second reward", () => {
  const decision = resolve({awardExists: true});
  assert.ok(decision.ok);
  if (!decision.ok) return;
  assert.equal(decision.response.pointsAwarded, 0);
  assert.equal(decision.response.alreadyResolved, true);
  assert.ok(!decision.writes.some((w) => w.op === "create" || w.path.startsWith("items/")));
});

test("repeating a finished resolution is a no-op", () => {
  const decision = resolve({item: {reportedBy: "reporter", type: "FOUND", status: "RETURNED"}});
  assert.ok(decision.ok);
  if (decision.ok) assert.equal(decision.response.alreadyResolved, true);
});

test("an unrelated signed-in user cannot confirm a return", () => {
  denied(resolve({uid: "stranger", actor: {uid: "stranger"}, itemChats: [finderChat]}), "permission-denied");
});

test("only the user who started the item conversation can confirm", () => {
  // Reporter started the chat; the finder is only a participant.
  denied(resolve({itemChats: [{createdBy: "reporter", participantIds: ["finder", "reporter"]}]}), "permission-denied");
  // Started the chat but is no longer a participant.
  denied(resolve({itemChats: [{createdBy: "finder", participantIds: ["reporter"]}]}), "permission-denied");
});

test("the reporter cannot confirm their own return", () => {
  denied(resolve({uid: "reporter", actor: reporter}), "permission-denied");
});

test("a non-reporter cannot make non-final transitions", () => {
  denied(resolve({newStatus: "UNCLAIMED"}), "permission-denied");
});

test("invalid stored state is rejected", () => {
  denied(resolve({uid: "admin", actor: admin, item: {reportedBy: "reporter", type: "FOUND", status: "BOGUS"}}), "failed-precondition");
  denied(resolve({item: {type: "FOUND", status: "PENDING_CLAIM"}}), "failed-precondition");
});

test("a resolved item cannot move to another terminal status", () => {
  denied(resolve({uid: "admin", actor: admin, newStatus: "UNCLAIMED", item: {reportedBy: "reporter", type: "FOUND", status: "RETURNED"}}), "failed-precondition");
});

test("missing documents are reported", () => {
  denied(resolve({item: null}), "not-found");
  denied(resolve({actor: null}), "failed-precondition");
  denied(resolve({reporter: null}), "failed-precondition");
});

test("admin can resolve and sees the reporter's new achievements", () => {
  const decision = resolve({
    uid: "admin", actor: admin, itemChats: [],
    reporter: {...reporter, itemsReturned: 2},
  });
  assert.ok(decision.ok);
  if (!decision.ok) return;
  assert.deepEqual(decision.response.newAchievements.map((a) => a.id), ["helper"]);
  assert.equal(decision.writes[1].data.points, 50 + 25);
});

test("LOST items resolve through CLAIMED", () => {
  const decision = resolve({newStatus: "CLAIMED", item: {reportedBy: "reporter", type: "LOST", status: "MATCH_FOUND"}});
  assert.ok(decision.ok);
});

test("report award request accepts only report activity", () => {
  assert.deepEqual(validateReportAwardRequest({activityType: "return", itemId: "item1"}), {error: "Only report awards can be requested directly."});
  assert.deepEqual(validateReportAwardRequest({activityType: "report", itemId: ""}), {error: "A valid item ID is required."});
  assert.deepEqual(validateReportAwardRequest({activityType: "report", itemId: "item1"}), {itemId: "item1"});
});

test("report award goes only to the item's reporter, once", () => {
  const base = {uid: "reporter", itemId: "item1", user: {...reporter, itemsReported: 0, unlockedAchievements: []}, item: {reportedBy: "reporter"}, awardExists: false, now};

  const first = decideReportAward(base);
  assert.ok(first.ok);
  if (first.ok) {
    assert.equal(first.response.pointsAwarded, 10);
    assert.deepEqual(first.response.newAchievements.map((a) => a.id), ["first_report"]);
    assert.equal(first.response.stats.points, 10 + 10);
    assert.equal(first.writes.at(-1)?.path, "users/reporter/pointAwards/item1_report");
  }

  const again = decideReportAward({...base, awardExists: true});
  assert.ok(again.ok);
  if (again.ok) {
    assert.equal(again.response.pointsAwarded, 0);
    assert.ok(!again.writes.some((w) => w.op === "create"));
  }

  assert.equal(decideReportAward({...base, item: {reportedBy: "someone-else"}}).ok, false);
  assert.equal(decideReportAward({...base, user: null}).ok, false);
  assert.equal(decideReportAward({...base, item: null}).ok, false);
});

test("streak counts consecutive days and resets after a gap", () => {
  const stats = normalizeStats({streaks: {currentStreak: 3, longestStreak: 3, lastReportDate: "2026-11-23"}}, now);
  assert.equal(updateStreak(stats, now).updatedStats.streaks.currentStreak, 4);
  const gap = normalizeStats({streaks: {currentStreak: 3, longestStreak: 3, lastReportDate: "2026-11-20"}}, now);
  const reset = updateStreak(gap, now).updatedStats.streaks;
  assert.equal(reset.currentStreak, 1);
  assert.equal(reset.longestStreak, 3);
  const same = normalizeStats({streaks: {currentStreak: 2, longestStreak: 2, lastReportDate: "2026-11-24"}}, now);
  assert.equal(updateStreak(same, now).streakIncreased, false);
});

test("bad stored numbers fall back to zero", () => {
  const stats = normalizeStats({points: "lots", itemsReturned: NaN}, now);
  assert.equal(stats.points, 0);
  assert.equal(stats.itemsReturned, 0);
});
