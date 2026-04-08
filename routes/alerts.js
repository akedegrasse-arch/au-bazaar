const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const serviceAccount = require('../serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://aubazaar-4b39e-default-rtdb.firebaseio.com"
  });
}

const db = admin.firestore();

// AI Alert Matching Function
function matchesAlert(listing, alert) {
  // Check categories
  if (alert.categories && alert.categories.length > 0) {
    const listingCategory = listing.category || '';
    const categoryMatch = alert.categories.some(cat =>
      listingCategory.toLowerCase().includes(cat.toLowerCase().trim())
    );
    if (!categoryMatch) return false;
  }

  // Check keywords in title and description
  if (alert.keywords && alert.keywords.length > 0) {
    const searchText = `${listing.title || ''} ${listing.description || ''}`.toLowerCase();
    const keywordMatch = alert.keywords.some(keyword =>
      searchText.includes(keyword.toLowerCase().trim())
    );
    if (!keywordMatch) return false;
  }

  // Check price range
  const price = parseFloat(listing.price) || 0;
  if (alert.minPrice && price < alert.minPrice) return false;
  if (alert.maxPrice && price > alert.maxPrice) return false;

  return true;
}

// Monitor new listings and send alerts
async function monitorListings() {
  try {
    // Listen for all user alerts changes in real-time
    db.collection('userAlerts').onSnapshot((alertsSnapshot) => {
      const userAlerts = {};
      
      alertsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.alerts && Array.isArray(data.alerts)) {
          userAlerts[doc.id] = data.alerts.filter(alert => alert.active);
        }
      });
      
      // Store for use by listings listener
      globalUserAlerts = userAlerts;
      console.log('User alerts updated:', Object.keys(userAlerts).length, 'users');
    });

    // Listen for new listings in real-time
    const listingsRef = db.collection('listings');
    listingsRef.onSnapshot(async (snapshot) => {
      const changes = snapshot.docChanges();

      for (const change of changes) {
        if (change.type === 'added') {
          const listing = { id: change.doc.id, ...change.doc.data() };
          
          // Use the latest user alerts
          const currentAlerts = globalUserAlerts || {};
          
          // Check against all user alerts
          for (const [userId, alerts] of Object.entries(currentAlerts)) {
            for (const alert of alerts) {
              if (matchesAlert(listing, alert)) {
                // Create notification for this user
                await createAlertNotification(userId, alert, listing);
              }
            }
          }
        }
      }
    });

    console.log('AI Alert monitoring started');
  } catch (error) {
    console.error('Error in alert monitoring:', error);
  }
}

let globalUserAlerts = {};

// Create alert notification
async function createAlertNotification(userId, alert, listing) {
  try {
    const notification = {
      type: 'alert',
      title: `New match for "${alert.name}"`,
      message: `"${listing.title}" matches your alert criteria`,
      listingId: listing.id,
      alertId: alert.name,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false
    };

    // Add to user's notifications
    await db.collection('users').doc(userId).collection('notifications').add(notification);

    // Also send browser notification if user has FCM token
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (userData && userData.fcmToken) {
      const message = {
        notification: {
          title: notification.title,
          body: notification.message
        },
        data: {
          type: 'alert',
          listingId: listing.id,
          alertName: alert.name
        },
        token: userData.fcmToken
      };

      try {
        await admin.messaging().send(message);
        console.log('Alert notification sent to user:', userId);
      } catch (fcmError) {
        console.error('Error sending FCM notification:', fcmError);
      }
    }
  } catch (error) {
    console.error('Error creating alert notification:', error);
  }
}

// Start monitoring when the module is loaded
monitorListings();

// Routes
router.get('/test', (req, res) => {
  res.json({ message: 'AI Alerts system is running' });
});

// Get user's alerts
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const alertsDoc = await db.collection('userAlerts').doc(userId).get();

    if (alertsDoc.exists) {
      res.json({ alerts: alertsDoc.data().alerts || [] });
    } else {
      res.json({ alerts: [] });
    }
  } catch (error) {
    console.error('Error fetching user alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Create or update user alerts
router.post('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { alerts } = req.body;

    if (!Array.isArray(alerts)) {
      return res.status(400).json({ error: 'Alerts must be an array' });
    }

    await db.collection('userAlerts').doc(userId).set({
      alerts: alerts,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: 'Alerts updated successfully' });
  } catch (error) {
    console.error('Error updating user alerts:', error);
    res.status(500).json({ error: 'Failed to update alerts', details: error.message || String(error) });
  }
});

// Delete user alert
router.delete('/user/:userId/alert/:alertIndex', async (req, res) => {
  try {
    const { userId, alertIndex } = req.params;
    const index = parseInt(alertIndex);

    const alertsDoc = await db.collection('userAlerts').doc(userId).get();
    if (!alertsDoc.exists) {
      return res.status(404).json({ error: 'User alerts not found' });
    }

    const alerts = alertsDoc.data().alerts || [];
    if (index < 0 || index >= alerts.length) {
      return res.status(400).json({ error: 'Invalid alert index' });
    }

    alerts.splice(index, 1);

    await db.collection('userAlerts').doc(userId).update({
      alerts: alerts,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: 'Alert deleted successfully' });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

module.exports = router;