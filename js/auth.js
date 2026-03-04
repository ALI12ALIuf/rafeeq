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

// ✅ تعريف مختصر لـ FieldValue
const FieldValue = firebase.firestore.FieldValue;

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
            
            // ✅ مستخدم جديد - بدون متابعة
            await window.db.collection('users').doc(user.uid).set({
                uid: user.uid,
                name: (user.displayName || 'مستخدم').substring(0, 25),
                email: user.email || '',
                shareableId: shareableId,
                bio: '',
                avatarType: 'male',
                friends: [], // فقط الأصدقاء
                blocked: [],
                createdAt: new Date()
            });
        } else {
            const userData = userDoc.data();
            
            // تحديث المستخدمين القدامى (إزالة المتابعة إذا وجدت)
            const updates = {};
            
            if (!userData.friends) updates.friends = [];
            if (userData.followers) updates.followers = []; // إزالة المتابعين
            if (userData.following) updates.following = []; // إزالة المتابَعين
            
            if (Object.keys(updates).length > 0) {
                await window.db.collection('users').doc(user.uid).update(updates);
            }
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

// ✅ تحميل بيانات المستخدم (بدون متابعة)
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
            
            // ✅ تحديث عدادات الأصدقاء
            const friendsCount = document.getElementById('friendsCount');
            const friendRequestsCount = document.getElementById('friendRequestsCount');
            
            if (friendsCount) {
                friendsCount.textContent = formatNumber((userData.friends || []).length);
            }
            
            if (friendRequestsCount) {
                try {
                    const requestsSnapshot = await window.db.collection('friendRequests')
                        .where('to', '==', uid)
                        .where('status', '==', 'pending')
                        .get();
                    friendRequestsCount.textContent = formatNumber(requestsSnapshot.size);
                } catch (e) {
                    console.log('No friend requests collection yet');
                    friendRequestsCount.textContent = '0';
                }
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

// ========== نظام الصداقة المتكامل (بدون متابعة) ==========

// ✅ عرض صفحة الأصدقاء
window.showFriendsList = function() {
    const profilePage = document.querySelector('.profile-page');
    const friendsPage = document.getElementById('friendsPage');
    
    if (profilePage) profilePage.style.display = 'none';
    if (friendsPage) friendsPage.style.display = 'block';
    
    loadFriendsList();
};

// ✅ تحميل قائمة الأصدقاء
async function loadFriendsList() {
    if (!window.auth || !window.auth.currentUser) return;
    
    const friendsList = document.getElementById('friendsList');
    if (!friendsList) return;
    
    try {
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (!userDoc.exists) return;
        
        const userData = userDoc.data();
        const friends = userData.friends || [];
        
        if (friends.length === 0) {
            friendsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <h3>${i18n ? i18n.t('no_friends') : 'لا يوجد أصدقاء'}</h3>
                    <p>${i18n ? i18n.t('no_friends_desc') : 'لم تضف أي أصدقاء بعد'}</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        for (const friendId of friends) {
            try {
                const friendDoc = await window.db.collection('users').doc(friendId).get();
                if (friendDoc.exists) {
                    const friend = friendDoc.data();
                    const avatarEmoji = getEmojiForUser(friend);
                    
                    html += `
                        <div class="user-item">
                            <div class="user-avatar-emoji">${avatarEmoji}</div>
                            <div class="user-info">
                                <h4>${friend.name || 'مستخدم'}</h4>
                                <p>${friend.shareableId || ''}</p>
                            </div>
                            <div class="user-actions">
                                <button class="action-btn" onclick="openChat('${friendId}')" title="محادثة">
                                    <i class="fas fa-comment"></i>
                                </button>
                                <button class="action-btn" onclick="removeFriend('${friendId}')" title="حذف الصديق" style="background: var(--danger); color: white;">
                                    <i class="fas fa-user-minus"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }
            } catch (e) {
                console.error('Error loading friend:', e);
            }
        }
        
        friendsList.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading friends list:', error);
        friendsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ في تحميل الأصدقاء</h3>
                <p>${error.message || 'حدث خطأ، حاول مرة أخرى'}</p>
            </div>
        `;
    }
}

// ✅ حذف صديق
window.removeFriend = async function(friendId) {
    if (!window.auth || !window.auth.currentUser) return;
    
    if (!confirm('هل أنت متأكد من حذف هذا الصديق؟')) return;
    
    try {
        const currentUserId = window.auth.currentUser.uid;
        
        // إزالة الصديق من الطرفين
        await window.db.collection('users').doc(currentUserId).update({
            friends: FieldValue.arrayRemove(friendId)
        });
        
        await window.db.collection('users').doc(friendId).update({
            friends: FieldValue.arrayRemove(currentUserId)
        });
        
        // تحديث القائمة
        await updateFriendsCount();
        await loadFriendsList();
        
        alert('تم حذف الصديق بنجاح');
        
    } catch (error) {
        console.error('Error removing friend:', error);
        alert('حدث خطأ في حذف الصديق');
    }
};

// ✅ تحديث عداد الأصدقاء
async function updateFriendsCount() {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (userDoc.exists) {
            const friends = userDoc.data().friends || [];
            const countElement = document.getElementById('friendsCount');
            if (countElement) {
                countElement.textContent = formatNumber(friends.length);
            }
        }
    } catch (error) {
        console.error('Error updating friends count:', error);
    }
}

// إظهار صفحة طلبات الصداقة
window.showFriendRequests = function() {
    const profilePage = document.querySelector('.profile-page');
    const requestsPage = document.getElementById('friendRequestsPage');
    
    if (profilePage) profilePage.style.display = 'none';
    if (requestsPage) requestsPage.style.display = 'block';
    
    loadFriendRequests();
};

// دالة مساعدة لتنسيق التاريخ بأمان
function formatDateSafely(timestamp) {
    try {
        if (!timestamp) return 'تاريخ غير معروف';
        
        if (timestamp.seconds) {
            return new Date(timestamp.seconds * 1000).toLocaleDateString('ar-EG');
        } else if (timestamp instanceof Date) {
            return timestamp.toLocaleDateString('ar-EG');
        } else {
            return new Date(timestamp).toLocaleDateString('ar-EG');
        }
    } catch (e) {
        console.error('Error formatting date:', e);
        return 'تاريخ غير معروف';
    }
}

// تحميل طلبات الصداقة
async function loadFriendRequests() {
    if (!window.auth || !window.auth.currentUser) return;
    
    const requestsList = document.getElementById('friendRequestsList');
    if (!requestsList) return;
    
    try {
        const snapshot = await window.db.collection('friendRequests')
            .where('to', '==', window.auth.currentUser.uid)
            .where('status', '==', 'pending')
            .get();
        
        if (snapshot.empty) {
            requestsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <h3>${i18n ? i18n.t('no_friend_requests') : 'لا توجد طلبات'}</h3>
                    <p>${i18n ? i18n.t('no_friend_requests_desc') : 'لم يرسل لك أحد طلب صداقة بعد'}</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        let requests = [];
        
        snapshot.forEach(doc => {
            requests.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        requests.sort((a, b) => {
            const timeA = a.timestamp?.seconds || 0;
            const timeB = b.timestamp?.seconds || 0;
            return timeB - timeA;
        });
        
        for (const request of requests) {
            try {
                const senderDoc = await window.db.collection('users').doc(request.from).get();
                if (senderDoc.exists) {
                    const sender = senderDoc.data();
                    const avatarEmoji = getEmojiForUser(sender);
                    const requestDate = formatDateSafely(request.timestamp);
                    
                    html += `
                        <div class="user-item" id="request-${request.id}">
                            <div class="user-avatar-emoji">${avatarEmoji}</div>
                            <div class="user-info">
                                <h4>${sender.name || 'مستخدم'}</h4>
                                <p>${sender.shareableId || ''}</p>
                                <small style="color: var(--text-light);">${requestDate}</small>
                            </div>
                            <div class="user-actions">
                                <button class="action-btn" style="background: var(--success); color: white;" onclick="acceptFriendRequest('${request.id}', '${request.from}')" title="قبول">
                                    <i class="fas fa-check"></i>
                                </button>
                                <button class="action-btn remove" onclick="rejectFriendRequest('${request.id}')" title="رفض">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }
            } catch (e) {
                console.error('Error processing request:', e);
            }
        }
        
        if (html === '') {
            requestsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <h3>${i18n ? i18n.t('no_friend_requests') : 'لا توجد طلبات'}</h3>
                    <p>${i18n ? i18n.t('no_friend_requests_desc') : 'لم يرسل لك أحد طلب صداقة بعد'}</p>
                </div>
            `;
        } else {
            requestsList.innerHTML = html;
        }
        
    } catch (error) {
        console.error('Error loading friend requests:', error);
        requestsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ في تحميل الطلبات</h3>
                <p>${error.message || 'حدث خطأ، حاول مرة أخرى'}</p>
            </div>
        `;
    }
}

// قبول طلب الصداقة
window.acceptFriendRequest = async function(requestId, senderId) {
    if (!window.auth || !window.auth.currentUser) {
        alert('الرجاء تسجيل الدخول أولاً');
        return;
    }
    
    try {
        const currentUserId = window.auth.currentUser.uid;
        
        await window.db.collection('friendRequests').doc(requestId).update({
            status: 'accepted',
            respondedAt: new Date()
        });
        
        await window.db.collection('users').doc(currentUserId).update({
            friends: FieldValue.arrayUnion(senderId)
        });
        
        await window.db.collection('users').doc(senderId).update({
            friends: FieldValue.arrayUnion(currentUserId)
        });
        
        const requestElement = document.getElementById(`request-${requestId}`);
        if (requestElement) {
            requestElement.remove();
        }
        
        await updateFriendRequestsCount();
        await updateFriendsCount();
        
        alert('تم قبول طلب الصداقة بنجاح');
        
        const remainingRequests = document.querySelectorAll('[id^="request-"]').length;
        if (remainingRequests === 0) {
            document.getElementById('friendRequestsList').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <h3>${i18n ? i18n.t('no_friend_requests') : 'لا توجد طلبات'}</h3>
                    <p>${i18n ? i18n.t('no_friend_requests_desc') : 'لم يرسل لك أحد طلب صداقة بعد'}</p>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Error accepting friend request:', error);
        alert('حدث خطأ في قبول الطلب: ' + error.message);
    }
};

// رفض طلب الصداقة
window.rejectFriendRequest = async function(requestId) {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        await window.db.collection('friendRequests').doc(requestId).update({
            status: 'rejected',
            respondedAt: new Date()
        });
        
        const requestElement = document.getElementById(`request-${requestId}`);
        if (requestElement) {
            requestElement.remove();
        }
        
        await updateFriendRequestsCount();
        
        alert('تم رفض الطلب');
        
        const remainingRequests = document.querySelectorAll('[id^="request-"]').length;
        if (remainingRequests === 0) {
            document.getElementById('friendRequestsList').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <h3>${i18n ? i18n.t('no_friend_requests') : 'لا توجد طلبات'}</h3>
                    <p>${i18n ? i18n.t('no_friend_requests_desc') : 'لم يرسل لك أحد طلب صداقة بعد'}</p>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Error rejecting friend request:', error);
        alert('حدث خطأ في رفض الطلب');
    }
};

// تحديث عداد طلبات الصداقة
async function updateFriendRequestsCount() {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        const snapshot = await window.db.collection('friendRequests')
            .where('to', '==', window.auth.currentUser.uid)
            .where('status', '==', 'pending')
            .get();
        
        const countElement = document.getElementById('friendRequestsCount');
        if (countElement) {
            countElement.textContent = formatNumber(snapshot.size);
        }
    } catch (error) {
        console.error('Error updating friend requests count:', error);
    }
}

// إضافة صديق جديد
window.addNewFriend = async function(targetUserId) {
    if (!window.auth || !window.auth.currentUser) {
        alert('الرجاء تسجيل الدخول أولاً');
        return;
    }
    
    const currentUserId = window.auth.currentUser.uid;
    
    if (currentUserId === targetUserId) {
        alert('لا يمكنك إضافة نفسك كصديق');
        return;
    }
    
    try {
        const existingRequest = await window.db.collection('friendRequests')
            .where('from', '==', currentUserId)
            .where('to', '==', targetUserId)
            .where('status', '==', 'pending')
            .get();
        
        if (!existingRequest.empty) {
            alert('لقد أرسلت طلب صداقة لهذا المستخدم مسبقاً');
            return;
        }
        
        const currentUserDoc = await window.db.collection('users').doc(currentUserId).get();
        if (currentUserDoc.exists) {
            const friends = currentUserDoc.data().friends || [];
            if (friends.includes(targetUserId)) {
                alert('هذا المستخدم صديقك بالفعل');
                return;
            }
        }
        
        await window.db.collection('friendRequests').add({
            from: currentUserId,
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
        
        alert('تم إرسال طلب الصداقة بنجاح');
        
    } catch (error) {
        console.error('Error sending friend request:', error);
        alert('حدث خطأ في إرسال الطلب: ' + error.message);
    }
};

// إعداد مستمع实时 لطلبات الصداقة
function setupFriendRequestsListener(userId) {
    try {
        const requestsQuery = window.db.collection('friendRequests')
            .where('to', '==', userId)
            .where('status', '==', 'pending');
        
        requestsQuery.onSnapshot((snapshot) => {
            const countElement = document.getElementById('friendRequestsCount');
            if (countElement) {
                countElement.textContent = formatNumber(snapshot.size);
            }
            
            const requestsPage = document.getElementById('friendRequestsPage');
            if (requestsPage && requestsPage.style.display === 'block') {
                loadFriendRequests();
            }
        }, (error) => {
            console.log('Listener error:', error);
        });
    } catch (error) {
        console.log('Error setting up listener:', error);
    }
}

// ========== نهاية نظام الصداقة ==========

// مراقبة حالة المستخدم
if (typeof window.auth !== 'undefined') {
    window.auth.onAuthStateChanged(async (user) => {
        console.log('Auth state changed:', user ? 'logged in' : 'logged out');
        
        const splash = document.getElementById('splash');
        const app = document.getElementById('app');
        
        if (user) {
            console.log('Loading user data for:', user.uid);
            await loadUserData(user.uid);
            setupFriendRequestsListener(user.uid);
            
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
        alert('تم النسخ');
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// ========== دوال البحث ==========

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
    resultsContainer.innerHTML = `<div style="text-align: center; padding: 10px; color: var(--text-light);">جاري البحث...</div>`;
    
    try {
        const snapshot = await window.db.collection('users')
            .where('shareableId', '==', searchText)
            .get();
        
        if (snapshot.empty) {
            resultsContainer.innerHTML = `<div style="text-align: center; padding: 15px; color: var(--text-light); font-size: 0.95rem;">لا يوجد مستخدم</div>`;
            return;
        }
        
        const user = snapshot.docs[0].data();
        const userId = snapshot.docs[0].id;
        const currentUser = window.auth ? window.auth.currentUser : null;
        
        if (currentUser && userId === currentUser.uid) {
            resultsContainer.innerHTML = `<div style="text-align: center; padding: 15px; color: var(--text-light); font-size: 0.95rem;">هذا حسابك الشخصي</div>`;
            return;
        }
        
        const avatarEmoji = getEmojiForUser(user);
        
        let buttonText = 'إضافة';
        let buttonDisabled = '';
        
        if (currentUser) {
            const currentUserDoc = await window.db.collection('users').doc(currentUser.uid).get();
            const currentUserData = currentUserDoc.data();
            
            if (currentUserData.friends && currentUserData.friends.includes(userId)) {
                buttonText = 'أصدقاء';
                buttonDisabled = 'disabled style="opacity: 0.5; cursor: not-allowed;"';
            } else {
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
        resultsContainer.innerHTML = `<div style="text-align: center; padding: 15px; color: var(--text-light); font-size: 0.95rem;">حدث خطأ بالبحث حاول مرة ثانية</div>`;
    }
};

window.hideSearchResults = function() {
    const resultsContainer = document.getElementById('searchResultsContainer');
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
    }
};

// ========== تم إزالة دوال المتابعة بالكامل ==========
