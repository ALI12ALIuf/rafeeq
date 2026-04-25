function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
}

function generateShareableId() {
    let id = '';
    for (let i = 0; i < 10; i++) { id += Math.floor(Math.random() * 10).toString(); }
    return id;
}

function getEmojiForUser(userData) {
    const emojiMap = { 'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧', 'father': '👨‍🦳', 'mother': '👩‍🦳', 'grandfather': '👴', 'grandmother': '👵' };
    return emojiMap[userData.avatarType] || '👤';
}

const FieldValue = firebase.firestore.FieldValue;

async function signInWithGoogle() {
    try {
        if (!window.auth || !window.googleProvider) { alert('مكتبة Firebase لم يتم تحميلها بعد.'); return false; }
        const result = await window.auth.signInWithPopup(window.googleProvider);
        const user = result.user;
        const userDoc = await window.db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            await window.db.collection('users').doc(user.uid).set({ uid: user.uid, name: (user.displayName || 'مستخدم').substring(0, 25), email: user.email || '', shareableId: generateShareableId(), bio: '', avatarType: 'male', friends: [], blocked: [], createdAt: new Date() });
        } else {
            const userData = userDoc.data();
            
            // ✅ إذا كان هناك طلب مسح سابق، إلغاءه تلقائياً
            if (userData.deleteRequestedAt) {
                await window.db.collection('users').doc(user.uid).update({ deleteRequestedAt: FieldValue.delete(), deleteAfter: FieldValue.delete() });
                console.log('✅ تم إلغاء مسح الحساب - تم تسجيل الدخول');
            }
            
            const updates = {};
            if (!userData.friends) updates.friends = [];
            if (userData.followers) updates.followers = [];
            if (userData.following) updates.following = [];
            if (Object.keys(updates).length > 0) await window.db.collection('users').doc(user.uid).update(updates);
        }
        updateUserUI();
        if (typeof SecureChatSystem !== 'undefined') { await SecureChatSystem.init(); }
        return true;
    } catch (error) {
        let msg = 'حدث خطأ في تسجيل الدخول';
        if (error.code === 'auth/popup-closed-by-user') msg = 'تم إغلاق نافذة تسجيل الدخول';
        else if (error.code === 'auth/network-request-failed') msg = 'خطأ في الشبكة';
        alert(msg); return false;
    }
}

function updateUserUI() {
    const splash = document.getElementById('splash'), app = document.getElementById('app');
    if (splash) { splash.classList.add('hide'); setTimeout(() => { splash.style.display = 'none'; if (app) app.style.display = 'flex'; }, 500); }
}

async function logout() { try { await window.auth.signOut(); window.location.reload(); } catch (e) {} }

async function loadUserData(uid) {
    try {
        const doc = await window.db.collection('users').doc(uid).get();
        if (doc.exists) {
            const d = doc.data();
            
            // ✅ إظهار تنبيه إذا كان هناك طلب مسح نشط
            if (d.deleteRequestedAt) {
                const remaining = calculateRemainingTime(d.deleteAfter);
                if (remaining) {
                    document.getElementById('profileBio').textContent = `⏰ ${remaining}`;
                }
            }
            
            const pn = document.getElementById('profileName'), pa = document.getElementById('profileAvatarEmoji'), pb = document.getElementById('profileBio'), si = document.getElementById('shareableId'), ca = document.getElementById('currentAvatarEmoji');
            if (pn) pn.textContent = (d.name || 'مستخدم').substring(0, 25);
            if (pb && !d.deleteRequestedAt) pb.textContent = d.bio || '';
            if (si) si.textContent = d.shareableId || '0000000000';
            const emoji = getEmojiForUser(d);
            if (pa) pa.textContent = emoji; if (ca) ca.textContent = emoji;
            const fc = document.getElementById('friendsCount'), frc = document.getElementById('friendRequestsCount');
            if (fc) fc.textContent = formatNumber((d.friends || []).length);
            if (frc) { try { const s = await window.db.collection('friendRequests').where('to', '==', uid).where('status', '==', 'pending').get(); frc.textContent = formatNumber(s.size); } catch (e) { frc.textContent = '0'; } }
        }
    } catch (e) {}
}

