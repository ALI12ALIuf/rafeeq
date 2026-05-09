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

// ========== متغيرات الكابتشا ==========
let _captchaCode = '';
let _captchaBlocked = false;
let _captchaActive = false;
let _pendingGoogleUser = null;
let _isLoggingIn = false;
let _captchaBlockTimer = null;
let _captchaCountdownTimer = null;
let _captchaRemainingSeconds = 0;
const MAX_CAPTCHA_ATTEMPTS = 3;

function showApp() {
    _captchaActive = false;
    _captchaBlocked = false;
    _isLoggingIn = false;
    _pendingGoogleUser = null;
    if (_captchaBlockTimer) { clearTimeout(_captchaBlockTimer); _captchaBlockTimer = null; }
    if (_captchaCountdownTimer) { clearInterval(_captchaCountdownTimer); _captchaCountdownTimer = null; }
    sessionStorage.removeItem('_captchaBlockCount');
    sessionStorage.setItem('_captchaVerified', 'true');
    
    const splash = document.getElementById('splash'), app = document.getElementById('app');
    const loginScreen = document.querySelector('.login-screen');
    const captchaScreen = document.querySelector('.captcha-screen');
    if (loginScreen) loginScreen.remove();
    if (captchaScreen) captchaScreen.remove();
    if (splash) { splash.style.display = 'none'; }
    if (app) { app.style.display = 'flex'; }
}

function showLoginScreen() {
    if (_captchaActive || _isLoggingIn) return;
    const el = document.querySelector('.login-screen'); if (el) el.remove();
    const cap = document.querySelector('.captcha-screen'); if (cap) cap.remove();
    const d = document.createElement('div'); d.className = 'login-screen'; d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:10000;';
    d.innerHTML = `<div style="text-align:center;padding:20px;max-width:350px;"><div style="font-size:5rem;">🛡️</div><h1 style="font-size:2rem;color:var(--primary);">رفيق</h1><p style="color:var(--text-light);margin-bottom:2rem;">سجل دخولك للوصول إلى جميع الميزات</p><button onclick="startGoogleLogin()" style="background:var(--primary);color:white;border:none;border-radius:30px;padding:15px 30px;font-size:1.1rem;cursor:pointer;width:100%;"><i class="fab fa-google"></i> المتابعة بحساب جوجل</button></div>`;
    document.body.appendChild(d);
}

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

// ========== توليد الكابتشا محلياً ==========
function generateCaptchaLocal() {
    _captchaCode = Math.floor(100000 + Math.random() * 900000).toString();
    return _captchaCode;
}

function refreshCaptchaDisplayLocal() {
    const code = generateCaptchaLocal();
    const display = document.getElementById('captchaDisplay');
    if (display) display.textContent = code;
    return code;
}

