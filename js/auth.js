// دالة تنسيق الأرقام (1K, 1M)
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// توليد معرف عشوائي من 10 أرقام (أرقام فقط)
function generateShareableId() {
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
        if (!window.auth || !window.googleProvider) {
            alert('مكتبة Firebase لم يتم تحميلها بعد. يرجى تحديث الصفحة.');
            return false;
        }
        
        const result = await window.auth.signInWithPopup(window.googleProvider);
        const user = result.user;
        
        const userDoc = await window.db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            const shareableId = generateShareableId();
            
            await window.db.collection('users').doc(user.uid).set({
                uid: user.uid,
                name: (user.displayName || 'مستخدم').substring(0, 25),
                email: user.email || '',
                shareableId: shareableId,
                bio: '',
                avatarType: 'male',
                followers: [],
                following: [],
                trips: [],
                createdAt: new Date()
            });
        }
        
        updateUserUI();
        return true;
    } catch (error) {
        console.error('Login error:', error);
        
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
            if (shareableId) shareableId.textContent = userData.shareableId || '0000000000';
            
            const avatarEmoji = getEmojiForUser(userData);
            
            if (profileAvatarEmoji) profileAvatarEmoji.textContent = avatarEmoji;
            if (menuAvatarEmoji) menuAvatarEmoji.textContent = avatarEmoji;
            if (currentAvatarEmoji) currentAvatarEmoji.textContent = avatarEmoji;
            
            // تحديث العدادات بالتنسيق
            const followersCount = document.getElementById('followersCount');
            const followingCount = document.getElementById('followingCount');
            const tripsCount = document.getElementById('tripsCount');
            
            if (followersCount) followersCount.textContent = formatNumber((userData.followers || []).length);
            if (followingCount) followingCount.textContent = formatNumber((userData.following || []).length);
            if (tripsCount) tripsCount.textContent = formatNumber((userData.trips || []).length);
            
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
            console.log('User not logged in, showing content after delay');
            setTimeout(() => {
                if (splash) {
                    splash.classList.add('hide');
                    setTimeout(() => {
                        splash.style.display = 'none';
                        if (app) app.style.display = 'flex';
                        setTimeout(showLoginPrompt, 1000);
                    }, 500);
                }
            }, 2000);
        }
    });
} else {
    console.error('auth is not defined. Firebase may not be loaded yet.');
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

// البحث عن صديق بالمعرف (أرقام فقط)
async function searchFriend() {
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('searchResults');
    
    if (!searchInput || !resultsDiv) return;
    
    const searchId = searchInput.value.trim();
    if (!searchId || searchId.length !== 10 || !/^\d+$/.test(searchId)) {
        alert('الرجاء إدخال 10 أرقام فقط');
        return;
    }
    
    resultsDiv.innerHTML = '<div class="loading" style="text-align: center; padding: 20px;">جاري البحث...</div>';
    
    try {
        const snapshot = await window.db.collection('users')
            .where('shareableId', '==', searchId)
            .get();
        
        if (snapshot.empty) {
            resultsDiv.innerHTML = '<div class="empty-state" style="text-align: center; padding: 20px;">لا يوجد مستخدم بهذا المعرف</div>';
            return;
        }
        
        const user = snapshot.docs[0].data();
        const userId = snapshot.docs[0].id;
        const currentUser = window.auth ? window.auth.currentUser : null;
        
        if (currentUser && userId === currentUser.uid) {
            resultsDiv.innerHTML = '<div class="empty-state" style="text-align: center; padding: 20px;">هذا معرفك أنت</div>';
            return;
        }
        
        // التحقق إذا كان المستخدم مُتابَعاً أم لا
        const isFollowing = currentUser ? 
            (await window.db.collection('users').doc(currentUser.uid).get()).data().following?.includes(userId) : false;
        
        const avatarEmoji = getEmojiForUser(user);
        
        resultsDiv.innerHTML = `
            <div class="search-result-item">
                <div class="search-result-avatar-emoji">${avatarEmoji}</div>
                <div class="search-result-info">
                    <h4>${user.name}</h4>
                    <p>${user.shareableId}</p>
                    <small>متابعون: ${formatNumber(user.followers?.length || 0)}</small>
                </div>
                ${currentUser ? `
                    <button class="btn ${isFollowing ? 'btn-outline' : 'btn-primary'}" 
                            onclick="${isFollowing ? 'unfollowUser' : 'followUser'}('${userId}')">
                        ${isFollowing ? 'إلغاء متابعة' : 'متابعة'}
                    </button>
                ` : ''}
            </div>
        `;
    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = '<div class="empty-state" style="text-align: center; padding: 20px;">حدث خطأ في البحث</div>';
    }
}

// متابعة مستخدم
async function followUser(targetUserId) {
    if (!window.auth || !window.auth.currentUser) {
        alert('الرجاء تسجيل الدخول أولاً');
        return;
    }
    
    const currentUserId = window.auth.currentUser.uid;
    
    try {
        // إضافة للمتابعين
        await window.db.collection('users').doc(currentUserId).update({
            following: firebase.firestore.FieldValue.arrayUnion(targetUserId)
        });
        
        await window.db.collection('users').doc(targetUserId).update({
            followers: firebase.firestore.FieldValue.arrayUnion(currentUserId)
        });
        
        // تحديث العدادات
        const userDoc = await window.db.collection('users').doc(currentUserId).get();
        document.getElementById('followingCount').textContent = formatNumber(userDoc.data().following?.length || 0);
        
        closeModal();
        alert('تمت المتابعة بنجاح');
        
    } catch (error) {
        console.error('Error following user:', error);
        alert('حدث خطأ في المتابعة');
    }
}

// إلغاء متابعة مستخدم
async function unfollowUser(targetUserId) {
    if (!window.auth || !window.auth.currentUser) {
        alert('الرجاء تسجيل الدخول أولاً');
        return;
    }
    
    const currentUserId = window.auth.currentUser.uid;
    
    try {
        await window.db.collection('users').doc(currentUserId).update({
            following: firebase.firestore.FieldValue.arrayRemove(targetUserId)
        });
        
        await window.db.collection('users').doc(targetUserId).update({
            followers: firebase.firestore.FieldValue.arrayRemove(currentUserId)
        });
        
        // تحديث العدادات
        const userDoc = await window.db.collection('users').doc(currentUserId).get();
        document.getElementById('followingCount').textContent = formatNumber(userDoc.data().following?.length || 0);
        
        closeModal();
        alert('تم إلغاء المتابعة');
        
    } catch (error) {
        console.error('Error unfollowing user:', error);
        alert('حدث خطأ في إلغاء المتابعة');
    }
}

// إزالة متابع
async function removeFollower(followerId) {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        await window.db.collection('users').doc(window.auth.currentUser.uid).update({
            followers: firebase.firestore.FieldValue.arrayRemove(followerId)
        });
        
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        document.getElementById('followersCount').textContent = formatNumber(userDoc.data().followers?.length || 0);
        
        if (typeof loadFollowersList === 'function') {
            loadFollowersList(window.auth.currentUser.uid, userDoc.data().followers || []);
        }
    } catch (error) {
        console.error('Error removing follower:', error);
    }
}

// باقي الدوال (loadFollowersList, loadFollowingList) كما هي...
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
    window.followersData = html;
}

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
    window.followingData = html;
}
