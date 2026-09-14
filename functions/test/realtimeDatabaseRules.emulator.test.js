const test = require('node:test');

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require('@firebase/rules-unit-testing');

const projectId = process.env.GCLOUD_PROJECT || 'campusfind';
const rules = readFileSync(join(__dirname, '../../database.rules.json'), 'utf8');

let testEnv;

const baseChat = {
  createdBy: 'creator-1',
  itemId: 'item-1',
  itemTitle: 'Lost Keys',
  participants: {
    'creator-1': {
      name: 'Creator',
      joinedAt: 1000
    },
    'member-1': {
      name: 'Member',
      joinedAt: 1001
    }
  },
  createdAt: 1000
};

const baseMessage = {
  senderId: 'creator-1',
  senderName: 'Creator',
  content: 'Original message',
  timestamp: 1002,
  read: false,
  status: 'sent',
  readBy: {}
};

async function clearChats() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.database().ref('chats').remove();
  });
}

async function seedChat(chatId = 'chat-1', overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.database().ref(`chats/${chatId}`).set({
      ...baseChat,
      ...overrides
    });
  });
}

function dbFor(userId) {
  return testEnv.authenticatedContext(userId).database();
}

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    database: { rules }
  });
});

test.beforeEach(clearChats);
test.afterEach(clearChats);

test.after(async () => {
  await testEnv.cleanup();
});

test('authenticated creator can create a chat with themselves as a participant', async () => {
  const db = dbFor('creator-1');

  await assertSucceeds(
    db.ref('chats/chat-create').set({
      createdBy: 'creator-1',
      itemId: 'item-1',
      itemTitle: 'Lost Keys',
      participants: {
        'creator-1': {
          name: 'Creator',
          joinedAt: 1000
        }
      },
      createdAt: 1000
    })
  );
});

test('authenticated user cannot create a chat claiming another user as creator', async () => {
  const db = dbFor('attacker');

  await assertFails(
    db.ref('chats/chat-create').set({
      createdBy: 'creator-1',
      itemId: 'item-1',
      itemTitle: 'Lost Keys',
      participants: {
        'creator-1': {
          name: 'Creator',
          joinedAt: 1000
        }
      },
      createdAt: 1000
    })
  );
});

test('chat member can read the conversation', async () => {
  await seedChat();

  await assertSucceeds(
    dbFor('member-1').ref('chats/chat-1').get()
  );
});

test('non-member cannot read the conversation', async () => {
  await seedChat();

  await assertFails(
    dbFor('outsider').ref('chats/chat-1').get()
  );
});

test('chat member cannot modify the conversation root', async () => {
  await seedChat();

  await assertFails(
    dbFor('member-1').ref('chats/chat-1').update({ itemTitle: 'Hijacked Chat' })
  );
});

test('non-member cannot write to an existing conversation', async () => {
  await seedChat();

  await assertFails(
    dbFor('outsider').ref('chats/chat-1/participants/outsider').set({
      name: 'Outsider',
      joinedAt: 1002
    })
  );
});

test('chat creator can add a participant', async () => {
  await seedChat('chat-1', {
    participants: {
      'creator-1': {
        name: 'Creator',
        joinedAt: 1000
      }
    }
  });

  await assertSucceeds(
    dbFor('creator-1').ref('chats/chat-1/participants/member-2').set({
      name: 'Member 2',
      joinedAt: 1002
    })
  );
});

test('non-creator cannot add themselves to a conversation', async () => {
  await seedChat('chat-1', {
    participants: {
      'creator-1': {
        name: 'Creator',
        joinedAt: 1000
      }
    }
  });

  await assertFails(
    dbFor('outsider').ref('chats/chat-1/participants/outsider').set({
      name: 'Outsider',
      joinedAt: 1002
    })
  );
});

test('participant can leave their own conversation membership', async () => {
  await seedChat();

  await assertSucceeds(
    dbFor('member-1').ref('chats/chat-1/participants/member-1').remove()
  );
});

test('participant cannot remove another user from the conversation', async () => {
  await seedChat();

  await assertFails(
    dbFor('member-1').ref('chats/chat-1/participants/creator-1').remove()
  );
});

