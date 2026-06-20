// ========== friends.js ==========
// نظام الصداقة

// ==================== القسم 1: عرض قائمة الأصدقاء ====================
window.showFriendsList = function() { 
    document.querySelector('.profile-page').style.display = 'none'; 
    document.getElementById('friendsPage').style.display = 'block'; 
    loadFriendsList(); 
};

// ==================== القسم 2: تحميل قائمة الأصدقاء (معدل - استخدام القالب الثابت) ====================
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

// ==================== القسم 5: عرض طلبات الصداقة ====================
window.showFriendRequests = function() { 
    document.querySelector('.profile-page').style.display = 'none'; 
    document.getElementById('friendRequestsPage').style.display = 'block'; 
    loadFriendRequests(); 
};

// ==================== القسم 6: تحميل طلبات الصداقة (معدل - استخدام القالب الثابت) ====================
let requestsLoaded = false;

async function loadFriendRequests(force = false) {
    if (!window.auth?.currentUser) return;
    const list = document.getElementById('friendRequestsList'); 
    if (!list) return;
    
    if (requestsLoaded && !force) {
        console.log('⏭️ قائمة طلبات الصداقة محملة مسبقاً، تخطي التحميل');
        return;
    }
    
    const template = document.getElementById('friendRequestTemplate');
    if (!template) {
        console.warn('⚠️ قالب friendRequestTemplate غير موجود');
        return;
    }
    
    try {
        const s = await window.db.collection('friendRequests')
            .where('to', '==', window.auth.currentUser.uid)
            .where('status', '==', 'pending')
            .get();
            
        list.innerHTML = '';
            
        if (s.empty) { 
            list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3><p>لم يرسل لك أحد طلب صداقة بعد</p></div>`; 
            requestsLoaded = true;
            return; 
        }
        
        let reqs = [];
        s.forEach(d => reqs.push({ id: d.id, ...d.data() }));
        reqs.sort((a, b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0));
        
        for (const r of reqs) {
            try {
                const sender = await window.db.collection('users').doc(r.from).get();
                if (sender.exists) { 
                    const sd = sender.data();
                    
                    const clone = template.content.cloneNode(true);
                    const userItem = clone.querySelector('.user-item');
                    
                    if (userItem) userItem.id = `request-${r.id}`;
                    
                    const avatar = userItem.querySelector('.user-avatar-emoji');
                    const name = userItem.querySelector('.user-info h4');
                    const idText = userItem.querySelector('.user-info p');
                    const acceptBtn = userItem.querySelector('.accept-btn');
                    const rejectBtn = userItem.querySelector('.reject-btn');
                    
                    if (avatar) avatar.textContent = getEmojiForUser(sd);
                    if (name) name.textContent = sd.name || 'مستخدم';
                    if (idText) idText.textContent = sd.shareableId || '';
                    
                    if (acceptBtn) acceptBtn.onclick = () => acceptFriendRequest(r.id, r.from);
                    if (rejectBtn) rejectBtn.onclick = () => rejectFriendRequest(r.id);
                    
                    list.appendChild(clone);
                }
            } catch (e) {
                console.warn('خطأ في تحميل طلب:', e);
            }
        }
        
        requestsLoaded = true;
        
        if (list.children.length === 0) {
            list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3><p>لم يرسل لك أحد طلب صداقة بعد</p></div>`;
        }
        
    } catch (e) { 
        console.error('خطأ في loadFriendRequests:', e);
        list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>خطأ</h3><p>حاول تحديث الصفحة</p></div>`; 
        requestsLoaded = true;
    }
}

function refreshRequests() {
    requestsLoaded = false;
    loadFriendRequests(true);
}

// ==================== القسم 7: قبول طلب صداقة ====================
window.acceptFriendRequest = async function(requestId, senderId) {
    if (!window.auth?.currentUser) return;
    try {
        const uid = window.auth.currentUser.uid;
        await window.db.collection('friendRequests').doc(requestId).update({ status: 'accepted', respondedAt: new Date() });
        await window.db.collection('users').doc(uid).update({ friends: FieldValue.arrayUnion(senderId) });
        await window.db.collection('users').doc(senderId).update({ friends: FieldValue.arrayUnion(uid) });
        document.getElementById(`request-${requestId}`)?.remove();
        await updateFriendRequestsCount(); 
        await updateFriendsCount();
        refreshFriends();
        refreshRequests();
        if (!document.querySelectorAll('[id^="request-"]').length) {
            document.getElementById('friendRequestsList').innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3></div>`;
            requestsLoaded = true;
        }
    } catch (e) { 
        alert('حدث خطأ'); 
    }
};

