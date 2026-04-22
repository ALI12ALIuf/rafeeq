function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
}

function generateShareableId() {
    let id = '';
    for (let i = 0; i < 10; i++) {
        id += Math.floor(Math.random() * 10).toString();
    }
    return id;
}

function getEmojiForUser(userData) {
    const emojiMap = {
        'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧',
        'father': '👨‍🦳', 'mother': '👩‍🦳', 'grandfather': '👴', 'grandmother': '👵'
    };
    return emojiMap[userData.avatarType] || '👤';
}

const FieldValue = firebase.firestore.FieldValue;

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
            
            let publicKeyBase64 = null;
            try {
                if (window.cryptoSystem) {
                    const keyPair = await window.cryptoSystem.generateKeyPair();
                    publicKeyBase64 = await window.cryptoSystem.exportPublicKey(keyPair.publicKey);
                    window.cryptoSystem.keyPairs.set(user.uid, keyPair);
                    if (window.cryptoSystem.savePrivateKey) {
                        await window.cryptoSystem.savePrivateKey(user.uid, keyPair.privateKey);
                    }
                    console.log('✅ P2P keys generated for new user');
                }
            } catch (e) {
                console.warn('P2P key generation failed:', e);
            }
            
            await window.db.collection('users').doc(user.uid).set({
                uid: user.uid,
                name: (user.displayName || 'مستخدم').substring(0, 25),
                email: user.email || '',
                shareableId: shareableId,
                bio: '',
                avatarType: 'male',
                publicKey: publicKeyBase64 || null,
                friends: [],
                blocked: [],
                createdAt: new Date()
            });
        } else {
            const userData = userDoc.data();
            const updates = {};
            
            if (!userData.friends) updates.friends = [];
            
            if (!userData.publicKey && window.cryptoSystem) {
                try {
                    const keyPair = await window.cryptoSystem.generateKeyPair();
                    const publicKeyBase64 = await window.cryptoSystem.exportPublicKey(keyPair.publicKey);
                    updates.publicKey = publicKeyBase64;
                    window.cryptoSystem.keyPairs.set(user.uid, keyPair);
                    if (window.cryptoSystem.savePrivateKey) {
                        await window.cryptoSystem.savePrivateKey(user.uid, keyPair.privateKey);
                    }
                    console.log('✅ P2P keys added to existing user');
                } catch (e) {
                    console.warn('P2P key generation failed:', e);
                }
            }
            
            if (Object.keys(updates).length > 0) {
                await window.db.collection('users').doc(user.uid).update(updates);
            }
        }
        
        updateUserUI();
        return true;
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'حدث خطأ في تسجيل الدخول';
        if (error.code === 'auth/popup-closed-by-user') errorMessage = 'تم إغلاق نافذة تسجيل الدخول';
        else if (error.code === 'auth/cancelled-popup-request') errorMessage = 'تم إلغاء طلب تسجيل الدخول';
        else if (error.code === 'auth/network-request-failed') errorMessage = 'خطأ في الشبكة. تحقق من اتصالك بالإنترنت';
        else errorMessage += ': ' + error.message;
        alert(errorMessage);
        return false;
    }
}

function updateUserUI() {
    const splash = document.getElementById('splash');
    const app = document.getElementById('app');
    const loginScreen = document.querySelector('.login-screen');
    
    if (splash) splash.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'none';
    if (app) app.style.display = 'flex';
    
    setTimeout(() => {
        if (typeof loadChats === 'function') loadChats();
        if (typeof updateTripsCount === 'function') updateTripsCount();
        if (typeof loadUserTrips === 'function') loadUserTrips();
        if (typeof loadFriendsList === 'function') loadFriendsList();
        if (typeof loadFriendRequests === 'function') loadFriendRequests();
        
        const profileName = document.getElementById('profileName');
        const shareableId = document.getElementById('shareableId');
        const profileAvatar = document.getElementById('profileAvatarEmoji');
        
        if (window.auth.currentUser) {
            window.db.collection('users').doc(window.auth.currentUser.uid).get().then(doc => {
                if (doc.exists) {
                    const data = doc.data();
                    if (profileName) profileName.textContent = data.name || 'مستخدم';
                    if (shareableId) shareableId.textContent = data.shareableId || '0000000000';
                    if (profileAvatar) profileAvatar.textContent = getEmojiForUser(data);
                }
            });
        }
    }, 300);
}

