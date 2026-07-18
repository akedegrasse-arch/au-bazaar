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

// Offline data cache. Keep a local copy of everything the app has already
// loaded, so previously-seen listings/messages still work with no connection,
// and actions taken offline (post, message, mark sold) are queued and
// auto-synced the moment the connection returns. Must be enabled before any
// other Firestore call runs.
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  // 'failed-precondition' = another tab already holds the cache;
  // 'unimplemented' = a browser without IndexedDB. Either way the app still
  // works normally online - it just won't have the offline cache.
  console.warn('Firestore offline cache unavailable:', err && err.code);
});

// PWA installability - injected here rather than added to every page's
// <head> individually. Needs both a manifest link and a registered
// service worker present to qualify for the browser's install prompt.
if (!document.querySelector('link[rel="manifest"]')) {
  const manifestLink = document.createElement('link');
  manifestLink.rel = 'manifest';
  manifestLink.href = '/manifest.json';
  document.head.appendChild(manifestLink);

  const themeColor = document.createElement('meta');
  themeColor.name = 'theme-color';
  themeColor.content = '#d32f2f';
  document.head.appendChild(themeColor);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => {});
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  // The browser decides install-eligibility asynchronously after page
  // load, so a UI checking canInstallApp() on first render can miss it -
  // this lets that UI re-check once it's actually available.
  window.dispatchEvent(new Event('aubazaar:installavailable'));
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
});

// Push notifications (real, work even with the app closed - via a Cloud
// Function that fires on every new `messages` doc). Loaded dynamically
// here rather than added to every page's <script> tags individually.
// PASTE THE REAL KEY FROM Firebase Console -> Project Settings ->
// Cloud Messaging -> Web configuration -> Web Push certificates.
// Push notifications will silently no-op until this is a real key.
const FCM_VAPID_KEY = 'BA3nv6n-j381RpQ1R9dgEWBguDJJQwhhyEFCy-51GCA-d2pXF5FU3mfzKXS6T9RPBY7wSk65WdU5xhz2bDSqOzs';

let messaging = null;
let messagingScriptLoading = null;

function loadMessagingScript() {
  if (messagingScriptLoading) return messagingScriptLoading;
  messagingScriptLoading = new Promise((resolve, reject) => {
    if (typeof firebase.messaging === 'function') {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Firebase Messaging SDK'));
    document.head.appendChild(script);
  });
  return messagingScriptLoading;
}

async function getMessagingInstance() {
  if (messaging) return messaging;
  await loadMessagingScript();
  messaging = firebase.messaging();
  return messaging;
}

// If notification permission was already granted in a previous visit,
// quietly re-establish the foreground listener on every page load - no
// need to click "Enable" again each time.
if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
  getMessagingInstance().then(setupForegroundMessageListener).catch(() => {});
}

function setupForegroundMessageListener(msg) {
  // Fires when a push arrives while a tab IS open and focused. messages.html
  // already has its own more precise per-conversation notification logic
  // (it knows which conversation you're actively looking at) - defer to
  // that instead of duplicating/conflicting with it here.
  msg.onMessage((payload) => {
    if (window.location.pathname === '/messages') return;

    // Messages are data-only now, so read from payload.data (fall back to
    // notification for safety).
    const d = payload.data || {};
    const title = d.title || (payload.notification && payload.notification.title) || 'AUBazaar';
    const body = d.body || (payload.notification && payload.notification.body) || '';
    const link = d.link || (payload.fcmOptions && payload.fcmOptions.link) || '/messages';

    const notification = new Notification(title, { body, icon: '/favicon.png' });
    notification.onclick = () => {
      window.focus();
      window.location.href = link;
    };
  });
}

