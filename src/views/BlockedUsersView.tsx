import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebase';
import { unblockUser } from '../services/chatService';
import { useToast } from '../hooks/useToast';

interface BlockedUserProfile {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

interface BlockedUsersViewProps {
  onToastSuccess?: (message: string) => void;
  onToastError?: (message: string) => void;
}

export const BlockedUsersView: React.FC<BlockedUsersViewProps> = ({
  onToastSuccess,
  onToastError,
}) => {
  const { user } = useAuth();
  const fallbackToast = useToast();
  const success = onToastSuccess ?? fallbackToast.success;
  const error = onToastError ?? fallbackToast.error;
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setBlockedUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    let active = true;
    let latestRequest = 0;
    const unsubscribe = onSnapshot(
      collection(db, 'users', user.uid, 'blockedUsers'),
      async (snapshot) => {
        const requestId = ++latestRequest;
        try {
          const profiles = await Promise.all(snapshot.docs.map(async (blockedDoc) => {
            try {
              const profileSnapshot = await getDoc(doc(db, 'publicProfiles', blockedDoc.id));
              const data = profileSnapshot.exists() ? profileSnapshot.data() : {};
              return {
                uid: blockedDoc.id,
                displayName: typeof data.displayName === 'string' && data.displayName.trim()
                  ? data.displayName
                  : 'CampusFind user',
                photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
              };
            } catch (profileError) {
              console.warn('Unable to load a blocked user profile:', profileError);
              return { uid: blockedDoc.id, displayName: 'CampusFind user', photoURL: null };
            }
          }));

          if (active && requestId === latestRequest) {
            setBlockedUsers(profiles);
            setLoading(false);
          }
        } catch (loadError) {
          console.error('Unable to load blocked users:', loadError);
          if (active && requestId === latestRequest) {
            setLoading(false);
            error('Unable to load your blocked users');
          }
        }
      },
      (subscriptionError) => {
        console.error('Unable to subscribe to blocked users:', subscriptionError);
        if (active) {
          setLoading(false);
          error('Unable to load your blocked users');
        }
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [user, error]);

  const handleUnblock = async (blockedUser: BlockedUserProfile) => {
    if (!user || unblockingUserId) return;
    if (!confirm(`Unblock ${blockedUser.displayName}? They may be able to message you again if they have not blocked you.`)) return;

    setUnblockingUserId(blockedUser.uid);
    try {
      await unblockUser(user.uid, blockedUser.uid);
      setBlockedUsers((current) => current.filter((entry) => entry.uid !== blockedUser.uid));
      success(`${blockedUser.displayName} was unblocked`);
    } catch (unblockError) {
      console.error('Unable to unblock user:', unblockError);
      error(unblockError instanceof Error ? unblockError.message : 'Unable to unblock this user');
    } finally {
      setUnblockingUserId(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-full p-6">
        <div className="mx-auto max-w-3xl rounded-xl bg-white p-8 text-center shadow-soft">
          <h1 className="text-2xl font-bold text-primary">Blocked Users</h1>
          <p className="mt-2 text-sm text-gray-600">Please sign in to manage blocked accounts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background-light p-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <span className="material-icons">block</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-primary">Blocked Users</h1>
              <p className="text-sm text-gray-600">Manage accounts you've blocked on CampusFind.</p>
            </div>
          </div>
        </header>

        <section className="rounded-xl bg-white p-6 shadow-soft" aria-labelledby="blocked-users-title">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="blocked-users-title" className="text-lg font-semibold text-gray-800">Your blocked accounts</h2>
            <span className="text-xs text-gray-500">{blockedUsers.length} blocked</span>
          </div>
          <p className="mb-5 text-sm text-gray-500">
            Blocked people cannot start new conversations with you or send messages in existing chats. Unblocking does not restore messages that were prevented while blocked.
          </p>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500" role="status">
              <span className="material-icons animate-spin text-base">refresh</span>
              Loading blocked users…
            </div>
          ) : blockedUsers.length === 0 ? (
            <div className="rounded-lg bg-gray-50 px-4 py-10 text-center">
              <span className="material-icons text-4xl text-gray-400">person_off</span>
              <p className="mt-2 text-sm font-medium text-gray-700">You haven't blocked anyone.</p>
              <p className="mt-1 text-xs text-gray-500">When you block someone from a chat, they'll appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {blockedUsers.map((blockedUser) => (
                <li key={blockedUser.uid} className="flex items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    {blockedUser.photoURL ? (
                      <img src={blockedUser.photoURL} alt="" className="h-11 w-11 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <span className="material-icons">person</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-800">{blockedUser.displayName}</p>
                      <p className="text-xs text-gray-500">Blocked account</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleUnblock(blockedUser)}
                    disabled={unblockingUserId !== null}
                    className="shrink-0 rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {unblockingUserId === blockedUser.uid ? 'Unblocking…' : 'Unblock'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
