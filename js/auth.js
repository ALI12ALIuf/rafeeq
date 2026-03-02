// توليد معرف عشوائي من 10 أرقام
function generateShareableId() {
    return Math.random().toString(36).substring(2, 12).toUpperCase();
}

// دالة لتوليد لون ثابت من الاسم
function getColorFromName(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#2196F3', '#4CAF50', '#FF9800', '#E91E63', '#9C27B0', '#3F51B5', '#009688', '#FF5722'];
    return colors[Math.abs(hash) % colors.length];
}

// دالة لتحديد الأيقونة المناسبة
function getAvatarForUser(userData) {
    const defaultIcon = 'fas fa-user-circle';
    if (userData.avatarType) {
        const iconMap = {
            'male': 'fas fa-user',
            'female': 'fas fa-user',
            'boy': 'fas fa-child',
            'girl': 'fas fa-child',
            'father': 'fas fa-user-tie',
            'mother': 'fas fa-user',
            'grandfather': 'fas fa-user',
            'grandmother': 'fas fa-user'
        };
        return iconMap[userData.avatarType] || defaultIcon;
    }
    return defaultIcon;
}

// تسجيل الدخول بجوجل
async function signInWithGoogle() {
    try {
        const result = await auth.signInWithPopup(googleProvider);
        const user = result.user;
        
        // التحقق من وجود المستخدم في Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            // مستخدم جديد - إنشاء ملفه
            const shareableId = generateShareableId();
            
            await db.collection('users').doc(user.uid).set({
                uid: user.uid,
                name: user.displayName || 'مستخدم',
                email: user.email || '',
                shareableId: shareableId,
                bio: '',
                avatarType: 'male', // أيقونة افتراضية
                avatarColor: getColorFromName(user.displayName || 'مستخدم'),
                followers: [],
                following: [],
                blocked: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // تحديث واجهة المستخدم
        updateUserUI();
        
        return true;
    } catch (error) {
        console.error('Login error:', error);
        alert('حدث خطأ في تسجيل الدخول: ' + error.message);
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
        await auth.signOut();
        window.location.reload();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// تحميل بيانات المستخدم
async function loadUserData(uid) {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            // تحديث واجهة المستخدم
            const profileName = document.getElementById('profileName');
            const profileAvatarIcon = document.getElementById('profileAvatarIcon');
            const menuAvatarIcon = document.getElementById('menuAvatarIcon');
            const menuName = document.getElementById('menuName');
            const profileBio = document.getElementById('profileBio');
            const shareableId = document.getElementById('shareableId');
            
            if (profileName) profileName.textContent = (userData.name || 'مستخدم').substring(0, 25);
            if (menuName) menuName.textContent = (userData.name || 'مستخدم').substring(0, 25);
            if (profileBio) profileBio.textContent = userData.bio || '';
            if (shareableId) shareableId.textContent = userData.shareableId || '---';
            
            // تحديث الأيقونات
            const avatarIcon = getAvatarForUser(userData);
            const avatarColor = userData.avatarColor || '#2196F3';
            
            if (profileAvatarIcon) {
                profileAvatarIcon.innerHTML = `<i class="${avatarIcon}" style="color: ${avatarColor}; font-size: 5rem;"></i>`;
            }
            if (menuAvatarIcon) {
                menuAvatarIcon.innerHTML = `<i class="${avatarIcon}" style="color: ${avatarColor}; font-size: 2.5rem;"></i>`;
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
auth.onAuthStateChanged(async (user) => {
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

// البحث عن صديق بالمعرف
async function searchFriend() {
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('searchResults');
    
    if (!searchInput || !resultsDiv) return;
    
    const searchId = searchInput.value.trim().toUpperCase();
    if (!searchId || searchId.length !== 10) {
        alert('الرجاء إدخال 10 أرقام');
        return;
    }
    
    resultsDiv.innerHTML = '<div class="loading" style="text-align: center; padding: 20px;">جاري البحث...</div>';
    
    try {
        const snapshot = await db.collection('users')
            .where('shareableId', '==', searchId)
            .get();
        
        if (snapshot.empty) {
            resultsDiv.innerHTML = '<div class="empty-state" style="text-align: center; padding: 20px;">لا يوجد مستخدم بهذا المعرف</div>';
            return;
        }
        
        const user = snapshot.docs[0].data();
        const userId = snapshot.docs[0].id;
        const currentUser = auth.currentUser;
        
        if (currentUser && userId === currentUser.uid) {
            resultsDiv.innerHTML = '<div class="empty-state" style="text-align: center; padding: 20px;">هذا معرفك أنت</div>';
            return;
        }
        
        const avatarIcon = getAvatarForUser(user);
        const avatarColor = user.avatarColor || '#2196F3';
        
        resultsDiv.innerHTML = `
            <div class="search-result-item" style="display: flex; align-items: center; gap: 1rem; padding: 1rem; border-bottom: 1px solid var(--border);">
                <div class="user-avatar-icon" style="width: 50px; height: 50px; border-radius: 50%; background: var(--light); display: flex; align-items: center; justify-content: center;">
                    <i class="${avatarIcon}" style="color: ${avatarColor}; font-size: 2rem;"></i>
                </div>
                <div style="flex: 1;">
                    <h4 style="margin-bottom: 5px;">${user.name}</h4>
                    <p style="color: var(--text-light);">${user.shareableId}</p>
                </div>
                ${currentUser ? '<button class="btn btn-primary" onclick="sendFriendRequest(\'' + userId + '\')" style="padding: 8px 16px;">إضافة</button>' : ''}
            </div>
        `;
    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = '<div class="empty-state" style="text-align: center; padding: 20px;">حدث خطأ في البحث</div>';
    }
}

// إرسال طلب صداقة
async function sendFriendRequest(targetUserId) {
    if (!auth.currentUser) {
        alert('الرجاء تسجيل الدخول أولاً');
        return;
    }
    
    try {
        await db.collection('friendRequests').add({
            from: auth.currentUser.uid,
            to: targetUserId,
            status: 'pending',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
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
    if (!auth.currentUser) return;
    
    try {
        await db.collection('users').doc(auth.currentUser.uid).update({
            followers: firebase.firestore.FieldValue.arrayRemove(followerId)
        });
        
        // تحديث القائمة
        const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
        if (userDoc.exists) {
            loadFollowersList(auth.currentUser.uid, userDoc.data().followers || []);
        }
    } catch (error) {
        console.error('Error removing follower:', error);
    }
}

// إلغاء متابعة
async function unfollow(followingId) {
    if (!auth.currentUser) return;
    
    try {
        await db.collection('users').doc(auth.currentUser.uid).update({
            following: firebase.firestore.FieldValue.arrayRemove(followingId)
        });
        
        await db.collection('users').doc(followingId).update({
            followers: firebase.firestore.FieldValue.arrayRemove(auth.currentUser.uid)
        });
        
        // تحديث القائمة
        const userDoc = await db.collection('users').doc(auth.currentUser.uid).get();
        if (userDoc.exists) {
            loadFollowingList(auth.currentUser.uid, userDoc.data().following || []);
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
        followersList.innerHTML = '<div class="empty-state" style="text-align: center; padding: 40px;">لا يوجد متابعين</div>';
        return;
    }
    
    let html = '';
    for (const followerId of followers) {
        try {
            const userDoc = await db.collection('users').doc(followerId).get();
            if (userDoc.exists) {
                const user = userDoc.data();
                const avatarIcon = getAvatarForUser(user);
                const avatarColor = user.avatarColor || '#2196F3';
                
                html += `
                    <div class="user-item" style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--card-bg); border-radius: 12px; margin-bottom: 10px;">
                        <div class="user-avatar-icon" style="width: 50px; height: 50px; border-radius: 50%; background: var(--light); display: flex; align-items: center; justify-content: center;">
                            <i class="${avatarIcon}" style="color: ${avatarColor}; font-size: 2rem;"></i>
                        </div>
                        <div style="flex: 1;">
                            <h4 style="margin-bottom: 5px;">${user.name}</h4>
                            <p style="color: var(--text-light);">${user.shareableId || ''}</p>
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <button class="action-btn" onclick="openChat('${followerId}')" style="width: 35px; height: 35px; border-radius: 50%; border: none; background: var(--light); cursor: pointer;"><i class="fas fa-comment"></i></button>
                            <button class="action-btn remove" onclick="removeFollower('${followerId}')" style="width: 35px; height: 35px; border-radius: 50%; border: none; background: #f44336; color: white; cursor: pointer;"><i class="fas fa-user-minus"></i></button>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading follower:', error);
        }
    }
    followersList.innerHTML = html;
    
    // ✅ حفظ البيانات للصفحات الفرعية
    window.followersData = html;
}

// تحميل قائمة من يتابعهم
async function loadFollowingList(currentUid, following) {
    const followingList = document.getElementById('followingList');
    if (!followingList) return;
    
    if (!following || following.length === 0) {
        followingList.innerHTML = '<div class="empty-state" style="text-align: center; padding: 40px;">لا تتابع أحداً بعد</div>';
        return;
    }
    
    let html = '';
    for (const followingId of following) {
        try {
            const userDoc = await db.collection('users').doc(followingId).get();
            if (userDoc.exists) {
                const user = userDoc.data();
                const avatarIcon = getAvatarForUser(user);
                const avatarColor = user.avatarColor || '#2196F3';
                
                html += `
                    <div class="user-item" style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--card-bg); border-radius: 12px; margin-bottom: 10px;">
                        <div class="user-avatar-icon" style="width: 50px; height: 50px; border-radius: 50%; background: var(--light); display: flex; align-items: center; justify-content: center;">
                            <i class="${avatarIcon}" style="color: ${avatarColor}; font-size: 2rem;"></i>
                        </div>
                        <div style="flex: 1;">
                            <h4 style="margin-bottom: 5px;">${user.name}</h4>
                            <p style="color: var(--text-light);">${user.shareableId || ''}</p>
                        </div>
                        <div style="display: flex; gap: 5px;">
                            <button class="action-btn" onclick="openChat('${followingId}')" style="width: 35px; height: 35px; border-radius: 50%; border: none; background: var(--light); cursor: pointer;"><i class="fas fa-comment"></i></button>
                            <button class="action-btn following" onclick="unfollow('${followingId}')" style="width: 35px; height: 35px; border-radius: 50%; border: none; background: var(--primary); color: white; cursor: pointer;"><i class="fas fa-check"></i></button>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading following:', error);
        }
    }
    followingList.innerHTML = html;
    
    // ✅ حفظ البيانات للصفحات الفرعية
    window.followingData = html;
}
