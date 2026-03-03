// دالة تنسيق الأرقام (تحويل 1000 → 1K، 1000000 → 1M)
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
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
                blocked: [],
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
            
            const followersCount = document.getElementById('followersCount');
            const followingCount = document.getElementById('followingCount');
            
            if (followersCount) followersCount.textContent = formatNumber((userData.followers || []).length);
            if (followingCount) followingCount.textContent = formatNumber((userData.following || []).length);
            
            if (typeof loadFollowersList === 'function') {
                loadFollowersList(uid, userData.followers || []);
                loadFollowingList(uid, userData.following || []);
            }
            
            // ===== الاستماع المباشر لطلبات الصداقة =====
            listenToFriendRequests(uid);
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

// ========== دوال البحث المباشر ==========

window.findUserById = async function() {
    const input = document.getElementById('searchInput');
    const resultsContainer = document.getElementById('searchResultsContainer');
    
    if (!input || !resultsContainer) return;
    
    const searchText = input.value.trim();
    
    if (searchText === '') {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
        return;
    }
    
    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = `<div style="text-align: center; padding: 10px; color: var(--text-light);">${i18n ? i18n.t('searching') : 'جاري البحث...'}</div>`;
    
    try {
        const snapshot = await window.db.collection('users')
            .where('shareableId', '==', searchText)
            .get();
        
        if (snapshot.empty) {
            resultsContainer.innerHTML = `<div style="text-align: center; padding: 15px; color: var(--text-light); font-size: 0.95rem;">${i18n ? i18n.t('search_no_user') : 'لا يوجد مستخدم'}</div>`;
            return;
        }
        
        const user = snapshot.docs[0].data();
        const userId = snapshot.docs[0].id;
        const currentUser = window.auth ? window.auth.currentUser : null;
        
        if (currentUser && userId === currentUser.uid) {
            resultsContainer.innerHTML = `<div style="text-align: center; padding: 15px; color: var(--text-light); font-size: 0.95rem;">${i18n ? i18n.t('search_yourself') : 'هذا حسابك الشخصي'}</div>`;
            return;
        }
        
        const avatarEmoji = getEmojiForUser(user);
        
        resultsContainer.innerHTML = `
            <div class="search-result-item" style="display: flex; align-items: center; gap: 10px; padding: 8px; border-bottom: 1px solid var(--border);">
                <div class="search-result-avatar-emoji" style="width: 40px; height: 40px; border-radius: 50%; background: var(--light); display: flex; align-items: center; justify-content: center; font-size: 1.8rem;">${avatarEmoji}</div>
                <div style="flex: 1;">
                    <h4 style="margin: 0; font-size: 1rem;">${user.name}</h4>
                    <p style="margin: 0; color: var(--text-light); font-size: 0.85rem;">${user.shareableId}</p>
                </div>
                ${currentUser ? '<button class="btn btn-primary" style="padding: 5px 10px; font-size: 0.85rem;" onclick="addNewFriend(\'' + userId + '\')">' + (i18n ? i18n.t('add_friend') : 'إضافة') + '</button>' : ''}
            </div>
        `;
    } catch (error) {
        console.error('Search error:', error);
        resultsContainer.innerHTML = `<div style="text-align: center; padding: 15px; color: var(--text-light); font-size: 0.95rem;">${i18n ? i18n.t('search_error') : 'حدث خطأ بالبحث حاول مرة ثانية'}</div>`;
    }
};

window.addNewFriend = async function(targetUserId) {
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
        
        const resultsContainer = document.getElementById('searchResultsContainer');
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
            resultsContainer.innerHTML = '';
        }
        
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        
        alert(i18n ? i18n.t('request_sent') : 'تم إرسال طلب الصداقة');
    } catch (error) {
        console.error('Error sending request:', error);
        alert(i18n ? i18n.t('request_error') : 'حدث خطأ في إرسال الطلب');
    }
};

window.hideSearchResults = function() {
    const resultsContainer = document.getElementById('searchResultsContainer');
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
    }
};

// ========== دوال طلبات الصداقة مع Real-time listener ==========

// الاستماع المباشر لطلبات الصداقة
function listenToFriendRequests(uid) {
    if (!uid) return;
    
    console.log('🎧 بدء الاستماع لطلبات الصداقة لـ:', uid);
    
    window.db.collection('friendRequests')
        .where('to', '==', uid)
        .where('status', '==', 'pending')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            console.log('📩 تحديث طلبات الصداقة:', snapshot.size, 'طلبات');
            
            // تحديث العداد
            updateRequestsBadge(snapshot.size);
            
            // عرض الطلبات في الصفحة (إذا كانت مفتوحة)
            displayFriendRequestsRealTime(snapshot);
            
            // يمكن إظهار إشعار إذا كان هناك طلب جديد
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    console.log('➕ طلب صداقة جديد وصل!');
                    // هنا يمكن إضافة إشعار (اختياري)
                }
            });
        }, (error) => {
            console.error('❌ خطأ في الاستماع للطلبات:', error);
        });
}

