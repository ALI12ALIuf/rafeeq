function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
}

function generateShareableId() {
    let id = '';
    for (let i = 0; i < 10; i++) {
        id += Math.floor(Math.random() * 10).toString();
    }
    return id;
}

function getEmojiForUser(userData) {
    const emojiMap = {
        'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧',
        'father': '👨‍🦳', 'mother': '👩‍🦳', 'grandfather': '👴', 'grandmother': '👵'
    };
    return emojiMap[userData.avatarType] || '👤';
}

const FieldValue = firebase.firestore.FieldValue;

async function signInWithGoogle() {
    try {
        if (!window.auth || !window.googleProvider) {
            alert('مكتبة Firebase لم يتم تحميلها بعد. يرجى تحديث الصفحة.');
            return false;
        }
        
        const result = await window.auth.signInWithPopup(window.googleProvider);
        const user = result.user;
        const userDoc = await window.db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            const shareableId = generateShareableId();
            
            let publicKeyBase64 = null;
            try {
                if (window.cryptoSystem) {
                    const keyPair = await window.cryptoSystem.generateKeyPair();
                    publicKeyBase64 = await window.cryptoSystem.exportPublicKey(keyPair.publicKey);
                    window.cryptoSystem.keyPairs.set(user.uid, keyPair);
                    if (window.cryptoSystem.savePrivateKey) {
                        await window.cryptoSystem.savePrivateKey(user.uid, keyPair.privateKey);
                    }
                    console.log('✅ P2P keys generated for new user');
                }
            } catch (e) {
                console.warn('P2P key generation failed:', e);
            }
            
            await window.db.collection('users').doc(user.uid).set({
                uid: user.uid,
                name: (user.displayName || 'مستخدم').substring(0, 25),
                email: user.email || '',
                shareableId: shareableId,
                bio: '',
                avatarType: 'male',
                publicKey: publicKeyBase64 || null,
                friends: [],
                blocked: [],
                createdAt: new Date()
            });
        } else {
            const userData = userDoc.data();
            const updates = {};
            
            if (!userData.friends) updates.friends = [];
            if (userData.followers) updates.followers = [];
            if (userData.following) updates.following = [];
            
            if (!userData.publicKey && window.cryptoSystem) {
                try {
                    const keyPair = await window.cryptoSystem.generateKeyPair();
                    const publicKeyBase64 = await window.cryptoSystem.exportPublicKey(keyPair.publicKey);
                    updates.publicKey = publicKeyBase64;
                    window.cryptoSystem.keyPairs.set(user.uid, keyPair);
                    if (window.cryptoSystem.savePrivateKey) {
                        await window.cryptoSystem.savePrivateKey(user.uid, keyPair.privateKey);
                    }
                    console.log('✅ P2P keys added to existing user');
                } catch (e) {
                    console.warn('P2P key generation failed:', e);
                }
            }
            
            if (Object.keys(updates).length > 0) {
                await window.db.collection('users').doc(user.uid).update(updates);
            }
        }
        
        if (window.signaling) {
            window.signaling.init(user.uid);
        }
        if (window.p2pManager) {
            window.p2pManager.init(user.uid);
        }
        
        updateUserUI();
        return true;
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'حدث خطأ في تسجيل الدخول';
        if (error.code === 'auth/popup-closed-by-user') errorMessage = 'تم إغلاق نافذة تسجيل الدخول';
        else if (error.code === 'auth/cancelled-popup-request') errorMessage = 'تم إلغاء طلب تسجيل الدخول';
        else if (error.code === 'auth/network-request-failed') errorMessage = 'خطأ في الشبكة. تحقق من اتصالك بالإنترنت';
        else errorMessage += ': ' + error.message;
        alert(errorMessage);
        return false;
    }
}

// ✅ دالة تحديث الواجهة بعد تسجيل الدخول
function updateUserUI() {
    const splash = document.getElementById('splash');
    const app = document.getElementById('app');
    const loginScreen = document.querySelector('.login-screen');
    
    // إخفاء جميع شاشات التحميل
    if (splash) splash.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'none';
    if (app) app.style.display = 'flex';
    
    // ✅ إعادة تحميل جميع البيانات بعد تسجيل الدخول
    setTimeout(() => {
        console.log('🔄 Loading user data after login...');
        
        if (typeof loadChats === 'function') {
            loadChats();
            console.log('✅ Chats loaded');
        }
        
        if (typeof updateTripsCount === 'function') {
            updateTripsCount();
        }
        
        if (typeof loadUserTrips === 'function') {
            loadUserTrips();
        }
        
        if (typeof loadFriendsList === 'function') {
            loadFriendsList();
        }
        
        if (typeof loadFriendRequests === 'function') {
            loadFriendRequests();
        }
        
        // تحديث واجهة المستخدم
        const profileName = document.getElementById('profileName');
        const shareableId = document.getElementById('shareableId');
        const profileAvatar = document.getElementById('profileAvatarEmoji');
        
        if (window.auth.currentUser) {
            window.db.collection('users').doc(window.auth.currentUser.uid).get().then(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    if (profileName) profileName.textContent = data.name || 'مستخدم';
                    if (shareableId) shareableId.textContent = data.shareableId || '0000000000';
                    if (profileAvatar) profileAvatar.textContent = getEmojiForUser(data);
                }
            });
        }
    }, 500);
}

