// ========== auth.js ==========
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
    _captchaActive = false;
    _captchaBlocked = false;
    _captchaAttempts = 0;
    _isLoggingIn = false;
    _pendingGoogleUser = null;
    if (_captchaBlockTimer) { clearTimeout(_captchaBlockTimer); _captchaBlockTimer = null; }
    if (_captchaCountdownTimer) { clearInterval(_captchaCountdownTimer); _captchaCountdownTimer = null; }
    sessionStorage.removeItem('_captchaTotalAttempts');
    sessionStorage.setItem('_captchaVerified', 'true');
    
    const splash = document.getElementById('splash'), app = document.getElementById('app');
    const loginScreen = document.querySelector('.login-screen');
    const captchaScreen = document.querySelector('.captcha-screen');
    if (loginScreen) loginScreen.remove();
    if (captchaScreen) captchaScreen.remove();
    if (splash) { splash.style.display = 'none'; }
    if (app) { app.style.display = 'flex'; }
}

// ==================== القسم 3: showLoginScreen ====================
function showLoginScreen() {
    if (_captchaActive || _isLoggingIn) return;
    const el = document.querySelector('.login-screen'); if (el) el.remove();
    const cap = document.querySelector('.captcha-screen'); if (cap) cap.remove();
    const d = document.createElement('div'); d.className = 'login-screen'; d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:10000;';
    d.innerHTML = `<div style="text-align:center;padding:20px;max-width:350px;"><div style="font-size:5rem;">🛡️</div><h1 style="font-size:2rem;color:var(--primary);">رفيق</h1><p style="color:var(--text-light);margin-bottom:2rem;">سجل دخولك للوصول إلى جميع الميزات</p><button onclick="startGoogleLogin()" style="background:var(--primary);color:white;border:none;border-radius:30px;padding:15px 30px;font-size:1.1rem;cursor:pointer;width:100%;"><i class="fab fa-google"></i> المتابعة بحساب جوجل</button></div>`;
    document.body.appendChild(d);
}

// ==================== القسم 4: startGoogleLogin ====================
async function startGoogleLogin() {
    _isLoggingIn = true;
    sessionStorage.removeItem('_captchaVerified');
    try {
        if (!window.auth || !window.googleProvider) { _isLoggingIn = false; alert('مكتبة Firebase لم يتم تحميلها بعد.'); return; }
        
        const splash = document.getElementById('splash');
        if (splash) { splash.style.display = 'none'; }
        
        const loginScreen = document.querySelector('.login-screen');
        if (loginScreen) { loginScreen.style.opacity = '0'; setTimeout(() => { if (loginScreen) loginScreen.remove(); }, 200); }
        
        _captchaActive = true;
        _captchaBlocked = false;
        _captchaAttempts = 0;
        _pendingGoogleUser = null;
        
        const result = await window.auth.signInWithPopup(window.googleProvider);
        _pendingGoogleUser = result.user;
        
        if (_pendingGoogleUser) {
            showCaptchaScreen(async () => {
                if (_pendingGoogleUser) {
                    await saveUserAndEnter(_pendingGoogleUser);
                    _pendingGoogleUser = null;
                }
            });
        }
        
    } catch (error) {
        _pendingGoogleUser = null;
        _captchaActive = false;
        _isLoggingIn = false;
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
                uid: user.uid, name: (user.displayName || 'مستخدم').substring(0, 25),
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
        _isLoggingIn = false;
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
    // ✅ تنظيف العناصر الديناميكية قبل الخروج
    if (typeof CallSystem !== 'undefined' && CallSystem.cleanupDynamicElements) {
        console.log('🧹 تنظيف العناصر الديناميكية قبل تسجيل الخروج');
        CallSystem.cleanupDynamicElements();
    }
    
    // ✅ تنظيف أي مؤقتات عالقة في ChatSystem
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
    
    sessionStorage.removeItem('_captchaVerified');
    PresenceSystem.stopAll();
    
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
            if (pn) pn.textContent = (d.name || 'مستخدم').substring(0, 25);
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

// ==================== القسم 9: مراقب حالة تسجيل الدخول ====================
if (typeof window.auth !== 'undefined') {
    window.auth.onAuthStateChanged(async (user) => {
        const splash = document.getElementById('splash'), app = document.getElementById('app');
        
        if (user) {
            if (_captchaActive) return;
            
            const isVerified = sessionStorage.getItem('_captchaVerified') === 'true';
            
            if (!isVerified) {
                _pendingGoogleUser = user;
                _captchaActive = true;
                _isLoggingIn = true;
                
                if (app) app.style.display = 'none';
                if (splash) { splash.style.display = 'none'; }
                const loginEl = document.querySelector('.login-screen');
                if (loginEl) loginEl.remove();
                const capEl = document.querySelector('.captcha-screen');
                if (capEl) capEl.remove();
                
                showCaptchaScreen(async () => {
                    await saveUserAndEnter(user);
                    _pendingGoogleUser = null;
                });
                return;
            }
            
            await loadUserData(user.uid);
            setupFriendRequestsListener(user.uid);
            if (typeof SecureChatSystem !== 'undefined') await SecureChatSystem.init();
            showApp();
        } else {
            if (_isLoggingIn || _captchaActive) return;
            
            if (app) app.style.display = 'none';
            if (splash) { splash.style.display = 'flex'; }
            
            setTimeout(() => {
                if (!_isLoggingIn && !_captchaActive) {
                    if (splash) { splash.style.display = 'none'; }
                    showLoginScreen();
                }
            }, 2500);
        }
    });
}

// ==================== القسم 10: copyId ====================
function copyId() { 
    const el = document.getElementById('shareableId'); 
    if (el) navigator.clipboard.writeText(el.textContent).then(() => alert('تم النسخ')); 
}
