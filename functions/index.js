const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Fires for every new document in `messages` - this single trigger covers
// all real-time notification cases already built on top of the messages
// collection this session (chat messages, contact-reply, report outcomes,
// sale-claim notices, listing-removal notices), since they all write into
// this same collection rather than a separate notifications system.
exports.onNewMessage = onDocumentCreated('messages/{messageId}', async (event) => {
  const message = event.data.data();
  if (!message || !message.receiverId || !message.senderId) return;

  const receiverDoc = await db.collection('users').doc(message.receiverId).get();
  const receiverData = receiverDoc.data();
  const fcmToken = receiverData && receiverData.fcmToken;
  if (!fcmToken) return; // receiver never enabled push notifications

  const senderDoc = await db.collection('users').doc(message.senderId).get();
  const senderName = (senderDoc.data() && senderDoc.data().fullName) || 'Someone';

  const body = message.type === 'sale_claim'
    ? message.content
    : (message.content && message.content.length > 100 ? message.content.slice(0, 100) + '...' : message.content) || 'Sent you a message';

  try {
    await admin.messaging().send({
      token: fcmToken,
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
    // Token is stale/invalid (e.g. user cleared site data) - clear it so
    // we stop trying to send to a dead token every time.
    if (error.code === 'messaging/registration-token-not-registered') {
      await db.collection('users').doc(message.receiverId).update({ fcmToken: admin.firestore.FieldValue.delete() });
    } else {
      console.error('Failed to send push notification:', error);
    }
  }
});