// ========== نظام مسح الحساب ==========
async function requestAccountDeletion() {
    if (!window.auth?.currentUser) return;
    const uid = window.auth.currentUser.uid;
    const deleteAfter = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 ساعة
    
    try {
        await window.db.collection('users').doc(uid).update({
            deleteRequestedAt: firebase.firestore.FieldValue.serverTimestamp(),
            deleteAfter: firebase.firestore.Timestamp.fromDate(deleteAfter)
        });
        
        // جدولة الحذف
        scheduleAccountDeletion(uid, deleteAfter);
        
        alert('⏰ سيتم مسح حسابك بعد 24 ساعة.\nإذا سجلت دخول قبل انتهاء المدة، سيتم إلغاء المسح تلقائياً.');
        
        // تسجيل خروج
        await logout();
        
    } catch (error) {
        console.error('خطأ في طلب مسح الحساب:', error);
        alert('حدث خطأ. حاول مرة أخرى.');
    }
}

function calculateRemainingTime(deleteAfter) {
    if (!deleteAfter) return null;
    const now = new Date();
    const deleteDate = deleteAfter.toDate ? deleteAfter.toDate() : new Date(deleteAfter.seconds * 1000);
    const diff = deleteDate - now;
    
    if (diff <= 0) return 'جاري المسح...';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `⏰ سيتم مسح الحساب بعد ${hours} ساعة و ${minutes} دقيقة`;
}

function scheduleAccountDeletion(uid, deleteAfter) {
    const now = new Date();
    const deleteDate = new Date(deleteAfter);
    const delay = deleteDate - now;
    
    if (delay <= 0) {
        performAccountDeletion(uid);
        return;
    }
    
    // تخزين في localStorage للتحقق عند تحميل الصفحة
    localStorage.setItem(`delete_scheduled_${uid}`, deleteAfter.toISOString());
    
    // جدولة الحذف
    setTimeout(async () => {
        await performAccountDeletion(uid);
        localStorage.removeItem(`delete_scheduled_${uid}`);
    }, delay);
    
    console.log(`⏰ جدولة مسح الحساب ${uid} بعد ${Math.floor(delay/3600000)} ساعة`);
}

async function performAccountDeletion(uid) {
    try {
        // التحقق من أن المستخدم لم يسجل دخول (إلغاء المسح)
        const userDoc = await window.db.collection('users').doc(uid).get();
        if (!userDoc.exists || !userDoc.data().deleteRequestedAt) {
            console.log('✅ تم إلغاء مسح الحساب - المستخدم سجل دخول');
            return;
        }
        
        console.log('🗑️ جاري مسح الحساب:', uid);
        
        // 1. مسح بيانات المستخدم
        await window.db.collection('users').doc(uid).delete();
        
        // 2. مسح طلبات الصداقة
        const sentRequests = await window.db.collection('friendRequests').where('from', '==', uid).get();
        const receivedRequests = await window.db.collection('friendRequests').where('to', '==', uid).get();
        for (const doc of sentRequests.docs) { await doc.ref.delete(); }
        for (const doc of receivedRequests.docs) { await doc.ref.delete(); }
        
        // 3. مسح الرسائل المشفرة
        const sentMessages = await window.db.collection('secure_messages').where('from', '==', uid).get();
        const receivedMessages = await window.db.collection('secure_messages').where('to', '==', uid).get();
        for (const doc of sentMessages.docs) { await doc.ref.delete(); }
        for (const doc of receivedMessages.docs) { await doc.ref.delete(); }
        
        // 4. مسح الرسائل المؤقتة
        const tempSent = await window.db.collection('temp_messages').where('from', '==', uid).get();
        const tempReceived = await window.db.collection('temp_messages').where('to', '==', uid).get();
        for (const doc of tempSent.docs) { await doc.ref.delete(); }
        for (const doc of tempReceived.docs) { await doc.ref.delete(); }
        
        // 5. مسح الرحلات
        const trips = await window.db.collection('trips').where('userId', '==', uid).get();
        for (const doc of trips.docs) { await doc.ref.delete(); }
        
        // 6. مسح حساب Firebase Auth
        try {
            const user = window.auth.currentUser;
            if (user && user.uid === uid) {
                await user.delete();
            }
        } catch (authError) {
            console.error('خطأ في مسح حساب المصادقة:', authError);
        }
        
        // 7. مسح localStorage
        localStorage.removeItem(`delete_scheduled_${uid}`);
        localStorage.removeItem('enc_private_key');
        
        console.log('✅ تم مسح الحساب بنجاح:', uid);
        
    } catch (error) {
        console.error('❌ فشل مسح الحساب:', error);
    }
}