async function logout() {
    try {
        await window.auth.signOut();
        window.location.reload();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

async function loadUserData(uid) {
    try {
        const userDoc = await window.db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            const profileName = document.getElementById('profileName');
            const profileAvatarEmoji = document.getElementById('profileAvatarEmoji');
            const profileBio = document.getElementById('profileBio');
            const shareableId = document.getElementById('shareableId');
            const currentAvatarEmoji = document.getElementById('currentAvatarEmoji');
            
            if (profileName) profileName.textContent = (userData.name || 'مستخدم').substring(0, 25);
            if (profileBio) profileBio.textContent = userData.bio || '';
            if (shareableId) shareableId.textContent = userData.shareableId || '0000000000';
            
            const avatarEmoji = getEmojiForUser(userData);
            if (profileAvatarEmoji) profileAvatarEmoji.textContent = avatarEmoji;
            if (currentAvatarEmoji) currentAvatarEmoji.textContent = avatarEmoji;
            
            const friendsCount = document.getElementById('friendsCount');
            const friendRequestsCount = document.getElementById('friendRequestsCount');
            
            if (friendsCount) friendsCount.textContent = formatNumber((userData.friends || []).length);
            
            if (friendRequestsCount) {
                try {
                    const requestsSnapshot = await window.db.collection('friendRequests')
                        .where('to', '==', uid)
                        .where('status', '==', 'pending')
                        .get();
                    friendRequestsCount.textContent = formatNumber(requestsSnapshot.size);
                } catch (e) {
                    friendRequestsCount.textContent = '0';
                }
            }
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// ✅ شاشة تسجيل الدخول
function showLoginScreen() {
    const existingLogin = document.querySelector('.login-screen');
    if (existingLogin) existingLogin.remove();
    
    const loginScreen = document.createElement('div');
    loginScreen.className = 'login-screen';
    loginScreen.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--bg, #ffffff);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    loginScreen.innerHTML = `
        <div style="text-align: center; padding: 20px; max-width: 350px;">
            <div style="font-size: 5rem; margin-bottom: 1rem;">🛡️</div>
            <h1 style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--primary, #2196F3);">رفيق P2P</h1>
            <p style="margin-bottom: 2rem; color: var(--text-light, #666);">تواصل مشفر بالكامل</p>
            <button id="googleSignInBtn" style="
                background: var(--primary, #2196F3);
                color: white;
                border: none;
                border-radius: 30px;
                padding: 15px 30px;
                font-size: 1.1rem;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                width: 100%;
                transition: all 0.3s;
            ">
                <i class="fab fa-google"></i>
                <span>المتابعة بحساب جوجل</span>
            </button>
            <p style="margin-top: 1rem; font-size: 0.8rem; color: var(--text-light, #666);">🔒 جميع الرسائل مشفرة من طرف إلى طرف<br>السيرفر لا يرى أي محتوى</p>
        </div>
    `;
    
    document.body.appendChild(loginScreen);
    
    const signInBtn = document.getElementById('googleSignInBtn');
    if (signInBtn) {
        signInBtn.onclick = signInWithGoogle;
    }
}

// ========== مراقبة حالة المصادقة ==========
if (typeof window.auth !== 'undefined') {
    window.auth.onAuthStateChanged(async (user) => {
        console.log('Auth state changed:', user ? 'logged in' : 'logged out');
        
        const splash = document.getElementById('splash');
        const app = document.getElementById('app');
        
        if (user) {
            console.log('Loading user data for:', user.uid);
            
            if (window.cryptoSystem && window.cryptoSystem.getOrCreateKeyPair) {
                const keyPair = await window.cryptoSystem.getOrCreateKeyPair(user.uid);
                if (keyPair) {
                    window.cryptoSystem.keyPairs.set(user.uid, keyPair);
                    console.log('✅ Key pair loaded for user');
                }
            }
            
            await loadUserData(user.uid);
            setupFriendRequestsListener(user.uid);
            
            if (splash) splash.style.display = 'none';
            const loginScreen = document.querySelector('.login-screen');
            if (loginScreen) loginScreen.style.display = 'none';
            if (app) app.style.display = 'flex';
            
            setTimeout(() => {
                if (typeof loadChats === 'function') loadChats();
                if (typeof updateTripsCount === 'function') updateTripsCount();
            }, 300);
        } else {
            console.log('User not logged in, showing login screen');
            
            if (app) app.style.display = 'none';
            if (splash) splash.style.display = 'flex';
            
            setTimeout(() => {
                if (splash) splash.style.display = 'none';
                showLoginScreen();
            }, 1000);
        }
    });
} else {
    console.error('auth is not defined. Firebase may not be loaded yet.');
}

function copyId() {
    const idElement = document.getElementById('shareableId');
    if (!idElement) return;
    const id = idElement.textContent;
    navigator.clipboard.writeText(id).then(() => {
        alert('تم النسخ');
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// ========== دوال الصداقة والبحث (أضفها من ملف auth.js القديم) ==========
// ... (ضع هنا دوال الصداقة والبحث كاملة)