async function showCaptchaScreen(onSuccess) {
    _captchaActive = true;
    _captchaBlocked = false;
    const captchaCode = generateCaptchaLocal();
    
    const existing = document.querySelector('.captcha-screen');
    if (existing) existing.remove();
    
    const d = document.createElement('div');
    d.className = 'captcha-screen';
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:10001;';
    d.innerHTML = `
        <div style="text-align:center;padding:30px;max-width:400px;width:90%;background:var(--card-bg);border-radius:20px;box-shadow:var(--shadow);">
            <div style="font-size:4rem;margin-bottom:1rem;">🔐</div>
            <p style="color:var(--primary);margin-bottom:1.5rem;font-size:1.1rem;font-weight:600;">أدخل الرمز الظاهر للمتابعة</p>
            
            <div style="background:var(--light);padding:20px;border-radius:15px;margin-bottom:1.5rem;letter-spacing:8px;font-size:2.2rem;font-weight:bold;color:var(--primary);font-family:monospace;user-select:none;direction:ltr;" id="captchaDisplay">${captchaCode}</div>
            
            <div style="display:flex;gap:8px;justify-content:center;margin-bottom:1.5rem;direction:ltr;">
                <input type="tel" maxlength="1" class="captcha-input" pattern="[0-9]" inputmode="numeric" style="width:45px;height:55px;text-align:center;font-size:1.5rem;font-weight:bold;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);direction:ltr;" oninput="handleCaptchaInput(this, 0)" onkeydown="handleCaptchaKeyDown(event, this, 0)" onpaste="handleCaptchaPaste(event)">
                <input type="tel" maxlength="1" class="captcha-input" pattern="[0-9]" inputmode="numeric" style="width:45px;height:55px;text-align:center;font-size:1.5rem;font-weight:bold;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);direction:ltr;" oninput="handleCaptchaInput(this, 1)" onkeydown="handleCaptchaKeyDown(event, this, 1)">
                <input type="tel" maxlength="1" class="captcha-input" pattern="[0-9]" inputmode="numeric" style="width:45px;height:55px;text-align:center;font-size:1.5rem;font-weight:bold;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);direction:ltr;" oninput="handleCaptchaInput(this, 2)" onkeydown="handleCaptchaKeyDown(event, this, 2)">
                <input type="tel" maxlength="1" class="captcha-input" pattern="[0-9]" inputmode="numeric" style="width:45px;height:55px;text-align:center;font-size:1.5rem;font-weight:bold;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);direction:ltr;" oninput="handleCaptchaInput(this, 3)" onkeydown="handleCaptchaKeyDown(event, this, 3)">
                <input type="tel" maxlength="1" class="captcha-input" pattern="[0-9]" inputmode="numeric" style="width:45px;height:55px;text-align:center;font-size:1.5rem;font-weight:bold;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);direction:ltr;" oninput="handleCaptchaInput(this, 4)" onkeydown="handleCaptchaKeyDown(event, this, 4)">
                <input type="tel" maxlength="1" class="captcha-input" pattern="[0-9]" inputmode="numeric" style="width:45px;height:55px;text-align:center;font-size:1.5rem;font-weight:bold;border:2px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);direction:ltr;" oninput="handleCaptchaInput(this, 5)" onkeydown="handleCaptchaKeyDown(event, this, 5)">
            </div>
            
            <p style="color:var(--danger);font-size:0.85rem;margin-bottom:1rem;min-height:20px;" id="captchaError"></p>
            
            <button onclick="verifyCaptcha()" style="background:var(--primary);color:white;border:none;border-radius:25px;padding:12px 40px;font-size:1.1rem;cursor:pointer;width:100%;" id="captchaVerifyBtn">تحقق</button>
            <button onclick="generateNewCaptcha()" style="background:none;border:none;color:var(--text-light);margin-top:1rem;cursor:pointer;font-size:0.9rem;" id="captchaRefreshBtn">رمز جديد</button>
        </div>`;
    document.body.appendChild(d);
    d._onSuccess = onSuccess;
    
    setTimeout(() => {
        const firstInput = document.querySelector('.captcha-input');
        if (firstInput) firstInput.focus();
    }, 300);
}

function updateInputColors() {
    const inputs = document.querySelectorAll('.captcha-input');
    for (let i = 0; i < 6; i++) {
        if (inputs[i].value !== '') {
            if (inputs[i].value === _captchaCode[i]) {
                inputs[i].style.borderColor = '#4CAF50';
                inputs[i].style.background = 'rgba(76,175,80,0.1)';
            } else {
                inputs[i].style.borderColor = '#f44336';
                inputs[i].style.background = 'rgba(244,67,54,0.1)';
            }
        } else {
            inputs[i].style.borderColor = 'var(--border)';
            inputs[i].style.background = 'var(--bg)';
        }
    }
}

function resetInputs() {
    const inputs = document.querySelectorAll('.captcha-input');
    inputs.forEach(input => { input.value = ''; input.style.borderColor = 'var(--border)'; input.style.background = 'var(--bg)'; });
    inputs[0].focus();
}

window.handleCaptchaInput = function(input, index) {
    input.value = input.value.replace(/\D/g, '');
    updateInputColors();
    if (input.value.length === 1 && index < 5) {
        const inputs = document.querySelectorAll('.captcha-input');
        if (inputs[index + 1]) inputs[index + 1].focus();
    }
};

window.handleCaptchaKeyDown = function(event, input, index) {
    if (event.key === 'Backspace' && input.value === '' && index > 0) {
        const inputs = document.querySelectorAll('.captcha-input');
        if (inputs[index - 1]) { inputs[index - 1].focus(); inputs[index - 1].value = ''; updateInputColors(); }
    }
    if (event.key === 'Enter') { verifyCaptcha(); }
};