// عرض الطلبات في الوقت الحقيقي
async function displayFriendRequestsRealTime(snapshot) {
    const requestsList = document.getElementById('requestsList');
    if (!requestsList) return;
    
    if (snapshot.empty) {
        requestsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-friends"></i>
                <h3>${i18n ? i18n.t('no_requests') : 'لا توجد طلبات صداقة'}</h3>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    for (const doc of snapshot.docs) {
        const request = doc.data();
        const requestId = doc.id;
        
        try {
            // جلب بيانات المرسل
            const userDoc = await window.db.collection('users').doc(request.from).get();
            if (!userDoc.exists) continue;
            
            const user = userDoc.data();
            const avatarEmoji = getEmojiForUser(user);
            
            html += `
                <div class="request-item" data-request-id="${requestId}">
                    <div class="request-avatar-emoji">${avatarEmoji}</div>
                    <div class="request-info">
                        <h4>${user.name}</h4>
                        <p>${user.shareableId || ''}</p>
                    </div>
                    <div class="request-actions">
                        <button class="request-btn accept" onclick="acceptFriendRequest('${requestId}', '${request.from}')">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="request-btn reject" onclick="rejectFriendRequest('${requestId}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading user data for request:', error);
        }
    }
    
    requestsList.innerHTML = html;
}

// تحديث عداد الإشعارات
function updateRequestsBadge(count) {
    const badge = document.getElementById('requestsBadge');
    if (!badge) return;
    
    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// قبول طلب صداقة
window.acceptFriendRequest = async function(requestId, fromUserId) {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        // تحديث حالة الطلب
        await window.db.collection('friendRequests').doc(requestId).update({
            status: 'accepted'
        });
        
        // إضافة الصديق لقائمة الأصدقاء
        await window.db.collection('users').doc(window.auth.currentUser.uid).update({
            followers: window.db.FieldValue.arrayUnion(fromUserId)
        });
        
        await window.db.collection('users').doc(fromUserId).update({
            following: window.db.FieldValue.arrayUnion(window.auth.currentUser.uid)
        });
        
        // إزالة الطلب من الواجهة (سيتم تلقائياً عبر onSnapshot)
        
        // تحديث قوائم المتابعين
        loadUserData(window.auth.currentUser.uid);
        
        alert(i18n ? i18n.t('request_accepted') : 'تم قبول طلب الصداقة');
    } catch (error) {
        console.error('Error accepting request:', error);
        alert(i18n ? i18n.t('request_error') : 'حدث خطأ');
    }
};

// رفض طلب صداقة
window.rejectFriendRequest = async function(requestId) {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        // تحديث حالة الطلب
        await window.db.collection('friendRequests').doc(requestId).update({
            status: 'rejected'
        });
        
        // إزالة الطلب من الواجهة (سيتم تلقائياً عبر onSnapshot)
        
        alert(i18n ? i18n.t('request_rejected') : 'تم رفض طلب الصداقة');
    } catch (error) {
        console.error('Error rejecting request:', error);
        alert(i18n ? i18n.t('request_error') : 'حدث خطأ');
    }
};

// تحميل طلبات الصداقة (لقطة واحدة - تستخدم كاحتياطي)
async function loadFriendRequests(uid) {
    try {
        const requestsSnapshot = await window.db.collection('friendRequests')
            .where('to', '==', uid)
            .where('status', '==', 'pending')
            .orderBy('timestamp', 'desc')
            .get();
        
        updateRequestsBadge(requestsSnapshot.size);
        // لا نحتاج لعرضها هنا لأن real-time listener سيفعل ذلك
    } catch (error) {
        console.error('Error loading friend requests:', error);
    }
}

// ========== الدوال القديمة ==========

async function removeFollower(followerId) {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        await window.db.collection('users').doc(window.auth.currentUser.uid).update({
            followers: window.db.FieldValue.arrayRemove(followerId)
        });
        
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (userDoc.exists) {
            loadFollowersList(window.auth.currentUser.uid, userDoc.data().followers || []);
        }
    } catch (error) {
        console.error('Error removing follower:', error);
    }
}

async function unfollow(followingId) {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        await window.db.collection('users').doc(window.auth.currentUser.uid).update({
            following: window.db.FieldValue.arrayRemove(followingId)
        });
        
        await window.db.collection('users').doc(followingId).update({
            followers: window.db.FieldValue.arrayRemove(window.auth.currentUser.uid)
        });
        
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (userDoc.exists) {
            loadFollowingList(window.auth.currentUser.uid, userDoc.data().following || []);
        }
    } catch (error) {
        console.error('Error unfollowing:', error);
    }
}

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
