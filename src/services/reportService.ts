import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { sanitizeFirestoreDocId, sanitizePlainText } from '../utils/sanitize';

export type UserReportReason =
  | 'harassment'
  | 'threats'
  | 'spam'
  | 'impersonation'
  | 'inappropriate_content'
  | 'scam'
  | 'other';

const VALID_REPORT_REASONS: UserReportReason[] = [
  'harassment',
  'threats',
  'spam',
  'impersonation',
  'inappropriate_content',
  'scam',
  'other',
];

interface SubmitUserReportInput {
  reporterId: string;
  reportedUserId: string;
  chatId: string;
  itemId: string;
  reason: UserReportReason;
  details?: string;
}

export const submitUserReport = async ({
  reporterId,
  reportedUserId,
  chatId,
  itemId,
  reason,
  details = '',
}: SubmitUserReportInput): Promise<string> => {
  const safeReporterId = sanitizeFirestoreDocId(reporterId);
  const safeReportedUserId = sanitizeFirestoreDocId(reportedUserId);
  const safeChatId = sanitizeFirestoreDocId(chatId);
  const safeItemId = sanitizeFirestoreDocId(itemId);

  if (!safeReporterId || !safeReportedUserId || safeReporterId === safeReportedUserId) {
    throw new Error('Choose a valid account to report.');
  }
  if (!safeChatId || !safeItemId) {
    throw new Error('A valid conversation is required to submit a report.');
  }
  if (!VALID_REPORT_REASONS.includes(reason)) {
    throw new Error('Choose a valid report reason.');
  }

  const chatSnapshot = await getDoc(doc(db, 'chats', safeChatId));
  if (!chatSnapshot.exists()) throw new Error('This conversation could not be found.');
  const chat = chatSnapshot.data();
  if (
    !Array.isArray(chat.participantIds) ||
    !chat.participantIds.includes(safeReporterId) ||
    !chat.participantIds.includes(safeReportedUserId) ||
    chat.itemId !== safeItemId
  ) {
    throw new Error('You can only report someone from a conversation you share.');
  }

  const safeDetails = sanitizePlainText(details, 1000, { multiline: true });
  const report = await addDoc(collection(db, 'userReports'), {
    reporterId: safeReporterId,
    reportedUserId: safeReportedUserId,
    chatId: safeChatId,
    itemId: safeItemId,
    reason,
    details: safeDetails,
    status: 'new',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return report.id;
};