async function logout() {
    try {
        await window.auth.signOut();
        window.location.reload();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

async function loadUserData(uid) {
    try {
        const userDoc = await window.db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            
            const profileName = document.getElementById('profileName');
            const profileAvatarEmoji = document.getElementById('profileAvatarEmoji');
            const profileBio = document.getElementById('profileBio');
            const shareableId = document.getElementById('shareableId');
            const currentAvatarEmoji = document.getElementById('currentAvatarEmoji');
            
            if (profileName) profileName.textContent = (userData.name || 'مستخدم').substring(0, 25);
            if (profileBio) profileBio.textContent = userData.bio || '';
            if (shareableId) shareableId.textContent = userData.shareableId || '0000000000';
            
            const avatarEmoji = getEmojiForUser(userData);
            if (profileAvatarEmoji) profileAvatarEmoji.textContent = avatarEmoji;
            if (currentAvatarEmoji) currentAvatarEmoji.textContent = avatarEmoji;
            
            const friendsCount = document.getElementById('friendsCount');
            const friendRequestsCount = document.getElementById('friendRequestsCount');
            
            if (friendsCount) friendsCount.textContent = formatNumber((userData.friends || []).length);
            
            if (friendRequestsCount) {
                try {
                    const requestsSnapshot = await window.db.collection('friendRequests')
                        .where('to', '==', uid)
                        .where('status', '==', 'pending')
                        .get();
                    friendRequestsCount.textContent = formatNumber(requestsSnapshot.size);
                } catch (e) {
                    friendRequestsCount.textContent = '0';
                }
            }
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

function showLoginScreen() {
    const existingLogin = document.querySelector('.login-screen');
    if (existingLogin) existingLogin.remove();
    
    const loginScreen = document.createElement('div');
    loginScreen.className = 'login-screen';
    loginScreen.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--bg, #ffffff);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    loginScreen.innerHTML = `
        <div style="text-align: center; padding: 20px; max-width: 350px;">
            <div style="font-size: 5rem; margin-bottom: 1rem;">🛡️</div>
            <h1 style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--primary, #2196F3);">رفيق</h1>
            <p style="margin-bottom: 2rem; color: var(--text-light, #666);">سجل دخولك للوصول إلى جميع الميزات</p>
            <button id="googleSignInBtn" style="
                background: var(--primary, #2196F3);
                color: white;
                border: none;
                border-radius: 30px;
                padding: 15px 30px;
                font-size: 1.1rem;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                width: 100%;
                transition: all 0.3s;
            ">
                <i class="fab fa-google"></i>
                <span>المتابعة بحساب جوجل</span>
            </button>
            <p style="margin-top: 1rem; font-size: 0.8rem; color: var(--text-light, #666);">لن يتم مشاركة معلوماتك مع أي طرف ثالث</p>
        </div>
    `;
    
    document.body.appendChild(loginScreen);
    
    const signInBtn = document.getElementById('googleSignInBtn');
    if (signInBtn) {
        signInBtn.onclick = signInWithGoogle;
    }
}

// ========== مراقبة حالة المصادقة ==========
if (typeof window.auth !== 'undefined') {
    window.auth.onAuthStateChanged(async (user) => {
        console.log('Auth state changed:', user ? 'logged in' : 'logged out');
        
        const splash = document.getElementById('splash');
        const app = document.getElementById('app');
        
        if (user) {
            console.log('Loading user data for:', user.uid);
            
            if (window.cryptoSystem && window.cryptoSystem.getOrCreateKeyPair) {
                const keyPair = await window.cryptoSystem.getOrCreateKeyPair(user.uid);
                if (keyPair) {
                    window.cryptoSystem.keyPairs.set(user.uid, keyPair);
                }
            }
            
            await loadUserData(user.uid);
            setupFriendRequestsListener(user.uid);
            
            if (splash) splash.style.display = 'none';
            const loginScreen = document.querySelector('.login-screen');
            if (loginScreen) loginScreen.style.display = 'none';
            if (app) app.style.display = 'flex';
            
            setTimeout(() => {
                if (typeof loadChats === 'function') loadChats();
                if (typeof updateTripsCount === 'function') updateTripsCount();
            }, 300);
        } else {
            if (app) app.style.display = 'none';
            if (splash) splash.style.display = 'flex';
            
            setTimeout(() => {
                if (splash) splash.style.display = 'none';
                showLoginScreen();
            }, 1000);
        }
    });
} else {
    console.error('auth is not defined. Firebase may not be loaded yet.');
}

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

// ========== نظام الصداقة ==========

window.showFriendsList = function() {
    const profilePage = document.querySelector('.profile-page');
    const friendsPage = document.getElementById('friendsPage');
    if (profilePage) profilePage.style.display = 'none';
    if (friendsPage) friendsPage.style.display = 'block';
    loadFriendsList();
};

async function loadFriendsList() {
    if (!window.auth || !window.auth.currentUser) return;
    
    const friendsList = document.getElementById('friendsList');
    if (!friendsList) return;
    
    try {
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (!userDoc.exists) return;
        
        const friends = userDoc.data().friends || [];
        
        if (friends.length === 0) {
            friendsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-friends"></i>
                    <h3>لا يوجد أصدقاء</h3>
                    <p>أضف أصدقاء لبدء المحادثة</p>
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
                                <button class="action-btn" onclick="removeFriend('${friendId}')" title="حذف" style="background: var(--danger); color: white;">
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
        friendsList.innerHTML = `<div class="empty-state"><p>خطأ في تحميل الأصدقاء</p></div>`;
    }
}

window.removeFriend = async function(friendId) {
    if (!window.auth || !window.auth.currentUser) return;
    if (!confirm('هل أنت متأكد من حذف هذا الصديق؟')) return;
    
    try {
        const currentUserId = window.auth.currentUser.uid;
        await window.db.collection('users').doc(currentUserId).update({
            friends: FieldValue.arrayRemove(friendId)
        });
        await window.db.collection('users').doc(friendId).update({
            friends: FieldValue.arrayRemove(currentUserId)
        });
        await loadFriendsList();
        alert('تم حذف الصديق بنجاح');
    } catch (error) {
        console.error('Error removing friend:', error);
        alert('حدث خطأ في حذف الصديق');
    }
};

window.showFriendRequests = function() {
    const profilePage = document.querySelector('.profile-page');
    const requestsPage = document.getElementById('friendRequestsPage');
    if (profilePage) profilePage.style.display = 'none';
    if (requestsPage) requestsPage.style.display = 'block';
    loadFriendRequests();
};

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
                    <h3>لا توجد طلبات</h3>
                    <p>ليس لديك طلبات صداقة حالياً</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        for (const doc of snapshot.docs) {
            const request = doc.data();
            try {
                const senderDoc = await window.db.collection('users').doc(request.from).get();
                if (senderDoc.exists) {
                    const sender = senderDoc.data();
                    const avatarEmoji = getEmojiForUser(sender);
                    
                    html += `
                        <div class="user-item" id="request-${doc.id}">
                            <div class="user-avatar-emoji">${avatarEmoji}</div>
                            <div class="user-info">
                                <h4>${sender.name || 'مستخدم'}</h4>
                                <p>${sender.shareableId || ''}</p>
                            </div>
                            <div class="user-actions">
                                <button class="action-btn" style="background: var(--success); color: white;" onclick="acceptFriendRequest('${doc.id}', '${request.from}')">
                                    <i class="fas fa-check"></i>
                                </button>
                                <button class="action-btn remove" onclick="rejectFriendRequest('${doc.id}')">
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
        
        requestsList.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading friend requests:', error);
        requestsList.innerHTML = `<div class="empty-state"><p>خطأ في تحميل الطلبات</p></div>`;
    }
}

window.acceptFriendRequest = async function(requestId, senderId) {
    if (!window.auth || !window.auth.currentUser) return;
    
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
        
        document.getElementById(`request-${requestId}`)?.remove();
        await loadFriendRequests();
        alert('تم قبول طلب الصداقة');
        
    } catch (error) {
        console.error('Error accepting friend request:', error);
        alert('حدث خطأ في قبول الطلب');
    }
};

window.rejectFriendRequest = async function(requestId) {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        await window.db.collection('friendRequests').doc(requestId).update({
            status: 'rejected',
            respondedAt: new Date()
        });
        
        document.getElementById(`request-${requestId}`)?.remove();
        await loadFriendRequests();
        alert('تم رفض الطلب');
        
    } catch (error) {
        console.error('Error rejecting friend request:', error);
        alert('حدث خطأ في رفض الطلب');
    }
};

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
            alert('طلب صداقة معلق بالفعل');
            return;
        }
        
        await window.db.collection('friendRequests').add({
            from: currentUserId,
            to: targetUserId,
            status: 'pending',
            timestamp: new Date()
        });
        
        alert('تم إرسال طلب الصداقة');
        
    } catch (error) {
        console.error('Error sending friend request:', error);
        alert('حدث خطأ في إرسال الطلب');
    }
};

