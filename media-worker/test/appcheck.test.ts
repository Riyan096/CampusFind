// App Check must fail closed: the item and points routes are refused unless a
// valid token is present or the check is explicitly disabled for local dev.
import assert from "node:assert/strict";
import {test} from "node:test";

import {hasValidAppCheck} from "../src/index.ts";

const request = (token?: string) =>
  new Request("http://worker/api/items/resolve", {headers: token ? {"X-Firebase-AppCheck": token} : {}});

test("missing token is refused", async () => {
  assert.equal(await hasValidAppCheck(request(), {FIREBASE_PROJECT_NUMBER: "123"}), false);
});

test("missing project number is refused even with a token", async () => {
  assert.equal(await hasValidAppCheck(request("anything"), {}), false);
});

test("a forged token is refused", async () => {
  // header.payload.signature that was never signed by App Check.
  const forged = [{alg: "RS256", kid: "x"}, {iss: "https://firebaseappcheck.googleapis.com/123", aud: ["projects/123"]}]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".") + ".c2ln";
  assert.equal(await hasValidAppCheck(request(forged), {FIREBASE_PROJECT_NUMBER: "123"}), false);
});

test("APP_CHECK_DISABLED=true allows local development without a token", async () => {
  assert.equal(await hasValidAppCheck(request(), {APP_CHECK_DISABLED: "true"}), true);
  assert.equal(await hasValidAppCheck(request(), {APP_CHECK_DISABLED: "yes"}), false);
});
