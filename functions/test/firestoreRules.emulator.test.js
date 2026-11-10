const assert = require('node:assert/strict');
const test = require('node:test');

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
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

async function clearBlockedUsers() {
  const snapshot = await adminDb.collectionGroup('blockedUsers').get();
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

async function clearPublicProfiles() {
  const snapshot = await adminDb.collection('publicProfiles').get();
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
  await adminDb.collection('items').doc(itemId).set({...baseItem, ...overrides});
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

async function seedPublicProfile(userId, overrides = {}) {
  await adminDb.collection('publicProfiles').doc(userId).set({
    uid: userId,
    displayName: 'Test User',
    photoURL: null,
    points: 100,
    itemsReported: 3,
    itemsReturned: 2,
    itemsClaimed: 1,
    ...overrides
  });
}

test.before(async () => {
  testEnv = await initializeTestEnvironment({projectId, firestore: {rules}});
});

test.beforeEach(async () => {
  await Promise.all([clearItems(), clearBlockedUsers(), clearUsers(), clearPublicProfiles(), clearPointAwards()]);
});

test.afterEach(async () => {
  await Promise.all([clearItems(), clearBlockedUsers(), clearUsers(), clearPublicProfiles(), clearPointAwards()]);
});

test.after(async () => {
  await testEnv.cleanup();
});

test('owner can update allowed item fields', async () => {
  await seedItem('allowed-update');
  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertSucceeds(db.collection('items').doc('allowed-update').update({
    title: 'Updated title', description: 'Updated description', location: 'Library'
  }));
});

test('item creation only allows initial states and approved fields', async () => {
  const db = testEnv.authenticatedContext('new-reporter').firestore();
  const initialItem = {
    reportedBy: 'new-reporter',
    type: 'FOUND',
    status: 'AVAILABLE',
    title: 'Test item',
    description: 'A test item',
    category: 'Other',
    location: 'Student Center',
    date: '2026-11-06T12:00:00.000Z',
    reporterName: 'Reporter',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  await assertSucceeds(db.collection('items').doc('valid-create').set(initialItem));
  await assertFails(db.collection('items').doc('resolved-create').set({
    ...initialItem,
    status: 'RETURNED'
  }));
  await assertFails(db.collection('items').doc('field-injection').set({
    ...initialItem,
    moderationApproved: true
  }));
});

test('owner cannot change reportedBy', async () => {
  await seedItem('reported-by');
  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertFails(db.collection('items').doc('reported-by').update({reportedBy: 'attacker'}));
});

test('owner cannot change status directly', async () => {
  await seedItem('status-bypass');
  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertFails(db.collection('items').doc('status-bypass').update({status: 'RETURNED'}));
});

test('owner cannot change item type', async () => {
  await seedItem('type-bypass');
  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertFails(db.collection('items').doc('type-bypass').update({type: 'LOST'}));
});

test('owner cannot add arbitrary fields', async () => {
  await seedItem('field-bypass');
  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertFails(db.collection('items').doc('field-bypass').update({
    isAdmin: true, moderationApproved: true, arbitraryServerField: 'attacker-controlled'
  }));
});

test('owner cannot modify protected server-managed fields', async () => {
  await seedItem('protected-fields', {createdAt: {seconds: 1, nanoseconds: 0}, moderationStatus: 'pending'});
  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertFails(db.collection('items').doc('protected-fields').update({createdAt: {seconds: 999, nanoseconds: 0}}));
  await assertFails(db.collection('items').doc('protected-fields').update({moderationStatus: 'approved'}));
});

test('different user cannot edit another reporter item', async () => {
  await seedItem('ownership-bypass');
  const db = testEnv.authenticatedContext('attacker').firestore();
  await assertFails(db.collection('items').doc('ownership-bypass').update({title: 'Attacker edit'}));
});

test('normal user cannot modify protected user stats', async () => {
  await seedUser('reporter-1');
  const db = testEnv.authenticatedContext('reporter-1').firestore();
  const protectedFields = [
    ['points', 9999], ['itemsReturned', 999], ['itemsReported', 999],
    ['lastActive', '2099-01-01'], ['itemsClaimed', 999], ['badges', ['admin']]
  ];
  for (const [field, value] of protectedFields) {
    await assertFails(db.collection('users').doc('reporter-1').update({[field]: value}));
  }
});

test('new users can only initialize profile stats at zero', async () => {
  const db = testEnv.authenticatedContext('new-user').firestore();
  const userRef = db.collection('users').doc('new-user');
  const baseUser = {
    uid: 'new-user',
    displayName: 'New User',
    isAdmin: false,
    createdAt: '2026-11-06T12:00:00.000Z',
    points: 0,
    itemsReturned: 0,
    itemsReported: 0,
    itemsClaimed: 0
  };

  await assertSucceeds(userRef.set(baseUser));
  const forgedDb = testEnv.authenticatedContext('forged-user').firestore();
  await assertFails(forgedDb.collection('users').doc('forged-user').set({
    ...baseUser,
    uid: 'forged-user',
    points: 100000
  }));
});

test('clients cannot create notifications for another user', async () => {
  const db = testEnv.authenticatedContext('sender').firestore();
  await assertFails(db.collection('notifications').doc('forged').set({
    userId: 'victim',
    title: 'Fake message',
    message: 'Forged notification',
    type: 'chat_message',
    read: false,
    createdAt: '2026-11-06T12:00:00.000Z'
  }));
});

test('normal user can update allowed profile fields without changing stats', async () => {
  await seedUser('reporter-1');
  const db = testEnv.authenticatedContext('reporter-1').firestore();
  await assertSucceeds(db.collection('users').doc('reporter-1').update({
    displayName: 'Updated User', photoURL: 'https://example.com/avatar.png'
  }));
});

test('normal user cannot read another user private document', async () => {
  await seedUser('user-a', {email: 'a@example.com'});
  await seedUser('user-b', {email: 'b@example.com'});
  const db = testEnv.authenticatedContext('user-a').firestore();
  await assertFails(db.collection('users').doc('user-b').get());
});

test('normal user can read another user public profile', async () => {
  await seedUser('user-b');
  await seedPublicProfile('user-b');
  const db = testEnv.authenticatedContext('user-a').firestore();
  await assertSucceeds(db.collection('publicProfiles').doc('user-b').get());
});

test('normal user cannot create a public profile with forged stats', async () => {
  await seedUser('user-a');
  const db = testEnv.authenticatedContext('user-a').firestore();
  await assertFails(db.collection('publicProfiles').doc('user-a').set({
    uid: 'user-a', displayName: 'User A', photoURL: null,
    points: 9999, itemsReported: 999, itemsReturned: 999, itemsClaimed: 999
  }));
});

test('normal user cannot modify another user public profile', async () => {
  await seedUser('user-a');
  await seedUser('user-b');
  await seedPublicProfile('user-b');
  const db = testEnv.authenticatedContext('user-a').firestore();
  await assertFails(db.collection('publicProfiles').doc('user-b').update({displayName: 'Attacker'}));
});

test('public profile update cannot change authoritative stats', async () => {
  await seedUser('user-a');
  await seedPublicProfile('user-a');
  const db = testEnv.authenticatedContext('user-a').firestore();
  await assertFails(db.collection('publicProfiles').doc('user-a').update({points: 9999}));
});

test('normal user cannot tamper with point awards', async () => {
  await seedUser('reporter-1');
  await adminDb.collection('users').doc('reporter-1').collection('pointAwards').doc('award-1').set({
    points: 25, reason: 'return', createdAt: '2026-09-13'
  });
  const db = testEnv.authenticatedContext('reporter-1').firestore();
  const award = db.collection('users').doc('reporter-1').collection('pointAwards').doc('award-1');
  await assertFails(award.set({points: 9999, reason: 'fake'}));
  await assertFails(award.update({points: 9999}));
  await assertFails(award.delete());
});


async function seedBlock(blockerId, blockedId) {
  await adminDb.collection('users').doc(blockerId).collection('blockedUsers').doc(blockedId).set({
    blockedUserId: blockedId,
    createdAt: firebase.firestore.Timestamp.now()
  });
}

async function seedChat(chatId, firstUserId, secondUserId, itemId) {
  await adminDb.collection('chats').doc(chatId).set({
    itemId,
    itemTitle: 'Test item',
    createdBy: firstUserId,
    participantIds: [firstUserId, secondUserId],
    participants: {
      [firstUserId]: {name: 'First user', joinedAt: firebase.firestore.Timestamp.now()},
      [secondUserId]: {name: 'Second user', joinedAt: firebase.firestore.Timestamp.now()}
    },
    createdAt: firebase.firestore.Timestamp.now()
  });
}

function validChatMessage(senderId) {
  return {
    senderId,
    senderName: 'Test sender',
    content: 'Hello',
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    read: false,
    status: 'sent',
    readBy: {}
  };
}

test('users can create and remove blocks only in their own private block list', async () => {
  await seedUser('blocker');
  await seedUser('blocked');
  const db = testEnv.authenticatedContext('blocker').firestore();
  const ownBlock = db.collection('users').doc('blocker').collection('blockedUsers').doc('blocked');

  await assertSucceeds(ownBlock.set({
    blockedUserId: 'blocked',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }));
  await assertFails(db.collection('users').doc('blocked').collection('blockedUsers').doc('blocker').get());
  await assertFails(db.collection('users').doc('blocked').collection('blockedUsers').doc('blocker').set({
    blockedUserId: 'blocker',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }));
  await assertFails(ownBlock.update({blockedUserId: 'another-user'}));
  await assertSucceeds(ownBlock.delete());
});

test('a block in either direction prevents creating a new chat', async () => {
  await seedUser('blocker');
  await seedUser('blocked');
  await seedBlock('blocker', 'blocked');
  await seedItem('blocked-item', {reportedBy: 'blocked'});
  await seedItem('blocker-item', {reportedBy: 'blocker'});

  const blockerDb = testEnv.authenticatedContext('blocker').firestore();
  const blockedDb = testEnv.authenticatedContext('blocked').firestore();
  const chatData = (creator, owner) => ({
    itemId: creator === 'blocker' ? 'blocked-item' : 'blocker-item',
    itemTitle: 'Test item',
    createdBy: creator,
    participantIds: [creator, owner],
    participants: {
      [creator]: {name: 'Creator', joinedAt: firebase.firestore.FieldValue.serverTimestamp()},
      [owner]: {name: 'Owner', joinedAt: firebase.firestore.FieldValue.serverTimestamp()}
    },
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  await assertFails(blockerDb.collection('chats').doc('blocked-chat-a').set(chatData('blocker', 'blocked')));
  await assertFails(blockedDb.collection('chats').doc('blocked-chat-b').set(chatData('blocked', 'blocker')));
});

test('a block in either direction prevents both participants from sending new messages', async () => {
  await seedUser('blocker');
  await seedUser('blocked');
  await seedItem('blocked-item');
  await seedBlock('blocker', 'blocked');
  await seedChat('blocked-chat', 'blocker', 'blocked', 'blocked-item');

  const blockerDb = testEnv.authenticatedContext('blocker').firestore();
  const blockedDb = testEnv.authenticatedContext('blocked').firestore();

  await assertFails(blockerDb.collection('chats').doc('blocked-chat').collection('messages').doc('from-blocker').set(validChatMessage('blocker')));
  await assertFails(blockedDb.collection('chats').doc('blocked-chat').collection('messages').doc('from-blocked').set(validChatMessage('blocked')));
});
