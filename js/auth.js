// توليد معرف عشوائي من 10 أرقام (أرقام فقط)
function generateShareableId() {
    // توليد 10 أرقام عشوائية
    let id = '';
    for (let i = 0; i < 10; i++) {
        id += Math.floor(Math.random() * 10).toString();
    }
    return id;
}

// دالة لتحديد الملصق المناسب
function getEmojiForUser(userData) {
    const emojiMap = {
        'male': '👨',
        'female': '👩',
        'boy': '🧒',
        'girl': '👧',
        'father': '👨‍🦳',
        'mother': '👩‍🦳',
        'grandfather': '👴',
        'grandmother': '👵'
    };
    return emojiMap[userData.avatarType] || '👤';
}

// تسجيل الدخول بجوجل
async function signInWithGoogle() {
    try {
        // استخدام googleProvider من window (الذي تم تعريفه في index.html)
        if (!window.auth || !window.googleProvider) {
            alert('مكتبة Firebase لم يتم تحميلها بعد. يرجى تحديث الصفحة.');
            return false;
        }
        
        const result = await window.auth.signInWithPopup(window.googleProvider);
        const user = result.user;
        
        // التحقق من وجود المستخدم في Firestore
        const userDoc = await window.db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            // مستخدم جديد - إنشاء ملفه
            const shareableId = generateShareableId();
            
            await window.db.collection('users').doc(user.uid).set({
                uid: user.uid,
                name: (user.displayName || 'مستخدم').substring(0, 25),
                email: user.email || '',
                shareableId: shareableId,
                bio: '',
                avatarType: 'male', // ملصق افتراضي
                followers: [],
                following: [],
                blocked: [],
                createdAt: new Date()
            });
        }
        
        // تحديث واجهة المستخدم
        updateUserUI();
        
        return true;
    } catch (error) {
        console.error('Login error:', error);
        
        // رسالة خطأ مخصصة
        let errorMessage = 'حدث خطأ في تسجيل الدخول';
        if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'تم إغلاق نافذة تسجيل الدخول';
        } else if (error.code === 'auth/cancelled-popup-request') {
            errorMessage = 'تم إلغاء طلب تسجيل الدخول';
        } else if (error.code === 'auth/network-request-failed') {
            errorMessage = 'خطأ في الشبكة. تحقق من اتصالك بالإنترنت';
        } else {
            errorMessage += ': ' + error.message;
        }
        
        alert(errorMessage);
        return false;
    }
}

// تحديث واجهة المستخدم بعد تسجيل الدخول
function updateUserUI() {
    const splash = document.getElementById('splash');
    const app = document.getElementById('app');
    
    if (splash) {
        splash.classList.add('hide');
        setTimeout(() => {
            splash.style.display = 'none';
            if (app) app.style.display = 'flex';
        }, 500);
    }
    
    // تحديث أزرار تسجيل الدخول
    const loginPrompt = document.querySelector('.login-prompt');
    if (loginPrompt) loginPrompt.remove();
}

