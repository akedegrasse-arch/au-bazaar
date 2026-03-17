const express = require('express');
const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, studentId, role } = req.body;

    // Validate Africa University email
    if (!email.endsWith('@africau.edu') && !email.endsWith('@students.africau.edu')) {
      return res.status(400).json({
        success: false,
        message: 'Only Africa University email addresses are allowed (@africau.edu or @students.africau.edu)'
      });
    }

    // Return success - actual Firebase auth happens on frontend
    res.json({
      success: true,
      message: 'Registration data validated. Please complete registration with Firebase.',
      data: { email, fullName, studentId, role }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email.endsWith('@africau.edu') && !email.endsWith('@students.africau.edu')) {
      return res.status(400).json({
        success: false,
        message: 'Only Africa University email addresses are allowed'
      });
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
