const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Bulk-deletes real Firebase Auth accounts (not just Firestore docs) - the
// client SDK can only ever delete your OWN auth account, never someone
// else's, so admin's bulk "delete selected users" needs a server-side
// function with Admin SDK privileges to actually remove other people's
// login credentials, not just their Firestore data.
exports.deleteUsers = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const callerDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }

  const uids = request.data && request.data.uids;
  if (!Array.isArray(uids) || uids.length === 0) {
    throw new HttpsError('invalid-argument', 'uids must be a non-empty array.');
  }
  if (uids.includes(request.auth.uid)) {
    throw new HttpsError('invalid-argument', "You can't delete your own account this way.");
  }
  if (uids.length > 1000) {
    // admin.auth().deleteUsers() itself caps out at 1000 identifiers per
    // call - the client is expected to chunk larger selections into
    // batches and call this function once per chunk.
    throw new HttpsError('invalid-argument', 'Too many accounts at once (max 1000 per batch).');
  }

  const result = await admin.auth().deleteUsers(uids);
  return {
    successCount: result.successCount,
    failureCount: result.failureCount,
    errors: result.errors.map(e => ({ index: e.index, uid: uids[e.index], code: e.error.code, message: e.error.message }))
  };
});

// Fires for every new document in `messages` - this single trigger covers
// all real-time notification cases already built on top of the messages
// collection this session (chat messages, contact-reply, report outcomes,
// sale-claim notices, listing-removal notices), since they all write into
// this same collection rather than a separate notifications system.
exports.onNewMessage = onDocumentCreated('messages/{messageId}', async (event) => {
  const message = event.data.data();
  if (!message || !message.receiverId || !message.senderId) return;

  const receiverDoc = await db.collection('users').doc(message.receiverId).get();
  const receiverData = receiverDoc.data() || {};

  // A receiver can have push enabled on multiple devices - collect every
  // registered token so the notification reaches all of them, not just the
  // most recently enabled one. Also honour the legacy single-token field
  // so accounts that enabled before this change keep working.
  const tokenSet = new Set();
  if (Array.isArray(receiverData.fcmTokens)) {
    receiverData.fcmTokens.forEach(t => { if (t) tokenSet.add(t); });
  }
  if (receiverData.fcmToken) tokenSet.add(receiverData.fcmToken);
  const tokens = [...tokenSet];
  if (tokens.length === 0) return; // receiver never enabled push on any device

  const senderDoc = await db.collection('users').doc(message.senderId).get();
  const senderName = (senderDoc.data() && senderDoc.data().fullName) || 'Someone';

  const body = message.type === 'sale_claim'
    ? message.content
    : (message.content && message.content.length > 100 ? message.content.slice(0, 100) + '...' : message.content) || 'Sent you a message';

  let response;
  try {
    response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: `New message from ${senderName}`,
        body
      },
      webpush: {
        notification: {
          icon: 'https://aubazaar-12d35.web.app/favicon.png'
        },
        fcmOptions: {
          link: 'https://aubazaar-12d35.web.app/messages'
        }
      }
    });
  } catch (error) {
    console.error('Failed to send push notifications:', error);
    return;
  }

  // Prune any tokens FCM reports as dead (site data cleared, app removed,
  // etc.) so we stop trying to reach them on every future message.
  const deadTokens = [];
  response.responses.forEach((r, i) => {
    if (!r.success && r.error && (
      r.error.code === 'messaging/registration-token-not-registered' ||
      r.error.code === 'messaging/invalid-registration-token' ||
      r.error.code === 'messaging/invalid-argument'
    )) {
      deadTokens.push(tokens[i]);
    }
  });
  if (deadTokens.length > 0) {
    const updates = { fcmTokens: admin.firestore.FieldValue.arrayRemove(...deadTokens) };
    // Also drop the legacy single-token field if that's the one that died.
    if (receiverData.fcmToken && deadTokens.includes(receiverData.fcmToken)) {
      updates.fcmToken = admin.firestore.FieldValue.delete();
    }
    await db.collection('users').doc(message.receiverId).update(updates).catch(() => {});
  }
});
