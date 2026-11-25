// Runs the item/points handlers against the Firestore emulator.
// Run with: npm run test:emulator (starts the emulator for you).
// Ports the cases from functions/test/resolveItem.emulator.test.js.
import assert from "node:assert/strict";
import {beforeEach, test} from "node:test";

import {commit, runTransaction, type FirestoreEnv} from "../src/firestore.ts";
import {reportAwardForUser, resolveItemForUser} from "../src/index.ts";
import type {DocData, Write} from "../src/resolution.ts";

const host = process.env.FIRESTORE_EMULATOR_HOST;
const env: FirestoreEnv = {
  FIREBASE_PROJECT_ID: process.env.GCLOUD_PROJECT || "demo-campusfind",
  FIRESTORE_EMULATOR_HOST: host,
};
const skip = host ? false : "FIRESTORE_EMULATOR_HOST not set; run npm run test:emulator";

const create = (path: string, data: DocData): Write => ({op: "create", path, data});

const user = (uid: string, extra: DocData = {}) => create(`users/${uid}`, {
  uid, displayName: uid, isAdmin: false, points: 0, itemsReported: 1, itemsReturned: 0, itemsClaimed: 0,
  unlockedAchievements: [{achievementId: "first_report", unlockedAt: "2026-11-01T00:00:00.000Z", progress: 100}],
  ...extra,
});

async function read(path: string): Promise<DocData | null> {
  return runTransaction(env, async (tx) => ({writes: [], result: (await tx.getAll([path]))[0]}));
}

async function call(handler: typeof resolveItemForUser, uid: string, body: unknown) {
  const response = await handler(env, uid, body);
  return {status: response.status, body: await response.json() as DocData};
}

const resolve = (uid: string, itemId: string, newStatus: string) =>
  call(resolveItemForUser, uid, {itemId, newStatus});

beforeEach(async () => {
  if (!host) return;
  const url = `http://${host}/emulator/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  await fetch(url, {method: "DELETE"});
  await commit(env, [
    user("reporter"),
    user("finder"),
    user("stranger"),
    user("admin", {isAdmin: true}),
    create("items/found1", {reportedBy: "reporter", type: "FOUND", status: "PENDING_CLAIM", title: "Keys"}),
    create("items/lost1", {reportedBy: "reporter", type: "LOST", status: "MATCH_FOUND", title: "Wallet"}),
    create("items/fresh", {reportedBy: "reporter", type: "FOUND", status: "AVAILABLE", title: "Bag"}),
    create("chats/chat1", {itemId: "found1", createdBy: "finder", participantIds: ["finder", "reporter"]}),
    create("chats/chat2", {itemId: "lost1", createdBy: "finder", participantIds: ["finder", "reporter"]}),
  ]);
});

test("legal transitions are accepted and the return is rewarded", {skip}, async () => {
  const pending = await resolve("reporter", "fresh", "PENDING_CLAIM");
  assert.equal(pending.status, 200);
  assert.equal((await read("items/fresh"))?.status, "PENDING_CLAIM");

  const returned = await resolve("finder", "found1", "RETURNED");
  assert.equal(returned.status, 200);
  assert.equal(returned.body.pointsAwarded, 50);
  assert.equal((await read("items/found1"))?.status, "RETURNED");
  assert.equal((await read("users/reporter"))?.points, 50);
  assert.equal((await read("users/reporter"))?.itemsReturned, 1);
  assert.equal((await read("publicProfiles/reporter"))?.points, 50);
  const award = await read("users/reporter/pointAwards/found1_return");
  assert.equal(award?.pointsAwarded, 50);
  assert.equal(typeof award?.createdAt, "string", "createdAt is stored as a Firestore timestamp");
});

test("LOST items resolve through CLAIMED", {skip}, async () => {
  const claimed = await resolve("finder", "lost1", "CLAIMED");
  assert.equal(claimed.status, 200);
  assert.equal((await read("items/lost1"))?.status, "CLAIMED");
});

test("illegal status transitions are rejected and change nothing", {skip}, async () => {
  const result = await resolve("reporter", "fresh", "RETURNED");
  assert.equal(result.status, 412);
  assert.equal(result.body.code, "failed-precondition");
  assert.equal((await read("items/fresh"))?.status, "AVAILABLE");
});

test("repeated resolution calls award points exactly once", {skip}, async () => {
  await resolve("finder", "found1", "RETURNED");
  const again = await resolve("finder", "found1", "RETURNED");
  assert.equal(again.status, 200);
  assert.equal(again.body.alreadyResolved, true);
  assert.equal(again.body.pointsAwarded, 0);
  assert.equal((await read("users/reporter"))?.points, 50);
});

test("concurrent resolution attempts produce one reward", {skip}, async () => {
  const results = await Promise.all(Array.from({length: 5}, () => resolve("finder", "found1", "RETURNED")));
  assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.body)));
  assert.equal(results.filter((r) => r.body.pointsAwarded === 50).length, 1);
  assert.equal((await read("users/reporter"))?.points, 50);
  assert.equal((await read("users/reporter"))?.itemsReturned, 1);
});

test("an unrelated signed-in user cannot confirm a return", {skip}, async () => {
  const result = await resolve("stranger", "found1", "RETURNED");
  assert.equal(result.status, 403);
  assert.equal((await read("items/found1"))?.status, "PENDING_CLAIM");
  assert.equal((await read("users/reporter"))?.points, 0);
});

test("only the user who started the item conversation can confirm", {skip}, async () => {
  await commit(env, [{op: "merge", path: "chats/chat1", data: {createdBy: "reporter"}}]);
  const result = await resolve("finder", "found1", "RETURNED");
  assert.equal(result.status, 403);
  assert.equal((await read("items/found1"))?.status, "PENDING_CLAIM");
});

test("the reporter cannot confirm their own return", {skip}, async () => {
  const result = await resolve("reporter", "found1", "RETURNED");
  assert.equal(result.status, 403);
});

test("a resolved item cannot move to another terminal status", {skip}, async () => {
  await resolve("finder", "found1", "RETURNED");
  const result = await resolve("admin", "found1", "UNCLAIMED");
  assert.equal(result.status, 412);
  assert.equal((await read("items/found1"))?.status, "RETURNED");
});

test("admin can resolve and the reporter receives the reward", {skip}, async () => {
  const result = await resolve("admin", "found1", "RETURNED");
  assert.equal(result.status, 200);
  assert.equal((await read("users/reporter"))?.points, 50);
});

test("missing items and bad IDs are rejected", {skip}, async () => {
  assert.equal((await resolve("reporter", "nope", "RETURNED")).status, 404);
  assert.equal((await resolve("reporter", "a/b", "RETURNED")).status, 400);
  assert.equal((await call(resolveItemForUser, "reporter", null)).status, 400);
});

test("report award goes to the item's reporter exactly once", {skip}, async () => {
  const first = await call(reportAwardForUser, "reporter", {activityType: "report", itemId: "fresh"});
  assert.equal(first.status, 200);
  assert.equal(first.body.pointsAwarded, 10);
  const again = await call(reportAwardForUser, "reporter", {activityType: "report", itemId: "fresh"});
  assert.equal(again.body.pointsAwarded, 0);
  assert.equal((await read("users/reporter"))?.points, 10);
  assert.equal((await read("users/reporter"))?.itemsReported, 2);

  const notMine = await call(reportAwardForUser, "finder", {activityType: "report", itemId: "fresh"});
  assert.equal(notMine.status, 403);
  const wrongType = await call(reportAwardForUser, "reporter", {activityType: "return", itemId: "fresh"});
  assert.equal(wrongType.status, 400);
});
