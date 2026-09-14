// ========== friends.js - النسخة النهائية (بدون تكرار) ==========
// نظام الصداقة - مع مزامنة فورية بدون تكرار

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
        
        const addedIds = new Set();
        for (const fid of friends) {
            if (addedIds.has(fid)) continue;
            addedIds.add(fid);
            
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
        friendsLoaded = true;
    }
}

function refreshFriends() {
    friendsLoaded = false;
    loadFriendsList(true);
}

// ==================== القسم 3: إضافة صديق جديد ====================
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
            timestamp: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
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

// ==================== القسم 4: قبول طلب الصداقة ====================
window.acceptFriendRequest = async function(requestId, senderId) {
    if (!window.auth?.currentUser) return;
    try {
        const uid = window.auth.currentUser.uid;
        const FieldValue = firebase.firestore.FieldValue;
        
        // 1. حذف الطلب
        await window.db.collection('friendRequests').doc(requestId).delete();
        console.log('🗑️ تم حذف طلب الصداقة المقبول');
        
        // 2. إضافة الصديق للمستخدم الحالي
        await window.db.collection('users').doc(uid).update({ 
            friends: FieldValue.arrayUnion(senderId) 
        });
        
        // 3. إضافة المستخدم الحالي للطرف الآخر
        await window.db.collection('users').doc(senderId).update({ 
            friends: FieldValue.arrayUnion(uid) 
        });
        
        console.log('✅ تمت إضافة الصديق للطرفين');
        
        // ✅ 4. إزالة الطلب من القائمة فوراً
        const requestEl = _currentChatsElements.requests.get(requestId);
        if (requestEl) {
            requestEl.remove();
            _currentChatsElements.requests.delete(requestId);
        }
        
        // ✅ 5. onSnapshot سيتعامل مع إضافة الصديق (بفضل القفل، لن يحدث تكرار)
        
        console.log('✅ تم قبول طلب الصداقة بنجاح');
        
    } catch (e) { 
        console.error('خطأ في قبول الطلب:', e);
        alert('حدث خطأ'); 
    }
};

// ==================== القسم 5: رفض طلب الصداقة ====================
window.rejectFriendRequest = async function(requestId) {
    if (!window.auth?.currentUser) return;
    try { 
        await window.db.collection('friendRequests').doc(requestId).delete();
        console.log('🗑️ تم حذف طلب الصداقة المرفوض');
        
        const requestEl = _currentChatsElements.requests.get(requestId);
        if (requestEl) {
            requestEl.remove();
            _currentChatsElements.requests.delete(requestId);
            const list = document.getElementById('chatsList');
            if (list && typeof updateEmptyState === 'function') updateEmptyState(list);
        }
        
    } catch (e) {
        console.error('خطأ في رفض الطلب:', e);
    }
};

// ==================== القسم 6: مستمع طلبات الصداقة ====================
let friendRequestsUnsubscribe = null;

function setupFriendRequestsListener(userId) {
    if (!userId) return;
    
    if (friendRequestsUnsubscribe) {
        try { friendRequestsUnsubscribe(); } catch(e) {}
        friendRequestsUnsubscribe = null;
    }
    
    try { 
        friendRequestsUnsubscribe = window.db.collection('friendRequests')
            .where('to', '==', userId)
            .where('status', '==', 'pending')
            .onSnapshot(async snapshot => {
                console.log(`📬 تحديث طلبات الصداقة: ${snapshot.size} طلب معلق`);
                
                const list = document.getElementById('chatsList');
                const chatTemplate = ChatSystem.chatItemTemplate || document.getElementById('chatItemTemplate');
                const requestTemplate = document.getElementById('friendRequestChatTemplate');
                
                if (!list || !chatTemplate || !requestTemplate) return;
                
                const udoc = await window.db.collection('users').doc(userId).get();
                if (!udoc.exists) return;
                const friends = udoc.data().friends || [];
                
                await smartUpdateChatsList(friends, chatTemplate, requestTemplate, list);
                
            }, error => {
                console.warn('خطأ في مستمع طلبات الصداقة:', error);
            });
    } catch (e) {
        console.warn('خطأ في setupFriendRequestsListener:', e);
    }
}

// ==================== القسم 7: مستمع الأصدقاء ====================
let friendsUnsubscribe = null;