window.handleCaptchaPaste = function(event) {
    event.preventDefault();
    const paste = (event.clipboardData || window.clipboardData).getData('text');
    const digits = paste.replace(/\D/g, '').slice(0, 6);
    const inputs = document.querySelectorAll('.captcha-input');
    for (let i = 0; i < 6; i++) { inputs[i].value = digits[i] || ''; }
    updateInputColors();
    if (digits.length === 6) { inputs[5].focus(); setTimeout(() => verifyCaptcha(), 200); }
};

// ========== التحقق من الكابتشا (محلي فقط) ==========
window.verifyCaptcha = function() {
    if (_captchaBlocked) return;
    
    const inputs = document.querySelectorAll('.captcha-input');
    let enteredCode = '';
    inputs.forEach(input => { enteredCode += input.value; });
    
    const errorEl = document.getElementById('captchaError');
    
    if (enteredCode.length < 6) {
        if (errorEl) { errorEl.textContent = 'الرجاء إدخال 6 أرقام كاملة'; errorEl.style.color = 'var(--danger)'; }
        return;
    }
    
    if (enteredCode === _captchaCode) {
        _captchaActive = false;
        _captchaBlocked = false;
        if (_captchaBlockTimer) { clearTimeout(_captchaBlockTimer); _captchaBlockTimer = null; }
        if (_captchaCountdownTimer) { clearInterval(_captchaCountdownTimer); _captchaCountdownTimer = null; }
        sessionStorage.setItem('_captchaVerified', 'true');
        sessionStorage.removeItem('_captchaBlockCount');
        const captchaScreen = document.querySelector('.captcha-screen');
        if (captchaScreen) {
            inputs.forEach(input => { input.style.borderColor = '#4CAF50'; input.style.background = 'rgba(76,175,80,0.2)'; });
            const onSuccess = captchaScreen._onSuccess;
            captchaScreen.remove();
            if (onSuccess) onSuccess();
        }
    } else {
        if (errorEl) { errorEl.textContent = 'رمز غير صحيح'; errorEl.style.color = 'var(--danger)'; }
        for (let i = 0; i < 6; i++) {
            if (inputs[i].value !== _captchaCode[i]) {
                inputs[i].style.borderColor = '#f44336';
                inputs[i].style.background = 'rgba(244,67,54,0.2)';
            }
        }
        setTimeout(() => {
            refreshCaptchaDisplayLocal();
            resetInputs();
        }, 800);
    }
};

window.generateNewCaptcha = function() {
    if (_captchaBlocked) return;
    refreshCaptchaDisplayLocal();
    const errorEl = document.getElementById('captchaError');
    if (errorEl) { errorEl.textContent = ''; }
    resetInputs();
};

async function signInWithGoogle() { await startGoogleLogin(); }
function updateUserUI() { const splash = document.getElementById('splash'), app = document.getElementById('app'); if (splash) { splash.classList.add('hide'); setTimeout(() => { splash.style.display = 'none'; if (app) app.style.display = 'flex'; }, 500); } }
async function logout() { sessionStorage.removeItem('_captchaVerified'); try { await window.auth.signOut(); window.location.reload(); } catch (e) {} }

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

// ========== نظام الصداقة ==========
window.showFriendsList = function() { document.querySelector('.profile-page').style.display = 'none'; document.getElementById('friendsPage').style.display = 'block'; loadFriendsList(); };