function setupFriendRequestsListener(userId) {
    try {
        window.db.collection('friendRequests')
            .where('to', '==', userId)
            .where('status', '==', 'pending')
            .onSnapshot(() => {
                loadFriendRequests();
            });
    } catch (error) {
        console.log('Error setting up listener:', error);
    }
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
    resultsContainer.innerHTML = '<div style="text-align: center; padding: 10px;">جاري البحث...</div>';
    
    try {
        const snapshot = await window.db.collection('users')
            .where('shareableId', '==', searchText)
            .get();
        
        if (snapshot.empty) {
            resultsContainer.innerHTML = '<div style="text-align: center; padding: 15px;">لا يوجد مستخدم</div>';
            return;
        }
        
        const user = snapshot.docs[0].data();
        const userId = snapshot.docs[0].id;
        const currentUser = window.auth.currentUser;
        
        if (currentUser && userId === currentUser.uid) {
            resultsContainer.innerHTML = '<div style="text-align: center; padding: 15px;">هذا حسابك الشخصي</div>';
            return;
        }
        
        const avatarEmoji = getEmojiForUser(user);
        
        resultsContainer.innerHTML = `
            <div class="search-result-item" style="display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 1px solid #ddd;">
                <div style="font-size: 2rem;">${avatarEmoji}</div>
                <div style="flex: 1;">
                    <h4 style="margin: 0;">${user.name}</h4>
                    <p style="margin: 0; color: #666; font-size: 0.8rem;">${user.shareableId}</p>
                </div>
                <button class="btn btn-primary" onclick="addNewFriend('${userId}')" style="padding: 5px 10px; background: #2196F3; color: white; border: none; border-radius: 5px; cursor: pointer;">إضافة صديق</button>
            </div>
        `;
    } catch (error) {
        console.error('Search error:', error);
        resultsContainer.innerHTML = '<div style="text-align: center; padding: 15px;">حدث خطأ في البحث</div>';
    }
};

window.hideSearchResults = function() {
    const resultsContainer = document.getElementById('searchResultsContainer');
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
    }
};
