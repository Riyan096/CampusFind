const assert = require('node:assert/strict');
const test = require('node:test');

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

initializeApp();
const adminDb = getFirestore();

const projectId = process.env.GCLOUD_PROJECT || 'campusfind';
const rules = readFileSync(join(__dirname, '../../firestore.rules'), 'utf8');

let testEnv;

const baseItem = {
  reportedBy: 'reporter-1',
  type: 'FOUND',
  status: 'AVAILABLE',
  title: 'Test item',
  description: 'A test item',
  category: 'Other',
  location: 'Student Center'
};

async function clearItems() {
  const snapshot = await adminDb.collection('items').get();
  if (!snapshot.empty) {
    const batch = adminDb.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function clearUsers() {
  const snapshot = await adminDb.collection('users').get();
  if (!snapshot.empty) {
    const batch = adminDb.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function clearPointAwards() {
  const snapshot = await adminDb.collectionGroup('pointAwards').get();
  if (!snapshot.empty) {
    const batch = adminDb.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function seedItem(itemId, overrides = {}) {
  await adminDb.collection('items').doc(itemId).set({
    ...baseItem,
    ...overrides
  });
}

async function seedUser(userId, overrides = {}) {
  await adminDb.collection('users').doc(userId).set({
    displayName: 'Test User',
    photoURL: null,
    isAdmin: false,
    points: 100,
    itemsReturned: 2,
    itemsReported: 3,
    lastActive: '2026-09-13',
    itemsClaimed: 1,
    badges: ['helper'],
    ...overrides
  });
}

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules }
  });
});

test.beforeEach(async () => {
  await Promise.all([clearItems(), clearUsers(), clearPointAwards()]);
});
test.afterEach(async () => {
  await Promise.all([clearItems(), clearUsers(), clearPointAwards()]);
});

test.after(async () => {
  await testEnv.cleanup();
});

test('owner can update allowed item fields', async () => {
  await seedItem('allowed-update');

  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertSucceeds(
    db.collection('items').doc('allowed-update').update({
      title: 'Updated title',
      description: 'Updated description',
      location: 'Library'
    })
  );
});

test('owner cannot change reportedBy', async () => {
  await seedItem('reported-by');

  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertFails(
    db.collection('items').doc('reported-by').update({
      reportedBy: 'attacker'
    })
  );
});

test('owner cannot change status directly', async () => {
  await seedItem('status-bypass');

  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertFails(
    db.collection('items').doc('status-bypass').update({
      status: 'RETURNED'
    })
  );
});

test('owner cannot change item type', async () => {
  await seedItem('type-bypass');

  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertFails(
    db.collection('items').doc('type-bypass').update({
      type: 'LOST'
    })
  );
});

test('owner cannot add arbitrary fields', async () => {
  await seedItem('field-bypass');

  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertFails(
    db.collection('items').doc('field-bypass').update({
      isAdmin: true,
      moderationApproved: true,
      arbitraryServerField: 'attacker-controlled'
    })
  );
});

test('owner cannot modify protected server-managed fields', async () => {
  await seedItem('protected-fields', {
    createdAt: { seconds: 1, nanoseconds: 0 },
    moderationStatus: 'pending'
  });

  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertFails(
    db.collection('items').doc('protected-fields').update({
      createdAt: { seconds: 999, nanoseconds: 0 }
    })
  );

  await assertFails(
    db.collection('items').doc('protected-fields').update({
      moderationStatus: 'approved'
    })
  );
});

test('different user cannot edit another reporter item', async () => {
  await seedItem('ownership-bypass');

  const db = testEnv.authenticatedContext('attacker').firestore();
  await assertFails(
    db.collection('items').doc('ownership-bypass').update({
      title: 'Attacker edit'
    })
  );
});

test('normal user cannot modify protected user stats', async () => {
  await seedUser('reporter-1');

  const db = testEnv.authenticatedContext('reporter-1').firestore();
  const protectedFields = [
    ['points', 9999],
    ['itemsReturned', 999],
    ['itemsReported', 999],
    ['lastActive', '2099-01-01'],
    ['itemsClaimed', 999],
    ['badges', ['admin']]
  ];

  for (const [field, value] of protectedFields) {
    await assertFails(
      db.collection('users').doc('reporter-1').update({ [field]: value })
    );
  }
});

test('normal user can update allowed profile fields without changing stats', async () => {
  await seedUser('reporter-1');

  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertSucceeds(
    db.collection('users').doc('reporter-1').update({
      displayName: 'Updated User',
      photoURL: 'https://example.com/avatar.png'
    })
  );
});

test('normal user cannot tamper with point awards', async () => {
  await seedUser('reporter-1');
  await adminDb.collection('users').doc('reporter-1').collection('pointAwards').doc('award-1').set({
    points: 25,
    reason: 'return',
    createdAt: '2026-09-13'
  });

  const db = testEnv.authenticatedContext('reporter-1').firestore();
  const award = db.collection('users').doc('reporter-1').collection('pointAwards').doc('award-1');

  await assertFails(award.create({
    points: 9999,
    reason: 'fake'
  }));

  await assertFails(award.update({
    points: 9999
  }));

  await assertFails(award.delete());
});
