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

// Auth state observer with automatic user document creation
auth.onAuthStateChanged(async (user) => {
  if (user) {
    // User is signed in - check and create user document if missing
    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();
    
    if (!doc.exists) {
      // Create new document if doesn't exist
      await userRef.set({
        fullName: user.displayName || "",
        email: user.email,
        role: "student",
        status: "active",
        createdAt: Date.now(),
        rating: 0,
        ratingCount: 0,
        totalListings: 0,
        totalSales: 0
      }, { merge: true });
    }
    
    // ALWAYS sync localStorage with Firestore user data on login
    const userData = doc.exists ? doc.data() : {};
    localStorage.setItem('uid', user.uid);
    localStorage.setItem('role', userData.role || 'student');
    localStorage.setItem('sellerStatus', userData.sellerStatus || 'none');
    localStorage.setItem('paymentRef', userData.paymentRef || '');
    
    // Check user role and show admin link if admin
    const adminLink = document.getElementById('admin-link');
    if (adminLink && userData && userData.role === 'admin') {
      adminLink.style.display = 'block';
    }
    
    // User is signed in
    window.currentUser = user;
    updateNavbarForUser(user);
  } else {
    // User is signed out
    window.currentUser = null;
    updateNavbarForGuest();
  }
});

// Function to resend verification email
async function resendVerificationEmail() {
  const user = firebase.auth().currentUser;
  if (user) {
    try {
      await user.sendEmailVerification();
      alert('Verification email sent! Please check your inbox.');
    } catch (error) {
      alert('Error sending email: ' + error.message);
    }
  }
}