function setupFriendsListener(userId) {
    if (!userId) return;
    
    if (friendsUnsubscribe) {
        try { friendsUnsubscribe(); } catch(e) {}
        friendsUnsubscribe = null;
    }
    
    try {
        friendsUnsubscribe = window.db.collection('users').doc(userId).onSnapshot(async (doc) => {
            if (!doc.exists) return;
            
            const data = doc.data();
            const friends = data.friends || [];
            
            console.log(`👥 تحديث قائمة الأصدقاء: ${friends.length} صديق`);
            
            if (typeof ChatSystem !== 'undefined' && ChatSystem.loadAllChats) {
                ChatSystem.loadAllChats();
            }
            
            const list = document.getElementById('chatsList');
            const chatTemplate = ChatSystem.chatItemTemplate || document.getElementById('chatItemTemplate');
            const requestTemplate = document.getElementById('friendRequestChatTemplate');
            
            if (list && chatTemplate && requestTemplate) {
                await smartUpdateChatsList(friends, chatTemplate, requestTemplate, list);
            }
            
            friendsLoaded = false;
            if (document.getElementById('friendsPage')?.style.display === 'block') {
                loadFriendsList(true);
            }
            
        }, error => {
            console.warn('خطأ في مستمع الأصدقاء:', error);
        });
    } catch (e) {
        console.warn('خطأ في setupFriendsListener:', e);
    }
}

// ==================== القسم 8: تحميل طلبات الصداقة ====================
async function loadFriendRequestsForChat() {
    if (!window.auth?.currentUser) return [];
    try {
        const snapshot = await window.db.collection('friendRequests')
            .where('to', '==', window.auth.currentUser.uid)
            .where('status', '==', 'pending')
            .get();
        const requests = [];
        const seenIds = new Set();
        snapshot.forEach(doc => {
            if (!seenIds.has(doc.id)) {
                seenIds.add(doc.id);
                requests.push({ id: doc.id, ...doc.data() });
            }
        });
        requests.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        return requests;
    } catch (e) {
        console.warn('خطأ في تحميل طلبات الصداقة:', e);
        return [];
    }
}