// ✅ التحقق من المسح المجدول عند تحميل الصفحة
function checkScheduledDeletions() {
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('delete_scheduled_')) {
            const uid = key.replace('delete_scheduled_', '');
            const deleteAfter = new Date(localStorage.getItem(key));
            const now = new Date();
            
            if (deleteAfter <= now) {
                // حان وقت المسح
                performAccountDeletion(uid);
                localStorage.removeItem(key);
            } else {
                // إعادة جدولة
                const delay = deleteAfter - now;
                setTimeout(() => {
                    performAccountDeletion(uid);
                    localStorage.removeItem(key);
                }, delay);
            }
        }
    }
}

// ✅ تصدير الدوال العامة
window.requestAccountDeletion = requestAccountDeletion;
window.cancelAccountDeletion = async function() {
    if (!window.auth?.currentUser) return;
    const uid = window.auth.currentUser.uid;
    await window.db.collection('users').doc(uid).update({
        deleteRequestedAt: FieldValue.delete(),
        deleteAfter: FieldValue.delete()
    });
    localStorage.removeItem(`delete_scheduled_${uid}`);
    alert('✅ تم إلغاء مسح الحساب');
};

// ✅ تشغيل التحقق عند تحميل الصفحة
checkScheduledDeletions();

// ========== نظام الصداقة ==========
window.showFriendsList = function() { document.querySelector('.profile-page').style.display = 'none'; document.getElementById('friendsPage').style.display = 'block'; loadFriendsList(); };

async function loadFriendsList() {
    if (!window.auth?.currentUser) return;
    const list = document.getElementById('friendsList'); if (!list) return;
    try {
        const doc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (!doc.exists) return;
        const friends = doc.data().friends || [];
        if (!friends.length) { list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا يوجد أصدقاء</h3><p>لم تضف أي أصدقاء بعد</p></div>`; return; }
        let html = '';
        for (const fid of friends) {
            try {
                const f = await window.db.collection('users').doc(fid).get();
                if (f.exists) { const d = f.data(); html += `<div class="user-item"><div class="user-avatar-emoji">${getEmojiForUser(d)}</div><div class="user-info"><h4>${d.name||'مستخدم'}</h4><p>${d.shareableId||''}</p></div><div class="user-actions"><button class="action-btn" onclick="openChat('${fid}')"><i class="fas fa-comment"></i></button><button class="action-btn" onclick="removeFriend('${fid}')" style="background:var(--danger);color:white;"><i class="fas fa-user-minus"></i></button></div></div>`; }
            } catch (e) {}
        }
        list.innerHTML = html;
    } catch (e) { list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>خطأ</h3></div>`; }
}

window.removeFriend = async function(friendId) {
    if (!window.auth?.currentUser || !confirm('هل أنت متأكد من حذف هذا الصديق؟')) return;
    try { const uid = window.auth.currentUser.uid; await window.db.collection('users').doc(uid).update({ friends: FieldValue.arrayRemove(friendId) }); await window.db.collection('users').doc(friendId).update({ friends: FieldValue.arrayRemove(uid) }); await updateFriendsCount(); await loadFriendsList(); alert('تم حذف الصديق بنجاح'); } catch (e) { alert('حدث خطأ'); }
};

async function updateFriendsCount() {
    if (!window.auth?.currentUser) return;
    try { const d = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); if (d.exists) { const c = document.getElementById('friendsCount'); if (c) c.textContent = formatNumber((d.data().friends||[]).length); } } catch (e) {}
}

window.showFriendRequests = function() { document.querySelector('.profile-page').style.display = 'none'; document.getElementById('friendRequestsPage').style.display = 'block'; loadFriendRequests(); };

