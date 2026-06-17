// ========== auth.js - النسخة المعدلة (بدون كابتشا) ==========
// Firebase Auth الأساسي

// ==================== القسم 1: دوال مساعدة ====================
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
}

function generateShareableId() {
    let id = '';
    for (let i = 0; i < 10; i++) { id += Math.floor(Math.random() * 10).toString(); }
    return id;
}

function getEmojiForUser(userData) {
    const emojiMap = { 'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧', 'father': '👨‍🦳', 'mother': '👩‍🦳', 'grandfather': '👴', 'grandmother': '👵' };
    return emojiMap[userData.avatarType] || '👤';
}

const FieldValue = firebase.firestore.FieldValue;

// ==================== القسم 2: showApp ====================
function showApp() {
    const splash = document.getElementById('splash'), app = document.getElementById('app');
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.style.display = 'none';
    if (splash) { splash.style.display = 'none'; }
    if (app) { app.style.display = 'flex'; }
}

// ==================== القسم 3: showLoginScreen ====================
function showLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.style.display = 'flex';
}

// ==================== القسم 4: startGoogleLogin (معدل - بدون كابتشا) ====================
async function startGoogleLogin() {
    try {
        if (!window.auth || !window.googleProvider) {
            alert('مكتبة Firebase لم يتم تحميلها بعد.');
            return;
        }
        
        const splash = document.getElementById('splash');
        if (splash) { splash.style.display = 'none'; }
        
        const loginScreen = document.getElementById('loginScreen');
        if (loginScreen) { loginScreen.style.display = 'none'; }
        
        const result = await window.auth.signInWithPopup(window.googleProvider);
        await saveUserAndEnter(result.user);
        
    } catch (error) {
        let msg = 'حدث خطأ في تسجيل الدخول';
        if (error.code === 'auth/popup-closed-by-user') msg = 'تم إغلاق نافذة تسجيل الدخول';
        else if (error.code === 'auth/network-request-failed') msg = 'خطأ في الشبكة';
        alert(msg);
    }
}

// ==================== القسم 5: saveUserAndEnter ====================
async function saveUserAndEnter(user) {
    try {
        const userDoc = await window.db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            await window.db.collection('users').doc(user.uid).set({
                uid: user.uid, name: (user.displayName || 'مستخدم').substring(0, 16), // ✅ تغيير من 25 إلى 16
                email: user.email || '', shareableId: generateShareableId(),
                bio: '', avatarType: 'male', friends: [], blocked: [], createdAt: new Date()
            });
        } else {
            const userData = userDoc.data(); const updates = {};
            if (!userData.friends) updates.friends = [];
            if (userData.followers) updates.followers = [];
            if (userData.following) updates.following = [];
            if (Object.keys(updates).length > 0) await window.db.collection('users').doc(user.uid).update(updates);
        }
        await loadUserData(user.uid);
        setupFriendRequestsListener(user.uid);
        if (typeof SecureChatSystem !== 'undefined') { await SecureChatSystem.init(); }
        showApp();
    } catch (error) {
        console.error('خطأ في حفظ المستخدم:', error);
        alert('حدث خطأ في إعداد الحساب');
    }
}

// ==================== القسم 6: دوال إضافية ====================
async function signInWithGoogle() { await startGoogleLogin(); }

function updateUserUI() { 
    const splash = document.getElementById('splash'), app = document.getElementById('app'); 
    if (splash) { 
        splash.classList.add('hide'); 
        setTimeout(() => { 
            splash.style.display = 'none'; 
            if (app) app.style.display = 'flex'; 
        }, 500); 
    } 
}

// ==================== القسم 7: logout (معدل - إضافة تنظيف شامل) ====================
async function logout() { 
    if (typeof CallSystem !== 'undefined' && CallSystem.cleanupDynamicElements) {
        console.log('🧹 تنظيف العناصر الديناميكية قبل تسجيل الخروج');
        CallSystem.cleanupDynamicElements();
    }
    
    if (typeof ChatSystem !== 'undefined') {
        if (ChatSystem.featureBlinkInterval) {
            clearInterval(ChatSystem.featureBlinkInterval);
            ChatSystem.featureBlinkInterval = null;
        }
        ChatSystem.featuresEnabled = false;
        ChatSystem.featureRequestPending = false;
        ChatSystem.featureRequestReceived = false;
    }
    
    try {
        if (window.auth?.currentUser) {
            await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                online: false,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (e) {}
    
    try { await window.auth.signOut(); } catch (e) {}
    window.location.reload(); 
}

// ==================== القسم 8: loadUserData ====================
async function loadUserData(uid) {
    try {
        const doc = await window.db.collection('users').doc(uid).get();
        if (doc.exists) {
            const d = doc.data();
            const pn = document.getElementById('profileName'), pa = document.getElementById('profileAvatarEmoji'), pb = document.getElementById('profileBio'), si = document.getElementById('shareableId'), ca = document.getElementById('currentAvatarEmoji');
            if (pn) pn.textContent = (d.name || 'مستخدم').substring(0, 16); // ✅ تغيير من 25 إلى 16
            if (pb) pb.textContent = d.bio || '';
            if (si) si.textContent = d.shareableId || '0000000000';
            const emoji = getEmojiForUser(d);
            if (pa) pa.textContent = emoji; if (ca) ca.textContent = emoji;
            const fc = document.getElementById('friendsCount'), frc = document.getElementById('friendRequestsCount');
            if (fc) fc.textContent = formatNumber((d.friends || []).length);
            if (frc) { try { const s = await window.db.collection('friendRequests').where('to', '==', uid).where('status', '==', 'pending').get(); frc.textContent = formatNumber(s.size); } catch (e) { frc.textContent = '0'; } }
        }
    } catch (e) {}
}

// ==================== القسم 9: مراقب حالة تسجيل الدخول (معدل - بدون كابتشا) ====================
if (typeof window.auth !== 'undefined') {
    window.auth.onAuthStateChanged(async (user) => {
        const splash = document.getElementById('splash'), app = document.getElementById('app');
        
        if (user) {
            await loadUserData(user.uid);
            setupFriendRequestsListener(user.uid);
            if (typeof SecureChatSystem !== 'undefined') await SecureChatSystem.init();
            showApp();
        } else {
            if (app) app.style.display = 'none';
            if (splash) { splash.style.display = 'flex'; }
            
            setTimeout(() => {
                if (splash) { splash.style.display = 'none'; }
                showLoginScreen();
            }, 2500);
        }
    });
}

// ==================== القسم 10: copyId ====================
function copyId() { 
    const el = document.getElementById('shareableId'); 
    if (el) navigator.clipboard.writeText(el.textContent).then(() => alert('تم النسخ')); 
}