async function loadFriendsList() {
    if (!window.auth?.currentUser) return;
    const list = document.getElementById('friendsList'); if (!list) return;
    try {
        const doc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (!doc.exists) return;
        const friends = doc.data().friends || [];
        if (!friends.length) { list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا يوجد أصدقاء</h3><p>لم تضف أي أصدقاء بعد</p></div>`; return; }
        let html = '';
        for (const fid of friends) {
            try {
                const f = await window.db.collection('users').doc(fid).get();
                if (f.exists) { const d = f.data(); html += `<div class="user-item"><div class="user-avatar-emoji">${getEmojiForUser(d)}</div><div class="user-info"><h4>${d.name||'مستخدم'}</h4><p>${d.shareableId||''}</p></div><div class="user-actions"><button class="action-btn" onclick="openChat('${fid}')"><i class="fas fa-comment"></i></button><button class="action-btn" onclick="removeFriend('${fid}')" style="background:var(--danger);color:white;"><i class="fas fa-user-minus"></i></button></div></div>`; }
            } catch (e) {}
        }
        list.innerHTML = html;
    } catch (e) { list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>خطأ</h3></div>`; }
}

window.removeFriend = async function(friendId) {
    if (!window.auth?.currentUser || !confirm('هل أنت متأكد من حذف هذا الصديق؟')) return;
    try { const uid = window.auth.currentUser.uid; await window.db.collection('users').doc(uid).update({ friends: FieldValue.arrayRemove(friendId) }); await window.db.collection('users').doc(friendId).update({ friends: FieldValue.arrayRemove(uid) }); await updateFriendsCount(); await loadFriendsList(); alert('تم حذف الصديق بنجاح'); } catch (e) { alert('حدث خطأ'); }
};

async function updateFriendsCount() {
    if (!window.auth?.currentUser) return;
    try { const d = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); if (d.exists) { const c = document.getElementById('friendsCount'); if (c) c.textContent = formatNumber((d.data().friends||[]).length); } } catch (e) {}
}

window.showFriendRequests = function() { document.querySelector('.profile-page').style.display = 'none'; document.getElementById('friendRequestsPage').style.display = 'block'; loadFriendRequests(); };

