require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve images from Images folder
app.use('/images', express.static(path.join(__dirname, 'Images')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'aubazaar_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Routes
const authRoutes = require('./routes/auth');
const listingRoutes = require('./routes/listings');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const adminRoutes = require('./routes/admin');
const alertRoutes = require('./routes/alerts');

app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/alerts', alertRoutes);

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/marketplace', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'marketplace.html'));
});

app.get('/listing/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'listing-detail.html'));
});

app.get('/sell', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sell.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/messages', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'messages.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/become-seller', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'become-seller.html'));
});

app.get('/setup-allowed-users', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'setup-allowed-users.html'));
});

app.get('/setup-allowed-users', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'setup-allowed-users.html'));
});

app.get('/top-sellers', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'top-sellers.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get('/test-firebase', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-firebase.html'));
});

app.listen(PORT, () => {
  console.log(`AUBazaar server running on http://localhost:${PORT}`);
});

module.exports = app;