async function loadFriendRequests() {
    if (!window.auth?.currentUser) return;
    const list = document.getElementById('friendRequestsList'); if (!list) return;
    try {
        const s = await window.db.collection('friendRequests').where('to', '==', window.auth.currentUser.uid).where('status', '==', 'pending').get();
        if (s.empty) { list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3><p>لم يرسل لك أحد طلب صداقة بعد</p></div>`; return; }
        let html = '', reqs = [];
        s.forEach(d => reqs.push({ id: d.id, ...d.data() }));
        reqs.sort((a, b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0));
        for (const r of reqs) {
            try {
                const sender = await window.db.collection('users').doc(r.from).get();
                if (sender.exists) { const sd = sender.data(); html += `<div class="user-item" id="request-${r.id}"><div class="user-avatar-emoji">${getEmojiForUser(sd)}</div><div class="user-info"><h4>${sd.name||'مستخدم'}</h4><p>${sd.shareableId||''}</p></div><div class="user-actions"><button class="action-btn" style="background:var(--success);color:white;" onclick="acceptFriendRequest('${r.id}','${r.from}')"><i class="fas fa-check"></i></button><button class="action-btn remove" onclick="rejectFriendRequest('${r.id}')"><i class="fas fa-times"></i></button></div></div>`; }
            } catch (e) {}
        }
        list.innerHTML = html || `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3></div>`;
    } catch (e) { list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>خطأ</h3></div>`; }
}

window.acceptFriendRequest = async function(requestId, senderId) {
    if (!window.auth?.currentUser) return;
    try {
        const uid = window.auth.currentUser.uid;
        await window.db.collection('friendRequests').doc(requestId).update({ status: 'accepted', respondedAt: new Date() });
        await window.db.collection('users').doc(uid).update({ friends: FieldValue.arrayUnion(senderId) });
        await window.db.collection('users').doc(senderId).update({ friends: FieldValue.arrayUnion(uid) });
        document.getElementById(`request-${requestId}`)?.remove();
        await updateFriendRequestsCount(); await updateFriendsCount();
        if (!document.querySelectorAll('[id^="request-"]').length) document.getElementById('friendRequestsList').innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3></div>`;
    } catch (e) { alert('حدث خطأ'); }
};

window.rejectFriendRequest = async function(requestId) {
    if (!window.auth?.currentUser) return;
    try { await window.db.collection('friendRequests').doc(requestId).update({ status: 'rejected', respondedAt: new Date() }); document.getElementById(`request-${requestId}`)?.remove(); await updateFriendRequestsCount(); if (!document.querySelectorAll('[id^="request-"]').length) document.getElementById('friendRequestsList').innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد طلبات</h3></div>`; } catch (e) {}
};

async function updateFriendRequestsCount() {
    if (!window.auth?.currentUser) return;
    try { const s = await window.db.collection('friendRequests').where('to', '==', window.auth.currentUser.uid).where('status', '==', 'pending').get(); const c = document.getElementById('friendRequestsCount'); if (c) c.textContent = formatNumber(s.size); } catch (e) {}
}

window.addNewFriend = async function(targetUserId) {
    if (!window.auth?.currentUser) return;
    const uid = window.auth.currentUser.uid;
    if (uid === targetUserId) { alert('لا يمكنك إضافة نفسك'); return; }
    try {
        const exist = await window.db.collection('friendRequests').where('from', '==', uid).where('to', '==', targetUserId).where('status', '==', 'pending').get();
        if (!exist.empty) { alert('أرسلت طلباً مسبقاً'); return; }
        const me = await window.db.collection('users').doc(uid).get();
        if (me.exists && (me.data().friends||[]).includes(targetUserId)) { alert('صديقك بالفعل'); return; }
        await window.db.collection('friendRequests').add({ from: uid, to: targetUserId, status: 'pending', timestamp: new Date() });
        const rc = document.getElementById('searchResultsContainer'); if (rc) { rc.style.display = 'none'; rc.innerHTML = ''; }
        const si = document.getElementById('searchInput'); if (si) si.value = '';
        alert('تم إرسال طلب الصداقة');
    } catch (e) { alert('حدث خطأ'); }
};

function setupFriendRequestsListener(userId) {
    try { window.db.collection('friendRequests').where('to', '==', userId).where('status', '==', 'pending').onSnapshot(s => { const c = document.getElementById('friendRequestsCount'); if (c) c.textContent = formatNumber(s.size); if (document.getElementById('friendRequestsPage')?.style.display === 'block') loadFriendRequests(); }); } catch (e) {}
}

// ========== نظام تسجيل الدخول ==========
if (typeof window.auth !== 'undefined') {
    window.auth.onAuthStateChanged(async (user) => {
        const splash = document.getElementById('splash'), app = document.getElementById('app');
        if (user) {
            await loadUserData(user.uid); setupFriendRequestsListener(user.uid);
            if (typeof SecureChatSystem !== 'undefined') await SecureChatSystem.init();
            if (splash) { splash.classList.add('hide'); setTimeout(() => { splash.style.display = 'none'; if (app) app.style.display = 'flex'; }, 500); }
        } else {
            if (app) app.style.display = 'none';
            if (splash) { splash.classList.remove('hide'); splash.style.display = 'flex'; }
            setTimeout(() => { if (splash) { splash.classList.add('hide'); setTimeout(() => { splash.style.display = 'none'; showLoginScreen(); }, 500); } else showLoginScreen(); }, 2000);
        }
    });
}

function showLoginScreen() {
    const el = document.querySelector('.login-screen'); if (el) el.remove();
    const d = document.createElement('div'); d.className = 'login-screen'; d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:10000;';
    d.innerHTML = `<div style="text-align:center;padding:20px;max-width:350px;"><div style="font-size:5rem;">🛡️</div><h1 style="font-size:2rem;color:var(--primary);">رفيق</h1><p style="color:var(--text-light);margin-bottom:2rem;">سجل دخولك للوصول إلى جميع الميزات</p><button onclick="signInWithGoogle()" style="background:var(--primary);color:white;border:none;border-radius:30px;padding:15px 30px;font-size:1.1rem;cursor:pointer;width:100%;"><i class="fab fa-google"></i> المتابعة بحساب جوجل</button></div>`;
    document.body.appendChild(d);
}

function copyId() { const el = document.getElementById('shareableId'); if (el) navigator.clipboard.writeText(el.textContent).then(() => alert('تم النسخ')); }

window.findUserById = async function() {
    const inp = document.getElementById('searchInput'), rc = document.getElementById('searchResultsContainer');
    if (!inp || !rc) return;
    const q = inp.value.trim();
    if (!q) { rc.style.display = 'none'; return; }
    rc.style.display = 'block'; rc.innerHTML = `<div style="text-align:center;padding:10px;">جاري البحث...</div>`;
    try {
        const s = await window.db.collection('users').where('shareableId', '==', q).get();
        if (s.empty) { rc.innerHTML = `<div style="text-align:center;padding:15px;">لا يوجد مستخدم</div>`; return; }
        const u = s.docs[0].data(), uid = s.docs[0].id, cu = window.auth?.currentUser;
        if (cu && uid === cu.uid) { rc.innerHTML = `<div style="text-align:center;padding:15px;">هذا حسابك الشخصي</div>`; return; }
        let btn = 'إضافة', dis = '';
        if (cu) { const me = await window.db.collection('users').doc(cu.uid).get(); if ((me.data().friends||[]).includes(uid)) { btn = 'أصدقاء'; dis = 'disabled style="opacity:0.5;"'; } else { const er = await window.db.collection('friendRequests').where('from','==',cu.uid).where('to','==',uid).where('status','==','pending').get(); if (!er.empty) { btn = 'طلب معلق'; dis = 'disabled style="opacity:0.5;"'; } } }
        rc.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:8px;"><div style="width:40px;height:40px;border-radius:50%;background:var(--light);display:flex;align-items:center;justify-content:center;font-size:1.8rem;">${getEmojiForUser(u)}</div><div style="flex:1;"><h4>${u.name}</h4><p style="color:var(--text-light);">${u.shareableId}</p></div>${cu?`<button onclick="addNewFriend('${uid}')" ${dis}>${btn}</button>`:''}</div>`;
    } catch (e) { rc.innerHTML = `<div style="text-align:center;padding:15px;">حدث خطأ</div>`; }
};

window.hideSearchResults = function() { const rc = document.getElementById('searchResultsContainer'); if (rc) { rc.style.display = 'none'; rc.innerHTML = ''; } };
