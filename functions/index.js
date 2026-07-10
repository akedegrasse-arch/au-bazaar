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
        // High urgency + a day-long TTL so the push is delivered promptly
        // and still arrives if the device was briefly offline.
        headers: { Urgency: 'high', TTL: '86400' },
        notification: {
          icon: 'https://aubazaar-12d35.web.app/favicon.png',
          badge: 'https://aubazaar-12d35.web.app/favicon.png',
          // Group per sender and renotify so a second/third message from the
          // same person still alerts, instead of silently replacing the last
          // one (the cause of "it only showed once").
          tag: `aubazaar-${message.senderId}`,
          renotify: true,
          requireInteraction: false
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
    // Only prune tokens that are genuinely dead. Deliberately NOT pruning on
    // 'messaging/invalid-argument' - that can be raised for a bad payload
    // rather than a bad token, and pruning on it would wrongly wipe every
    // valid token whenever a payload problem occurs.
    if (!r.success && r.error && (
      r.error.code === 'messaging/registration-token-not-registered' ||
      r.error.code === 'messaging/invalid-registration-token'
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

// Push a notification to EVERY admin's every enabled device. Used for events
// that don't live in the `messages` collection (new reports, new contact
// messages), so they'd otherwise only show up as a badge count in the admin
// panel with no alert. Reuses the same multi-device token model + dead-token
// pruning as onNewMessage.
async function notifyAdmins(title, body, link, tag) {
  const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();

  // token -> { uid, legacy } so a dead token can be pruned from the right
  // admin's doc (and from the legacy single-token field if that's the one).
  const tokenInfo = new Map();
  adminsSnap.forEach((doc) => {
    const d = doc.data() || {};
    if (Array.isArray(d.fcmTokens)) {
      d.fcmTokens.forEach((t) => { if (t && !tokenInfo.has(t)) tokenInfo.set(t, { uid: doc.id, legacy: false }); });
    }
    if (d.fcmToken && !tokenInfo.has(d.fcmToken)) tokenInfo.set(d.fcmToken, { uid: doc.id, legacy: true });
  });

  const tokens = [...tokenInfo.keys()];
  if (tokens.length === 0) return; // no admin has push enabled on any device

  let response;
  try {
    response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: {
        headers: { Urgency: 'high', TTL: '86400' },
        notification: {
          icon: 'https://aubazaar-12d35.web.app/favicon.png',
          badge: 'https://aubazaar-12d35.web.app/favicon.png',
          tag,
          renotify: true,
          requireInteraction: false
        },
        fcmOptions: { link }
      }
    });
  } catch (error) {
    console.error('Failed to notify admins:', error);
    return;
  }

  // Prune dead tokens, grouped by the admin doc that owns them.
  const pruneByUid = {};
  response.responses.forEach((r, i) => {
    if (!r.success && r.error && (
      r.error.code === 'messaging/registration-token-not-registered' ||
      r.error.code === 'messaging/invalid-registration-token'
    )) {
      const info = tokenInfo.get(tokens[i]);
      const bucket = pruneByUid[info.uid] || (pruneByUid[info.uid] = { arr: [], legacy: false });
      if (info.legacy) bucket.legacy = true; else bucket.arr.push(tokens[i]);
    }
  });
  await Promise.all(Object.entries(pruneByUid).map(([uid, bucket]) => {
    const updates = {};
    if (bucket.arr.length) updates.fcmTokens = admin.firestore.FieldValue.arrayRemove(...bucket.arr);
    if (bucket.legacy) updates.fcmToken = admin.firestore.FieldValue.delete();
    return Object.keys(updates).length
      ? db.collection('users').doc(uid).update(updates).catch(() => {})
      : null;
  }));
}

// New report filed -> alert every admin (reports live in their own
// collection, so onNewMessage doesn't cover them).
exports.onNewReport = onDocumentCreated('reports/{reportId}', async (event) => {
  const report = event.data && event.data.data();
  if (!report) return;
  const kind = report.reportType === 'user' ? 'user' : 'listing';
  const reason = report.reason ? ` (${report.reason})` : '';
  await notifyAdmins(
    'New report filed',
    `A ${kind} was reported${reason}. Tap to review in the admin panel.`,
    'https://aubazaar-12d35.web.app/admin',
    'aubazaar-admin-report-' + event.params.reportId
  );
});

// New contact-form message -> alert every admin.
exports.onNewContactMessage = onDocumentCreated('contact_messages/{messageId}', async (event) => {
  const msg = event.data && event.data.data();
  if (!msg) return;
  const subject = msg.subject ? `"${msg.subject}"` : 'a message';
  await notifyAdmins(
    'New contact message',
    `${msg.email || 'Someone'} sent ${subject}. Tap to read it in the admin panel.`,
    'https://aubazaar-12d35.web.app/admin',
    'aubazaar-admin-contact-' + event.params.messageId
  );
});

// New listing that tripped the keyword filter -> alert every admin, so a
// suspicious posting doesn't just sit as a badge until someone opens the
// panel. Fires on creation (a fresh post); the function runs for every new
// listing but returns immediately unless it was flagged.
exports.onFlaggedListing = onDocumentCreated('listings/{listingId}', async (event) => {
  const listing = event.data && event.data.data();
  if (!listing || !listing.flaggedForReview) return;
  const terms = (Array.isArray(listing.flaggedTerms) && listing.flaggedTerms.length)
    ? ` (matched: ${listing.flaggedTerms.join(', ')})`
    : '';
  const title = listing.title ? `"${listing.title}"` : 'A listing';
  await notifyAdmins(
    'Listing flagged for review',
    `${title} may violate policy${terms}. Tap to review it in the admin panel.`,
    'https://aubazaar-12d35.web.app/admin',
    'aubazaar-admin-flagged-' + event.params.listingId
  );
});
