// Firebase Client Configuration
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
  // Small delay to ensure page is fully loaded
  await new Promise(resolve => setTimeout(resolve, 100));

  if (user) {
    const userRef = db.collection('users').doc(user.uid);
    let doc = await userRef.get();

    // Get user data safely
    let userData = {};
    if (doc.exists) {
      userData = doc.data();
    }

    if (!doc.exists) {
      // Preserve existing fullName and studentId if they exist
      await userRef.set({
        fullName: user.displayName || userData.fullName || "",
        email: user.email,
        role: userData.role || 'student',
        status: userData.status || "active",
        createdAt: userData.createdAt || Date.now(),
        rating: userData.rating || 0,
        ratingCount: userData.ratingCount || 0,
        totalListings: userData.totalListings || 0,
        totalSales: userData.totalSales || 0,
        studentId: userData.studentId || '',
        phone: userData.phone || '',
        department: userData.department || '',
        bio: userData.bio || '',
        preferredLocation: userData.preferredLocation || ''
      }, { merge: true });

      // Re-fetch after creation
      doc = await userRef.get();
      userData = doc.data();
    }

    // Sync localStorage with Firestore
    localStorage.setItem('uid', user.uid);
    localStorage.setItem('role', userData.role || 'student');
    localStorage.setItem('sellerStatus', userData.sellerStatus || 'none');
    localStorage.setItem('paymentRef', userData.paymentRef || '');

    // Debug: log role for verification
    console.log('User role from Firestore:', userData.role);

    // Show admin link if admin
    const adminLink = document.getElementById('admin-link');
    if (adminLink) {
      if (userData.role === 'admin') {
        console.log('Showing admin link');
        adminLink.style.display = 'flex';
        adminLink.style.alignItems = 'center';
      } else {
        console.log('Hiding admin link (role is:', userData.role, ')');
      }
    } else {
      console.log('Admin link element not found');
    }

    // Show mobile admin link if admin
    const mobileAdminLink = document.getElementById('mobile-admin-link');
    if (mobileAdminLink) {
      if (userData.role === 'admin') {
        mobileAdminLink.style.display = 'block';
      }
    }

    window.currentUser = user;
    updateNavbarForUser(user, userData);
  } else {
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

// Updated: accepts userData to avoid second Firestore read
function updateNavbarForUser(user, userData) {
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

  // Show admin links using Firestore role (not localStorage)
  const role = userData?.role || localStorage.getItem('role');
  const adminLink = document.getElementById('admin-link');
  const mobileAdminLink = document.getElementById('mobile-admin-link');
  if (role === 'admin') {
    if (adminLink) {
      adminLink.style.display = 'flex';
      adminLink.style.alignItems = 'center';
    }
    if (mobileAdminLink) mobileAdminLink.style.display = 'block';
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

// Utility: Format currency
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

// University Database (local fallback)
const universityDatabase = [
  'admin@africau.edu',
  'principal@africau.edu',
  'dean@africau.edu',
  'registrar@africau.edu',
  'finance@africau.edu',
  'student1@africau.edu',
  'student2@africau.edu',
  'student3@africau.edu',
  'student4@africau.edu',
  'student5@africau.edu',
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

// Check if user is allowed via Firestore
async function isAllowedUserInFirestore(email) {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase();

  try {
    const snapshot = await db.collection('allowed_users')
      .where('email', '==', normalizedEmail)
      .get();

    const isAllowed = !snapshot.empty;
    return isAllowed;
  } catch (error) {
    console.error('Error checking allowed users in Firestore:', error);
    return universityDatabase.includes(normalizedEmail);
  }
}

// Add user to allowed_users collection
async function addAllowedUser(email) {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase();

  try {
    const snapshot = await db.collection('allowed_users')
      .where('email', '==', normalizedEmail)
      .get();

    if (!snapshot.empty) return true;

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

// Validate Africa University email
async function isValidAUEmail(email) {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase();

  const hasValidDomain = normalizedEmail.endsWith('@africau.edu') || normalizedEmail.endsWith('@students.africau.edu');
  if (!hasValidDomain) return false;

  try {
    const isAllowed = await isAllowedUserInFirestore(normalizedEmail);
    if (isAllowed) return true;
  } catch (error) {
    console.error('Firestore check failed, using fallback:', error);
  }

  return universityDatabase.includes(normalizedEmail);
}

// Sync wrapper for backward compatibility
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
  isAllowedUserInFirestore,
  addAllowedUser,
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
      background: '#ffffff'
    });

    if (!result.isConfirmed) return;

    await auth.signOut();
    window.location.href = '/login';
  },
  toggleProfileMenu: function() {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) {
      dropdown.classList.toggle('show');
    }
  },
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
  addToUniversityDatabase: function(email) {
    if (!email) return false;
    const normalizedEmail = email.toLowerCase();
    if (!universityDatabase.includes(normalizedEmail)) {
      universityDatabase.push(normalizedEmail);
      return true;
    }
    return false;
  },
  // Notification functions
  requestNotificationPermission: async function() {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  },
  showMessageNotification: function(title, body, icon = '/favicon.png') {
    if (Notification.permission === 'granted' && document.hidden) {
      const notification = new Notification(title, {
        body: body,
        icon: icon,
        badge: '/favicon.png',
        tag: 'aubazaar-message',
        requireInteraction: false,
        silent: false
      });

      // Play notification sound
      this.playNotificationSound();

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      // Click handler to focus window
      notification.onclick = function() {
        window.focus();
        notification.close();
      };

      return notification;
    }
    return null;
  },
  playNotificationSound: function() {
    // Try to play a notification sound using Audio API
    try {
      // Create a simple beep sound
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      // Fallback: no sound if Web Audio API is not supported
      console.log('Audio notification not supported');
    }
  }
};
