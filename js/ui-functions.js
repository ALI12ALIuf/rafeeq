// ========== ui-functions.js - النسخة النهائية ==========

window._pageStack = [];

function pushPage(pageType, pageId) {
    window._pageStack.push({ type: pageType, id: pageId });
}

function popPage() {
    if (window._pageStack.length > 0) {
        return window._pageStack.pop();
    }
    return null;
}

function clearStack() {
    window._pageStack = [];
}

let chatsLoaded = false;
let isLoadingChats = false;

async function loadChats(force = false) { 
    if (!window.auth || !window.auth.currentUser) return; 
    const list = document.getElementById('chatsList'); 
    if (!list) return; 
    
    if (isLoadingChats) return;
    if (chatsLoaded && !force) return;
    
    isLoadingChats = true;
    
    const chatTemplate = ChatSystem.chatItemTemplate || document.getElementById('chatItemTemplate');
    const requestTemplate = document.getElementById('friendRequestChatTemplate');
    
    if (!chatTemplate) {
        isLoadingChats = false;
        return;
    }
    
    try { 
        const udoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); 
        if (!udoc.exists) {
            isLoadingChats = false;
            return; 
        }
        const friends = udoc.data().friends || []; 
        
        list.innerHTML = '';
        
        // عرض طلبات الصداقة
        if (requestTemplate) {
            const pendingRequests = await window.loadFriendRequestsForChat ? await window.loadFriendRequestsForChat() : [];
            const addedRequestIds = new Set();
            
            for (const req of pendingRequests) {
                if (addedRequestIds.has(req.id)) continue;
                addedRequestIds.add(req.id);
                
                try {
                    const senderDoc = await window.db.collection('users').doc(req.from).get();
                    if (!senderDoc.exists) continue;
                    
                    const sender = senderDoc.data();
                    const clone = requestTemplate.content.cloneNode(true);
                    const requestItem = clone.querySelector('.friend-request-item');
                    
                    const avatar = requestItem.querySelector('.chat-avatar-emoji');
                    const nameSpan = requestItem.querySelector('.friend-request-name');
                    const idSpan = requestItem.querySelector('.friend-request-id');
                    const copyBtn = requestItem.querySelector('.copy-id-btn');
                    const acceptBtn = requestItem.querySelector('.accept-friend-btn');
                    const rejectBtn = requestItem.querySelector('.reject-friend-btn');
                    
                    if (avatar) avatar.textContent = window.getEmojiForUser ? window.getEmojiForUser(sender) : '🧔🏻‍♂️';
                    if (nameSpan) nameSpan.textContent = sender.name || 'مستخدم';
                    if (idSpan) idSpan.textContent = sender.shareableId || '0000000000';
                    
                    if (copyBtn) {
                        copyBtn.onclick = (e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(sender.shareableId || '0000000000').then(() => {
                                const icon = copyBtn.querySelector('i');
                                if (icon) {
                                    icon.className = 'fas fa-check';
                                    setTimeout(() => { icon.className = 'fas fa-copy'; }, 1500);
                                }
                            }).catch(() => {});
                        };
                    }
                    
                    if (acceptBtn) acceptBtn.onclick = (e) => { e.stopPropagation(); window.acceptFriendRequest(req.id, req.from); };
                    if (rejectBtn) rejectBtn.onclick = (e) => { e.stopPropagation(); window.rejectFriendRequest(req.id); };
                    
                    list.appendChild(clone);
                } catch (e) {}
            }
        }
        
        if (!friends.length) { 
            if (list.children.length === 0) {
                list.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>لا توجد محادثات</h3><p>أضف أصدقاء لبدء المحادثة</p></div>`; 
            }
            chatsLoaded = true;
            isLoadingChats = false;
            return; 
        } 
        
        const addedFriendIds = new Set();
        
        for (const fid of friends) { 
            if (addedFriendIds.has(fid)) continue;
            addedFriendIds.add(fid);
            
            try { 
                const fdoc = await window.db.collection('users').doc(fid).get(); 
                if (fdoc.exists) { 
                    const f = fdoc.data(); 
                    const key = `chat_${fid}`; 
                    let lm = 'اضغط لبدء المحادثة', lt = ''; 
                    
                    try { 
                        const h = JSON.parse(localStorage.getItem(key)) || []; 
                        if (h.length > 0) { 
                            const l = h[h.length - 1]; 
                            if (l.type === 'text') lm = l.text.length > 30 ? l.text.substring(0, 30) + '...' : l.text; 
                            lt = new Date(l.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); 
                        } 
                    } catch (e) {} 
                    
                    const clone = chatTemplate.content.cloneNode(true);
                    const chatItem = clone.querySelector('.chat-item');
                    
                    const avatar = chatItem.querySelector('.chat-avatar-emoji');
                    const name = chatItem.querySelector('.chat-info h4');
                    const lastMsg = chatItem.querySelector('.last-message');
                    const time = chatItem.querySelector('.chat-time');
                    
                    if (avatar) avatar.textContent = window.getEmojiForUser ? window.getEmojiForUser(f) : '🧔🏻‍♂️';
                    if (name) name.textContent = f.name || 'مستخدم';
                    if (lastMsg) lastMsg.textContent = lm;
                    if (time) time.textContent = lt || '';
                    
                    chatItem.onclick = () => openChat(fid);
                    
                    list.appendChild(clone);
                } 
            } catch (e) {} 
        } 
        
        chatsLoaded = true;
        isLoadingChats = false;
        
        if (list.children.length === 0) {
            list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد محادثات نشطة</h3><p>ابدأ بإضافة أصدقاء جدد</p></div>`;
        }
        
    } catch (e) {
        list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>حدث خطأ</h3><p>حاول تحديث الصفحة</p></div>`;
        chatsLoaded = true;
        isLoadingChats = false;
    } 
}

function setupChatListeners() { 
    document.addEventListener('click', e => { 
        const m = document.getElementById('attachmentMenu'); 
        const ab = document.querySelector('.attach-btn'); 
        if (m && ab && !m.contains(e.target) && !ab.contains(e.target)) {
            m.style.display = 'none'; 
        }
    }); 
}

window.selectAvatar = function(type) {
    const emojiMap = {
        'man_light': '🧔🏻‍♂️',
        'man_medium': '🧔🏼‍♂️',
        'man_dark': '🧔🏽‍♂️',
        'woman_light': '👩🏻',
        'woman_medium': '👩🏼',
        'woman_dark': '👩🏽'
    };
    const emoji = emojiMap[type] || '🧔🏻‍♂️';
    const profileAvatar = document.getElementById('profileAvatarEmoji');
    const currentAvatar = document.getElementById('currentAvatarEmoji');
    if (profileAvatar) profileAvatar.textContent = emoji;
    if (currentAvatar) currentAvatar.textContent = emoji;
    
    document.querySelectorAll('.avatar-option-btn').forEach(btn => {
        btn.style.borderColor = 'transparent';
        btn.style.background = 'var(--light)';
        btn.style.boxShadow = 'none';
    });
    
    const selectedBtn = document.querySelector(`.avatar-option-btn[data-type="${type}"]`);
    if (selectedBtn) {
        selectedBtn.style.borderColor = '#2196F3';
        selectedBtn.style.background = 'rgba(33, 150, 243, 0.15)';
        selectedBtn.style.boxShadow = '0 0 20px rgba(33, 150, 243, 0.3)';
    }
    
    if (auth?.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({ avatarType: type })
            .then(() => { setTimeout(() => closeModal(), 500); })
            .catch(() => {});
    }
};

window.openAvatarModal = function() {
    const modal = document.getElementById('avatarModal');
    if (modal) modal.classList.add('active');
    
    const currentAvatar = document.getElementById('profileAvatarEmoji')?.textContent;
    document.querySelectorAll('.avatar-option-btn').forEach(btn => {
        const emojiSpan = btn.querySelector('span');
        if (emojiSpan && emojiSpan.textContent === currentAvatar) {
            btn.style.borderColor = '#2196F3';
            btn.style.background = 'rgba(33, 150, 243, 0.15)';
            btn.style.boxShadow = '0 0 20px rgba(33, 150, 243, 0.3)';
        } else {
            btn.style.borderColor = 'transparent';
            btn.style.background = 'var(--light)';
            btn.style.boxShadow = 'none';
        }
    });
};

window.getEmojiForUser = function(userData) {
    const emojiMap = {
        'man_light': '🧔🏻‍♂️',
        'man_medium': '🧔🏼‍♂️',
        'man_dark': '🧔🏽‍♂️',
        'woman_light': '👩🏻',
        'woman_medium': '👩🏼',
        'woman_dark': '👩🏽'
    };
    if (!userData?.avatarType || ['male','female','boy','girl','father','mother','grandfather','grandmother'].includes(userData.avatarType)) {
        return '🧔🏻‍♂️';
    }
    return emojiMap[userData.avatarType] || '🧔🏻‍♂️';
};

function formatNumber(num) { 
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'; 
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'; 
    return num.toString(); 
}

async function updateTripsCount() { 
    if (!window.auth || !window.auth.currentUser) return; 
    try { 
        const s = await window.db.collection('trips').where('userId', '==', window.auth.currentUser.uid).where('status', '==', 'ended').get(); 
        const c = document.getElementById('tripsCount'); 
        if (c) c.textContent = formatNumber(s.size); 
    } catch (error) {} 
}

function ensureSinglePage() { 
    document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); 
    document.querySelectorAll('.page').forEach(p => { 
        p.style.display = p.classList.contains('active') ? 'block' : 'none'; 
    }); 
}

function setupNavigation() { 
    const nav = document.querySelectorAll('.nav-item'); 
    const pages = document.querySelectorAll('.page'); 
    if (!nav.length || !pages.length) return; 
    
    function switchPage(id) { 
        clearStack(); 
        pages.forEach(p => p.classList.remove('active')); 
        const t = document.querySelector(`.page.${id}-page`); 
        if (t) { 
            t.classList.add('active'); 
            t.style.display = 'block'; 
        } 
        pages.forEach(p => { 
            if (!p.classList.contains('active')) p.style.display = 'none'; 
        }); 
        document.querySelectorAll('.profile-subpage').forEach(s => s.style.display = 'none'); 
        document.body.classList.remove('profile-subpage-open'); 
        document.body.classList.remove('conversation-open'); 
        
        if (typeof window.hideSearchResults === 'function') {
            window.hideSearchResults();
        }
        
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            const titles = {
                'home': 'الرئيسية',
                'chat': 'الدردشة',
                'profile': 'الملف الشخصي',
                'settings': 'الإعدادات'
            };
            pageTitle.textContent = titles[id] || id;
            pageTitle.setAttribute('data-i18n', id);
        }
        
        if (id === 'chat') loadChats(); 
        nav.forEach(n => n.classList.toggle('active', n.dataset.page === id)); 
    } 
    
    window.switchPage = switchPage;
    nav.forEach(n => n.addEventListener('click', () => switchPage(n.dataset.page))); 
}

function setupModals() { 
    window.openLanguageModal = () => document.getElementById('languageModal')?.classList.add('active'); 
    window.closeModal = () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); 
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { 
        if (e.target === m) m.classList.remove('active'); 
    })); 
    document.querySelectorAll('.settings-item').forEach(i => { 
        if (i.querySelector('[data-i18n="language"]')) i.addEventListener('click', window.openLanguageModal); 
    }); 
}

// ==================== دوال التعديل والرجوع ====================

window.openEditProfileModal = function() {
    const modal = document.getElementById('editProfileModal');
    if (!modal) return;
    
    const nameInput = document.getElementById('editName');
    const currentName = document.getElementById('profileName')?.textContent;
    const currentEmoji = document.getElementById('profileAvatarEmoji')?.textContent;
    
    if (nameInput) nameInput.value = currentName || '';
    
    const avatarPreview = document.getElementById('currentAvatarEmoji');
    if (avatarPreview) avatarPreview.textContent = currentEmoji || '🧔🏻‍♂️';
    
    modal.classList.add('active');
};

window.saveProfile = function() {
    const n = document.getElementById('editName')?.value?.trim();
    if (!n || n.length > 25) {
        alert('الاسم مطلوب ولا يزيد عن 25 حرف');
        return;
    }
    if (auth?.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({ name: n })
            .then(() => {
                const nameEl = document.getElementById('profileName');
                if (nameEl) nameEl.textContent = n;
                closeModal();
            })
            .catch(() => alert('فشل حفظ التغييرات'));
    }
};

window.showUserTrips = function() {
    pushPage('page', 'profile');
    document.body.classList.add('profile-subpage-open');
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('tripsPage').style.display = 'block';
};

window.showFriendsList = function() {
    pushPage('page', 'profile');
    document.body.classList.add('profile-subpage-open');
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('friendsPage').style.display = 'block';
    if (typeof loadFriendsList === 'function') loadFriendsList();
};

window.goBack = function() {
    document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none');
    document.body.classList.remove('profile-subpage-open');
    
    const profilePage = document.querySelector('.profile-page');
    if (profilePage) {
        profilePage.style.display = 'block';
        profilePage.classList.add('active');
    }
    
    clearStack();
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('active');
        if (n.dataset.page === 'profile') n.classList.add('active');
    });
};

// ==================== تهيئة الصفحة ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 تهيئة ui-functions...');
    ensureSinglePage();
    setupNavigation();
    setupModals();
    loadChats();
    setupChatListeners();
    updateTripsCount();
});

window.addEventListener('authReady', async function() {
    if (window.auth?.currentUser && typeof SecureChatSystem !== 'undefined') {
        await SecureChatSystem.init();
    }
});

if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

window.addEventListener('error', function(event) {
    console.error('❌ خطأ عام:', event.error);
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('❌ خطأ غير معالج:', event.reason);
});
