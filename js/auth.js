// ========== auth.js - النسخة النظيفة (بدون دردشة) ==========

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
    const emojiMap = {
        'man_light': '🧔🏻‍♂️',
        'man_medium': '🧔🏼‍♂️',
        'man_dark': '🧔🏽‍♂️',
        'woman_light': '👩🏻',
        'woman_medium': '👩🏼',
        'woman_dark': '👩🏽'
    };
    if (!userData?.avatarType || ['male','female','boy','girl','father','mother','grandfather','grandmother'].includes(userData.avatarType)) {
        return '🧔🏻‍♂️';
    }
    return emojiMap[userData.avatarType] || '🧔🏻‍♂️';
}

// ✅ منع التشغيل المزدوج
let _authReadyFired = false;
function fireAuthReady() {
    if (_authReadyFired) return;
    _authReadyFired = true;
    console.log('🔔 إطلاق authReady (مرة واحدة)');
    window.dispatchEvent(new Event('authReady'));
}

function showApp() {
    const splash = document.getElementById('splash'), app = document.getElementById('app');
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.style.display = 'none';
    if (splash) splash.style.display = 'none';
    if (app) app.style.display = 'flex';
}

function showLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.style.display = 'flex';
}

async function startGoogleLogin() {
    try {
        if (!window.auth || !window.googleProvider) {
            alert('مكتبة Firebase لم يتم تحميلها بعد.');
            return;
        }
        const splash = document.getElementById('splash');
        if (splash) splash.style.display = 'none';
        const loginScreen = document.getElementById('loginScreen');
        if (loginScreen) loginScreen.style.display = 'none';
        
        const result = await window.auth.signInWithPopup(window.googleProvider);
        await saveUserAndEnter(result.user);
    } catch (error) {
        let msg = 'حدث خطأ في تسجيل الدخول';
        if (error.code === 'auth/popup-closed-by-user') msg = 'تم إغلاق نافذة تسجيل الدخول';
        else if (error.code === 'auth/network-request-failed') msg = 'خطأ في الشبكة';
        alert(msg);
    }
}

async function saveUserAndEnter(user) {
    try {
        const userDoc = await window.db.collection('users').doc(user.uid).get();
        
        let shortName = (user.displayName || 'مستخدم').trim();
        if (shortName.length > 15) shortName = shortName.substring(0, 15);
        
        if (!userDoc.exists) {
            await window.db.collection('users').doc(user.uid).set({
                uid: user.uid,
                name: shortName,
                email: user.email || '',
                shareableId: generateShareableId(),
                bio: '',
                avatarType: 'man_light',
                createdAt: new Date()
            });
            console.log('✅ مستخدم جديد - تم حفظ الاسم:', shortName);
        } else {
            const userData = userDoc.data();
            const updates = {};
            if (userData.name && userData.name.length > 15) {
                updates.name = userData.name.substring(0, 15);
            }
            if (!userData.avatarType || ['male','female','boy','girl','father','mother','grandfather','grandmother'].includes(userData.avatarType)) {
                updates.avatarType = 'man_light';
            }
            if (Object.keys(updates).length > 0) {
                await window.db.collection('users').doc(user.uid).update(updates);
            }
        }
        
        fireAuthReady();
        await loadUserData(user.uid);
        showApp();
    } catch (error) {
        console.error('خطأ في حفظ المستخدم:', error);
        alert('حدث خطأ في إعداد الحساب');
    }
}

async function signInWithGoogle() { await startGoogleLogin(); }

async function logout() {
    try { await window.auth.signOut(); } catch (e) {}
    console.log('🔓 تم تسجيل الخروج');
    window.location.reload();
}

async function loadUserData(uid) {
    try {
        const doc = await window.db.collection('users').doc(uid).get();
        if (doc.exists) {
            const d = doc.data();
            const pn = document.getElementById('profileName');
            const pa = document.getElementById('profileAvatarEmoji');
            const pb = document.getElementById('profileBio');
            const si = document.getElementById('shareableId');
            const ca = document.getElementById('currentAvatarEmoji');
            
            let displayName = d.name || 'مستخدم';
            if (displayName.length > 15) {
                displayName = displayName.substring(0, 15);
                try {
                    await window.db.collection('users').doc(uid).update({ name: displayName });
                } catch (e) {}
            }
            if (pn) pn.textContent = displayName;
            if (pb) pb.textContent = d.bio || '';
            if (si) si.textContent = d.shareableId || '0000000000';
            
            const emoji = getEmojiForUser(d);
            if (pa) pa.textContent = emoji;
            if (ca) ca.textContent = emoji;
        }
    } catch (e) {
        console.warn('خطأ في loadUserData:', e);
    }
}

// ==================== onAuthStateChanged ====================
if (typeof window.auth !== 'undefined') {
    window.auth.onAuthStateChanged(async (user) => {
        const splash = document.getElementById('splash'), app = document.getElementById('app');
        
        if (user) {
            fireAuthReady();
            await loadUserData(user.uid);
            showApp();
        } else {
            _authReadyFired = false;
            if (app) app.style.display = 'none';
            if (splash) splash.style.display = 'flex';
            setTimeout(() => {
                if (splash) splash.style.display = 'none';
                showLoginScreen();
            }, 2500);
        }
    });
}

function copyId() {
    const el = document.getElementById('shareableId');
    if (el) navigator.clipboard.writeText(el.textContent).then(() => alert('تم النسخ'));
}
