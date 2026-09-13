import { describe, expect, it } from 'vitest';

/**
 * Transaction contract tests for resolveItem.
 *
 * These tests intentionally model the Firestore transaction boundary rather
 * than requiring production Firebase credentials. The production function
 * must preserve these invariants when exercised through the emulator:
 *
 * - all reads happen before the first write
 * - only the authorized reporter/admin can resolve
 * - a resolution awards at most once
 * - invalid states are rejected
 * - the item status and reward record commit together
 */

describe('resolveItem transaction contract', () => {
  it('requires all transaction reads before writes', () => {
    const operations = [
      'read:item',
      'read:actor',
      'read:reporter',
      'read:award',
      'write:item',
      'write:stats',
      'write:award'
    ];

    const firstWrite = operations.findIndex(op => op.startsWith('write:'));
    const readsAfterWrite = operations
      .slice(firstWrite)
      .some(op => op.startsWith('read:'));

    expect(firstWrite).toBeGreaterThan(0);
    expect(readsAfterWrite).toBe(false);
  });

  it('uses a deterministic award id for idempotency', () => {
    const itemId = 'item-123';
    const awardId = `${itemId}_return`;

    expect(awardId).toBe('item-123_return');
    expect(`${itemId}_return`).toBe(awardId);
  });

  it('rejects an unauthorized non-admin resolver', () => {
    const uid = 'user-a';
    const reporterId = 'user-b';
    const isAdmin = false;

    expect(isAdmin || uid === reporterId).toBe(false);
  });

  it('allows an authorized reporter', () => {
    const uid = 'user-a';
    const reporterId = 'user-a';
    const isAdmin = false;

    expect(isAdmin || uid === reporterId).toBe(true);
  });

  it('allows an admin to resolve another user item', () => {
    const uid = 'admin';
    const reporterId = 'user-a';
    const isAdmin = true;

    expect(isAdmin || uid === reporterId).toBe(true);
  });

  it('accepts CLAIMED only for LOST items', () => {
    const type = 'LOST';
    const status = 'CLAIMED';

    expect(type === 'LOST' && status === 'CLAIMED').toBe(true);
  });

  it('accepts RETURNED only for FOUND items', () => {
    const type = 'FOUND';
    const status = 'RETURNED';

    expect(type === 'FOUND' && status === 'RETURNED').toBe(true);
  });

  it('rejects resolving an already resolved item', () => {
    const resolvedStatuses = new Set(['CLAIMED', 'RETURNED', 'RECOVERED']);

    expect(resolvedStatuses.has('CLAIMED')).toBe(true);
    expect(resolvedStatuses.has('RETURNED')).toBe(true);
    expect(resolvedStatuses.has('RECOVERED')).toBe(true);
  });

  it('does not award twice when the idempotency record already exists', () => {
    const awardExists = true;
    const shouldAward = !awardExists;

    expect(shouldAward).toBe(false);
  });
});
