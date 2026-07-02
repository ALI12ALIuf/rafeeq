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
        await window.db.collection('users').doc(uid).update({ friends: firebase.firestore.FieldValue.arrayRemove(friendId) }); 
        await window.db.collection('users').doc(friendId).update({ friends: firebase.firestore.FieldValue.arrayRemove(uid) }); 
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

// ✅ تم إزالة القسم 5 و 6 و 9 و 11 (المتعلقة بصفحة طلبات الصداقة)

// ==================== القسم 7: قبول طلب صداقة (معدل) ====================
window.acceptFriendRequest = async function(requestId, senderId) {
    if (!window.auth?.currentUser) return;
    const uid = window.auth.currentUser.uid;
    try {
        // تحديث حالة الطلب في Firestore
        await window.db.collection('friendRequests').doc(requestId).update({ 
            status: 'accepted', 
            respondedAt: firebase.firestore.FieldValue.serverTimestamp() 
        });

        // إرسال رسالة قبول الصداقة إلى الدردشة
        const me = await window.db.collection('users').doc(uid).get();
        const myName = me.data().name || 'مستخدم';
        
        const acceptedMessage = {
            id: 'accepted-' + Date.now(),
            type: 'friend_request_status',
            text: `${myName} قبل طلب الصداقة. يمكنكما الآن التواصل.`,
            sender: uid,
            receiver: senderId,
            requestId: requestId,
            timestamp: new Date().toISOString()
        };

        // حفظ الرسالة محلياً ولدى الطرف الآخر
        await ChatSystem.saveMessage(senderId, acceptedMessage);
        
        // إرسال الرسالة عبر الخادم
        const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(senderId);
        const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
        if (myPrivateKey && receiverPublicKey) {
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(acceptedMessage), sharedKey);
            await SecureChatSystem.sendToServer(senderId, { 
                id: acceptedMessage.id, 
                type: 'friend_request_status', 
                data: encrypted, 
                timestamp: Date.now() 
            });
        }

        // ملاحظة: لا يتم الإضافة إلى قائمة الأصدقاء مباشرة كما هو مطلوب
        // سيتم الإضافة فقط إذا تم الضغط على زر "قبول" من الطرفين أو عبر منطق آخر
        // ولكن حسب الطلب: "إذا مستخدم وافق عليه ما ينضاف مباشره مع الاصدقاء"
        
        if (ChatSystem.currentChat === senderId) {
            ChatSystem.displayMessages(senderId);
        }
        
        alert('تم قبول طلب الصداقة بنجاح.');
    } catch (e) { 
        console.error('خطأ في قبول الطلب:', e);
        alert('حدث خطأ'); 
    }
};

// ==================== القسم 8: رفض طلب صداقة (معدل) ====================
window.rejectFriendRequest = async function(requestId, senderId) {
    if (!window.auth?.currentUser) return;
    const uid = window.auth.currentUser.uid;
    try { 
        await window.db.collection('friendRequests').doc(requestId).update({ 
            status: 'rejected', 
            respondedAt: firebase.firestore.FieldValue.serverTimestamp() 
        }); 

        // إرسال رسالة رفض الصداقة إلى الدردشة
        const me = await window.db.collection('users').doc(uid).get();
        const myName = me.data().name || 'مستخدم';
        
        const rejectedMessage = {
            id: 'rejected-' + Date.now(),
            type: 'friend_request_status',
            text: `${myName} رفض طلب الصداقة.`,
            sender: uid,
            receiver: senderId,
            requestId: requestId,
            timestamp: new Date().toISOString()
        };

        await ChatSystem.saveMessage(senderId, rejectedMessage);
        
        const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(senderId);
        const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
        if (myPrivateKey && receiverPublicKey) {
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(rejectedMessage), sharedKey);
            await SecureChatSystem.sendToServer(senderId, { 
                id: rejectedMessage.id, 
                type: 'friend_request_status', 
                data: encrypted, 
                timestamp: Date.now() 
            });
        }

        if (ChatSystem.currentChat === senderId) {
            ChatSystem.displayMessages(senderId);
        }
    } catch (e) {
        console.error('خطأ في رفض الطلب:', e);
    }
};

// ==================== القسم 10: إضافة صديق جديد (معدل ليرسل في الدردشة) ====================
window.addNewFriend = async function(targetUserId) {
    if (!window.auth?.currentUser) return;
    const uid = window.auth.currentUser.uid;
    if (uid === targetUserId) { 
        alert('لا يمكنك إضافة نفسك'); 
        return; 
    }
    try {
        // التحقق من وجود طلب معلق
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

        // إنشاء الطلب مع تاريخ انتهاء بعد 24 ساعة
        const expiresAt = new Date(Date.now() + 24 * 3600000);
        const requestDoc = await window.db.collection('friendRequests').add({ 
            from: uid, 
            to: targetUserId, 
            status: 'pending', 
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt)
        });

        // إرسال بطاقة الطلب في الدردشة
        const myName = me.data().name || 'مستخدم';
        const requestMessage = {
            id: 'req-' + requestDoc.id,
            type: 'friend_request_card',
            text: `طلب صداقة من ${myName}`,
            sender: uid,
            receiver: targetUserId,
            requestId: requestDoc.id,
            timestamp: new Date().toISOString(),
            status: 'pending'
        };

        // حفظ محلياً
        await ChatSystem.saveMessage(targetUserId, requestMessage);
        
        // إرسال عبر الخادم (مشفر)
        const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(targetUserId);
        const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
        if (myPrivateKey && receiverPublicKey) {
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(requestMessage), sharedKey);
            await SecureChatSystem.sendToServer(targetUserId, { 
                id: requestMessage.id, 
                type: 'friend_request_card', 
                data: encrypted, 
                timestamp: Date.now() 
            });
        }

        const rc = document.getElementById('searchResultsContainer'); 
        if (rc) { 
            rc.style.display = 'none'; 
            rc.innerHTML = ''; 
        }
        const si = document.getElementById('searchInput'); 
        if (si) si.value = '';
        
        // فتح الدردشة فوراً لرؤية الطلب
        openChat(targetUserId);
        alert('تم إرسال طلب الصداقة إلى الدردشة');
    } catch (e) { 
        console.error('خطأ في إرسال الطلب:', e);
        alert('حدث خطأ'); 
    }
};

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
            rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">لا يوجد مستخدم ID</div>`; 
            return; 
        }
        
        const u = s.docs[0].data();
        const uid = s.docs[0].id;
        const cu = window.auth?.currentUser;
        
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
                    rc.style.display = 'none';
                }
            }, 5000);
            
            return;
        }
        
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
        rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">حدث خطأ</div>`; 
    }
};

// دالة مساعدة للحصول على الإيموجي
function getEmojiForUser(userData) {
    if (userData.avatarEmoji) return userData.avatarEmoji;
    if (userData.gender === 'female') return '👩';
    return '👨';
}

// دالة مساعدة لتنسيق الأرقام
function formatNumber(num) {
    if (num >= 1000000) return (num/1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num/1000).toFixed(1) + 'K';
    return num;
}