// تسجيل الخروج
async function logout() {
    try {
        await window.auth.signOut();
        window.location.reload();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// تحميل بيانات المستخدم
async function loadUserData(uid) {
    try {
        const userDoc = await window.db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            // تحديث واجهة المستخدم
            const profileName = document.getElementById('profileName');
            const profileAvatarEmoji = document.getElementById('profileAvatarEmoji');
            const menuAvatarEmoji = document.getElementById('menuAvatarEmoji');
            const menuName = document.getElementById('menuName');
            const profileBio = document.getElementById('profileBio');
            const shareableId = document.getElementById('shareableId');
            const currentAvatarEmoji = document.getElementById('currentAvatarEmoji');
            
            if (profileName) profileName.textContent = (userData.name || 'مستخدم').substring(0, 25);
            if (menuName) menuName.textContent = (userData.name || 'مستخدم').substring(0, 25);
            if (profileBio) profileBio.textContent = userData.bio || '';
            
            // تحديث المعرف (يظهر كأرقام فقط)
            if (shareableId) shareableId.textContent = userData.shareableId || '0000000000';
            
            // تحديث الملصقات
            const avatarEmoji = getEmojiForUser(userData);
            
            if (profileAvatarEmoji) {
                profileAvatarEmoji.textContent = avatarEmoji;
            }
            if (menuAvatarEmoji) {
                menuAvatarEmoji.textContent = avatarEmoji;
            }
            if (currentAvatarEmoji) {
                currentAvatarEmoji.textContent = avatarEmoji;
            }
            
            // تحديث الإحصائيات
            const followersCount = document.getElementById('followersCount');
            const followingCount = document.getElementById('followingCount');
            
            if (followersCount) followersCount.textContent = (userData.followers || []).length;
            if (followingCount) followingCount.textContent = (userData.following || []).length;
            
            // تحميل قوائم المتابعين
            if (typeof loadFollowersList === 'function') {
                loadFollowersList(uid, userData.followers || []);
                loadFollowingList(uid, userData.following || []);
            }
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// إظهار رسالة تسجيل الدخول
function showLoginPrompt() {
    // التأكد من عدم وجود الرسالة مسبقاً
    if (document.querySelector('.login-prompt')) return;
    
    const loginPrompt = document.createElement('div');
    loginPrompt.className = 'login-prompt';
    loginPrompt.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 20px;
        right: 20px;
        background: var(--card-bg);
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 1000;
        text-align: center;
    `;
    
    loginPrompt.innerHTML = `
        <i class="fas fa-lock" style="font-size: 2rem; color: var(--primary); margin-bottom: 10px;"></i>
        <h3 style="margin-bottom: 10px;">${i18n ? i18n.t('login') : 'تسجيل الدخول'}</h3>
        <p style="margin-bottom: 20px; color: var(--text-light);">${i18n ? i18n.t('login_desc') : 'سجل دخولك للوصول إلى جميع الميزات'}</p>
        <button class="btn btn-primary" onclick="signInWithGoogle()" style="width: 100%;">${i18n ? i18n.t('login_with_google') : 'المتابعة بحساب جوجل'}</button>
    `;
    
    document.body.appendChild(loginPrompt);
}

// مراقبة حالة المستخدم
if (typeof window.auth !== 'undefined') {
    window.auth.onAuthStateChanged(async (user) => {
        console.log('Auth state changed:', user ? 'logged in' : 'logged out');
        
        const splash = document.getElementById('splash');
        const app = document.getElementById('app');
        
        if (user) {
            // مستخدم مسجل
            console.log('Loading user data for:', user.uid);
            await loadUserData(user.uid);
            
            if (splash) {
                splash.classList.add('hide');
                setTimeout(() => {
                    splash.style.display = 'none';
                    if (app) app.style.display = 'flex';
                }, 500);
            }
        } else {
            // مستخدم غير مسجل - انتظر 2 ثانية ثم أظهر المحتوى
            console.log('User not logged in, showing content after delay');
            setTimeout(() => {
                if (splash) {
                    splash.classList.add('hide');
                    setTimeout(() => {
                        splash.style.display = 'none';
                        if (app) app.style.display = 'flex';
                        
                        // إظهار رسالة تسجيل الدخول للميزات المهمة
                        setTimeout(showLoginPrompt, 1000);
                    }, 500);
                }
            }, 2000);
        }
    });
} else {
    console.error('auth is not defined. Firebase may not be loaded yet.');
    // محاولة إظهار رسالة تسجيل الدخول بعد فترة
    setTimeout(showLoginPrompt, 3000);
}

// نسخ المعرف
function copyId() {
    const idElement = document.getElementById('shareableId');
    if (!idElement) return;
    
    const id = idElement.textContent;
    navigator.clipboard.writeText(id).then(() => {
        alert(i18n ? i18n.t('copied') : 'تم النسخ');
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// البحث عن صديق بالمعرف - مع أسطر التشخيص
async function searchFriend() {
    console.log('🔍 === بدء البحث ===');
    console.log('window.db موجود؟', !!window.db);
    
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('searchResults');
    
    console.log('searchInput موجود؟', !!searchInput);
    console.log('resultsDiv موجود؟', !!resultsDiv);
    
    if (!searchInput || !resultsDiv) {
        console.error('❌ عناصر البحث غير موجودة');
        return;
    }
    
    const searchId = searchInput.value.trim();
    console.log('🔍 البحث عن:', searchId);
    
    if (!searchId || searchId.length !== 10 || !/^\d+$/.test(searchId)) {
        console.log('❌ رقم غير صالح:', searchId);
        alert('الرجاء إدخال 10 أرقام فقط');
        return;
    }
    
    resultsDiv.innerHTML = '<div class="loading" style="text-align: center; padding: 20px;">جاري البحث...</div>';
    console.log('⏳ جاري البحث في Firestore...');
    
    try {
        console.log('📦 Firestore collection: users');
        const snapshot = await window.db.collection('users')
            .where('shareableId', '==', searchId)
            .get();
        
        console.log('📊 عدد النتائج:', snapshot.size);
        
        if (snapshot.empty) {
            console.log('❌ لا توجد نتائج للمعرف:', searchId);
            resultsDiv.innerHTML = '<div class="empty-state" style="text-align: center; padding: 20px;">لا يوجد مستخدم بهذا المعرف</div>';
            return;
        }
        
        // عرض جميع النتائج
        snapshot.forEach(doc => {
            const user = doc.data();
            const userId = doc.id;
            const currentUser = window.auth ? window.auth.currentUser : null;
            
            console.log('✅ تم العثور على:', user.name, user.shareableId);
            
            if (currentUser && userId === currentUser.uid) {
                console.log('ℹ️ هذا هو المستخدم الحالي');
                resultsDiv.innerHTML = '<div class="empty-state" style="text-align: center; padding: 20px;">هذا معرفك أنت</div>';
                return;
            }
            
            const avatarEmoji = getEmojiForUser(user);
            
            resultsDiv.innerHTML = `
                <div class="search-result-item">
                    <div class="search-result-avatar-emoji">${avatarEmoji}</div>
                    <div class="search-result-info">
                        <h4>${user.name}</h4>
                        <p>${user.shareableId}</p>
                    </div>
                    ${currentUser ? '<button class="btn btn-primary" onclick="sendFriendRequest(\'' + userId + '\')">إضافة</button>' : ''}
                </div>
            `;
            console.log('✅ تم عرض النتيجة');
        });
        
    } catch (error) {
        console.error('❌ خطأ في البحث:', error);
        resultsDiv.innerHTML = '<div class="empty-state" style="text-align: center; padding: 20px;">حدث خطأ في البحث</div>';
    }
}

// إرسال طلب صداقة
async function sendFriendRequest(targetUserId) {
    if (!window.auth || !window.auth.currentUser) {
        alert('الرجاء تسجيل الدخول أولاً');
        return;
    }
    
    try {
        await window.db.collection('friendRequests').add({
            from: window.auth.currentUser.uid,
            to: targetUserId,
            status: 'pending',
            timestamp: new Date()
        });
        
        closeModal();
        alert('تم إرسال طلب الصداقة');
    } catch (error) {
        console.error('Error sending request:', error);
        alert('حدث خطأ في إرسال الطلب');
    }
}

// إزالة متابع
async function removeFollower(followerId) {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        await window.db.collection('users').doc(window.auth.currentUser.uid).update({
            followers: window.db.FieldValue.arrayRemove(followerId)
        });
        
        // تحديث القائمة
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (userDoc.exists) {
            loadFollowersList(window.auth.currentUser.uid, userDoc.data().followers || []);
        }
    } catch (error) {
        console.error('Error removing follower:', error);
    }
}

// إلغاء متابعة
async function unfollow(followingId) {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        await window.db.collection('users').doc(window.auth.currentUser.uid).update({
            following: window.db.FieldValue.arrayRemove(followingId)
        });
        
        await window.db.collection('users').doc(followingId).update({
            followers: window.db.FieldValue.arrayRemove(window.auth.currentUser.uid)
        });
        
        // تحديث القائمة
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (userDoc.exists) {
            loadFollowingList(window.auth.currentUser.uid, userDoc.data().following || []);
        }
    } catch (error) {
        console.error('Error unfollowing:', error);
    }
}

// تحميل قائمة المتابعين
async function loadFollowersList(currentUid, followers) {
    const followersList = document.getElementById('followersList');
    if (!followersList) return;
    
    if (!followers || followers.length === 0) {
        followersList.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><h3>لا يوجد متابعين</h3><p>لم يتابعك أحد بعد</p></div>';
        return;
    }
    
    let html = '';
    for (const followerId of followers) {
        try {
            const userDoc = await window.db.collection('users').doc(followerId).get();
            if (userDoc.exists) {
                const user = userDoc.data();
                const avatarEmoji = getEmojiForUser(user);
                
                html += `
                    <div class="user-item">
                        <div class="user-avatar-emoji">${avatarEmoji}</div>
                        <div class="user-info">
                            <h4>${user.name}</h4>
                            <p>${user.shareableId || ''}</p>
                        </div>
                        <div class="user-actions">
                            <button class="action-btn" onclick="openChat('${followerId}')"><i class="fas fa-comment"></i></button>
                            <button class="action-btn remove" onclick="removeFollower('${followerId}')"><i class="fas fa-user-minus"></i></button>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading follower:', error);
        }
    }
    followersList.innerHTML = html;
    
    // حفظ البيانات للصفحات الفرعية
    window.followersData = html;
}

// تحميل قائمة من يتابعهم
async function loadFollowingList(currentUid, following) {
    const followingList = document.getElementById('followingList');
    if (!followingList) return;
    
    if (!following || following.length === 0) {
        followingList.innerHTML = '<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا تتابع أحداً</h3><p>لم تتابع أي شخص بعد</p></div>';
        return;
    }
    
    let html = '';
    for (const followingId of following) {
        try {
            const userDoc = await window.db.collection('users').doc(followingId).get();
            if (userDoc.exists) {
                const user = userDoc.data();
                const avatarEmoji = getEmojiForUser(user);
                
                html += `
                    <div class="user-item">
                        <div class="user-avatar-emoji">${avatarEmoji}</div>
                        <div class="user-info">
                            <h4>${user.name}</h4>
                            <p>${user.shareableId || ''}</p>
                        </div>
                        <div class="user-actions">
                            <button class="action-btn" onclick="openChat('${followingId}')"><i class="fas fa-comment"></i></button>
                            <button class="action-btn following" onclick="unfollow('${followingId}')"><i class="fas fa-check"></i></button>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading following:', error);
        }
    }
    followingList.innerHTML = html;
    
    // حفظ البيانات للصفحات الفرعية
    window.followingData = html;
}