test('chat member can send a message with their own senderId', async () => {
  await seedChat();

  await assertSucceeds(
    dbFor('member-1').ref('chats/chat-1/messages/message-1').set({
      senderId: 'member-1',
      senderName: 'Member',
      content: 'Hello!',
      timestamp: 1002,
      read: false
    })
  );
});

test('chat member cannot impersonate another sender', async () => {
  await seedChat();

  await assertFails(
    dbFor('member-1').ref('chats/chat-1/messages/message-1').set({
      senderId: 'creator-1',
      senderName: 'Creator',
      content: 'I am the creator.',
      timestamp: 1002,
      read: false
    })
  );
});

test('non-member cannot send a message even with their own senderId', async () => {
  await seedChat();

  await assertFails(
    dbFor('outsider').ref('chats/chat-1/messages/message-1').set({
      senderId: 'outsider',
      senderName: 'Outsider',
      content: 'Unauthorized message',
      timestamp: 1002,
      read: false
    })
  );
});

test('non-member cannot read messages from a conversation', async () => {
  await seedChat('chat-1', {
    messages: {
      'message-1': {
        ...baseMessage
      }
    }
  });

  await assertFails(
    dbFor('outsider').ref('chats/chat-1/messages').get()
  );
});

test('chat member can update lastMessage only as themselves', async () => {
  await seedChat();

  await assertSucceeds(
    dbFor('member-1').ref('chats/chat-1/lastMessage').set({
      content: 'Hello!',
      timestamp: 1002,
      senderId: 'member-1'
    })
  );

  await assertFails(
    dbFor('member-1').ref('chats/chat-1/lastMessage').set({
      content: 'Impersonated update',
      timestamp: 1003,
      senderId: 'creator-1'
    })
  );
});

test('message recipient can mark a message as read without changing immutable metadata', async () => {
  await seedChat('chat-1', {
    messages: {
      'message-1': { ...baseMessage }
    }
  });

  await assertSucceeds(
    dbFor('member-1').ref('chats/chat-1/messages/message-1').update({
      read: true,
      status: 'read',
      readBy: {
        'member-1': 1003
      }
    })
  );
});

test('message sender cannot edit immutable message metadata', async () => {
  await seedChat('chat-1', {
    messages: {
      'message-1': { ...baseMessage }
    }
  });

  await assertFails(
    dbFor('creator-1').ref('chats/chat-1/messages/message-1').update({
      senderName: 'Impersonated Creator'
    })
  );

  await assertFails(
    dbFor('creator-1').ref('chats/chat-1/messages/message-1').update({
      content: 'Edited after sending'
    })
  );

  await assertFails(
    dbFor('creator-1').ref('chats/chat-1/messages/message-1').update({
      timestamp: 9999
    })
  );
});

test('message recipient cannot edit immutable metadata while marking a message read', async () => {
  await seedChat('chat-1', {
    messages: {
      'message-1': { ...baseMessage }
    }
  });

  await assertFails(
    dbFor('member-1').ref('chats/chat-1/messages/message-1').update({
      senderName: 'Forged Name',
      read: true,
      status: 'read',
      readBy: {
        'member-1': 1003
      }
    })
  );
});

test('message write rejects arbitrary unknown fields', async () => {
  await seedChat();

  await assertFails(
    dbFor('member-1').ref('chats/chat-1/messages/message-1').set({
      senderId: 'member-1',
      senderName: 'Member',
      content: 'Hello!',
      timestamp: 1002,
      read: false,
      hacked: true
    })
  );
});

test('message sender cannot delete their own sent message', async () => {
  await seedChat('chat-1', {
    messages: {
      'message-1': { ...baseMessage }
    }
  });

  await assertFails(
    dbFor('creator-1').ref('chats/chat-1/messages/message-1').remove()
  );
});

test('message recipient cannot delete another user\'s message', async () => {
  await seedChat('chat-1', {
    messages: {
      'message-1': { ...baseMessage }
    }
  });

  await assertFails(
    dbFor('member-1').ref('chats/chat-1/messages/message-1').remove()
  );
});

test('non-member cannot delete a message from a conversation', async () => {
  await seedChat('chat-1', {
    messages: {
      'message-1': { ...baseMessage }
    }
  });

  await assertFails(
    dbFor('outsider').ref('chats/chat-1/messages/message-1').remove()
  );
});
