// ========== friends.js ==========
// نظام الصداقة - نسخة معدلة (الطلبات تظهر في المحادثات)

// ==================== القسم 1: عرض قائمة الأصدقاء ====================
window.showFriendsList = function() { 
    document.querySelector('.profile-page').style.display = 'none'; 
    document.getElementById('friendsPage').style.display = 'block'; 
    loadFriendsList(); 
};

// ==================== القسم 2: تحميل قائمة الأصدقاء ====================
let friendsLoaded = false;

async function loadFriendsList(force = false) {
    if (!window.auth?.currentUser) return;
    const list = document.getElementById('friendsList'); 
    if (!list) return;
    
    if (friendsLoaded && !force) {
        console.log('⏭️ قائمة الأصدقاء محملة مسبقاً، تخطي التحميل');
        return;
    }
    
    const template = document.getElementById('friendItemTemplate');
    if (!template) {
        console.warn('⚠️ قالب friendItemTemplate غير موجود');
        return;
    }
    
    try {
        const doc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (!doc.exists) return;
        const friends = doc.data().friends || [];
        
        list.innerHTML = '';
        
        if (!friends.length) { 
            list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا يوجد أصدقاء</h3><p>لم تضف أي أصدقاء بعد</p></div>`; 
            friendsLoaded = true;
            return; 
        }
        
        for (const fid of friends) {
            try {
                const f = await window.db.collection('users').doc(fid).get();
                if (f.exists) { 
                    const d = f.data();
                    
                    const clone = template.content.cloneNode(true);
                    const userItem = clone.querySelector('.user-item');
                    
                    const avatar = userItem.querySelector('.user-avatar-emoji');
                    const name = userItem.querySelector('.user-info h4');
                    const idText = userItem.querySelector('.user-info p');
                    const chatBtn = userItem.querySelector('.chat-btn');
                    const removeBtn = userItem.querySelector('.remove-btn');
                    
                    if (avatar) avatar.textContent = getEmojiForUser(d);
                    if (name) name.textContent = d.name || 'مستخدم';
                    if (idText) idText.textContent = d.shareableId || '';
                    
                    if (chatBtn) chatBtn.onclick = () => openChat(fid);
                    if (removeBtn) removeBtn.onclick = () => removeFriend(fid);
                    
                    list.appendChild(clone);
                }
            } catch (e) {
                console.warn('خطأ في تحميل صديق:', e);
            }
        }
        
        friendsLoaded = true;
        
        if (list.children.length === 0) {
            list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا يوجد أصدقاء</h3><p>لم تضف أي أصدقاء بعد</p></div>`;
        }
        
    } catch (e) { 
        console.error('خطأ في loadFriendsList:', e);
        list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>خطأ</h3><p>حاول تحديث الصفحة</p></div>`; 
        friendsLoaded = true;
    }
}

function refreshFriends() {
    friendsLoaded = false;
    loadFriendsList(true);
}

// ==================== القسم 3: حذف صديق ====================
window.removeFriend = async function(friendId) {
    if (!window.auth?.currentUser || !confirm('هل أنت متأكد من حذف هذا الصديق؟')) return;
    try { 
        const uid = window.auth.currentUser.uid; 
        await window.db.collection('users').doc(uid).update({ friends: FieldValue.arrayRemove(friendId) }); 
        await window.db.collection('users').doc(friendId).update({ friends: FieldValue.arrayRemove(uid) }); 
        await updateFriendsCount(); 
        refreshFriends();
        alert('تم حذف الصديق بنجاح'); 
    } catch (e) { 
        alert('حدث خطأ'); 
    }
};

// ==================== القسم 4: تحديث عدد الأصدقاء ====================
async function updateFriendsCount() {
    if (!window.auth?.currentUser) return;
    try { 
        const d = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); 
        if (d.exists) { 
            const c = document.getElementById('friendsCount'); 
            if (c) c.textContent = formatNumber((d.data().friends||[]).length); 
        } 
    } catch (e) {}
}

// ==================== القسم 5: نظام طلبات الصداقة الجديد (يظهر في المحادثات) ====================

// ✅ دالة إرسال طلب صداقة (تضاف كرسالة واردة)
window.addNewFriend = async function(targetUserId) {
    if (!window.auth?.currentUser) return;
    const uid = window.auth.currentUser.uid;
    if (uid === targetUserId) { 
        alert('لا يمكنك إضافة نفسك'); 
        return; 
    }
    try {
        const exist = await window.db.collection('friendRequests')
            .where('from', '==', uid)
            .where('to', '==', targetUserId)
            .where('status', '==', 'pending')
            .get();
        if (!exist.empty) { 
            alert('أرسلت طلباً مسبقاً'); 
            return; 
        }
        const me = await window.db.collection('users').doc(uid).get();
        if (me.exists && (me.data().friends||[]).includes(targetUserId)) { 
            alert('صديقك بالفعل'); 
            return; 
        }
        
        // إرسال الطلب
        await window.db.collection('friendRequests').add({ 
            from: uid, 
            to: targetUserId, 
            status: 'pending', 
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)) // 24 ساعة
        });
        
        // إخفاء نتائج البحث
        const rc = document.getElementById('searchResultsContainer'); 
        if (rc) { 
            rc.style.display = 'none'; 
            rc.innerHTML = ''; 
        }
        const si = document.getElementById('searchInput'); 
        if (si) si.value = '';
        alert('تم إرسال طلب الصداقة');
    } catch (e) { 
        alert('حدث خطأ'); 
    }
};

// ✅ دالة قبول طلب صداقة من المحادثة
window.acceptFriendRequestFromChat = async function(requestId, senderId) {
    if (!window.auth?.currentUser) return;
    try {
        const uid = window.auth.currentUser.uid;
        const requestDoc = await window.db.collection('friendRequests').doc(requestId).get();
        if (!requestDoc.exists) {
            alert('طلب الصداقة غير موجود');
            return;
        }
        const requestData = requestDoc.data();
        if (requestData.status !== 'pending') {
            alert('تم معالجة هذا الطلب مسبقاً');
            return;
        }
        if (requestData.to !== uid) {
            alert('هذا الطلب ليس لك');
            return;
        }
        
        // قبول الطلب
        await window.db.collection('friendRequests').doc(requestId).update({ 
            status: 'accepted', 
            respondedAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
        await window.db.collection('users').doc(uid).update({ friends: FieldValue.arrayUnion(senderId) });
        await window.db.collection('users').doc(senderId).update({ friends: FieldValue.arrayUnion(uid) });
        
        await updateFriendsCount();
        refreshFriends();
        
        // تحديث واجهة المحادثة (إزالة رسالة الطلب)
        if (ChatSystem.currentChat === senderId) {
            ChatSystem.displayMessages(senderId);
        }
        
        alert('تم قبول طلب الصداقة بنجاح');
    } catch (e) { 
        console.error('خطأ في قبول الطلب:', e);
        alert('حدث خطأ'); 
    }
};

// ✅ دالة رفض طلب صداقة من المحادثة
window.rejectFriendRequestFromChat = async function(requestId) {
    if (!window.auth?.currentUser) return;
    try {
        const uid = window.auth.currentUser.uid;
        const requestDoc = await window.db.collection('friendRequests').doc(requestId).get();
        if (!requestDoc.exists) {
            alert('طلب الصداقة غير موجود');
            return;
        }
        const requestData = requestDoc.data();
        if (requestData.status !== 'pending') {
            alert('تم معالجة هذا الطلب مسبقاً');
            return;
        }
        if (requestData.to !== uid) {
            alert('هذا الطلب ليس لك');
            return;
        }
        
        await window.db.collection('friendRequests').doc(requestId).update({ 
            status: 'rejected', 
            respondedAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
        
        // تحديث واجهة المحادثة (إزالة رسالة الطلب)
        if (ChatSystem.currentChat === requestData.from) {
            ChatSystem.displayMessages(requestData.from);
        }
        
        alert('تم رفض الطلب');
    } catch (e) { 
        console.error('خطأ في رفض الطلب:', e);
        alert('حدث خطأ'); 
    }
};

// ✅ دالة تنظيف الطلبات المنتهية (24 ساعة)
async function cleanExpiredFriendRequests() {
    try {
        const now = new Date();
        const snapshot = await window.db.collection('friendRequests')
            .where('expiresAt', '<', firebase.firestore.Timestamp.fromDate(now))
            .where('status', '==', 'pending')
            .get();
        
        for (const doc of snapshot.docs) {
            await doc.ref.update({ 
                status: 'expired',
                expiredAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('🗑️ تم حذف طلب صداقة منتهي الصلاحية:', doc.id);
        }
    } catch (e) {
        console.warn('خطأ في تنظيف الطلبات المنتهية:', e);
    }
}

// ✅ بدء التنظيف الدوري (كل 6 ساعات)
function startFriendRequestCleanup() {
    cleanExpiredFriendRequests();
    setInterval(cleanExpiredFriendRequests, 6 * 60 * 60 * 1000);
}

// ✅ دالة جلب طلبات الصداقة المعلقة للمستخدم الحالي (للظهور في المحادثات)
async function getPendingFriendRequestsForUser(userId) {
    if (!userId) return [];
    try {
        const snapshot = await window.db.collection('friendRequests')
            .where('to', '==', userId)
            .where('status', '==', 'pending')
            .get();
        
        const requests = [];
        snapshot.forEach(doc => {
            requests.push({ id: doc.id, ...doc.data() });
        });
        return requests;
    } catch (e) {
        console.warn('خطأ في جلب طلبات الصداقة:', e);
        return [];
    }
}

// ✅ دالة جلب الطلبات المرسلة (للمستخدم الذي أرسل الطلب)
async function getSentFriendRequests(userId) {
    if (!userId) return [];
    try {
        const snapshot = await window.db.collection('friendRequests')
            .where('from', '==', userId)
            .where('status', '==', 'pending')
            .get();
        
        const requests = [];
        snapshot.forEach(doc => {
            requests.push({ id: doc.id, ...doc.data() });
        });
        return requests;
    } catch (e) {
        console.warn('خطأ في جلب الطلبات المرسلة:', e);
        return [];
    }
}

// ==================== القسم 6: البحث عن مستخدم ====================
window.findUserById = async function() {
    const inp = document.getElementById('searchInput');
    const rc = document.getElementById('searchResultsContainer');
    if (!inp || !rc) return;
    
    const q = inp.value.trim();
    if (!q) { 
        rc.style.display = 'none'; 
        return; 
    }
    
    rc.style.display = 'block';
    rc.innerHTML = `<div style="text-align:center;padding:10px;color:var(--text-light);">جاري البحث...</div>`;
    
    const template = document.getElementById('searchResultTemplate');
    if (!template) {
        console.warn('⚠️ قالب searchResultTemplate غير موجود');
        rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">حدث خطأ في البحث</div>`;
        return;
    }
    
    try {
        const s = await window.db.collection('users').where('shareableId', '==', q).get();
        
        if (s.empty) { 
            rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">لا يوجد مستخدم بهذا المعرف</div>`; 
            return; 
        }
        
        const u = s.docs[0].data();
        const uid = s.docs[0].id;
        const cu = window.auth?.currentUser;
        
        // ✅ حساب شخصي: اسم + صورة + ID (بدون زر)
        if (cu && uid === cu.uid) {
            const clone = template.content.cloneNode(true);
            const resultItem = clone.querySelector('.search-result-item');
            
            const avatar = resultItem.querySelector('.search-result-avatar');
            const name = resultItem.querySelector('.search-result-info h4');
            const idText = resultItem.querySelector('.search-result-info p');
            const actionBtn = resultItem.querySelector('.search-action-btn');
            
            if (avatar) avatar.textContent = getEmojiForUser(u);
            if (name) {
                name.textContent = u.name || 'مستخدم';
                name.style.color = 'var(--primary)';
            }
            if (idText) idText.textContent = u.shareableId || '';
            
            if (actionBtn) {
                actionBtn.style.display = 'none';
            }
            
            rc.innerHTML = '';
            rc.appendChild(clone);
            
            setTimeout(() => {
                if (rc.style.display !== 'none') {
                    hideSearchResults();
                }
            }, 5000);
            
            return;
        }
        
        // ✅ تحديد حالة العلاقة مع المستخدم
        let btnIcon = '';
        let btnDisabled = false;
        let btnStyle = '';
        let btnAction = null;
        let btnText = '';
        
        if (cu) { 
            const me = await window.db.collection('users').doc(cu.uid).get();
            const myFriends = me.data().friends || [];
            
            // ✅ التحقق من طلبات الصداقة المرسلة والمستلمة
            const sentRequests = await getSentFriendRequests(cu.uid);
            const isSent = sentRequests.some(r => r.to === uid);
            
            const receivedRequests = await getPendingFriendRequestsForUser(cu.uid);
            const isReceived = receivedRequests.some(r => r.from === uid);
            
            if (myFriends.includes(uid)) { 
                btnIcon = 'fa-comment';
                btnDisabled = false;
                btnStyle = 'background:var(--primary);color:white;';
                btnText = 'محادثة';
                btnAction = () => openChat(uid);
            } else if (isSent) {
                btnIcon = 'fa-clock';
                btnDisabled = true;
                btnStyle = 'background:#555;color:#888;cursor:not-allowed;';
                btnText = 'بانتظار الرد';
                btnAction = null;
            } else if (isReceived) {
                btnIcon = 'fa-check';
                btnDisabled = false;
                btnStyle = 'background:#4CAF50;color:white;';
                btnText = 'قبول';
                btnAction = async () => {
                    const request = receivedRequests.find(r => r.from === uid);
                    if (request) {
                        await acceptFriendRequestFromChat(request.id, uid);
                        hideSearchResults();
                    }
                };
            } else {
                btnIcon = 'fa-plus';
                btnDisabled = false;
                btnStyle = 'background:var(--primary);color:white;';
                btnText = 'إضافة';
                btnAction = () => {
                    addNewFriend(uid);
                    hideSearchResults();
                };
            }
        } else {
            btnIcon = 'fa-lock';
            btnDisabled = true;
            btnStyle = 'background:#555;color:#888;cursor:not-allowed;';
            btnText = 'تسجيل دخول';
            btnAction = null;
        }
        
        const clone = template.content.cloneNode(true);
        const resultItem = clone.querySelector('.search-result-item');
        
        const avatar = resultItem.querySelector('.search-result-avatar');
        const name = resultItem.querySelector('.search-result-info h4');
        const idText = resultItem.querySelector('.search-result-info p');
        const actionBtn = resultItem.querySelector('.search-action-btn');
        
        if (avatar) avatar.textContent = getEmojiForUser(u);
        if (name) name.textContent = u.name || 'مستخدم';
        if (idText) idText.textContent = u.shareableId || '';
        
        if (actionBtn) {
            actionBtn.textContent = btnText || '';
            actionBtn.innerHTML = `${btnText || ''} <i class="fas ${btnIcon}"></i>`;
            actionBtn.style.cssText = `padding:6px 14px;border:none;border-radius:20px;${btnStyle}font-size:0.85rem;cursor:${btnDisabled ? 'not-allowed' : 'pointer'};display:flex;align-items:center;gap:6px;`;
            
            if (btnDisabled) {
                actionBtn.disabled = true;
            }
            
            if (btnAction) {
                actionBtn.onclick = btnAction;
            }
        }
        
        rc.innerHTML = '';
        rc.appendChild(clone);
        
    } catch (e) { 
        console.error('خطأ في البحث:', e);
        rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">❌ حدث خطأ في البحث</div>`; 
    }
};

// ==================== القسم 7: إخفاء نتائج البحث ====================
window.hideSearchResults = function() { 
    const rc = document.getElementById('searchResultsContainer'); 
    const inp = document.getElementById('searchInput');
    if (rc) { 
        rc.style.display = 'none'; 
        rc.innerHTML = ''; 
    }
    if (inp) {
        inp.value = '';
    }
};

// ==================== القسم 8: بدء تشغيل النظام ====================
// بدء تنظيف الطلبات المنتهية
setTimeout(startFriendRequestCleanup, 5000);

console.log('✅ نظام الصداقة الجديد يعمل - الطلبات تظهر في المحادثات');
