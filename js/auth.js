// ========== auth.js - Rafeeq Auth via Cloudflare API ==========

// ✅ Google Client ID (الصحيح من Firebase)
const GOOGLE_CLIENT_ID = '578021976495-olbueuh63il6oberbrplpnjbjh0balko.apps.googleusercontent.com';

// ==================== دوال مساعدة ====================
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
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

// ==================== الشاشات ====================
function showApp() {
    const splash = document.getElementById('splash');
    const app = document.getElementById('app');
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.style.display = 'none';
    if (splash) splash.style.display = 'none';
    if (app) app.style.display = 'flex';
}

function showLoginScreen() {
    const splash = document.getElementById('splash');
    const loginScreen = document.getElementById('loginScreen');
    if (splash) splash.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'flex';
}

// ==================== Google Sign-In ====================
window.handleGoogleSignIn = async function(response) {
    console.log('🔐 Google Sign-In Response received');
    
    if (!response.credential) {
        alert('فشل تسجيل الدخول: لا يوجد credential');
        return;
    }
    
    const idToken = response.credential;
    
    try {
        showLoadingScreen('جاري تسجيل الدخول...');
        
        const result = await RafeeqAPI.auth.signInWithGoogle(idToken);
        
        if (!result.success || !result.user) {
            throw new Error('فشل تسجيل الدخول من السيرفر');
        }
        
        console.log('✅ تسجيل دخول ناجح:', result.user.name);
        
        RafeeqAPI.setUser(result.user);
        await loadUserData(result.user);
        
        hideLoadingScreen();
        showApp();
        
        window.dispatchEvent(new Event('authReady'));
        
        if (typeof SecureChatSystem !== 'undefined') {
            SecureChatSystem.init().catch(e => console.warn('⚠️ SecureChat:', e.message));
        }
        
        setTimeout(() => {
            if (typeof loadChats === 'function') {
                chatsLoaded = false;
                loadChats(true);
            }
            if (typeof ChatSystem !== 'undefined' && ChatSystem.loadAllChats) {
                ChatSystem.loadAllChats();
            }
        }, 500);
        
    } catch (error) {
        hideLoadingScreen();
        console.error('❌ Sign-In Error:', error);
        alert('فشل تسجيل الدخول: ' + error.message);
    }
};

