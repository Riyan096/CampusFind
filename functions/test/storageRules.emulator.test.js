const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { ref, uploadBytes, getBytes, deleteObject } = require('firebase/storage');

const PROJECT_ID = 'campusfind-storage-rules-test';
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;

let testEnv;

function imageBytes(size = 16) {
  return new Uint8Array(size);
}

async function upload(userId, path, contentType = 'image/jpeg', size = 16) {
  const storage = testEnv.authenticatedContext(userId).storage();
  return uploadBytes(ref(storage, path), imageBytes(size), { contentType });
}

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      host: '127.0.0.1',
      port: 9199,
      bucket: STORAGE_BUCKET,
    },
  });
});

test.after(async () => {
  await testEnv.cleanup();
});

test('authenticated owner can upload a JPEG item image', async () => {
  await assertSucceeds(
    upload('user-a', 'users/user-a/items/item-1/photo.jpg', 'image/jpeg')
  );
});

test('authenticated users can read stored item images', async () => {
  await upload('user-a', 'users/user-a/items/item-2/photo.png', 'image/png');

  const storage = testEnv.authenticatedContext('user-b').storage();
  await assertSucceeds(
    getBytes(ref(storage, 'users/user-a/items/item-2/photo.png'))
  );
});

test('user cannot write into another users item namespace', async () => {
  await assertFails(
    upload('user-a', 'users/user-b/items/item-3/photo.jpg', 'image/jpeg')
  );
});

test('unauthenticated users cannot upload', async () => {
  const storage = testEnv.unauthenticatedContext().storage();
  await assertFails(
    uploadBytes(
      ref(storage, 'users/user-a/items/item-4/photo.jpg'),
      imageBytes(),
      { contentType: 'image/jpeg' }
    )
  );
});

test('disallowed report MIME types are rejected', async () => {
  await assertFails(
    upload('user-a', 'users/user-a/items/item-5/photo.gif', 'image/gif')
  );
});

test('profile images allow GIF', async () => {
  await assertSucceeds(
    upload('user-a', 'users/user-a/profile/avatar.gif', 'image/gif')
  );
});

test('images larger than 5 MB are rejected', async () => {
  await assertFails(
    upload(
      'user-a',
      'users/user-a/items/item-6/large.jpg',
      'image/jpeg',
      5 * 1024 * 1024 + 1
    )
  );
});

test('arbitrary storage paths are denied', async () => {
  const storage = testEnv.authenticatedContext('user-a').storage();
  await assertFails(
    uploadBytes(
      ref(storage, 'private/user-a/file.jpg'),
      imageBytes(),
      { contentType: 'image/jpeg' }
    )
  );
});

test('owner can delete their own image', async () => {
  await upload('user-a', 'users/user-a/items/item-7/photo.webp', 'image/webp');
  const storage = testEnv.authenticatedContext('user-a').storage();
  await assertSucceeds(
    deleteObject(ref(storage, 'users/user-a/items/item-7/photo.webp'))
  );
});

test('user cannot delete another users image', async () => {
  await upload('user-a', 'users/user-a/items/item-8/photo.webp', 'image/webp');
  const storage = testEnv.authenticatedContext('user-b').storage();
  await assertFails(
    deleteObject(ref(storage, 'users/user-a/items/item-8/photo.webp'))
  );
});