// Auth state observer - reads the user doc for UI display. Account creation
// itself happens in register.html/login.html's own Google sign-in handlers
// (which have the real form data), not here - a second "create if missing"
// writer here previously raced those and could win with blank fields
// (e.g. an empty studentId) since neither writer would overwrite an
// already-existing doc.
auth.onAuthStateChanged(async (user) => {
  // Small delay to ensure page is fully loaded
  await new Promise(resolve => setTimeout(resolve, 100));

  if (user) {
    // Reveal the signed-in-only mobile quick icons right away, before the
    // user-doc fetch below, so they don't flash missing on slower loads.
    setMobileQuickAuthVisible(true);

    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();
    const userData = doc.exists ? doc.data() : {};

    // Suspension takes effect immediately, even for a session that was
    // already logged in when an admin suspended them - not just future
    // login attempts.
    if (userData.status === 'suspended') {
      await auth.signOut();
      window.location.href = '/login?suspended=1';
      return;
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
    watchUnreadMessagesBadge(user.uid);
    maybeShowNotificationBanner(user, userData);
  } else {
    window.currentUser = null;
    setMobileQuickAuthVisible(false);
    updateNavbarForGuest();
  }
});

function maybeShowNotificationBanner(user, userData) {
  if (typeof Notification === 'undefined') return; // unsupported browser
  if (Notification.permission === 'granted') return; // already enabled
  if (userData.notificationBannerDismissed) return; // user said no thanks already
  if (document.getElementById('aub-notif-banner')) return; // already showing

  const banner = document.createElement('div');
  banner.id = 'aub-notif-banner';
  banner.style.cssText = 'position:sticky;top:0;z-index:999;background:#d32f2f;color:white;padding:0.7rem 1rem;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;font-size:0.88rem;text-align:center';
  banner.innerHTML = `
    <span><i class="fas fa-bell"></i> Turn on notifications to know the moment someone messages you - even with AUBazaar closed.</span>
    <button id="aub-notif-banner-enable" style="background:white;color:#d32f2f;border:none;border-radius:6px;padding:6px 14px;font-weight:600;cursor:pointer;font-size:0.85rem">Enable</button>
    <button id="aub-notif-banner-dismiss" style="background:none;border:1px solid rgba(255,255,255,0.6);color:white;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:0.85rem">Not now</button>
  `;
  document.body.prepend(banner);

  banner.querySelector('#aub-notif-banner-enable').addEventListener('click', async () => {
    const enabled = await AUBazaar.enablePushNotifications();
    if (enabled) banner.remove();
  });
  banner.querySelector('#aub-notif-banner-dismiss').addEventListener('click', async () => {
    banner.remove();
    if (auth.currentUser) {
      await db.collection('users').doc(auth.currentUser.uid).set({ notificationBannerDismissed: true }, { merge: true });
    }
  });
}

let unreadBadgeUnsubscribe = null;

// Live count of unread messages, badged onto the navbar envelope icon -
// covers chat, and everything else built on the messages collection this
// session (report outcomes, sale-claim notices, listing-removal notices,
// contact replies), since they're all real documents in the same
// collection. receiverId + read are both equality filters, so this
// doesn't need a composite index.
function watchUnreadMessagesBadge(uid) {
  if (unreadBadgeUnsubscribe) unreadBadgeUnsubscribe();
  unreadBadgeUnsubscribe = db.collection('messages')
    .where('receiverId', '==', uid)
    .where('read', '==', false)
    .onSnapshot((snap) => {
      renderUnreadMessagesBadge(snap.size);
    }, () => {});
}

function renderUnreadMessagesBadge(count) {
  document.querySelectorAll('a[href="/messages"]').forEach((link) => {
    if (link.closest('#profile-dropdown')) return; // badge the main icon only, not the dropdown item

    let badge = link.querySelector('.aub-unread-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'aub-unread-badge';
      badge.style.cssText = 'background:#dc3545;color:white;border-radius:50%;min-width:16px;height:16px;font-size:0.65rem;align-items:center;justify-content:center;position:absolute;top:-4px;right:-6px;padding:0 3px;font-weight:700;line-height:1;display:none';
      link.style.position = 'relative';
      link.appendChild(badge);
    }

    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : String(count);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  });
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
    if (userData?.profilePicture) {
      userAvatarEl.innerHTML = `<img src="${userData.profilePicture}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      const initials = (user.displayName || user.email).charAt(0).toUpperCase();
      userAvatarEl.textContent = initials;
    }
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

// Mobile/tablet top-bar quick icons that only make sense when signed in
// (Messages, My Profile). Toggled directly from the auth observer the
// instant we know whether there's a user - not gated behind the async
// user-doc fetch - so a logged-in visitor doesn't briefly see them missing.
function setMobileQuickAuthVisible(visible) {
  document.querySelectorAll('.mobile-quick-auth').forEach(el => {
    el.style.display = visible ? 'flex' : 'none';
  });
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

// Validate Africa University email domain. Domain membership alone no longer
// grants access - the real gate is proving ownership of the mailbox via
// Firebase Auth's email verification link (see the onAuthStateChanged guard
// above and the register/login flows).
function isValidAUEmail(email) {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase();
  return normalizedEmail.endsWith('@africau.edu') || normalizedEmail.endsWith('@students.africau.edu');
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

// Utility: Get the condition badge HTML, or '' if there's no condition -
// food listings don't have one, since "new/used" doesn't apply to food.
function getConditionBadge(condition) {
  if (!condition) return '';
  return `<span class="product-card-condition condition-${condition}">${getConditionLabel(condition)}</span>`;
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
  getConditionBadge,
  getCategoryIcon,

  // Whether this user may put another listing live right now under the
  // 3-per-30-days free cap. Shared by the sell page (new posts) and the
  // dashboard (restoring a hidden listing) so both enforce the SAME rule
  // and paywall. Pass { excludeListingId } when restoring, so the listing
  // being restored isn't counted as an existing slot against itself.
  // Returns { allowed, userDoc, userData, recentCount }.
  checkListingQuota: async function(user, options) {
    options = options || {};
    const excludeListingId = options.excludeListingId || null;

    const userDoc = await AUBazaar.db.collection('users').doc(user.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Admins and active Unlimited subscribers bypass the free cap entirely.
    if (userData.role === 'admin') return { allowed: true, userDoc, userData, recentCount: null };

    const unlimitedUntilRaw = userData.unlimitedSellerUntil;
    if (unlimitedUntilRaw) {
      const unlimitedUntil = unlimitedUntilRaw.toDate ? unlimitedUntilRaw.toDate() : new Date(unlimitedUntilRaw);
      if (unlimitedUntil > new Date()) return { allowed: true, userDoc, userData, recentCount: null };
    }

    // Rolling 30-day window (not calendar month) so someone can't post 3 on
    // the last day and 3 more the next. Bounded query - we only need to know
    // whether they're at the cap, not the exact total.
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 30);

    const FREE_CAP = 3;
    const snap = await AUBazaar.db.collection('listings')
      .where('sellerId', '==', user.uid)
      .where('createdAt', '>=', windowStart)
      .orderBy('createdAt', 'desc')
      .limit(FREE_CAP + (excludeListingId ? 2 : 1))
      .get();

    // Don't count the listing being restored as one of its own slots.
    let count = snap.size;
    if (excludeListingId && snap.docs.some(d => d.id === excludeListingId)) count -= 1;

    if (count < FREE_CAP) return { allowed: true, userDoc, userData, recentCount: count };

    const allowed = await AUBazaar.showQuotaPaywall(user);
    return { allowed, userDoc, userData, recentCount: count };
  },

  // The pay-per-listing / upgrade prompt shown when someone is over their
  // free cap. Resolves true if they paid/upgraded, false if they cancelled.
  showQuotaPaywall: function(user) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'quota-paywall-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML = `
        <div style="background:white;border-radius:16px;max-width:440px;width:100%;padding:28px;box-shadow:0 25px 80px rgba(0,0,0,0.4)">
          <div style="text-align:center;margin-bottom:20px">
            <i class="fas fa-store" style="font-size:2.5rem;color:var(--primary)"></i>
            <h2 style="margin:10px 0 6px 0">You've used your 3 free listings for the last 30 days</h2>
            <p style="color:var(--gray);font-size:0.9rem">Choose how you'd like to continue:</p>
          </div>
          <button id="quota-pay-once-btn" style="width:100%;padding:16px;margin-bottom:12px;border:2px solid var(--primary);background:white;color:var(--primary);border-radius:12px;font-weight:600;cursor:pointer;text-align:left">
            <div style="font-size:1.1rem">Pay $0.50</div>
            <div style="font-size:0.82rem;font-weight:400;color:var(--gray)">Just for this one extra listing</div>
          </button>
          <button id="quota-unlimited-btn" style="width:100%;padding:16px;margin-bottom:12px;border:none;background:var(--primary);color:white;border-radius:12px;font-weight:600;cursor:pointer;text-align:left">
            <div style="font-size:1.1rem">Upgrade to Unlimited - $3/month</div>
            <div style="font-size:0.82rem;font-weight:400;opacity:0.9">Post as many listings as you want this month</div>
          </button>
          <button id="quota-cancel-btn" style="width:100%;padding:12px;background:none;border:none;color:var(--gray);cursor:pointer">Cancel</button>
        </div>
      `;
      document.body.appendChild(overlay);

      const cleanup = () => overlay.remove();

      overlay.querySelector('#quota-cancel-btn').addEventListener('click', () => { cleanup(); resolve(false); });

      overlay.querySelector('#quota-pay-once-btn').addEventListener('click', () => {
        cleanup();
        AUBazaar.showPaymentModal({
          amount: 0.50,
          description: 'One extra listing',
          onSuccess: async (txnId, method) => {
            AUBazaar.showToast('Payment successful', 'success');
            await AUBazaar.issueReceipt({ userId: user.uid, item: 'One extra listing', amount: 0.50, method, reference: txnId });
            resolve(true);
          }
        });
      });

      overlay.querySelector('#quota-unlimited-btn').addEventListener('click', () => {
        cleanup();
        AUBazaar.showPaymentModal({
          amount: 3.00,
          description: 'Unlimited listings this month',
          onSuccess: async (txnId, method) => {
            const untilDate = new Date();
            untilDate.setMonth(untilDate.getMonth() + 1);
            await AUBazaar.db.collection('users').doc(user.uid).set({
              unlimitedSellerUntil: untilDate,
              unlimitedSellerPaymentRef: txnId
            }, { merge: true });
            AUBazaar.showToast('Unlimited plan activated', 'success');
            await AUBazaar.issueReceipt({ userId: user.uid, item: 'Unlimited Seller Subscription (1 month)', amount: 3.00, method, reference: txnId, validFrom: new Date(), validUntil: untilDate });
            resolve(true);
          }
        });
      });
    });
  },

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
    // Everyone gets 3 free listings/month with no wall at the door -
    // sell.html itself handles the pay-per-extra/unlimited prompt if
    // someone is already over their free cap for the month.
    if (event) event.preventDefault();
    window.location.href = '/sell';
  },
  // Reusable fake payment modal - EcoCash / OneMoney / Card. Simulated
  // only (no real charge/gateway), same as the rest of AUBazaar's payment
  // flow, but shared here instead of duplicated per page. Calls
  // onSuccess(txnId) once the fake processing animation completes.
  showPaymentModal: function({ amount, description, onSuccess }) {
    const existing = document.getElementById('aub-payment-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'aub-payment-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:white;border-radius:16px;max-width:420px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 25px 80px rgba(0,0,0,0.4)">
        <div style="background:linear-gradient(135deg,#d32f2f,#8e0000);color:white;padding:24px;border-radius:16px 16px 0 0;text-align:center">
          <div style="font-size:1.8rem;font-weight:800">$${amount.toFixed(2)}</div>
          <div style="opacity:0.9;font-size:0.9rem;margin-top:4px">${description}</div>
        </div>
        <div style="padding:24px">
          <div id="aub-payment-methods">
            <div class="aub-pay-option" data-method="ecocash" style="display:flex;align-items:center;gap:14px;padding:16px;border:2px solid #ddd;border-radius:12px;margin-bottom:12px;cursor:pointer">
              <div style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#27ae60,#1e8449);display:flex;align-items:center;justify-content:center;font-size:1.3rem">📱</div>
              <div><div style="font-weight:600">EcoCash</div><div style="font-size:0.82rem;color:#777">Mobile money</div></div>
            </div>
            <div class="aub-pay-option" data-method="onemoney" style="display:flex;align-items:center;gap:14px;padding:16px;border:2px solid #ddd;border-radius:12px;margin-bottom:12px;cursor:pointer">
              <div style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#f39c12,#d68910);display:flex;align-items:center;justify-content:center;font-size:1.3rem">💰</div>
              <div><div style="font-weight:600">OneMoney</div><div style="font-size:0.82rem;color:#777">Mobile money</div></div>
            </div>
            <div class="aub-pay-option" data-method="card" style="display:flex;align-items:center;gap:14px;padding:16px;border:2px solid #ddd;border-radius:12px;margin-bottom:12px;cursor:pointer">
              <div style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#3498db,#2980b9);display:flex;align-items:center;justify-content:center;font-size:1.3rem">💳</div>
              <div><div style="font-weight:600">Credit / Debit Card</div><div style="font-size:0.82rem;color:#777">Visa, Mastercard</div></div>
            </div>
          </div>
          <div id="aub-payment-form" style="display:none;margin-top:16px"></div>
          <div id="aub-payment-status" style="display:none;margin-top:16px;padding:14px;border-radius:10px;text-align:center"></div>
          <button id="aub-payment-cancel" style="margin-top:16px;width:100%;padding:12px;background:#e0e0e0;border:none;border-radius:8px;font-weight:600;cursor:pointer">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('#aub-payment-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    const methodsDiv = overlay.querySelector('#aub-payment-methods');
    const formDiv = overlay.querySelector('#aub-payment-form');
    const statusDiv = overlay.querySelector('#aub-payment-status');

    methodsDiv.querySelectorAll('.aub-pay-option').forEach(opt => {
      opt.addEventListener('mouseenter', () => opt.style.borderColor = '#d32f2f');
      opt.addEventListener('mouseleave', () => opt.style.borderColor = '#ddd');
      opt.addEventListener('click', () => {
        methodsDiv.style.display = 'none';
        renderPaymentForm(opt.dataset.method);
      });
    });

    function renderPaymentForm(method) {
      formDiv.style.display = 'block';
      if (method === 'ecocash' || method === 'onemoney') {
        const providerName = method === 'ecocash' ? 'EcoCash' : 'OneMoney';
        const color = method === 'ecocash' ? '#27ae60' : '#f39c12';
        formDiv.innerHTML = `
          <h4 style="margin:0 0 10px 0;color:${color}">${providerName} Payment</h4>
          <p style="color:#666;font-size:0.85rem;margin-bottom:10px">Enter your ${providerName} number</p>
          <input type="tel" id="aub-mobile-number" placeholder="e.g. 0771234567 or +263771234567" maxlength="20" style="width:100%;padding:14px;font-size:1.1rem;border:2px solid ${color};border-radius:10px;box-sizing:border-box;text-align:center;letter-spacing:1px;margin-bottom:12px">
          <button id="aub-mobile-pay-btn" style="width:100%;padding:14px;background:${color};color:white;border:none;border-radius:10px;font-weight:600;cursor:pointer">Pay $${amount.toFixed(2)}</button>
          <button id="aub-back-btn" style="width:100%;padding:10px;background:none;border:none;color:#888;margin-top:8px;cursor:pointer">&larr; Choose a different method</button>
        `;
        formDiv.querySelector('#aub-back-btn').addEventListener('click', () => {
          formDiv.style.display = 'none';
          methodsDiv.style.display = 'block';
        });
        formDiv.querySelector('#aub-mobile-pay-btn').addEventListener('click', () => {
          const number = formDiv.querySelector('#aub-mobile-number').value.replace(/[^0-9]/g, '');
          // Lenient on format - accept a plain local number (0771234567) or
          // one with a country code (263771234567 / +263 77 123 4567) alike.
          // This is a simulated payment, so any plausible phone number should
          // be allowed straight through instead of being rejected on format.
          if (number.length < 9) {
            showToast('Enter a valid phone number', 'warning');
            return;
          }
          runFakeProcessing(providerName, color);
        });
      } else if (method === 'card') {
        formDiv.innerHTML = `
          <h4 style="margin:0 0 10px 0;color:#2980b9">Card Payment</h4>
          <input type="text" id="aub-card-number" placeholder="Card number" maxlength="19" style="width:100%;padding:12px;border:2px solid #3498db;border-radius:10px;box-sizing:border-box;margin-bottom:10px">
          <div style="display:flex;gap:10px;margin-bottom:12px">
            <input type="text" id="aub-card-expiry" placeholder="MM/YY" maxlength="5" style="flex:1;padding:12px;border:2px solid #3498db;border-radius:10px;box-sizing:border-box">
            <input type="text" id="aub-card-cvv" placeholder="CVV" maxlength="3" style="width:80px;padding:12px;border:2px solid #3498db;border-radius:10px;box-sizing:border-box">
          </div>
          <button id="aub-card-pay-btn" style="width:100%;padding:14px;background:#2980b9;color:white;border:none;border-radius:10px;font-weight:600;cursor:pointer">Pay $${amount.toFixed(2)}</button>
          <button id="aub-back-btn" style="width:100%;padding:10px;background:none;border:none;color:#888;margin-top:8px;cursor:pointer">&larr; Choose a different method</button>
        `;
        formDiv.querySelector('#aub-back-btn').addEventListener('click', () => {
          formDiv.style.display = 'none';
          methodsDiv.style.display = 'block';
        });
        formDiv.querySelector('#aub-card-pay-btn').addEventListener('click', () => {
          const num = formDiv.querySelector('#aub-card-number').value.replace(/\s/g, '');
          const exp = formDiv.querySelector('#aub-card-expiry').value;
          const cvv = formDiv.querySelector('#aub-card-cvv').value;
          if (!/^\d{13,19}$/.test(num) || !/^\d{2}\/\d{2}$/.test(exp) || !/^\d{3}$/.test(cvv)) {
            showToast('Enter valid card details', 'warning');
            return;
          }
          runFakeProcessing('Card', '#2980b9');
        });
      }
    }

    function runFakeProcessing(providerName, color) {
      formDiv.style.display = 'none';
      statusDiv.style.display = 'block';
      statusDiv.style.background = '#fff3cd';
      statusDiv.style.color = '#856404';
      statusDiv.innerHTML = `<div style="font-size:1.5rem;margin-bottom:8px">💳</div>Processing payment via ${providerName}...`;

      setTimeout(() => {
        statusDiv.innerHTML = `<div style="font-size:1.5rem;margin-bottom:8px">⏳</div>Confirming with ${providerName}...`;
        setTimeout(() => {
          const txnId = providerName.slice(0, 2).toUpperCase() + Math.floor(Math.random() * 10000000) + 'Z';
          statusDiv.style.background = '#d4edda';
          statusDiv.style.color = '#155724';
          statusDiv.innerHTML = `<div style="font-size:1.7rem;margin-bottom:8px">✅</div><strong>Payment Successful!</strong><br>Reference: ${txnId}`;
          setTimeout(() => {
            closeModal();
            onSuccess(txnId, providerName);
          }, 1200);
        }, 1800);
      }, 1500);
    }
  },

  // Issues a receipt for a completed payment: saves a durable copy to the
  // `receipts` collection (proof the user/admin can look up later), then
  // shows a branded receipt the buyer can download or print so they don't
  // lose it. Returns a Promise that resolves when the receipt is closed, so
  // callers can wait before navigating away.
  // details: { userId, item, amount, method, reference, validFrom, validUntil }
  issueReceipt: async function(details) {
    // Pull the buyer's profile for the "billed to" block.
    let name = '', email = (auth.currentUser && auth.currentUser.email) || '', studentId = '';
    try {
      const uDoc = await AUBazaar.db.collection('users').doc(details.userId).get();
      const u = uDoc.exists ? uDoc.data() : {};
      name = u.fullName || '';
      email = u.email || email;
      studentId = u.studentId || '';
    } catch (e) { /* profile read is best-effort */ }

    const paidAtMs = Date.now();
    const reference = details.reference || ('AUB' + paidAtMs);
    const validFromMs = details.validFrom ? new Date(details.validFrom).getTime() : null;
    const validUntilMs = details.validUntil ? new Date(details.validUntil).getTime() : null;
    const amount = Number(details.amount) || 0;
    const method = details.method || 'Online';
    const item = details.item || 'AUBazaar payment';

    // Durable server-side copy (best-effort - the visible receipt still shows
    // even if this write fails).
    try {
      await AUBazaar.db.collection('receipts').add({
        userId: details.userId, name, email, studentId,
        item, amount, method, reference,
        validFromMs, validUntilMs,
        paidAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) { console.error('Failed to save receipt:', e); }

    const fmtDateTime = (ms) => {
      if (!ms) return '-';
      const d = new Date(ms);
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };
    const fmtDay = (ms) => ms ? new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const validText = (validFromMs && validUntilMs)
      ? `Valid ${fmtDay(validFromMs)} – ${fmtDay(validUntilMs)}`
      : '';

    const row = (label, value) => `<div style="display:flex;justify-content:space-between;gap:12px;font-size:0.85rem;margin-bottom:6px"><span style="color:#888">${label}</span><span style="text-align:right">${value}</span></div>`;
    const inner = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:460px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eee">
        <div style="background:linear-gradient(135deg,#d32f2f,#8e0000);color:#fff;padding:20px 24px">
          <div style="font-size:1.35rem;font-weight:800;letter-spacing:.5px">AUBazaar</div>
          <div style="opacity:.9;font-size:.85rem;margin-top:2px">Payment Receipt</div>
        </div>
        <div style="padding:20px 24px">
          ${row('Receipt no.', '<strong>' + esc(reference) + '</strong>')}
          ${row('Date paid', esc(fmtDateTime(paidAtMs)))}
          ${row('Payment method', esc(method))}
          <div style="border-top:1px dashed #ddd;margin:14px 0"></div>
          <div style="font-size:.7rem;text-transform:uppercase;color:#999;letter-spacing:.05em;margin-bottom:4px">Billed to</div>
          <div style="font-weight:600">${esc(name) || '—'}</div>
          ${email ? `<div style="font-size:.85rem;color:#555">${esc(email)}</div>` : ''}
          ${studentId ? `<div style="font-size:.85rem;color:#555">ID: ${esc(studentId)}</div>` : ''}
          <div style="border-top:1px dashed #ddd;margin:14px 0"></div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px">
            <div><div style="font-weight:600">${esc(item)}</div>${validText ? `<div style="font-size:.8rem;color:#555;margin-top:2px">${validText}</div>` : ''}</div>
            <div style="font-weight:700;white-space:nowrap">$${amount.toFixed(2)}</div>
          </div>
          <div style="border-top:2px solid #eee;margin:14px 0 10px"></div>
          <div style="display:flex;justify-content:space-between;font-size:1.05rem;font-weight:800"><span>Total paid</span><span>$${amount.toFixed(2)}</span></div>
          <div style="margin-top:16px;font-size:.72rem;color:#999;text-align:center;line-height:1.5">Keep this receipt as proof of your AUBazaar payment.<br>A copy is saved to your account. Questions? Contact an admin through the app.</div>
        </div>
      </div>`;

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'aub-receipt-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto';
      overlay.innerHTML = `
        <div style="max-width:460px;width:100%">
          ${inner}
          <div style="display:flex;gap:10px;margin-top:14px">
            <button id="aub-receipt-download" style="flex:1;padding:13px;background:#fff;color:#d32f2f;border:2px solid #d32f2f;border-radius:10px;font-weight:700;cursor:pointer"><span style="font-size:1rem">⬇</span> Download</button>
            <button id="aub-receipt-print" style="flex:1;padding:13px;background:#fff;color:#333;border:2px solid #ccc;border-radius:10px;font-weight:600;cursor:pointer">🖨 Print</button>
            <button id="aub-receipt-close" style="flex:1;padding:13px;background:#d32f2f;color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer">Done</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const fullDoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AUBazaar Receipt ${esc(reference)}</title></head><body style="margin:0;padding:24px;background:#f4f4f4">${inner}</body></html>`;

      const done = () => { overlay.remove(); resolve(); };
      overlay.querySelector('#aub-receipt-close').addEventListener('click', done);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) done(); });

      overlay.querySelector('#aub-receipt-download').addEventListener('click', () => {
        const blob = new Blob([fullDoc], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AUBazaar-Receipt-${reference}.html`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Receipt downloaded', 'success');
      });

      overlay.querySelector('#aub-receipt-print').addEventListener('click', () => {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow.document;
        doc.open(); doc.write(fullDoc); doc.close();
        iframe.contentWindow.focus();
        setTimeout(() => { iframe.contentWindow.print(); setTimeout(() => iframe.remove(), 1500); }, 300);
      });
    });
  },
  // Real push notifications - work even with the app fully closed, via a
  // Cloud Function that sends through FCM whenever a new message is
  // created. Call this from a real user click (e.g. a Settings toggle),
  // not automatically on page load - browsers suppress permission
  // prompts that aren't tied to a genuine user gesture.
  enablePushNotifications: async function() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      showToast('Push notifications are not supported in this browser', 'warning');
      return false;
    }
    if (FCM_VAPID_KEY === 'PASTE_VAPID_KEY_HERE') {
      showToast('Push notifications are not fully configured yet', 'error');
      console.error('FCM_VAPID_KEY has not been set in firebase-config.js');
      return false;
    }

    // If the browser has notifications BLOCKED, requestPermission() returns
    // 'denied' instantly without a prompt - the button then looks broken.
    // Tell the user exactly how to unblock it instead of a vague error.
    if (Notification.permission === 'denied') {
      showToast('Notifications are blocked for this site. Tap the lock/settings icon next to the address bar → Site settings → allow Notifications, then try again.', 'error');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showToast('You didn\'t allow notifications. Tap Enable again and choose "Allow" when your browser asks.', 'warning');
        return false;
      }

      await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      // Wait until the service worker is actually ACTIVE before asking for a
      // token - getToken can fail on first-run/some devices if it's called
      // while the worker is still installing.
      const registration = await navigator.serviceWorker.ready;
      const msg = await getMessagingInstance();
      const token = await msg.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: registration });

      if (!token) {
        showToast('Could not register this device for notifications. Try reloading the page and enabling again.', 'error');
        return false;
      }

      if (auth.currentUser) {
        const userRef = db.collection('users').doc(auth.currentUser.uid);
        // Store tokens as an array so notifications reach every device the
        // user has enabled, not just the most recent one. Migrate any legacy
        // single-token field into the array, then drop it.
        const snap = await userRef.get();
        const legacy = snap.exists ? snap.data().fcmToken : null;
        const toAdd = legacy && legacy !== token ? [legacy, token] : [token];
        await userRef.set({ fcmTokens: firebase.firestore.FieldValue.arrayUnion(...toAdd) }, { merge: true });
        if (legacy) {
          await userRef.update({ fcmToken: firebase.firestore.FieldValue.delete() }).catch(() => {});
        }
      }

      // Remember this device's token locally so a later status check can
      // still identify the device even if getToken() briefly fails.
      try { localStorage.setItem('aub_push_token', token); } catch (e) {}

      setupForegroundMessageListener(msg);
      showToast('Push notifications enabled on this device!', 'success');
      return true;
    } catch (error) {
      console.error('Failed to enable push notifications:', error);
      // Give the specific reason where we can, so the button doesn't just
      // fail silently.
      const code = error && error.code;
      if (code === 'messaging/permission-blocked' || code === 'messaging/notifications-blocked') {
        showToast('Notifications are blocked in your browser settings. Allow them for this site, then try again.', 'error');
      } else if (code === 'messaging/unsupported-browser') {
        showToast('This browser doesn\'t support push notifications. On iPhone, add AUBazaar to your Home Screen first, then enable from there.', 'error');
      } else {
        showToast('Could not enable notifications on this device. Reload the page and try again - on iPhone, install AUBazaar to your Home Screen first.', 'error');
      }
      return false;
    }
  },
  disablePushNotifications: async function() {
    if (auth.currentUser) {
      const userRef = db.collection('users').doc(auth.currentUser.uid);
      // Only remove THIS device's token - disabling on one device shouldn't
      // turn off notifications on the user's other devices.
      try {
        const msg = await getMessagingInstance();
        const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
          || await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const token = await msg.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: registration }).catch(() => null);
        if (token) {
          await userRef.update({ fcmTokens: firebase.firestore.FieldValue.arrayRemove(token) }).catch(() => {});
        }
      } catch (e) { /* best effort */ }
      // Clear the legacy single-token field too if present.
      await userRef.update({ fcmToken: firebase.firestore.FieldValue.delete() }).catch(() => {});
    }
    try { localStorage.removeItem('aub_push_token'); } catch (e) {}
    showToast('Push notifications disabled', 'success');
  },
  isPushNotificationEnabled: function() {
    return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  },
  // A one-time, well-timed nudge to turn on notifications, shown at a
  // high-intent moment (e.g. right after a first listing, or opening
  // Messages) rather than on cold page load. Push can't be auto-enabled -
  // browsers require the user to tap Allow - so this explains why and offers
  // a single Enable button. Shows at most once per device (localStorage),
  // never if already granted or blocked. `reason` tailors the one-liner.
  maybePromptNotifications: async function(reason) {
    if (typeof Notification === 'undefined') return;                 // unsupported
    if (Notification.permission === 'granted') return;               // already on
    if (Notification.permission === 'denied') return;                // blocked; banner explains how to unblock
    if (typeof Swal === 'undefined') return;                         // no modal lib on this page
    try { if (localStorage.getItem('aub_notif_prompted')) return; } catch (e) {}
    try { localStorage.setItem('aub_notif_prompted', '1'); } catch (e) {}

    const line = reason || 'so you know the moment someone messages you';
    const result = await Swal.fire({
      title: '🔔 Turn on notifications?',
      html: `Get a notification <b>${line}</b> — even with AUBazaar closed.<br><span style="color:#888;font-size:0.85rem">You can change this anytime in your dashboard settings.</span>`,
      showCancelButton: true,
      confirmButtonText: 'Enable notifications',
      cancelButtonText: 'Maybe later',
      confirmButtonColor: '#d32f2f',
      cancelButtonColor: '#6c757d'
    });
    if (result.isConfirmed) {
      await AUBazaar.enablePushNotifications();
    }
  },
  // The TRUTHFUL "is push on for this device" check. Browser permission alone
  // (isPushNotificationEnabled) is sticky and misleading - it stays 'granted'
  // forever even after you turn notifications off in-app, and it's 'granted'
  // even if a token was never actually saved. This confirms this device's
  // current token is really registered in Firestore, i.e. this device will
  // actually receive notifications. Returns 'on', 'off', or 'blocked'.
  getPushStatusForThisDevice: async function() {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission !== 'granted') return 'off';
    if (!auth.currentUser) return 'off';
    try {
      const msg = await getMessagingInstance();
      await (navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
        || navigator.serviceWorker.register('/firebase-messaging-sw.js'));
      const registration = await navigator.serviceWorker.ready;
      let token = await msg.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: registration }).catch(() => null);
      // A transient getToken() failure shouldn't make an actually-enabled
      // device read as OFF ("it disabled itself"). Fall back to the token we
      // remembered when it was enabled, and still verify it against Firestore.
      if (!token) { try { token = localStorage.getItem('aub_push_token'); } catch (e) {} }
      if (!token) return 'off';
      const doc = await db.collection('users').doc(auth.currentUser.uid).get();
      const data = doc.exists ? doc.data() : {};
      const tokens = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];
      return (tokens.includes(token) || data.fcmToken === token) ? 'on' : 'off';
    } catch (e) {
      return 'off';
    }
  },
  // Whether the browser is currently offering to install AUBazaar as an
  // app - false if already installed, or if the browser hasn't decided
  // the install criteria are met yet (this fires asynchronously after
  // page load, so check again a moment after the page opens rather than
  // immediately).
  canInstallApp: function() {
    return !!deferredInstallPrompt;
  },
  installApp: async function() {
    if (!deferredInstallPrompt) {
      showToast("Install isn't available right now - your browser may not support it, or AUBazaar may already be installed", 'warning');
      return false;
    }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice.outcome === 'accepted') {
      showToast('AUBazaar installed!', 'success');
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
        // A unique tag per notification (plus renotify) so a second and third
        // message each alert separately, instead of silently replacing the
        // previous one - the fixed 'aubazaar-message' tag made it look like
        // notifications only ever showed once.
        tag: 'aubazaar-message-' + Date.now(),
        renotify: true,
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
