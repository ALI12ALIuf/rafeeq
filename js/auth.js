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
            const shareableId = generateShareableId();
            await window.db.collection('users').doc(user.uid).set({ uid: user.uid, name: (user.displayName || 'مستخدم').substring(0, 25), email: user.email || '', shareableId, bio: '', avatarType: 'male', friends: [], blocked: [], createdAt: new Date() });
        } else {
            const userData = userDoc.data(); const updates = {};
            if (!userData.friends) updates.friends = [];
            if (userData.followers) updates.followers = [];
            if (userData.following) updates.following = [];
            if (Object.keys(updates).length > 0) await window.db.collection('users').doc(user.uid).update(updates);
        }
        updateUserUI();
        if (typeof SecureChatSystem !== 'undefined') { await SecureChatSystem.init(); }
        return true;
    } catch (error) { console.error('Login error:', error); alert('حدث خطأ في تسجيل الدخول'); return false; }
}

function updateUserUI() {
    const splash = document.getElementById('splash'), app = document.getElementById('app');
    if (splash) { splash.classList.add('hide'); setTimeout(() => { splash.style.display = 'none'; if (app) app.style.display = 'flex'; }, 500); }
}

async function logout() { try { await window.auth.signOut(); window.location.reload(); } catch (e) {} }

async function loadUserData(uid) {
    try {
        const userDoc = await window.db.collection('users').doc(uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            document.getElementById('profileName').textContent = (userData.name || 'مستخدم').substring(0, 25);
            document.getElementById('profileBio').textContent = userData.bio || '';
            document.getElementById('shareableId').textContent = userData.shareableId || '0000000000';
            const avatarEmoji = getEmojiForUser(userData);
            document.getElementById('profileAvatarEmoji').textContent = avatarEmoji;
            document.getElementById('currentAvatarEmoji').textContent = avatarEmoji;
            document.getElementById('friendsCount').textContent = formatNumber((userData.friends || []).length);
            try { const rs = await window.db.collection('friendRequests').where('to', '==', uid).where('status', '==', 'pending').get(); document.getElementById('friendRequestsCount').textContent = formatNumber(rs.size); } catch (e) { document.getElementById('friendRequestsCount').textContent = '0'; }
        }
    } catch (e) {}
}

// ========== نظام الصداقة ==========
window.showFriendsList = function() { document.querySelector('.profile-page').style.display = 'none'; document.getElementById('friendsPage').style.display = 'block'; loadFriendsList(); };

