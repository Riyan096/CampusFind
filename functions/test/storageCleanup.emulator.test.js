const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const PROJECT_ID = 'campusfind-app';
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;

const app = initializeApp({
  projectId: PROJECT_ID,
  storageBucket: STORAGE_BUCKET,
});
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

function storageDownloadUrl(path) {
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=test-token`;
}

async function uploadImage(path) {
  await bucket.file(path).save(Buffer.from('test-image'), {
    metadata: { contentType: 'image/jpeg' },
  });
}

async function waitForFile(path, expectedExists, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const [exists] = await bucket.file(path).exists();
    if (exists === expectedExists) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const [exists] = await bucket.file(path).exists();
  assert.equal(
    exists,
    expectedExists,
    `Timed out waiting for Storage object ${path} to be ${expectedExists ? 'present' : 'deleted'}`
  );
}

async function deleteIfExists(path) {
  await bucket.file(path).delete({ ignoreNotFound: true });
}

test.before(async () => {
  await Promise.all([
    deleteIfExists('users/cleanup-test/items/deleted-item/image.jpg'),
    deleteIfExists('users/cleanup-test/items/replaced-item/old.jpg'),
    deleteIfExists('users/cleanup-test/items/replaced-item/new.jpg'),
  ]);
});

test.after(async () => {
  await Promise.all([
    deleteIfExists('users/cleanup-test/items/deleted-item/image.jpg'),
    deleteIfExists('users/cleanup-test/items/replaced-item/old.jpg'),
    deleteIfExists('users/cleanup-test/items/replaced-item/new.jpg'),
  ]);
  await db.terminate();
  await app.delete();
});

test('deleting an item removes its Firebase Storage image', async () => {
  const itemId = 'deleted-item';
  const imagePath = `users/cleanup-test/items/${itemId}/image.jpg`;
  const itemRef = db.collection('items').doc(itemId);

  await uploadImage(imagePath);
  await waitForFile(imagePath, true);

  await itemRef.set({
    reportedBy: 'cleanup-test',
    imageUrl: storageDownloadUrl(imagePath),
    title: 'Cleanup test item',
    createdAt: FieldValue.serverTimestamp(),
  });

  await itemRef.delete();
  await waitForFile(imagePath, false);
});

test('replacing an item image removes the old image and keeps the new image', async () => {
  const itemId = 'replaced-item';
  const oldImagePath = `users/cleanup-test/items/${itemId}/old.jpg`;
  const newImagePath = `users/cleanup-test/items/${itemId}/new.jpg`;
  const itemRef = db.collection('items').doc(itemId);

  await uploadImage(oldImagePath);
  await uploadImage(newImagePath);
  await waitForFile(oldImagePath, true);
  await waitForFile(newImagePath, true);

  await itemRef.set({
    reportedBy: 'cleanup-test',
    imageUrl: storageDownloadUrl(oldImagePath),
    title: 'Replacement test item',
    createdAt: FieldValue.serverTimestamp(),
  });

  await itemRef.update({
    imageUrl: storageDownloadUrl(newImagePath),
  });

  await waitForFile(oldImagePath, false);
  await waitForFile(newImagePath, true);

  await itemRef.delete();
});