async function loadFriendRequests() {
    if (!window.auth?.currentUser) return;
    const list = document.getElementById('friendRequestsList'); if (!list) return;
    try {
        const s = await window.db.collection('friendRequests').where('to', '==', window.auth.currentUser.uid).where('status', '==', 'pending').get();
        if (s.empty) { list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3><p>لم يرسل لك أحد طلب صداقة بعد</p></div>`; return; }
        let html = '', reqs = [];
        s.forEach(d => reqs.push({ id: d.id, ...d.data() }));
        reqs.sort((a, b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0));
        for (const r of reqs) {
            try {
                const sender = await window.db.collection('users').doc(r.from).get();
                if (sender.exists) { const sd = sender.data(); html += `<div class="user-item" id="request-${r.id}"><div class="user-avatar-emoji">${getEmojiForUser(sd)}</div><div class="user-info"><h4>${sd.name||'مستخدم'}</h4><p>${sd.shareableId||''}</p></div><div class="user-actions"><button class="action-btn" style="background:var(--success);color:white;" onclick="acceptFriendRequest('${r.id}','${r.from}')"><i class="fas fa-check"></i></button><button class="action-btn remove" onclick="rejectFriendRequest('${r.id}')"><i class="fas fa-times"></i></button></div></div>`; }
            } catch (e) {}
        }
        list.innerHTML = html || `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3></div>`;
    } catch (e) { list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>خطأ</h3></div>`; }
}

window.acceptFriendRequest = async function(requestId, senderId) {
    if (!window.auth?.currentUser) return;
    try {
        const uid = window.auth.currentUser.uid;
        await window.db.collection('friendRequests').doc(requestId).update({ status: 'accepted', respondedAt: new Date() });
        await window.db.collection('users').doc(uid).update({ friends: FieldValue.arrayUnion(senderId) });
        await window.db.collection('users').doc(senderId).update({ friends: FieldValue.arrayUnion(uid) });
        document.getElementById(`request-${requestId}`)?.remove();
        await updateFriendRequestsCount(); await updateFriendsCount();
        if (!document.querySelectorAll('[id^="request-"]').length) document.getElementById('friendRequestsList').innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3></div>`;
    } catch (e) { alert('حدث خطأ'); }
};

window.rejectFriendRequest = async function(requestId) {
    if (!window.auth?.currentUser) return;
    try { await window.db.collection('friendRequests').doc(requestId).update({ status: 'rejected', respondedAt: new Date() }); document.getElementById(`request-${requestId}`)?.remove(); await updateFriendRequestsCount(); if (!document.querySelectorAll('[id^="request-"]').length) document.getElementById('friendRequestsList').innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3></div>`; } catch (e) {}
};

async function updateFriendRequestsCount() {
    if (!window.auth?.currentUser) return;
    try { const s = await window.db.collection('friendRequests').where('to', '==', window.auth.currentUser.uid).where('status', '==', 'pending').get(); const c = document.getElementById('friendRequestsCount'); if (c) c.textContent = formatNumber(s.size); } catch (e) {}
}

window.addNewFriend = async function(targetUserId) {
    if (!window.auth?.currentUser) return;
    const uid = window.auth.currentUser.uid;
    if (uid === targetUserId) { alert('لا يمكنك إضافة نفسك'); return; }
    try {
        const exist = await window.db.collection('friendRequests').where('from', '==', uid).where('to', '==', targetUserId).where('status', '==', 'pending').get();
        if (!exist.empty) { alert('أرسلت طلباً مسبقاً'); return; }
        const me = await window.db.collection('users').doc(uid).get();
        if (me.exists && (me.data().friends||[]).includes(targetUserId)) { alert('صديقك بالفعل'); return; }
        await window.db.collection('friendRequests').add({ from: uid, to: targetUserId, status: 'pending', timestamp: new Date() });
        const rc = document.getElementById('searchResultsContainer'); if (rc) { rc.style.display = 'none'; rc.innerHTML = ''; }
        const si = document.getElementById('searchInput'); if (si) si.value = '';
        alert('تم إرسال طلب الصداقة');
    } catch (e) { alert('حدث خطأ'); }
};

function setupFriendRequestsListener(userId) {
    try { window.db.collection('friendRequests').where('to', '==', userId).where('status', '==', 'pending').onSnapshot(s => { const c = document.getElementById('friendRequestsCount'); if (c) c.textContent = formatNumber(s.size); if (document.getElementById('friendRequestsPage')?.style.display === 'block') loadFriendRequests(); }); } catch (e) {}
}

// ========== مراقب حالة تسجيل الدخول ==========
if (typeof window.auth !== 'undefined') {
    window.auth.onAuthStateChanged(async (user) => {
        const splash = document.getElementById('splash'), app = document.getElementById('app');
        
        if (user) {
            if (_captchaActive) return;
            
            // فحص محلي: هل المستخدم مجتاز الكابتشا؟
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

function copyId() { const el = document.getElementById('shareableId'); if (el) navigator.clipboard.writeText(el.textContent).then(() => alert('تم النسخ')); }

window.findUserById = async function() {
    const inp = document.getElementById('searchInput'), rc = document.getElementById('searchResultsContainer');
    if (!inp || !rc) return;
    const q = inp.value.trim();
    if (!q) { rc.style.display = 'none'; return; }
    rc.style.display = 'block'; rc.innerHTML = `<div style="text-align:center;padding:10px;">جاري البحث...</div>`;
    try {
        const s = await window.db.collection('users').where('shareableId', '==', q).get();
        if (s.empty) { rc.innerHTML = `<div style="text-align:center;padding:15px;">لا يوجد مستخدم</div>`; return; }
        const u = s.docs[0].data(), uid = s.docs[0].id, cu = window.auth?.currentUser;
        if (cu && uid === cu.uid) { rc.innerHTML = `<div style="text-align:center;padding:15px;">هذا حسابك الشخصي</div>`; return; }
        let btn = 'إضافة', dis = '';
        if (cu) { const me = await window.db.collection('users').doc(cu.uid).get(); if ((me.data().friends||[]).includes(uid)) { btn = 'أصدقاء'; dis = 'disabled style="opacity:0.5;"'; } else { const er = await window.db.collection('friendRequests').where('from','==',cu.uid).where('to','==',uid).where('status','==','pending').get(); if (!er.empty) { btn = 'طلب معلق'; dis = 'disabled style="opacity:0.5;"'; } } }
        rc.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:8px;"><div style="width:40px;height:40px;border-radius:50%;background:var(--light);display:flex;align-items:center;justify-content:center;font-size:1.8rem;">${getEmojiForUser(u)}</div><div style="flex:1;"><h4>${u.name}</h4><p style="color:var(--text-light);">${u.shareableId}</p></div>${cu?`<button onclick="addNewFriend('${uid}')" ${dis}>${btn}</button>`:''}</div>`;
    } catch (e) { rc.innerHTML = `<div style="text-align:center;padding:15px;">حدث خطأ</div>`; }
};

window.hideSearchResults = function() { const rc = document.getElementById('searchResultsContainer'); if (rc) { rc.style.display = 'none'; rc.innerHTML = ''; } };