async function loadFriendsList() {
    if (!window.auth?.currentUser) return;
    const friendsList = document.getElementById('friendsList'); if (!friendsList) return;
    try {
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); if (!userDoc.exists) return;
        const friends = userDoc.data().friends || [];
        if (!friends.length) { friendsList.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>${i18n?.t('no_friends')||'لا يوجد أصدقاء'}</h3><p>${i18n?.t('no_friends_desc')||'لم تضف أي أصدقاء بعد'}</p></div>`; return; }
        let html = '';
        for (const fid of friends) { try { const fd = await window.db.collection('users').doc(fid).get(); if (fd.exists) { const f = fd.data(); html += `<div class="user-item"><div class="user-avatar-emoji">${getEmojiForUser(f)}</div><div class="user-info"><h4>${f.name||'مستخدم'}</h4><p>${f.shareableId||''}</p></div><div class="user-actions"><button class="action-btn" onclick="openChat('${fid}')"><i class="fas fa-comment"></i></button><button class="action-btn" onclick="removeFriend('${fid}')" style="background:var(--danger);color:white;"><i class="fas fa-user-minus"></i></button></div></div>`; } } catch(e){} }
        friendsList.innerHTML = html;
    } catch(e) {}
}

window.removeFriend = async function(fid) {
    if (!window.auth?.currentUser || !confirm('هل أنت متأكد من حذف هذا الصديق؟')) return;
    try { const uid = window.auth.currentUser.uid; await window.db.collection('users').doc(uid).update({ friends: FieldValue.arrayRemove(fid) }); await window.db.collection('users').doc(fid).update({ friends: FieldValue.arrayRemove(uid) }); await updateFriendsCount(); await loadFriendsList(); alert('تم حذف الصديق بنجاح'); } catch(e) { alert('حدث خطأ'); }
};

async function updateFriendsCount() {
    if (!window.auth?.currentUser) return;
    try { const d = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); if (d.exists) document.getElementById('friendsCount').textContent = formatNumber((d.data().friends||[]).length); } catch(e) {}
}

window.showFriendRequests = function() { document.querySelector('.profile-page').style.display = 'none'; document.getElementById('friendRequestsPage').style.display = 'block'; loadFriendRequests(); };

async function loadFriendRequests() {
    if (!window.auth?.currentUser) return;
    const rl = document.getElementById('friendRequestsList'); if (!rl) return;
    try {
        const snap = await window.db.collection('friendRequests').where('to','==',window.auth.currentUser.uid).where('status','==','pending').get();
        if (snap.empty) { rl.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>${i18n?.t('no_friend_requests')||'لا توجد طلبات'}</h3><p>${i18n?.t('no_friend_requests_desc')||'لم يرسل لك أحد طلب صداقة بعد'}</p></div>`; return; }
        let reqs = []; snap.forEach(d => reqs.push({ id: d.id, ...d.data() }));
        reqs.sort((a,b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0));
        let html = '';
        for (const r of reqs) { try { const sd = await window.db.collection('users').doc(r.from).get(); if (sd.exists) { const s = sd.data(); html += `<div class="user-item" id="request-${r.id}"><div class="user-avatar-emoji">${getEmojiForUser(s)}</div><div class="user-info"><h4>${s.name||'مستخدم'}</h4><p>${s.shareableId||''}</p></div><div class="user-actions"><button class="action-btn" style="background:var(--success);color:white;" onclick="acceptFriendRequest('${r.id}','${r.from}')"><i class="fas fa-check"></i></button><button class="action-btn remove" onclick="rejectFriendRequest('${r.id}')"><i class="fas fa-times"></i></button></div></div>`; } } catch(e){} }
        rl.innerHTML = html || `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>${i18n?.t('no_friend_requests')||'لا توجد طلبات'}</h3></div>`;
    } catch(e) {}
}

window.acceptFriendRequest = async function(rid, sid) {
    if (!window.auth?.currentUser) return;
    try { const uid = window.auth.currentUser.uid; await window.db.collection('friendRequests').doc(rid).update({ status:'accepted', respondedAt:new Date() }); await window.db.collection('users').doc(uid).update({ friends:FieldValue.arrayUnion(sid) }); await window.db.collection('users').doc(sid).update({ friends:FieldValue.arrayUnion(uid) }); document.getElementById(`request-${rid}`)?.remove(); await updateFriendRequestsCount(); await updateFriendsCount(); if(!document.querySelectorAll('[id^="request-"]').length) document.getElementById('friendRequestsList').innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>${i18n?.t('no_friend_requests')||'لا توجد طلبات'}</h3></div>`; } catch(e) { alert('حدث خطأ'); }
};

window.rejectFriendRequest = async function(rid) {
    if (!window.auth?.currentUser) return;
    try { await window.db.collection('friendRequests').doc(rid).update({ status:'rejected', respondedAt:new Date() }); document.getElementById(`request-${rid}`)?.remove(); await updateFriendRequestsCount(); if(!document.querySelectorAll('[id^="request-"]').length) document.getElementById('friendRequestsList').innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>${i18n?.t('no_friend_requests')||'لا توجد طلبات'}</h3></div>`; } catch(e) { alert('حدث خطأ'); }
};

async function updateFriendRequestsCount() {
    if (!window.auth?.currentUser) return;
    try { const s = await window.db.collection('friendRequests').where('to','==',window.auth.currentUser.uid).where('status','==','pending').get(); document.getElementById('friendRequestsCount').textContent = formatNumber(s.size); } catch(e) {}
}

