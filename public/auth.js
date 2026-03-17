const express = require('express');
const router = express.Router();

const { getDb } = require('../config/firebase');
const db = getDb();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { uid, email, fullName, studentId, role } = req.body;

    if (!uid || !email) {
      return res.status(400).json({
        success: false,
        message: 'UID and email are required'
      });
    }

    // Validate Africa University email
    if (!email.endsWith('@africau.edu') && !email.endsWith('@students.africau.edu')) {
      return res.status(400).json({
        success: false,
        message: 'Only Africa University email addresses are allowed'
      });
    }

    const userRef = db.collection('users').doc(uid);
    const existingUser = await userRef.get();

    if (existingUser.exists) {
      return res.json({
        success: true,
        message: 'User already exists in Firestore'
      });
    }

    await userRef.set({
      email,
      fullName: fullName || '',
      studentId: studentId || '',
      role: role || 'student',
      status: 'active',
      rating: 0,
      ratingCount: 0,
      totalListings: 0,
      totalSales: 0,
      favorites: [],
      createdAt: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'User registered and saved to Firestore'
    });

  } catch (error) {
    console.error('REGISTER ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, uid } = req.body;

    if (!email.endsWith('@africau.edu') && !email.endsWith('@students.africau.edu')) {
      return res.status(400).json({
        success: false,
        message: 'Only Africa University email addresses are allowed'
      });
    }
    
    // Ensure user document exists in Firestore
    if (uid) {
      const userRef = db.collection('users').doc(uid);
      const existingUser = await userRef.get();
      
      if (!existingUser.exists) {
        // Create user document if it doesn't exist
        await userRef.set({
          email,
          fullName: '',
          studentId: '',
          role: 'student',
          status: 'active',
          rating: 0,
          ratingCount: 0,
          totalListings: 0,
          totalSales: 0,
          favorites: [],
          createdAt: new Date()
        });
      }
    }

    res.json({
      success: true,
      message: 'Login validated'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const { email } = req.body;
    const isValid = email.endsWith('@africau.edu') || email.endsWith('@students.africau.edu');
    
    res.json({
      success: true,
      isValid,
      message: isValid ? 'Valid Africa University email' : 'Invalid email domain'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
