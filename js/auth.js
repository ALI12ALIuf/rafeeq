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
                friends: [], // إضافة حقل الأصدقاء الجديد
                blocked: [],
                createdAt: new Date()
            });
        } else {
            // التأكد من وجود حقل friends للمستخدمين القدامى
            const userData = userDoc.data();
            if (!userData.friends) {
                await window.db.collection('users').doc(user.uid).update({
                    friends: []
                });
            }
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
            
            // تحديث الإحصائيات مع التنسيق الذكي
            const followersCount = document.getElementById('followersCount');
            const followingCount = document.getElementById('followingCount');
            const friendRequestsCount = document.getElementById('friendRequestsCount');
            
            if (followersCount) followersCount.textContent = formatNumber((userData.followers || []).length);
            if (followingCount) followingCount.textContent = formatNumber((userData.following || []).length);
            
            // تحميل عدد طلبات الصداقة
            if (friendRequestsCount) {
                const requestsSnapshot = await window.db.collection('friendRequests')
                    .where('to', '==', uid)
                    .where('status', '==', 'pending')
                    .get();
                friendRequestsCount.textContent = formatNumber(requestsSnapshot.size);
            }
            
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

// ========== نظام الصداقة المتكامل ==========

// إظهار صفحة طلبات الصداقة
window.showFriendRequests = function() {
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('friendRequestsPage').style.display = 'block';
    loadFriendRequests();
};

// تحميل طلبات الصداقة
async function loadFriendRequests() {
    if (!window.auth || !window.auth.currentUser) return;
    
    const requestsList = document.getElementById('friendRequestsList');
    if (!requestsList) return;
    
    try {
        const snapshot = await window.db.collection('friendRequests')
            .where('to', '==', window.auth.currentUser.uid)
            .where('status', '==', 'pending')
            .orderBy('timestamp', 'desc')
            .get();
        
        if (snapshot.empty) {
            requestsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <h3 data-i18n="no_friend_requests">لا توجد طلبات صداقة</h3>
                    <p data-i18n="no_friend_requests_desc">لم يرسل لك أحد طلب صداقة بعد</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        for (const doc of snapshot.docs) {
            const request = doc.data();
            
            // جلب بيانات المرسل
            const senderDoc = await window.db.collection('users').doc(request.from).get();
            if (senderDoc.exists) {
                const sender = senderDoc.data();
                const avatarEmoji = getEmojiForUser(sender);
                const requestTime = request.timestamp ? new Date(request.timestamp.seconds * 1000) : new Date();
                
                html += `
                    <div class="user-item" id="request-${doc.id}">
                        <div class="user-avatar-emoji">${avatarEmoji}</div>
                        <div class="user-info">
                            <h4>${sender.name}</h4>
                            <p>${sender.shareableId || ''}</p>
                            <small style="color: var(--text-light);">${requestTime.toLocaleDateString('ar-EG')}</small>
                        </div>
                        <div class="user-actions">
                            <button class="action-btn" style="background: var(--success); color: white;" onclick="acceptFriendRequest('${doc.id}', '${request.from}')" title="قبول">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="action-btn remove" onclick="rejectFriendRequest('${doc.id}')" title="رفض">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                `;
            }
        }
        
        requestsList.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading friend requests:', error);
        requestsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ في تحميل الطلبات</h3>
                <p>حدث خطأ، حاول مرة أخرى</p>
            </div>
        `;
    }
}

// قبول طلب الصداقة
window.acceptFriendRequest = async function(requestId, senderId) {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        const currentUserId = window.auth.currentUser.uid;
        
        // تحديث حالة الطلب إلى مقبول
        await window.db.collection('friendRequests').doc(requestId).update({
            status: 'accepted',
            respondedAt: new Date()
        });
        
        // إضافة كلا المستخدمين إلى قائمة أصدقاء بعضهما
        await window.db.collection('users').doc(currentUserId).update({
            friends: firebase.firestore.FieldValue.arrayUnion(senderId)
        });
        
        await window.db.collection('users').doc(senderId).update({
            friends: firebase.firestore.FieldValue.arrayUnion(currentUserId)
        });
        
        // إزالة الطلب من الواجهة
        const requestElement = document.getElementById(`request-${requestId}`);
        if (requestElement) {
            requestElement.remove();
        }
        
        // تحديث عداد طلبات الصداقة
        const friendRequestsCount = document.getElementById('friendRequestsCount');
        if (friendRequestsCount) {
            const currentCount = parseInt(friendRequestsCount.textContent) || 0;
            friendRequestsCount.textContent = formatNumber(Math.max(0, currentCount - 1));
        }
        
        // إظهار رسالة نجاح
        alert('تم قبول طلب الصداقة بنجاح');
        
        // إذا لم يتبق طلبات، أظهر الرسالة المناسبة
        const remainingRequests = document.querySelectorAll('[id^="request-"]').length;
        if (remainingRequests === 0) {
            document.getElementById('friendRequestsList').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <h3 data-i18n="no_friend_requests">لا توجد طلبات صداقة</h3>
                    <p data-i18n="no_friend_requests_desc">لم يرسل لك أحد طلب صداقة بعد</p>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Error accepting friend request:', error);
        alert('حدث خطأ في قبول الطلب');
    }
};

// رفض طلب الصداقة
window.rejectFriendRequest = async function(requestId) {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        // تحديث حالة الطلب إلى مرفوض
        await window.db.collection('friendRequests').doc(requestId).update({
            status: 'rejected',
            respondedAt: new Date()
        });
        
        // إزالة الطلب من الواجهة
        const requestElement = document.getElementById(`request-${requestId}`);
        if (requestElement) {
            requestElement.remove();
        }
        
        // تحديث عداد طلبات الصداقة
        const friendRequestsCount = document.getElementById('friendRequestsCount');
        if (friendRequestsCount) {
            const currentCount = parseInt(friendRequestsCount.textContent) || 0;
            friendRequestsCount.textContent = formatNumber(Math.max(0, currentCount - 1));
        }
        
        alert('تم رفض الطلب');
        
        // إذا لم يتبق طلبات، أظهر الرسالة المناسبة
        const remainingRequests = document.querySelectorAll('[id^="request-"]').length;
        if (remainingRequests === 0) {
            document.getElementById('friendRequestsList').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <h3 data-i18n="no_friend_requests">لا توجد طلبات صداقة</h3>
                    <p data-i18n="no_friend_requests_desc">لم يرسل لك أحد طلب صداقة بعد</p>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Error rejecting friend request:', error);
        alert('حدث خطأ في رفض الطلب');
    }
};

// تحديث دالة إضافة صديق جديدة
window.addNewFriend = async function(targetUserId) {
    if (!window.auth || !window.auth.currentUser) {
        alert('الرجاء تسجيل الدخول أولاً');
        return;
    }
    
    const currentUserId = window.auth.currentUser.uid;
    
    // التحقق من عدم إرسال طلب لنفس المستخدم
    if (currentUserId === targetUserId) {
        alert('لا يمكنك إضافة نفسك كصديق');
        return;
    }
    
    try {
        // التحقق من وجود طلب سابق
        const existingRequest = await window.db.collection('friendRequests')
            .where('from', '==', currentUserId)
            .where('to', '==', targetUserId)
            .where('status', '==', 'pending')
            .get();
        
        if (!existingRequest.empty) {
            alert('لقد أرسلت طلب صداقة لهذا المستخدم مسبقاً');
            return;
        }
        
        // التحقق من أنهم ليسوا أصدقاء بالفعل
        const currentUserDoc = await window.db.collection('users').doc(currentUserId).get();
        if (currentUserDoc.exists) {
            const friends = currentUserDoc.data().friends || [];
            if (friends.includes(targetUserId)) {
                alert('هذا المستخدم صديقك بالفعل');
                return;
            }
        }
        
        // إرسال طلب الصداقة
        await window.db.collection('friendRequests').add({
            from: currentUserId,
            to: targetUserId,
            status: 'pending',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // إخفاء نتائج البحث
        const resultsContainer = document.getElementById('searchResultsContainer');
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
            resultsContainer.innerHTML = '';
        }
        
        // إفراغ حقل البحث
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        
        alert('تم إرسال طلب الصداقة بنجاح');
        
    } catch (error) {
        console.error('Error sending friend request:', error);
        alert('حدث خطأ في إرسال الطلب: ' + error.message);
    }
};

// إعداد مستمع实时 لطلبات الصداقة
function setupFriendRequestsListener(userId) {
    const requestsQuery = window.db.collection('friendRequests')
        .where('to', '==', userId)
        .where('status', '==', 'pending');
    
    requestsQuery.onSnapshot((snapshot) => {
        // تحديث عداد طلبات الصداقة فور وصول طلب جديد
        const countElement = document.getElementById('friendRequestsCount');
        if (countElement) {
            countElement.textContent = formatNumber(snapshot.size);
        }
        
        // إذا كنا في صفحة الطلبات، قم بتحديث القائمة
        const requestsPage = document.getElementById('friendRequestsPage');
        if (requestsPage && requestsPage.style.display === 'block') {
            loadFriendRequests();
        }
        
        // إظهار إشعار للمستخدم عند وصول طلب جديد
        if (snapshot.docChanges().length > 0) {
            const change = snapshot.docChanges()[0];
            if (change.type === 'added') {
                // يمكن إظهار إشعار للمستخدم
                console.log('📨 لديك طلب صداقة جديد');
                // يمكن إضافة إشعار بصري هنا
            }
        }
    });
}

// ========== نهاية نظام الصداقة ==========

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
            
            // إعداد مستمع طلبات الصداقة
            setupFriendRequestsListener(user.uid);
            
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

// ========== دوال البحث المباشر (بدون شروط) ==========

// البحث عن مستخدم بالمعرف - بحث حر بدون شروط
window.findUserById = async function() {
    const input = document.getElementById('searchInput');
    const resultsContainer = document.getElementById('searchResultsContainer');
    
    if (!input || !resultsContainer) return;
    
    const searchText = input.value.trim();
    
    // إذا كان الحقل فارغاً، نخفي النتائج
    if (searchText === '') {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
        return;
    }
    
    resultsContainer.style.display = 'block';
    resultsContainer.innerHTML = `<div style="text-align: center; padding: 10px; color: var(--text-light);">${i18n ? i18n.t('searching') : 'جاري البحث...'}</div>`;
    
    try {
        // البحث في قاعدة البيانات باستخدام shareableId
        const snapshot = await window.db.collection('users')
            .where('shareableId', '==', searchText)
            .get();
        
        if (snapshot.empty) {
            // رسالة في المنتصف
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
        
        // التحقق من حالة الصداقة
        let buttonText = 'إضافة';
        let buttonDisabled = '';
        
        if (currentUser) {
            const currentUserDoc = await window.db.collection('users').doc(currentUser.uid).get();
            const currentUserData = currentUserDoc.data();
            
            if (currentUserData.friends && currentUserData.friends.includes(userId)) {
                buttonText = 'أصدقاء ✓';
                buttonDisabled = 'disabled style="opacity: 0.5; cursor: not-allowed;"';
            } else {
                // التحقق من وجود طلب معلق
                const existingRequest = await window.db.collection('friendRequests')
                    .where('from', '==', currentUser.uid)
                    .where('to', '==', userId)
                    .where('status', '==', 'pending')
                    .get();
                
                if (!existingRequest.empty) {
                    buttonText = 'طلب معلق';
                    buttonDisabled = 'disabled style="opacity: 0.5; cursor: not-allowed;"';
                }
            }
        }
        
        resultsContainer.innerHTML = `
            <div class="search-result-item" style="display: flex; align-items: center; gap: 10px; padding: 8px; border-bottom: 1px solid var(--border);">
                <div class="search-result-avatar-emoji" style="width: 40px; height: 40px; border-radius: 50%; background: var(--light); display: flex; align-items: center; justify-content: center; font-size: 1.8rem;">${avatarEmoji}</div>
                <div style="flex: 1;">
                    <h4 style="margin: 0; font-size: 1rem;">${user.name}</h4>
                    <p style="margin: 0; color: var(--text-light); font-size: 0.85rem;">${user.shareableId}</p>
                </div>
                ${currentUser ? '<button class="btn btn-primary" style="padding: 5px 10px; font-size: 0.85rem;" onclick="addNewFriend(\'' + userId + '\')" ' + buttonDisabled + '>' + buttonText + '</button>' : ''}
            </div>
        `;
    } catch (error) {
        console.error('Search error:', error);
        resultsContainer.innerHTML = `<div style="text-align: center; padding: 15px; color: var(--text-light); font-size: 0.95rem;">${i18n ? i18n.t('search_error') : 'حدث خطأ بالبحث حاول مرة ثانية'}</div>`;
    }
};

// إخفاء نتائج البحث
window.hideSearchResults = function() {
    const resultsContainer = document.getElementById('searchResultsContainer');
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
    }
};

// ========== باقي الدوال كما هي ==========

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
