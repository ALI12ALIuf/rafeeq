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
                    // حفظ المفتاح الخاص
                    await window.cryptoSystem.savePrivateKey(user.uid, keyPair.privateKey);
                    console.log('✅ P2P keys generated and saved for new user');
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
                    await window.cryptoSystem.savePrivateKey(user.uid, keyPair.privateKey);
                    console.log('✅ P2P keys added to existing user');
                } catch (e) {
                    console.warn('P2P key generation failed for existing user:', e);
                }
            } else if (userData.publicKey && window.cryptoSystem && !window.cryptoSystem.keyPairs.has(user.uid)) {
                const keyPair = await window.cryptoSystem.getOrCreateKeyPair(user.uid);
                if (keyPair) {
                    window.cryptoSystem.keyPairs.set(user.uid, keyPair);
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

function updateUserUI() {
    const splash = document.getElementById('splash');
    const app = document.getElementById('app');
    const loginScreen = document.querySelector('.login-screen');
    
    // إخفاء جميع شاشات التحميل وتسجيل الدخول
    if (splash) {
        splash.classList.add('hide');
        setTimeout(() => {
            splash.style.display = 'none';
        }, 500);
    }
    
    if (loginScreen) {
        loginScreen.style.display = 'none';
    }
    
    if (app) {
        app.style.display = 'flex';
    }
    
    // إعادة تحميل المحادثات
    setTimeout(() => {
        if (typeof loadChats === 'function') {
            loadChats();
        }
    }, 100);
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

// ========== نظام الصداقة (نفسه بدون تغيير) ==========
// ... (باقي الكود كما هو) ...