function updateNavbarForUser(user) {
  const guestNav = document.getElementById('guest-nav');
  const userNav = document.getElementById('user-nav');
  const userNameEl = document.getElementById('nav-user-name');
  const userAvatarEl = document.getElementById('nav-user-avatar');
  const dropdownNameEl = document.getElementById('dropdown-name');
  const dropdownEmailEl = document.getElementById('dropdown-email');
  
  if (guestNav) guestNav.style.display = 'none';
  if (userNav) userNav.style.display = 'flex';
  
  // Update mobile nav
  const mobileGuestNav = document.getElementById('mobile-guest-nav');
  const mobileUserNav = document.getElementById('mobile-user-nav');
  if (mobileGuestNav) mobileGuestNav.style.display = 'none';
  if (mobileUserNav) mobileUserNav.style.display = 'block';
  
  // Check for admin and show mobile admin link
  const role = localStorage.getItem('role');
  const mobileAdminLink = document.getElementById('mobile-admin-link');
  if (mobileAdminLink && role === 'admin') {
    mobileAdminLink.style.display = 'block';
  }
  
  if (userNameEl) {
    const displayName = user.displayName || user.email.split('@')[0];
    userNameEl.textContent = displayName;
  }
  
  if (dropdownNameEl) {
    const displayName = user.displayName || user.email.split('@')[0];
    dropdownNameEl.textContent = displayName;
  }
  
  if (dropdownEmailEl) {
    dropdownEmailEl.textContent = user.email;
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
  
  // Update mobile nav
  const mobileGuestNav = document.getElementById('mobile-guest-nav');
  const mobileUserNav = document.getElementById('mobile-user-nav');
  if (mobileGuestNav) mobileGuestNav.style.display = 'block';
  if (mobileUserNav) mobileUserNav.style.display = 'none';
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

// Simulated University Database (for demo purposes)
// Now using Firestore 'allowed_users' collection - see isAllowedUserInFirestore()
const universityDatabase = [
  // Faculty
  'admin@africau.edu',
  'principal@africau.edu',
  'dean@africau.edu',
  // Staff
  'registrar@africau.edu',
  'finance@africau.edu',
  // Students
  'student1@africau.edu',
  'student2@africau.edu',
  'student3@africau.edu',
  'student4@africau.edu',
  'student5@africau.edu',
  // Sample names
  'akek@africau.edu',
  'mjmatongo@africau.edu',
  'gnagnej@africau.edu',
  'magrimussat@africau.edu',
  'ndlovu@africau.edu',
  'allaj@africau.edu',
  'allk@africau.edu',
  'zulu@africau.edu',
  'sibanda@africau.edu',
  'josuek@africau.edu',
  'sessk@africau.edu',
  'mutandwa@africau.edu',
  'gumede@africau.edu'
];

// NEW: Check if user is allowed via Firestore (real database approach)
async function isAllowedUserInFirestore(email) {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase();
  
  console.log('Checking Firestore allowed_users for:', normalizedEmail);
  
  try {
    // Query Firestore 'allowed_users' collection
    const snapshot = await db.collection('allowed_users')
      .where('email', '==', normalizedEmail)
      .get();
    
    const isAllowed = !snapshot.empty;
    console.log('Firestore result for', normalizedEmail, ':', isAllowed);
    return isAllowed;
  } catch (error) {
    console.error('Error checking allowed users in Firestore:', error);
    // Fallback to local database if Firestore fails
    return universityDatabase.includes(normalizedEmail);
  }
}

// NEW: Add user to allowed_users collection (for registration)
async function addAllowedUser(email) {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase();
  
  try {
    // Check if already exists
    const snapshot = await db.collection('allowed_users')
      .where('email', '==', normalizedEmail)
      .get();
    
    if (!snapshot.empty) return true; // Already exists
    
    // Add new allowed user
    await db.collection('allowed_users').add({
      email: normalizedEmail,
      addedAt: Date.now(),
      addedBy: 'system'
    });
    
    return true;
  } catch (error) {
    console.error('Error adding allowed user:', error);
    return false;
  }
}


// Utility: Validate Africa University email (now uses Firestore allowed_users collection)
async function isValidAUEmail(email) {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase();
  
  // First check domain
  const hasValidDomain = normalizedEmail.endsWith('@africau.edu') || normalizedEmail.endsWith('@students.africau.edu');
  if (!hasValidDomain) {
    console.log('Invalid domain for:', email);
    return false;
  }
  
  // Check Firestore allowed_users collection
  try {
    const isAllowed = await isAllowedUserInFirestore(normalizedEmail);
    if (isAllowed) {
      console.log('Email allowed (Firestore):', normalizedEmail);
      return true;
    }
  } catch (error) {
    console.error('Firestore check failed, using fallback:', error);
  }
  
  // Fallback to local database if Firestore has no data yet
  const isInLocalDb = universityDatabase.includes(normalizedEmail);
  console.log('Email check result (local):', normalizedEmail, '=', isInLocalDb);
  return isInLocalDb;
}

// Sync wrapper for backward compatibility (returns false - use async version)
function isValidAUEmailSync(email) {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase();
  const hasValidDomain = normalizedEmail.endsWith('@africau.edu') || normalizedEmail.endsWith('@students.africau.edu');
  return hasValidDomain && universityDatabase.includes(normalizedEmail);
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
  getCategoryIcon,
  // New: Firestore-based allowed users
  isAllowedUserInFirestore,
  addAllowedUser,
  // Logout function
  handleLogout: async function() {
    const result = await Swal.fire({
      title: '<span style="color:#d32f2f;font-weight:bold;">Logout?</span>',
      text: 'Are you sure you want to logout?',
      icon: 'warning',
      iconColor: '#d32f2f',
      showCancelButton: true,
      confirmButtonColor: '#d32f2f',
      cancelButtonColor: '#6c757d',
      confirmButtonText: '<span style="font-weight:600">Yes, Logout</span>',
      cancelButtonText: 'Cancel',
      background: '#ffffff',
      customClass: {
        popup: 'logout-swal-popup',
        confirmButton: 'logout-confirm-btn',
        cancelButton: 'logout-cancel-btn'
      }
    });
    
    if (!result.isConfirmed) return;
    
    await auth.signOut();
    window.location.href = '/login';
  },
  // Toggle profile dropdown menu
  toggleProfileMenu: function() {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) {
      dropdown.classList.toggle('show');
    }
  },
  // Check seller status before going to sell page
  checkAndGoToSell: function(event) {
    if (event) event.preventDefault();
    
    const status = localStorage.getItem('sellerStatus');
    
    if (status === 'approved') {
      window.location.href = '/sell';
    } else if (status === 'pending') {
      Swal.fire({
        icon: 'info',
        title: 'Pending Approval',
        text: 'Your seller account is waiting for admin approval.',
        confirmButtonText: 'View Dashboard'
      }).then(() => {
        window.location.href = '/dashboard';
      });
    } else {
      Swal.fire({
        icon: 'warning',
        title: 'Become a Seller',
        text: 'You need to become a seller before posting items.',
        showCancelButton: true,
        confirmButtonText: 'Become a Seller',
        cancelButtonText: 'Later'
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.href = '/become-seller';
        }
      });
    }
  },
  // Add to university database (local fallback)
  addToUniversityDatabase: function(email) {
    if (!email) return false;
    const normalizedEmail = email.toLowerCase();
    if (!universityDatabase.includes(normalizedEmail)) {
      universityDatabase.push(normalizedEmail);
      return true;
    }
    return false;
  }
};
