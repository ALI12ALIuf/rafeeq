// ========== نظام المصادقة ==========

// توليد معرف عشوائي للمستخدم
function generateShareableId() {
    let id = '';
    for (let i = 0; i < 10; i++) {
        id += Math.floor(Math.random() * 10).toString();
    }
    return id;
}

// توليد أفاتار عشوائي
function getRandomAvatar() {
    const avatars = ['👨', '👩', '🧑', '👤', '🦸', '🦹', '🐱', '🐶', '🦊', '🐼'];
    return avatars[Math.floor(Math.random() * avatars.length)];
}

// تسجيل الدخول بـ Google
async function signInWithGoogle() {
    try {
        const result = await window.auth.signInWithPopup(window.googleProvider);
        const user = result.user;
        
        // التحقق من وجود المستخدم
        const userDoc = await window.db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            // إنشاء مستخدم جديد
            const shareableId = generateShareableId();
            const keyPair = await window.cryptoSystem.generateKeyPair();
            const publicKeyBase64 = await window.cryptoSystem.exportPublicKey(keyPair.publicKey);
            
            // حفظ المفتاح الخاص محلياً
            window.cryptoSystem.keyPairs.set(user.uid, keyPair);
            
            // حفظ البيانات في Firestore
            await window.db.collection('users').doc(user.uid).set({
                uid: user.uid,
                name: user.displayName || 'مستخدم',
                email: user.email || '',
                shareableId: shareableId,
                avatar: getRandomAvatar(),
                publicKey: publicKeyBase64,
                online: true,
                lastSeen: new Date(),
                createdAt: new Date()
            });
        } else {
            // مستخدم موجود - استرجاع المفتاح العام
            const userData = userDoc.data();
            const publicKey = await window.cryptoSystem.importPublicKey(userData.publicKey);
            
            // توليد مفتاح خاص جديد (يتم حفظه محلياً فقط)
            const keyPair = await window.cryptoSystem.generateKeyPair();
            window.cryptoSystem.keyPairs.set(user.uid, keyPair);
        }
        
        // تحديث حالة الاتصال
        await window.db.collection('users').doc(user.uid).update({
            online: true,
            lastSeen: new Date()
        });
        
        // تهيئة الأنظمة
        window.signaling.init(user.uid);
        window.p2pManager.init(user.uid);
        
        // تحديث الواجهة
        updateUIAfterLogin(user);
        
        return true;
    } catch (error) {
        console.error('Login error:', error);
        alert('حدث خطأ في تسجيل الدخول: ' + error.message);
        return false;
    }
}

// تحديث الواجهة بعد تسجيل الدخول
function updateUIAfterLogin(user) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('splash').style.display = 'none';
    
    // تحميل المحادثات
    if (window.loadChats) {
        window.loadChats();
    }
}

// تسجيل الخروج
async function logout() {
    if (window.auth.currentUser) {
        // تحديث حالة عدم الاتصال
        await window.db.collection('users').doc(window.auth.currentUser.uid).update({
            online: false,
            lastSeen: new Date()
        });
        
        // إغلاق جميع الاتصالات
        if (window.p2pManager) {
            window.p2pManager.activeConnections.forEach((_, peerId) => {
                window.p2pManager.closeConnection(peerId);
            });
        }
        
        await window.auth.signOut();
    }
    
    window.location.reload();
}

// مراقبة حالة المصادقة
window.auth.onAuthStateChanged(async (user) => {
    const splash = document.getElementById('splash');
    const loginScreen = document.getElementById('loginScreen');
    const app = document.getElementById('app');
    
    if (user) {
        console.log('User logged in:', user.uid);
        
        // تحميل بيانات المستخدم
        const userDoc = await window.db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            const publicKey = await window.cryptoSystem.importPublicKey(userData.publicKey);
            
            // توليد مفتاح خاص جديد
            const keyPair = await window.cryptoSystem.generateKeyPair();
            window.cryptoSystem.keyPairs.set(user.uid, keyPair);
            
            // تهيئة الأنظمة
            window.signaling.init(user.uid);
            window.p2pManager.init(user.uid);
            
            // تحديث حالة الاتصال
            await window.db.collection('users').doc(user.uid).update({
                online: true,
                lastSeen: new Date()
            });
        }
        
        // إخفاء شاشة التحميل وإظهار التطبيق
        setTimeout(() => {
            splash.style.display = 'none';
            loginScreen.style.display = 'none';
            app.style.display = 'flex';
            
            if (window.loadChats) {
                window.loadChats();
            }
        }, 500);
    } else {
        console.log('User not logged in');
        
        // إظهار واجهة تسجيل الدخول
        setTimeout(() => {
            splash.style.display = 'none';
            loginScreen.style.display = 'flex';
            app.style.display = 'none';
        }, 1000);
    }
});

// إعداد مستمع حالة الإنترنت
window.addEventListener('online', async () => {
    if (window.auth.currentUser) {
        await window.db.collection('users').doc(window.auth.currentUser.uid).update({
            online: true,
            lastSeen: new Date()
        });
    }
});

window.addEventListener('offline', async () => {
    if (window.auth.currentUser) {
        await window.db.collection('users').doc(window.auth.currentUser.uid).update({
            online: false,
            lastSeen: new Date()
        });
    }
});

// تحديث الحالة قبل إغلاق الصفحة
window.addEventListener('beforeunload', async () => {
    if (window.auth.currentUser) {
        await window.db.collection('users').doc(window.auth.currentUser.uid).update({
            online: false,
            lastSeen: new Date()
        });
    }
});