// ==================== شاشات الانتظار ====================
function showLoadingScreen(message = 'جاري التحميل...') {
    let loader = document.getElementById('globalLoader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'globalLoader';
        loader.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.8);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            color: white;
            font-family: inherit;
        `;
        loader.innerHTML = `
            <div style="width: 50px; height: 50px; border: 4px solid rgba(100, 181, 246, 0.3); border-top-color: #64B5F6; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
            <div id="loaderMessage" style="font-size: 1rem; color: #64B5F6;"></div>
        `;
        
        const style = document.createElement('style');
        style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
        document.head.appendChild(style);
        
        document.body.appendChild(loader);
    }
    const msg = document.getElementById('loaderMessage');
    if (msg) msg.textContent = message;
    loader.style.display = 'flex';
}

function hideLoadingScreen() {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.style.display = 'none';
}

// ==================== تحميل بيانات المستخدم ====================
async function loadUserData(user) {
    try {
        if (!user) {
            const cached = RafeeqAPI.getUser();
            if (cached) user = cached;
        }
        
        if (!user) {
            console.warn('⚠️ لا توجد بيانات مستخدم');
            return;
        }
        
        const pn = document.getElementById('profileName');
        const pa = document.getElementById('profileAvatarEmoji');
        const pb = document.getElementById('profileBio');
        const si = document.getElementById('shareableId');
        const ca = document.getElementById('currentAvatarEmoji');
        const balanceEl = document.getElementById('profileBalance');
        
        let displayName = user.name || 'مستخدم';
        if (displayName.length > 15) {
            displayName = displayName.substring(0, 15);
        }
        
        if (pn) pn.textContent = displayName;
        if (pb) pb.textContent = user.bio || '';
        if (si) si.textContent = user.shareableId || '0000000000';
        
        const emoji = getEmojiForUser(user);
        if (pa) pa.textContent = emoji;
        if (ca) ca.textContent = emoji;
        
        if (balanceEl) {
            balanceEl.textContent = `$${(user.balance || 0).toFixed(2)}`;
        }
        
        console.log('✅ تم تحميل بيانات المستخدم:', displayName);
        
    } catch (e) {
        console.warn('⚠️ خطأ في loadUserData:', e);
    }
}

// ==================== تسجيل الخروج ====================
async function logout() {
    if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) return;
    
    try {
        await RafeeqAPI.auth.logout();
    } catch (e) {
        console.warn('Logout API error:', e);
    }
    
    RafeeqAPI.clearAll();
    window.location.reload();
}

// ==================== نسخ ID ====================
function copyId() {
    const el = document.getElementById('shareableId');
    if (!el) return;
    
    const text = el.textContent;
    navigator.clipboard.writeText(text).then(() => {
        alert('✅ تم نسخ الـ ID: ' + text);
    }).catch(() => {
        alert('فشل النسخ');
    });
}

// ==================== تهيئة Google Sign-In ====================
function initGoogleSignIn() {
    if (typeof google === 'undefined' || !google.accounts) {
        console.warn('⚠️ Google Identity Services not loaded yet');
        return false;
    }
    
    try {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: window.handleGoogleSignIn,
            auto_select: false,
            cancel_on_tap_outside: true
        });
        
        const signInDiv = document.querySelector('.g_id_signin');
        if (signInDiv) {
            google.accounts.id.renderButton(signInDiv, {
                type: 'standard',
                size: 'large',
                theme: 'filled_blue',
                text: 'sign_in_with',
                shape: 'pill',
                logo_alignment: 'left',
                width: 280
            });
        }
        
        console.log('✅ Google Sign-In initialized');
        return true;
    } catch (e) {
        console.error('❌ Google Sign-In init error:', e);
        return false;
    }
}

// ==================== التحقق من الجلسة عند التحميل ====================
async function checkExistingSession() {
    const token = RafeeqAPI.getToken();
    
    if (!token) {
        showLoginScreen();
        return false;
    }
    
    try {
        showLoadingScreen('جاري التحقق من الجلسة...');
        
        const result = await RafeeqAPI.auth.me();
        
        if (!result.success || !result.user) {
            throw new Error('جلسة غير صالحة');
        }
        
        RafeeqAPI.setUser(result.user);
        await loadUserData(result.user);
        
        hideLoadingScreen();
        showApp();
        
        window.dispatchEvent(new Event('authReady'));
        
        if (typeof SecureChatSystem !== 'undefined') {
            SecureChatSystem.init().catch(e => console.warn('⚠️ SecureChat:', e.message));
        }
        
        setTimeout(() => {
            if (typeof loadChats === 'function') {
                chatsLoaded = false;
                loadChats(true);
            }
            if (typeof ChatSystem !== 'undefined' && ChatSystem.loadAllChats) {
                ChatSystem.loadAllChats();
            }
        }, 500);
        
        return true;
        
    } catch (error) {
        console.warn('⚠️ فشل التحقق من الجلسة:', error.message);
        RafeeqAPI.clearAll();
        hideLoadingScreen();
        showLoginScreen();
        return false;
    }
}

// ==================== إشعار عند انتهاء الجلسة ====================
window.onSessionExpired = function() {
    console.warn('⚠️ انتهت الجلسة');
    RafeeqAPI.clearAll();
    alert('انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.');
    window.location.reload();
};

// ==================== تهيئة عند التحميل ====================
window.addEventListener('load', function() {
    console.log('🚀 auth.js - بدء التهيئة...');
    
    let attempts = 0;
    const waitForGoogle = setInterval(() => {
        attempts++;
        if (initGoogleSignIn()) {
            clearInterval(waitForGoogle);
            console.log('✅ Google Sign-In ready after', attempts, 'attempts');
        } else if (attempts > 20) {
            clearInterval(waitForGoogle);
            console.error('❌ Google Sign-In failed to load');
        }
    }, 250);
    
    checkExistingSession();
});

// ==================== تصدير الدوال ====================
window.startGoogleLogin = function() {
    if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.prompt();
    } else {
        alert('Google Sign-In غير جاهز. أعد تحميل الصفحة.');
    }
};

window.loadUserData = loadUserData;
window.showLoginScreen = showLoginScreen;
window.showApp = showApp;
window.logout = logout;
window.copyId = copyId;

console.log('✅ auth.js loaded - Cloudflare API mode');
console.log('📌 GOOGLE_CLIENT_ID:', GOOGLE_CLIENT_ID);