// ==================== القسم 9: البحث عن مستخدم ====================
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
        rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">حدث خطأ في البحث</div>`;
        return;
    }
    
    try {
        const s = await window.db.collection('users').where('shareableId', '==', q).get();
        if (s.empty) { 
            rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">لا يوجد مستخدم بهذا ID</div>`; 
            return; 
        }
        
        const u = s.docs[0].data();
        const uid = s.docs[0].id;
        const cu = window.auth?.currentUser;
        
        // حالة: حسابك
        if (cu && uid === cu.uid) {
            const clone = template.content.cloneNode(true);
            const resultItem = clone.querySelector('.search-result-item');
            const avatar = resultItem.querySelector('.search-result-avatar');
            const name = resultItem.querySelector('.search-result-info h4');
            const idText = resultItem.querySelector('.search-result-info p');
            const actionBtn = resultItem.querySelector('.search-action-btn');
            
            if (avatar) avatar.textContent = getEmojiForUser(u);
            if (name) { name.textContent = u.name || 'مستخدم'; name.style.color = 'var(--primary)'; }
            if (idText) {
                const shareableId = u.shareableId || '';
                idText.innerHTML = `
                    <button class="copy-id-btn-search" style="background:transparent;border:none;color:var(--primary);cursor:pointer;font-size:0.7rem;display:inline-flex;align-items:center;justify-content:center;padding:2px;flex-shrink:0;" title="نسخ ID">
                        <i class="fas fa-copy" style="font-size:0.7rem;"></i>
                    </button>
                    <span style="font-size:0.75rem;font-family:monospace;direction:ltr;">${shareableId}</span>
                    <span style="color:var(--primary);font-weight:700;font-size:0.85rem;font-family:sans-serif;">ID</span>
                `;
                const copyBtn = idText.querySelector('.copy-id-btn-search');
                if (copyBtn) {
                    copyBtn.onclick = (e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(shareableId).then(() => {
                            const icon = copyBtn.querySelector('i');
                            if (icon) {
                                icon.className = 'fas fa-check';
                                setTimeout(() => { icon.className = 'fas fa-copy'; }, 1500);
                            }
                        }).catch(() => {});
                    };
                }
            }
            if (actionBtn) actionBtn.style.display = 'none';
            
            rc.innerHTML = '';
            rc.appendChild(clone);
            return;
        }
        
        // تحديد حالة العلاقة
        let btnIcon = '', btnDisabled = false, btnStyle = '', btnAction = null;
        
        if (cu) { 
            const me = await window.db.collection('users').doc(cu.uid).get();
            const myFriends = me.data().friends || [];
            
            if (myFriends.includes(uid)) { 
                btnIcon = 'fa-comment';
                btnDisabled = false;
                btnStyle = 'background:var(--primary);color:white;';
                btnAction = () => openChat(uid);
            } else { 
                const sentRequests = await window.db.collection('friendRequests')
                    .where('from','==',cu.uid)
                    .where('to','==',uid)
                    .where('status','==','pending')
                    .get();
                
                if (!sentRequests.empty) { 
                    btnIcon = 'fa-clock';
                    btnDisabled = true;
                    btnStyle = 'background:transparent;color:white;border:2px solid var(--primary);border-radius:50%;width:36px;height:36px;padding:0;cursor:default;display:flex;align-items:center;justify-content:center;';
                    btnAction = null;
                } else {
                    const receivedRequests = await window.db.collection('friendRequests')
                        .where('from','==',uid)
                        .where('to','==',cu.uid)
                        .where('status','==','pending')
                        .get();
                    
                    if (!receivedRequests.empty) {
                        btnIcon = 'fa-check';
                        btnDisabled = false;
                        btnStyle = 'background:#4CAF50;color:white;border-radius:50%;width:36px;height:36px;padding:0;display:flex;align-items:center;justify-content:center;';
                        btnAction = () => {
                            const reqDoc = receivedRequests.docs[0];
                            window.acceptFriendRequest(reqDoc.id, uid);
                            hideSearchResults();
                        };
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
            } 
        } else {
            btnIcon = 'fa-lock';
            btnDisabled = true;
            btnStyle = 'background:#555;color:#888;cursor:not-allowed;border-radius:50%;width:36px;height:36px;padding:0;display:flex;align-items:center;justify-content:center;';
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
        if (idText) {
            const shareableId = u.shareableId || '';
            idText.innerHTML = `
                <button class="copy-id-btn-search" style="background:transparent;border:none;color:var(--primary);cursor:pointer;font-size:0.7rem;display:inline-flex;align-items:center;justify-content:center;padding:2px;flex-shrink:0;" title="نسخ ID">
                    <i class="fas fa-copy" style="font-size:0.7rem;"></i>
                </button>
                <span style="font-size:0.75rem;font-family:monospace;direction:ltr;">${shareableId}</span>
                <span style="color:var(--primary);font-weight:700;font-size:0.85rem;font-family:sans-serif;">ID</span>
            `;
            const copyBtn = idText.querySelector('.copy-id-btn-search');
            if (copyBtn) {
                copyBtn.onclick = (e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(shareableId).then(() => {
                        const icon = copyBtn.querySelector('i');
                        if (icon) {
                            icon.className = 'fas fa-check';
                            setTimeout(() => { icon.className = 'fas fa-copy'; }, 1500);
                        }
                    }).catch(() => {});
                };
            }
        }
        
        if (actionBtn) {
            actionBtn.innerHTML = `<i class="fas ${btnIcon}"></i>`;
            actionBtn.style.cssText = `padding:6px 14px;border:none;border-radius:20px;${btnStyle}font-size:0.85rem;cursor:${btnDisabled ? 'not-allowed' : 'pointer'};display:flex;align-items:center;justify-content:center;gap:6px;min-width:40px;`;
            if (btnDisabled) { actionBtn.disabled = true; }
            if (btnAction) { actionBtn.onclick = btnAction; }
        }
        
        rc.innerHTML = '';
        rc.appendChild(clone);
        
    } catch (e) { 
        console.error('خطأ في البحث:', e);
        rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">❌ حدث خطأ في البحث</div>`; 
    }
};

// ==================== القسم 10: إخفاء نتائج البحث ====================
window.hideSearchResults = function() { 
    const rc = document.getElementById('searchResultsContainer'); 
    const inp = document.getElementById('searchInput');
    if (rc) { 
        rc.style.display = 'none'; 
        rc.innerHTML = ''; 
    }
    if (inp) { inp.value = ''; }
};

// ==================== القسم 11: تصدير الدوال ====================
window.loadFriendRequestsForChat = loadFriendRequestsForChat;
window.setupFriendRequestsListener = setupFriendRequestsListener;
window.setupFriendsListener = setupFriendsListener;
