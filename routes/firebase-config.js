// Firebase Client Configuration
// Replace these values with your actual Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyD3Vu-kHTGeReLgBPyUQZfC629gau_4qys",
  authDomain: "aubazaar-12d35.firebaseapp.com",
  projectId: "aubazaar-12d35",
  storageBucket: "aubazaar-12d35.firebasestorage.app",
  messagingSenderId: "711155540514",
  appId: "1:711155540514:web:26c64d452b9f62d68de07b"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Auth state observer
auth.onAuthStateChanged((user) => {
  if (user) {
    // User is signed in
    window.currentUser = user;
    updateNavbarForUser(user);
  } else {
    // User is signed out
    window.currentUser = null;
    updateNavbarForGuest();
  }
});

function updateNavbarForUser(user) {
  const guestNav = document.getElementById('guest-nav');
  const userNav = document.getElementById('user-nav');
  const userNameEl = document.getElementById('nav-user-name');
  const userAvatarEl = document.getElementById('nav-user-avatar');
  
  if (guestNav) guestNav.style.display = 'none';
  if (userNav) userNav.style.display = 'flex';
  
  if (userNameEl) {
    const displayName = user.displayName || user.email.split('@')[0];
    userNameEl.textContent = displayName;
  }
  
  if (userAvatarEl) {
    const initials = (user.displayName || user.email).charAt(0).toUpperCase();
    userAvatarEl.textContent = initials;
  }
}

function updateNavbarForGuest() {
  const guestNav = document.getElementById('guest-nav');
  const userNav = document.getElementById('user-nav');
  
  if (guestNav) guestNav.style.display = 'flex';
  if (userNav) userNav.style.display = 'none';
}

// Utility: Require authentication
function requireAuth(redirectUrl = '/login') {
  return new Promise((resolve, reject) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      if (user) {
        resolve(user);
      } else {
        window.location.href = redirectUrl;
        reject(new Error('Not authenticated'));
      }
    });
  });
}

// Utility: Get current user data from Firestore
async function getCurrentUserData() {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    const doc = await db.collection('users').doc(user.uid).get();
    if (doc.exists) {
      return { id: user.uid, ...doc.data() };
    }
    return { id: user.uid, email: user.email, displayName: user.displayName };
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
}

// Utility: Format currency (USD for international, can be changed to ZWL)
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

// Utility: Format date
function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Utility: Show toast notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container') || createToastContainer();
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 4000);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

// Utility: Validate Africa University email
function isValidAUEmail(email) {
  return email.endsWith('@africau.edu') || email.endsWith('@students.africau.edu');
}

// Utility: Get condition label
function getConditionLabel(condition) {
  const labels = {
    'new': 'New',
    'like-new': 'Like New',
    'good': 'Good',
    'fair': 'Fair',
    'poor': 'Poor'
  };
  return labels[condition] || condition;
}

// Utility: Get category icon
function getCategoryIcon(category) {
  const icons = {
    'textbooks': '📚',
    'electronics': '💻',
    'clothing': '👕',
    'dorm-essentials': '🛏️',
    'sports': '⚽',
    'services': '🤝',
    'food': '🍽️',
    'other': '📦'
  };
  return icons[category] || '📦';
}

window.AUBazaar = {
  auth,
  db,
  storage,
  requireAuth,
  getCurrentUserData,
  formatCurrency,
  formatDate,
  showToast,
  isValidAUEmail,
  getConditionLabel,
  getCategoryIcon
};
