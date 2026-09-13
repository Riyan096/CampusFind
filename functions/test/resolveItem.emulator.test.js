const assert = require('node:assert/strict');
const test = require('node:test');

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

const { resolveItem } = require('../lib/index.js');
const db = getFirestore();

const defaultStats = {
  points: 0,
  itemsReturned: 0,
  itemsReported: 0,
  itemsClaimed: 0,
  lastActive: '',
  badges: [],
  streaks: {
    currentStreak: 0,
    longestStreak: 0,
    lastReportDate: '',
    weeklyActivity: [false, false, false, false, false, false, false]
  },
  unlockedAchievements: []
};

async function seedUser(uid, overrides = {}) {
  await db.collection('users').doc(uid).set({
    ...defaultStats,
    ...overrides
  }, { merge: true });
}

async function seedItem(itemId, overrides = {}) {
  await db.collection('items').doc(itemId).set({
    reportedBy: 'reporter-1',
    type: 'FOUND',
    status: 'AVAILABLE',
    title: 'Test item',
    ...overrides
  });
}

async function callResolve(uid, itemId, newStatus) {
  return resolveItem.run({
    data: { itemId, newStatus },
    auth: { uid, token: {} },
    rawRequest: {}
  });
}

async function clear() {
  const usersSnapshot = await db.collection('users').get();

  for (const user of usersSnapshot.docs) {
    const awards = await user.ref.collection('pointAwards').get();
    if (!awards.empty) {
      const batch = db.batch();
      awards.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  for (const collection of ['items', 'users']) {
    const snapshot = await db.collection(collection).get();
    if (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  }
}

test.beforeEach(clear);
test.after(clear);

test('legal found-item transitions are accepted', async () => {
  await seedUser('reporter-1');
  await seedItem('transition-item');

  const pending = await callResolve('reporter-1', 'transition-item', 'PENDING_CLAIM');
  assert.equal(pending.item.status, 'PENDING_CLAIM');
  assert.equal(pending.pointsAwarded, 0);

  const returned = await callResolve('reporter-1', 'transition-item', 'RETURNED');
  assert.equal(returned.item.status, 'RETURNED');
  assert.equal(returned.pointsAwarded, 50);
});

test('illegal status transitions are rejected server-side', async () => {
  await seedUser('reporter-1');
  await seedItem('illegal-item');

  await assert.rejects(
    callResolve('reporter-1', 'illegal-item', 'RETURNED'),
    error => error.code === 'failed-precondition'
  );

  const item = await db.collection('items').doc('illegal-item').get();
  assert.equal(item.data().status, 'AVAILABLE');
});

test('repeated resolution calls award points exactly once', async () => {
  await seedUser('reporter-1');
  await seedItem('repeat-item', { status: 'PENDING_CLAIM' });

  const first = await callResolve('reporter-1', 'repeat-item', 'RETURNED');
  const second = await callResolve('reporter-1', 'repeat-item', 'RETURNED');

  assert.equal(first.pointsAwarded, 50);
  assert.equal(first.alreadyResolved, false);
  assert.equal(second.pointsAwarded, 0);
  assert.equal(second.alreadyResolved, true);

  const user = await db.collection('users').doc('reporter-1').get();
  assert.equal(user.data().points, 50);
  assert.equal(user.data().itemsReturned, 1);

  const awards = await db.collection('users').doc('reporter-1')
    .collection('pointAwards').get();
  assert.equal(awards.size, 1);
  assert.equal(awards.docs[0].id, 'repeat-item_return');

  const item = await db.collection('items').doc('repeat-item').get();
  assert.equal(item.data().status, 'RETURNED');
});

test('concurrent resolution attempts produce one reward', async () => {
  await seedUser('reporter-1');
  await seedItem('concurrent-item', { status: 'PENDING_CLAIM' });

  const results = await Promise.allSettled([
    callResolve('reporter-1', 'concurrent-item', 'RETURNED'),
    callResolve('reporter-1', 'concurrent-item', 'RETURNED')
  ]);

  const successful = results.filter(result => result.status === 'fulfilled');
  const rejected = results.filter(result => result.status === 'rejected');

  assert.ok(successful.length >= 1);
  assert.equal(successful.length + rejected.length, 2);

  const user = await db.collection('users').doc('reporter-1').get();
  assert.equal(user.data().points, 50);
  assert.equal(user.data().itemsReturned, 1);

  const awards = await db.collection('users').doc('reporter-1')
    .collection('pointAwards').get();
  assert.equal(awards.size, 1);

  const item = await db.collection('items').doc('concurrent-item').get();
  assert.equal(item.data().status, 'RETURNED');
});

test('unauthorized resolution is rejected and does not mutate data', async () => {
  await seedUser('reporter-1');
  await seedUser('attacker');
  await seedItem('private-item', { status: 'PENDING_CLAIM' });

  await assert.rejects(
    callResolve('attacker', 'private-item', 'RETURNED'),
    error => error.code === 'permission-denied'
  );

  const item = await db.collection('items').doc('private-item').get();
  assert.equal(item.data().status, 'PENDING_CLAIM');

  const user = await db.collection('users').doc('reporter-1').get();
  assert.equal(user.data().points, 0);
  assert.equal(user.data().itemsReturned, 0);
});

test('invalid resolution state is rejected', async () => {
  await seedUser('reporter-1');
  await seedItem('invalid-item', {
    type: 'LOST',
    status: 'STILL_LOST'
  });

  await assert.rejects(
    callResolve('reporter-1', 'invalid-item', 'RETURNED'),
    error => error.code === 'failed-precondition'
  );

  const item = await db.collection('items').doc('invalid-item').get();
  assert.equal(item.data().status, 'STILL_LOST');
});

test('already resolved item cannot transition to another terminal resolution', async () => {
  await seedUser('reporter-1');
  await seedItem('resolved-item', {
    type: 'LOST',
    status: 'RECOVERED'
  });

  await assert.rejects(
    callResolve('reporter-1', 'resolved-item', 'CLAIMED'),
    error => error.code === 'failed-precondition'
  );
});

test('admin can resolve an item and the reporter receives the reward', async () => {
  await seedUser('reporter-1');
  await seedUser('admin-1', { isAdmin: true });
  await seedItem('admin-item', { status: 'PENDING_CLAIM' });

  const result = await callResolve('admin-1', 'admin-item', 'RETURNED');

  assert.equal(result.pointsAwarded, 50);

  const reporter = await db.collection('users').doc('reporter-1').get();
  const admin = await db.collection('users').doc('admin-1').get();

  assert.equal(reporter.data().points, 50);
  assert.equal(reporter.data().itemsReturned, 1);
  assert.equal(admin.data().points, 0);
});
