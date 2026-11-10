const assert = require('node:assert/strict');
const test = require('node:test');

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
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

async function clearReports() {
  const snapshot = await adminDb.collection('userReports').get();
  if (!snapshot.empty) {
    const batch = adminDb.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

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
  await Promise.all([clearItems(), clearReports(), clearBlockedUsers(), clearUsers(), clearPublicProfiles(), clearPointAwards()]);
});

test.afterEach(async () => {
  await Promise.all([clearItems(), clearReports(), clearBlockedUsers(), clearUsers(), clearPublicProfiles(), clearPointAwards()]);
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
    createdAt: Timestamp.now()
  });
}

async function seedChat(chatId, firstUserId, secondUserId, itemId) {
  await adminDb.collection('chats').doc(chatId).set({
    itemId,
    itemTitle: 'Test item',
    createdBy: firstUserId,
    participantIds: [firstUserId, secondUserId],
    participants: {
      [firstUserId]: {name: 'First user', joinedAt: Timestamp.now()},
      [secondUserId]: {name: 'Second user', joinedAt: Timestamp.now()}
    },
    createdAt: Timestamp.now()
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


async function validUserReport(overrides = {}) {
  return {
    reporterId: 'reporter',
    reportedUserId: 'target',
    chatId: 'report-chat',
    itemId: 'report-item',
    reason: 'harassment',
    details: 'Repeated unwanted messages',
    status: 'new',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    ...overrides
  };
}

test('chat participants can submit private, valid user reports', async () => {
  await seedUser('reporter');
  await seedUser('target');
  await seedItem('report-item', {reportedBy: 'target'});
  await seedChat('report-chat', 'reporter', 'target', 'report-item');

  const reporterDb = testEnv.authenticatedContext('reporter').firestore();
  const reportRef = reporterDb.collection('userReports').doc('private-report');
  await assertSucceeds(reportRef.set(await validUserReport()));

  await assertSucceeds(reportRef.get());
  await assertFails(testEnv.authenticatedContext('target').firestore().collection('userReports').doc('private-report').get());
  await assertFails(testEnv.authenticatedContext('stranger').firestore().collection('userReports').doc('private-report').get());
});

test('user report creation rejects nonparticipants, self-reports, invalid reasons, and forged fields', async () => {
  await seedUser('reporter');
  await seedUser('target');
  await seedItem('report-item', {reportedBy: 'target'});
  await seedChat('report-chat', 'reporter', 'target', 'report-item');

  const reporterDb = testEnv.authenticatedContext('reporter').firestore();
  await assertFails(reporterDb.collection('userReports').doc('not-a-participant').set(
    await validUserReport({chatId: 'missing-chat'})
  ));
  await assertFails(reporterDb.collection('userReports').doc('self-report').set(
    await validUserReport({reportedUserId: 'reporter'})
  ));
  await assertFails(reporterDb.collection('userReports').doc('bad-reason').set(
    await validUserReport({reason: 'not-a-reason'})
  ));
  await assertFails(reporterDb.collection('userReports').doc('extra-field').set(
    await validUserReport({admin: true})
  ));
});

test('only admins can review reports and reports cannot be deleted', async () => {
  await seedUser('reporter');
  await seedUser('target');
  await seedUser('moderator', {isAdmin: true});
  await seedItem('report-item', {reportedBy: 'target'});
  await seedChat('report-chat', 'reporter', 'target', 'report-item');
  await adminDb.collection('userReports').doc('reviewable-report').set({
    reporterId: 'reporter',
    reportedUserId: 'target',
    chatId: 'report-chat',
    itemId: 'report-item',
    reason: 'spam',
    details: '',
    status: 'new',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });

  const reportRef = testEnv.authenticatedContext('reporter').firestore().collection('userReports').doc('reviewable-report');
  const adminReportRef = testEnv.authenticatedContext('moderator').firestore().collection('userReports').doc('reviewable-report');
  const reviewUpdate = {
    status: 'reviewing',
    reviewNote: 'Reviewing the conversation context',
    reviewedBy: 'moderator',
    reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  await assertFails(reportRef.update(reviewUpdate));
  await assertFails(reportRef.delete());
  await assertSucceeds(adminReportRef.update(reviewUpdate));
  await assertSucceeds(adminReportRef.get());
  await assertFails(adminReportRef.delete());
});

test('participants can use custom single and compound emoji reactions', async () => {
  await seedUser('reaction-user');
  await seedUser('other-user');
  await seedItem('reaction-item');
  await seedChat('reaction-chat', 'reaction-user', 'other-user', 'reaction-item');
  await adminDb.collection('chats').doc('reaction-chat').collection('messages').doc('reaction-message').set({
    senderId: 'other-user',
    senderName: 'Other user',
    content: 'React to this',
    timestamp: Timestamp.now(),
    read: false,
    status: 'sent',
    readBy: {},
    reactions: {}
  });

  const db = testEnv.authenticatedContext('reaction-user').firestore();
  const message = db.collection('chats').doc('reaction-chat').collection('messages').doc('reaction-message');

  await assertSucceeds(message.update({reactions: {'reaction-user': '😍'}}));
  await assertSucceeds(message.update({reactions: {'reaction-user': '👨‍👩‍👧‍👦'}}));
});

test('only the sender can edit their own text messages', async () => {
  await seedUser('message-author');
  await seedUser('message-recipient');
  await seedItem('edit-item');
  await seedChat('edit-chat', 'message-author', 'message-recipient', 'edit-item');
  await adminDb.collection('chats').doc('edit-chat').collection('messages').doc('text-message').set({
    senderId: 'message-author', senderName: 'Message author', content: 'Original text',
    timestamp: Timestamp.now(), read: false, status: 'sent', readBy: {}
  });
  const authorDb = testEnv.authenticatedContext('message-author').firestore();
  const recipientDb = testEnv.authenticatedContext('message-recipient').firestore();
  const authorMessage = authorDb.collection('chats').doc('edit-chat').collection('messages').doc('text-message');
  const recipientMessage = recipientDb.collection('chats').doc('edit-chat').collection('messages').doc('text-message');
  await assertSucceeds(authorMessage.update({content: 'Corrected text', edited: true, editedAt: firebase.firestore.FieldValue.serverTimestamp()}));
  await assertFails(recipientMessage.update({content: 'Tampered text', edited: true, editedAt: firebase.firestore.FieldValue.serverTimestamp()}));
  await assertFails(authorMessage.update({senderId: 'message-recipient'}));
});

test('message owners can soft-delete messages while preserving the message document', async () => {
  await seedUser('message-author');
  await seedUser('message-recipient');
  await seedItem('delete-item');
  await seedChat('delete-chat', 'message-author', 'message-recipient', 'delete-item');
  await adminDb.collection('chats').doc('delete-chat').collection('messages').doc('photo-message').set({
    senderId: 'message-author', senderName: 'Message author', content: 'Photo',
    timestamp: Timestamp.now(), read: false, status: 'sent', readBy: {},
    attachment: {type: 'image', publicId: 'campusfind/chats/delete-chat/12345678-1234-1234-1234-123456789012', format: 'jpg', bytes: 1024, width: 100, height: 100}
  });
  const authorDb = testEnv.authenticatedContext('message-author').firestore();
  const recipientDb = testEnv.authenticatedContext('message-recipient').firestore();
  const authorMessage = authorDb.collection('chats').doc('delete-chat').collection('messages').doc('photo-message');
  const recipientMessage = recipientDb.collection('chats').doc('delete-chat').collection('messages').doc('photo-message');
  const deleteUpdate = {
    content: 'This message was deleted', deleted: true,
    deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
    attachment: firebase.firestore.FieldValue.delete(),
    sticker: firebase.firestore.FieldValue.delete(),
    gif: firebase.firestore.FieldValue.delete(),
    reactions: firebase.firestore.FieldValue.delete()
  };
  await assertFails(recipientMessage.update(deleteUpdate));
  await assertSucceeds(authorMessage.update(deleteUpdate));
  const deleted = await assertSucceeds(recipientMessage.get());
  assert.equal(deleted.data().deleted, true);
  assert.equal(deleted.data().content, 'This message was deleted');
  assert.equal('attachment' in deleted.data(), false);
});

test('participants can reply to an existing message in the same conversation', async () => {
  await seedUser('reply-sender');
  await seedUser('reply-recipient');
  await seedItem('reply-item');
  await seedChat('reply-chat', 'reply-sender', 'reply-recipient', 'reply-item');
  await adminDb.collection('chats').doc('reply-chat').collection('messages').doc('original-message').set({
    senderId: 'reply-recipient',
    senderName: 'Reply recipient',
    content: 'Where did you last see the keys?',
    timestamp: Timestamp.now(),
    read: false,
    status: 'sent',
    readBy: {}
  });

  const db = testEnv.authenticatedContext('reply-sender').firestore();
  const replies = db.collection('chats').doc('reply-chat').collection('messages');
  await assertSucceeds(replies.doc('valid-reply').set({
    ...validChatMessage('reply-sender'),
    replyTo: {
      messageId: 'original-message',
      senderId: 'reply-recipient',
      senderName: 'Reply recipient',
      content: 'Where did you last see the keys?',
      type: 'text'
    }
  }));
});

test('message replies reject missing, cross-chat, and forged original references', async () => {
  await seedUser('reply-sender');
  await seedUser('reply-recipient');
  await seedItem('reply-item');
  await seedItem('other-reply-item');
  await seedChat('reply-chat', 'reply-sender', 'reply-recipient', 'reply-item');
  await seedChat('other-reply-chat', 'reply-sender', 'reply-recipient', 'other-reply-item');
  await adminDb.collection('chats').doc('reply-chat').collection('messages').doc('original-message').set({
    senderId: 'reply-recipient',
    senderName: 'Reply recipient',
    content: 'Original text',
    timestamp: Timestamp.now(),
    read: false,
    status: 'sent',
    readBy: {}
  });

  const db = testEnv.authenticatedContext('reply-sender').firestore();
  const messages = db.collection('chats').doc('reply-chat').collection('messages');
  const baseReply = {
    messageId: 'original-message',
    senderId: 'reply-recipient',
    senderName: 'Reply recipient',
    content: 'Original text',
    type: 'text'
  };

  await assertFails(messages.doc('missing-reply').set({
    ...validChatMessage('reply-sender'),
    replyTo: {...baseReply, messageId: 'does-not-exist'}
  }));
  await assertFails(db.collection('chats').doc('other-reply-chat').collection('messages').doc('cross-chat-reply').set({
    ...validChatMessage('reply-sender'),
    replyTo: baseReply
  }));
  await assertFails(messages.doc('forged-reply').set({
    ...validChatMessage('reply-sender'),
    replyTo: {...baseReply, content: 'Forged preview'}
  }));
});
