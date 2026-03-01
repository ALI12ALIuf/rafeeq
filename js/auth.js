// توليد معرف عشوائي من 10 أرقام
function generateShareableId() {
    return Math.random().toString().36().substring(2, 12).toUpperCase();
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
                name: user.displayName,
                email: user.email,
                photoUrl: user.photoURL,
                shareableId: shareableId,
                bio: '',
                followers: [],
                following: [],
                blocked: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // إخفاء شاشة التحميل
        document.getElementById('splash').classList.add('hide');
        setTimeout(() => {
            document.getElementById('splash').style.display = 'none';
            document.getElementById('app').style.display = 'flex';
        }, 500);
        
        return true;
    } catch (error) {
        console.error('Login error:', error);
        return false;
    }
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

// مراقبة حالة المستخدم
auth.onAuthStateChanged(async (user) => {
    const splash = document.getElementById('splash');
    const app = document.getElementById('app');
    
    if (user) {
        // مستخدم مسجل
        await loadUserData(user.uid);
        
        splash.classList.add('hide');
        setTimeout(() => {
            splash.style.display = 'none';
            app.style.display = 'flex';
        }, 500);
    } else {
        // مستخدم غير مسجل - عرض شاشة التحميل ثم إظهار الصفحة الرئيسية
        setTimeout(() => {
            splash.classList.add('hide');
            setTimeout(() => {
                splash.style.display = 'none';
                app.style.display = 'flex';
                // إظهار رسالة أن بعض الميزات تحتاج تسجيل
                showLoginPrompt();
            }, 500);
        }, 2000);
    }
});

// تحميل بيانات المستخدم
async function loadUserData(uid) {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            // تحديث واجهة المستخدم
            document.getElementById('profileName').textContent = userData.name;
            document.getElementById('profileAvatar').src = userData.photoUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(userData.name);
            document.getElementById('menuAvatar').src = userData.photoUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(userData.name);
            document.getElementById('menuName').textContent = userData.name;
            document.getElementById('profileBio').textContent = userData.bio || '';
            document.getElementById('shareableId').textContent = userData.shareableId;
            
            // تحديث الإحصائيات
            document.getElementById('followersCount').textContent = userData.followers?.length || 0;
            document.getElementById('followingCount').textContent = userData.following?.length || 0;
            
            // تحميل قوائم المتابعين
            loadFollowersList(uid, userData.followers || []);
            loadFollowingList(uid, userData.following || []);
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// تحميل قائمة المتابعين
async function loadFollowersList(currentUid, followers) {
    const followersList = document.getElementById('followersList');
    if (!followersList) return;
    
    if (followers.length === 0) {
        followersList.innerHTML = '<div class="empty-state">لا يوجد متابعين</div>';
        return;
    }
    
    let html = '';
    for (const followerId of followers) {
        const userDoc = await db.collection('users').doc(followerId).get();
        if (userDoc.exists) {
            const user = userDoc.data();
            html += `
                <div class="user-item">
                    <img src="${user.photoUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name)}" class="user-avatar">
                    <div class="user-info">
                        <h4>${user.name}</h4>
                        <p>${user.shareableId}</p>
                    </div>
                    <div class="user-actions">
                        <button class="action-btn" onclick="openChat('${followerId}')"><i class="fas fa-comment"></i></button>
                        <button class="action-btn remove" onclick="removeFollower('${followerId}')"><i class="fas fa-user-minus"></i></button>
                    </div>
                </div>
            `;
        }
    }
    followersList.innerHTML = html;
}

// تحميل قائمة من يتابعهم
async function loadFollowingList(currentUid, following) {
    const followingList = document.getElementById('followingList');
    if (!followingList) return;
    
    if (following.length === 0) {
        followingList.innerHTML = '<div class="empty-state">لا تتابع أحداً بعد</div>';
        return;
    }
    
    let html = '';
    for (const followingId of following) {
        const userDoc = await db.collection('users').doc(followingId).get();
        if (userDoc.exists) {
            const user = userDoc.data();
            html += `
                <div class="user-item">
                    <img src="${user.photoUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name)}" class="user-avatar">
                    <div class="user-info">
                        <h4>${user.name}</h4>
                        <p>${user.shareableId}</p>
                    </div>
                    <div class="user-actions">
                        <button class="action-btn" onclick="openChat('${followingId}')"><i class="fas fa-comment"></i></button>
                        <button class="action-btn following" onclick="unfollow('${followingId}')"><i class="fas fa-check"></i></button>
                    </div>
                </div>
            `;
        }
    }
    followingList.innerHTML = html;
}

// نسخ المعرف
function copyId() {
    const id = document.getElementById('shareableId').textContent;
    navigator.clipboard.writeText(id);
    alert(i18n.t('copied'));
}

// البحث عن صديق بالمعرف
async function searchFriend() {
    const searchId = document.getElementById('searchInput').value.trim().toUpperCase();
    if (!searchId || searchId.length !== 10) {
        alert('الرجاء إدخال 10 أرقام');
        return;
    }
    
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = '<div class="loading">جاري البحث...</div>';
    
    try {
        const snapshot = await db.collection('users')
            .where('shareableId', '==', searchId)
            .get();
        
        if (snapshot.empty) {
            resultsDiv.innerHTML = '<div class="empty-state">لا يوجد مستخدم بهذا المعرف</div>';
            return;
        }
        
        const user = snapshot.docs[0].data();
        const userId = snapshot.docs[0].id;
        const currentUser = auth.currentUser;
        
        if (userId === currentUser.uid) {
            resultsDiv.innerHTML = '<div class="empty-state">هذا معرفك أنت</div>';
            return;
        }
        
        resultsDiv.innerHTML = `
            <div class="search-result-item">
                <img src="${user.photoUrl || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name)}" class="search-result-avatar">
                <div class="search-result-info">
                    <h4>${user.name}</h4>
                    <p>${user.shareableId}</p>
                </div>
                <button class="btn btn-primary" onclick="sendFriendRequest('${userId}')">إضافة</button>
            </div>
        `;
    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = '<div class="empty-state">حدث خطأ</div>';
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
        alert('حدث خطأ');
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
        loadFollowersList(auth.currentUser.uid, userDoc.data().followers || []);
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
        loadFollowingList(auth.currentUser.uid, userDoc.data().following || []);
    } catch (error) {
        console.error('Error unfollowing:', error);
    }
}

// إظهار رسالة تسجيل الدخول
function showLoginPrompt() {
    const loginPrompt = document.createElement('div');
    loginPrompt.className = 'login-prompt';
    loginPrompt.innerHTML = `
        <div class="login-prompt-content">
            <i class="fas fa-lock"></i>
            <h3>${i18n.t('login')}</h3>
            <p>${i18n.t('login_desc')}</p>
            <button class="btn btn-primary" onclick="signInWithGoogle()">${i18n.t('login_with_google')}</button>
        </div>
    `;
    document.body.appendChild(loginPrompt);
}
