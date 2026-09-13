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

async function seedItem(itemId, overrides = {}) {
  await adminDb.collection('items').doc(itemId).set({
    ...baseItem,
    ...overrides
  });
}

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules }
  });
});

test.beforeEach(clearItems);
test.afterEach(clearItems);

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
