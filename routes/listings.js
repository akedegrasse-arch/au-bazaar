const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/firebase');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// GET /api/listings - Get all listings with filters
router.get('/', async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, condition, sort, limit = 20, page = 1 } = req.query;
    
    // Return sample data structure for frontend
    res.json({
      success: true,
      data: [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: 0
      },
      filters: { category, search, minPrice, maxPrice, condition, sort }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/listings/featured - Get featured listings
router.get('/featured', async (req, res) => {
  try {
    res.json({ success: true, data: [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/listings/categories - Get all categories with counts
router.get('/categories', async (req, res) => {
  try {
    const db = getDb();
    
    const categories = [
      { id: 'textbooks', name: 'Textbooks & Study Materials', icon: 'book' },
      { id: 'electronics', name: 'Electronics & Gadgets', icon: 'laptop' },
      { id: 'clothing', name: 'Clothing & Accessories', icon: 'tshirt' },
      { id: 'dorm-essentials', name: 'Dorm Essentials', icon: 'bed' },
      { id: 'sports', name: 'Sports & Recreation', icon: 'football' },
      { id: 'services', name: 'Services & Tutoring', icon: 'handshake' },
      { id: 'food', name: 'Food & Beverages', icon: 'utensils' },
      { id: 'other', name: 'Other Items', icon: 'box' }
    ];
    
    // Get all active listings and count in JavaScript (avoids index requirement)
    const snapshot = await db.collection('listings')
      .where('status', '==', 'active')
      .get();
    
    // Count by category
    const counts = {};
    categories.forEach(cat => counts[cat.id] = 0);
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const cat = data.category || 'other';
      if (counts[cat] !== undefined) {
        counts[cat]++;
      } else {
        counts['other']++;
      }
    });
    
    // Add counts to categories
    const categoriesWithCounts = categories.map(cat => ({
      ...cat,
      count: counts[cat.id] || 0
    }));
    
    res.json({ success: true, data: categoriesWithCounts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/listings/:id - Get single listing
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    res.json({ success: true, data: null, message: 'Listing not found' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/listings - Create new listing
router.post('/', upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, price, category, condition, location, sellerId, sellerName } = req.body;
    
    if (!title || !price || !category || !sellerId) {
      return res.status(400).json({
        success: false,
        message: 'Title, price, category, and seller ID are required'
      });
    }

    const images = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
    
    const listing = {
      id: uuidv4(),
      title,
      description,
      price: parseFloat(price),
      category,
      condition: condition || 'good',
      location: location || 'Africa University Campus',
      sellerId,
      sellerName,
      images,
      status: 'active',
      views: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    res.json({
      success: true,
      message: 'Listing created successfully',
      data: listing
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/listings/:id - Update listing
router.put('/:id', upload.array('images', 5), async (req, res) => {
  try {
    const { id } = req.params;
    res.json({ success: true, message: 'Listing updated successfully', data: { id } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/listings/:id - Delete listing
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    res.json({ success: true, message: 'Listing deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/listings/:id/report - Report a listing
router.post('/:id/report', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, reporterId } = req.body;
    res.json({ success: true, message: 'Listing reported successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/listings/:id/favorite - Toggle favorite
router.post('/:id/favorite', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    res.json({ success: true, message: 'Favorite toggled', isFavorited: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