// ==================== القسم 8: رفض طلب صداقة ====================
window.rejectFriendRequest = async function(requestId) {
    if (!window.auth?.currentUser) return;
    try { 
        await window.db.collection('friendRequests').doc(requestId).update({ status: 'rejected', respondedAt: new Date() }); 
        document.getElementById(`request-${requestId}`)?.remove(); 
        await updateFriendRequestsCount(); 
        refreshRequests();
        if (!document.querySelectorAll('[id^="request-"]').length) {
            document.getElementById('friendRequestsList').innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3></div>`;
            requestsLoaded = true;
        }
    } catch (e) {}
};

// ==================== القسم 9: تحديث عدد طلبات الصداقة ====================
async function updateFriendRequestsCount() {
    if (!window.auth?.currentUser) return;
    try { 
        const s = await window.db.collection('friendRequests')
            .where('to', '==', window.auth.currentUser.uid)
            .where('status', '==', 'pending')
            .get(); 
        const c = document.getElementById('friendRequestsCount'); 
        if (c) c.textContent = formatNumber(s.size); 
    } catch (e) {}
}

// ==================== القسم 10: إضافة صديق جديد ====================
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
        await window.db.collection('friendRequests').add({ 
            from: uid, 
            to: targetUserId, 
            status: 'pending', 
            timestamp: new Date() 
        });
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

// ==================== القسم 11: مستمع طلبات الصداقة ====================
function setupFriendRequestsListener(userId) {
    try { 
        window.db.collection('friendRequests')
            .where('to', '==', userId)
            .where('status', '==', 'pending')
            .onSnapshot(s => { 
                const c = document.getElementById('friendRequestsCount'); 
                if (c) c.textContent = formatNumber(s.size); 
                if (document.getElementById('friendRequestsPage')?.style.display === 'block') {
                    refreshRequests();
                }
            }); 
    } catch (e) {}
}

// ==================== القسم 12: البحث عن مستخدم (معدل - أيقونات فقط) ====================
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
            // ✅ تعديل الرسالة هنا (بدون علامة 🔍)
            rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">لا يوجد مستخدم ID</div>`; 
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
        
        // ✅ تحديد حالة العلاقة مع المستخدم (للمستخدمين الآخرين)
        let btnIcon = '';
        let btnDisabled = false;
        let btnStyle = '';
        let btnAction = null;
        
        if (cu) { 
            const me = await window.db.collection('users').doc(cu.uid).get();
            const myFriends = me.data().friends || [];
            
            if (myFriends.includes(uid)) { 
                btnIcon = 'fa-comment';
                btnDisabled = false;
                btnStyle = 'background:var(--primary);color:white;';
                btnAction = () => openChat(uid);
            } else { 
                const er = await window.db.collection('friendRequests')
                    .where('from','==',cu.uid)
                    .where('to','==',uid)
                    .where('status','==','pending')
                    .get(); 
                if (!er.empty) { 
                    btnIcon = 'fa-clock';
                    btnDisabled = true;
                    btnStyle = 'background:#555;color:#888;cursor:not-allowed;';
                    btnAction = null;
                } else {
                    btnIcon = 'fa-plus';
                    btnDisabled = false;
                    btnStyle = 'background:var(--primary);color:white;';
                    btnAction = () => {
                        addNewFriend(uid);
                        hideSearchResults();
                    };
                }
            } 
        } else {
            btnIcon = 'fa-lock';
            btnDisabled = true;
            btnStyle = 'background:#555;color:#888;cursor:not-allowed;';
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
            actionBtn.innerHTML = `<i class="fas ${btnIcon}"></i>`;
            actionBtn.style.cssText = `padding:8px 12px;border:none;border-radius:20px;${btnStyle}font-size:1rem;cursor:${btnDisabled ? 'not-allowed' : 'pointer'};display:flex;align-items:center;justify-content:center;gap:4px;min-width:40px;`;
            
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

// ==================== القسم 13: إخفاء نتائج البحث ====================
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
