const express = require('express');
const router = express.Router();

// ✅ Correct way to import your firebase.js
const { getDb } = require('../config/firebase'); // adjust path if needed
const db = getDb();

// GET /api/users/stats - Get public platform stats (no auth required)
router.get('/stats', async (req, res) => {
  try {
    const usersSnap = await db.collection('users').get();
    const listingsSnap = await db.collection('listings').where('status', '==', 'active').get();
    
    res.json({
      success: true,
      data: {
        totalUsers: usersSnap.size,
        activeListings: listingsSnap.size
      }
    });
  } catch (error) {
    console.error('STATS ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// GET /api/users/:id - Get user profile
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const userDoc = await db.collection('users').doc(id).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: userDoc.data()
    });

  } catch (error) {
    console.error('GET USER ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// PUT /api/users/:id - Update user profile
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // ✅ Use set with merge to avoid crash if doc doesn't exist
    await db.collection('users').doc(id).set(updates, { merge: true });

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('UPDATE USER ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// GET /api/users/:id/listings
router.get('/:id/listings', async (req, res) => {
  try {
    const { id } = req.params;

    const snapshot = await db
      .collection('listings')
      .where('ownerId', '==', id)
      .get();

    const listings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      data: listings
    });

  } catch (error) {
    console.error('GET LISTINGS ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// GET /api/users/:id/favorites
router.get('/:id/favorites', async (req, res) => {
  try {
    const { id } = req.params;

    const snapshot = await db
      .collection('favorites')
      .where('userId', '==', id)
      .get();

    const favorites = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.json({
      success: true,
      data: favorites
    });

  } catch (error) {
    console.error('GET FAVORITES ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// POST /api/users/:id/rate
router.post('/:id/rate', async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment, raterId } = req.body;

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    await db.collection('ratings').add({
      userId: id,
      rating,
      comment,
      raterId,
      createdAt: new Date()
    });

    res.json({
      success: true,
      message: 'Rating submitted successfully'
    });

  } catch (error) {
    console.error('RATE USER ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;