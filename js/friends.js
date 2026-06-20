// ========== friends.js ==========
// نظام الصداقة

// ==================== القسم 1: عرض قائمة الأصدقاء ====================
window.showFriendsList = function() { 
    document.querySelector('.profile-page').style.display = 'none'; 
    document.getElementById('friendsPage').style.display = 'block'; 
    loadFriendsList(); 
};

// ==================== القسم 2: تحميل قائمة الأصدقاء (معدل - استخدام القالب الثابت) ====================
async function loadFriendsList() {
    if (!window.auth?.currentUser) return;
    const list = document.getElementById('friendsList'); 
    if (!list) return;
    
    // ✅ استخدام القالب الثابت
    const template = document.getElementById('friendItemTemplate');
    if (!template) {
        console.warn('⚠️ قالب friendItemTemplate غير موجود');
        return;
    }
    
    try {
        const doc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (!doc.exists) return;
        const friends = doc.data().friends || [];
        
        if (!friends.length) { 
            list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا يوجد أصدقاء</h3><p>لم تضف أي أصدقاء بعد</p></div>`; 
            return; 
        }
        
        // ✅ مسح القائمة قبل إعادة التعبئة
        list.innerHTML = '';
        
        for (const fid of friends) {
            try {
                const f = await window.db.collection('users').doc(fid).get();
                if (f.exists) { 
                    const d = f.data();
                    
                    // ✅ استخدام القالب الثابت
                    const clone = template.content.cloneNode(true);
                    const userItem = clone.querySelector('.user-item');
                    
                    // تعبئة البيانات
                    const avatar = userItem.querySelector('.user-avatar-emoji');
                    const name = userItem.querySelector('.user-info h4');
                    const idText = userItem.querySelector('.user-info p');
                    const chatBtn = userItem.querySelector('.chat-btn');
                    const removeBtn = userItem.querySelector('.remove-btn');
                    
                    if (avatar) avatar.textContent = getEmojiForUser(d);
                    if (name) name.textContent = d.name || 'مستخدم';
                    if (idText) idText.textContent = d.shareableId || '';
                    
                    // ربط الأحداث
                    if (chatBtn) chatBtn.onclick = () => openChat(fid);
                    if (removeBtn) removeBtn.onclick = () => removeFriend(fid);
                    
                    list.appendChild(clone);
                }
            } catch (e) {
                console.warn('خطأ في تحميل صديق:', e);
            }
        }
        
        // ✅ إذا لم تظهر أي عناصر
        if (list.children.length === 0) {
            list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا يوجد أصدقاء</h3><p>لم تضف أي أصدقاء بعد</p></div>`;
        }
        
    } catch (e) { 
        console.error('خطأ في loadFriendsList:', e);
        list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>خطأ</h3><p>حاول تحديث الصفحة</p></div>`; 
    }
}

// ==================== القسم 3: حذف صديق ====================
window.removeFriend = async function(friendId) {
    if (!window.auth?.currentUser || !confirm('هل أنت متأكد من حذف هذا الصديق؟')) return;
    try { 
        const uid = window.auth.currentUser.uid; 
        await window.db.collection('users').doc(uid).update({ friends: FieldValue.arrayRemove(friendId) }); 
        await window.db.collection('users').doc(friendId).update({ friends: FieldValue.arrayRemove(uid) }); 
        await updateFriendsCount(); 
        await loadFriendsList(); 
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
async function loadFriendRequests() {
    if (!window.auth?.currentUser) return;
    const list = document.getElementById('friendRequestsList'); 
    if (!list) return;
    
    // ✅ استخدام القالب الثابت
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
            
        if (s.empty) { 
            list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3><p>لم يرسل لك أحد طلب صداقة بعد</p></div>`; 
            return; 
        }
        
        // ✅ مسح القائمة قبل إعادة التعبئة
        list.innerHTML = '';
        
        let reqs = [];
        s.forEach(d => reqs.push({ id: d.id, ...d.data() }));
        reqs.sort((a, b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0));
        
        for (const r of reqs) {
            try {
                const sender = await window.db.collection('users').doc(r.from).get();
                if (sender.exists) { 
                    const sd = sender.data();
                    
                    // ✅ استخدام القالب الثابت
                    const clone = template.content.cloneNode(true);
                    const userItem = clone.querySelector('.user-item');
                    
                    // تعيين ID للعنصر
                    if (userItem) userItem.id = `request-${r.id}`;
                    
                    // تعبئة البيانات
                    const avatar = userItem.querySelector('.user-avatar-emoji');
                    const name = userItem.querySelector('.user-info h4');
                    const idText = userItem.querySelector('.user-info p');
                    const acceptBtn = userItem.querySelector('.accept-btn');
                    const rejectBtn = userItem.querySelector('.reject-btn');
                    
                    if (avatar) avatar.textContent = getEmojiForUser(sd);
                    if (name) name.textContent = sd.name || 'مستخدم';
                    if (idText) idText.textContent = sd.shareableId || '';
                    
                    // ربط الأحداث
                    if (acceptBtn) acceptBtn.onclick = () => acceptFriendRequest(r.id, r.from);
                    if (rejectBtn) rejectBtn.onclick = () => rejectFriendRequest(r.id);
                    
                    list.appendChild(clone);
                }
            } catch (e) {
                console.warn('خطأ في تحميل طلب:', e);
            }
        }
        
        // ✅ إذا لم تظهر أي عناصر
        if (list.children.length === 0) {
            list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3><p>لم يرسل لك أحد طلب صداقة بعد</p></div>`;
        }
        
    } catch (e) { 
        console.error('خطأ في loadFriendRequests:', e);
        list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>خطأ</h3><p>حاول تحديث الصفحة</p></div>`; 
    }
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
        if (!document.querySelectorAll('[id^="request-"]').length) {
            document.getElementById('friendRequestsList').innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3></div>`;
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
        if (!document.querySelectorAll('[id^="request-"]').length) {
            document.getElementById('friendRequestsList').innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3></div>`;
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
                    loadFriendRequests(); 
                }
            }); 
    } catch (e) {}
}