window.addNewFriend = async function(targetUserId) {
    if (!window.auth?.currentUser) return;
    const uid = window.auth.currentUser.uid;
    if (uid === targetUserId) { alert('لا يمكنك إضافة نفسك'); return; }
    try {
        const er = await window.db.collection('friendRequests').where('from','==',uid).where('to','==',targetUserId).where('status','==','pending').get();
        if (!er.empty) { alert('لقد أرسلت طلباً مسبقاً'); return; }
        const cd = await window.db.collection('users').doc(uid).get();
        if (cd.exists && (cd.data().friends||[]).includes(targetUserId)) { alert('صديقك بالفعل'); return; }
        await window.db.collection('friendRequests').add({ from:uid, to:targetUserId, status:'pending', timestamp:new Date() });
        document.getElementById('searchResultsContainer').style.display = 'none';
        document.getElementById('searchInput').value = '';
        alert('تم إرسال طلب الصداقة بنجاح');
    } catch(e) { alert('حدث خطأ'); }
};

function setupFriendRequestsListener(uid) {
    try { window.db.collection('friendRequests').where('to','==',uid).where('status','==','pending').onSnapshot(s => { document.getElementById('friendRequestsCount').textContent = formatNumber(s.size); if(document.getElementById('friendRequestsPage')?.style.display==='block') loadFriendRequests(); }); } catch(e) {}
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
    const d = document.createElement('div'); d.className = 'login-screen';
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:10000;';
    d.innerHTML = `<div style="text-align:center;padding:20px;max-width:350px;"><div style="font-size:5rem;margin-bottom:1rem;">🛡️</div><h1 style="font-size:2rem;color:var(--primary);">${i18n?.t('app_name')||'رفيق'}</h1><p style="margin-bottom:2rem;color:var(--text-light);">${i18n?.t('login_desc')||'سجل دخولك للوصول إلى جميع الميزات'}</p><button onclick="signInWithGoogle()" style="background:var(--primary);color:white;border:none;border-radius:30px;padding:15px 30px;font-size:1.1rem;cursor:pointer;width:100%;"><i class="fab fa-google"></i> ${i18n?.t('login_with_google')||'المتابعة بحساب جوجل'}</button></div>`;
    document.body.appendChild(d);
}

function copyId() { navigator.clipboard.writeText(document.getElementById('shareableId').textContent).then(()=>alert('تم النسخ')); }

// ========== دوال البحث ==========
window.findUserById = async function() {
    const inp = document.getElementById('searchInput'), rc = document.getElementById('searchResultsContainer');
    if (!inp || !rc) return;
    const txt = inp.value.trim();
    if (!txt) { rc.style.display = 'none'; return; }
    rc.style.display = 'block'; rc.innerHTML = '<div style="text-align:center;padding:10px;">جاري البحث...</div>';
    try {
        const snap = await window.db.collection('users').where('shareableId','==',txt).get();
        if (snap.empty) { rc.innerHTML = '<div style="text-align:center;padding:15px;">لا يوجد مستخدم</div>'; return; }
        const u = snap.docs[0].data(), uid = snap.docs[0].id, cu = window.auth?.currentUser;
        if (cu && uid === cu.uid) { rc.innerHTML = '<div style="text-align:center;padding:15px;">هذا حسابك الشخصي</div>'; return; }
        let bt = 'إضافة', bd = '';
        if (cu) { const cd = await window.db.collection('users').doc(cu.uid).get(); const cud = cd.data(); if (cud.friends?.includes(uid)) { bt = 'أصدقاء'; bd = 'disabled style="opacity:0.5;"'; } else { const er = await window.db.collection('friendRequests').where('from','==',cu.uid).where('to','==',uid).where('status','==','pending').get(); if (!er.empty) { bt = 'طلب معلق'; bd = 'disabled style="opacity:0.5;"'; } } }
        rc.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:8px;"><div style="width:40px;height:40px;border-radius:50%;background:var(--light);display:flex;align-items:center;justify-content:center;font-size:1.8rem;">${getEmojiForUser(u)}</div><div style="flex:1;"><h4>${u.name}</h4><p style="color:var(--text-light);font-size:0.85rem;">${u.shareableId}</p></div>${cu?`<button class="btn btn-primary" onclick="addNewFriend('${uid}')" ${bd}>${bt}</button>`:''}</div>`;
    } catch(e) { rc.innerHTML = '<div style="text-align:center;padding:15px;">حدث خطأ</div>'; }
};

window.hideSearchResults = function() { const rc = document.getElementById('searchResultsContainer'); if (rc) { rc.style.display = 'none'; rc.innerHTML = ''; } };