// ==================== القسم 12: البحث عن مستخدم (معدل - استخدام القالب الثابت) ====================
window.findUserById = async function() {
    const inp = document.getElementById('searchInput');
    const rc = document.getElementById('searchResultsContainer');
    if (!inp || !rc) return;
    
    const q = inp.value.trim();
    if (!q) { 
        rc.style.display = 'none'; 
        return; 
    }
    
    // ✅ إظهار حاوية النتائج وعرض "جاري البحث..."
    rc.style.display = 'block';
    rc.innerHTML = `<div style="text-align:center;padding:10px;color:var(--text-light);">جاري البحث...</div>`;
    
    // ✅ الحصول على القالب الثابت
    const template = document.getElementById('searchResultTemplate');
    if (!template) {
        console.warn('⚠️ قالب searchResultTemplate غير موجود');
        rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">حدث خطأ في البحث</div>`;
        return;
    }
    
    try {
        const s = await window.db.collection('users').where('shareableId', '==', q).get();
        
        // ✅ حالة 1: لا يوجد مستخدم
        if (s.empty) { 
            rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">🔍 لا يوجد مستخدم بهذا المعرف</div>`; 
            return; 
        }
        
        const u = s.docs[0].data();
        const uid = s.docs[0].id;
        const cu = window.auth?.currentUser;
        
        // ✅ حالة 2: المستخدم هو نفسه (حساب شخصي)
        if (cu && uid === cu.uid) { 
            rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">👤 هذا حسابك الشخصي</div>`; 
            return; 
        }
        
        // ✅ تحديد حالة العلاقة مع المستخدم
        let btnText = 'إضافة';
        let btnDisabled = false;
        let btnStyle = 'background:var(--primary);';
        let isFriend = false;
        let isPending = false;
        let btnAction = null;
        
        if (cu) { 
            const me = await window.db.collection('users').doc(cu.uid).get();
            const myFriends = me.data().friends || [];
            
            // ✅ حالة 3: المستخدم صديق بالفعل
            if (myFriends.includes(uid)) { 
                btnText = '💬 دردشة'; 
                btnDisabled = false;
                btnStyle = 'background:#4CAF50;';
                isFriend = true;
                btnAction = () => openChat(uid);
            } else { 
                // ✅ التحقق من وجود طلب صداقة معلق
                const er = await window.db.collection('friendRequests')
                    .where('from','==',cu.uid)
                    .where('to','==',uid)
                    .where('status','==','pending')
                    .get(); 
                if (!er.empty) { 
                    btnText = '⏳ طلب معلق'; 
                    btnDisabled = true;
                    btnStyle = 'background:#888;cursor:not-allowed;';
                    isPending = true;
                    btnAction = null;
                } else {
                    // ✅ حالة 4: مستخدم جديد (يمكن إضافة)
                    btnText = '➕ إضافة';
                    btnDisabled = false;
                    btnStyle = 'background:var(--primary);';
                    btnAction = () => addNewFriend(uid);
                }
            } 
        } else {
            // ✅ إذا لم يكن هناك مستخدم مسجل دخول
            btnText = 'تسجيل دخول';
            btnDisabled = true;
            btnStyle = 'background:#888;cursor:not-allowed;';
            btnAction = null;
        }
        
        // ✅ استخدام القالب الثابت لإنشاء النتيجة
        const clone = template.content.cloneNode(true);
        const resultItem = clone.querySelector('.search-result-item');
        
        // تعبئة البيانات
        const avatar = resultItem.querySelector('.search-result-avatar');
        const name = resultItem.querySelector('.search-result-info h4');
        const idText = resultItem.querySelector('.search-result-info p');
        const actionBtn = resultItem.querySelector('.search-action-btn');
        
        if (avatar) avatar.textContent = getEmojiForUser(u);
        if (name) name.textContent = u.name || 'مستخدم';
        if (idText) idText.textContent = u.shareableId || '';
        
        // إعداد الزر حسب الحالة
        if (actionBtn) {
            actionBtn.textContent = btnText;
            actionBtn.style.cssText = `padding:6px 14px;border:none;border-radius:20px;${btnStyle}color:white;cursor:${btnDisabled ? 'not-allowed' : 'pointer'};font-size:0.85rem;`;
            
            if (btnDisabled) {
                actionBtn.disabled = true;
            }
            
            // ✅ ربط حدث الزر
            if (btnAction) {
                actionBtn.onclick = btnAction;
            }
        }
        
        // ✅ مسح النتائج السابقة وإضافة النتيجة الجديدة
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
    if (rc) { 
        rc.style.display = 'none'; 
        rc.innerHTML = ''; 
    } 
};
