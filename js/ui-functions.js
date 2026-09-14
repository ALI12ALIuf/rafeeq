// ========== ui-functions.js - النسخة النهائية (مع مسح فوري للإشارة) ==========

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

// ✅ متتبع العناصر المعروضة حالياً
let _currentChatsElements = {
    requests: new Map(),
    friends: new Map()
};

// ✅ قفل منع التحديثات المتزامنة
let _updateLock = false;

// ✅ تتبع الرسائل غير المقروءة لكل صديق
let _unreadMessages = new Map();

// ==================== تحميل المحادثات ====================
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
        
        _currentChatsElements.requests.clear();
        _currentChatsElements.friends.clear();
        list.innerHTML = '';
        
        await smartUpdateChatsList(friends, chatTemplate, requestTemplate, list);
        
        chatsLoaded = true;
        isLoadingChats = false;
        
    } catch (e) {
        console.error('خطأ في loadChats:', e);
        isLoadingChats = false;
    } 
}

// ==================== ✅ التحديث الذكي ====================
async function smartUpdateChatsList(friends, chatTemplate, requestTemplate, list) {
    if (_updateLock) {
        await new Promise(resolve => {
            const checkLock = setInterval(() => {
                if (!_updateLock) {
                    clearInterval(checkLock);
                    resolve();
                }
            }, 50);
        });
    }
    
    _updateLock = true;
    
    try {
        const uid = window.auth?.currentUser?.uid;
        if (!uid) {
            _updateLock = false;
            return;
        }
        
        // 1. جلب طلبات الصداقة
        const pendingRequests = await window.loadFriendRequestsForChat 
            ? await window.loadFriendRequestsForChat() 
            : [];
        
        const currentFriendIds = new Set(friends);
        
        // 2. إزالة الطلبات غير الموجودة
        _currentChatsElements.requests.forEach((el, id) => {
            const stillExists = pendingRequests.some(r => r.id === id);
            if (!stillExists) {
                el.remove();
                _currentChatsElements.requests.delete(id);
            }
        });
        
        // 3. إزالة الأصدقاء غير الموجودين
        _currentChatsElements.friends.forEach((el, id) => {
            if (!currentFriendIds.has(id)) {
                el.remove();
                _currentChatsElements.friends.delete(id);
                _unreadMessages.delete(id);
            }
        });
        
        // 4. إضافة طلبات الصداقة الجديدة
        const addedRequestIds = new Set();
        for (const req of pendingRequests) {
            if (addedRequestIds.has(req.id)) continue;
            if (_currentChatsElements.requests.has(req.id)) continue;
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
                
                requestItem.setAttribute('data-request-id', req.id);
                requestItem.setAttribute('data-type', 'request');
                
                if (list.firstChild) {
                    list.insertBefore(requestItem, list.firstChild);
                } else {
                    list.appendChild(requestItem);
                }
                
                _currentChatsElements.requests.set(req.id, requestItem);
                
            } catch (e) {
                console.warn('خطأ في عرض طلب صداقة:', e);
            }
        }
        
        // 5. إضافة الأصدقاء الجدد
        const addedFriendIds = new Set();
        for (const fid of friends) {
            if (addedFriendIds.has(fid)) continue;
            if (_currentChatsElements.friends.has(fid)) continue;
            addedFriendIds.add(fid);
            
            try { 
                const fdoc = await window.db.collection('users').doc(fid).get(); 
                if (fdoc.exists) { 
                    const f = fdoc.data(); 
                    
                    const clone = chatTemplate.content.cloneNode(true);
                    const chatItem = clone.querySelector('.chat-item');
                    
                    const avatar = chatItem.querySelector('.chat-avatar-emoji');
                    const name = chatItem.querySelector('.chat-info h4');
                    const userIdSpan = chatItem.querySelector('.chat-user-id');
                    const copyIdBtn = chatItem.querySelector('.copy-chat-id-btn');
                    const removeBtn = chatItem.querySelector('.remove-friend-btn');
                    
                    if (avatar) avatar.textContent = window.getEmojiForUser ? window.getEmojiForUser(f) : '🧔🏻‍♂️';
                    if (name) name.textContent = f.name || 'مستخدم';
                    if (userIdSpan) userIdSpan.textContent = f.shareableId || '';
                    
                    if (copyIdBtn) {
                        copyIdBtn.onclick = (e) => {
                            e.stopPropagation();
                            const id = f.shareableId || '';
                            if (!id) return;
                            navigator.clipboard.writeText(id).then(() => {
                                const icon = copyIdBtn.querySelector('i');
                                if (icon) {
                                    icon.className = 'fas fa-check';
                                    setTimeout(() => { icon.className = 'far fa-copy'; }, 1500);
                                }
                            }).catch(() => {});
                        };
                    }
                    
                    if (removeBtn) {
                        removeBtn.onclick = (e) => {
                            e.stopPropagation();
                            window.confirmRemoveFriend(fid, f.name || 'مستخدم');
                        };
                    }
                    
                    // ✅ عند النقر على البطاقة: مسح الإشارة + فتح المحادثة
                    chatItem.onclick = (e) => {
                        if (e.target.closest('.remove-friend-btn') || e.target.closest('.copy-chat-id-btn')) return;
                        
                        // ✅ مسح الإشارة فوراً (بدون انتظار)
                        if (typeof window.clearUnreadStatus === 'function') {
                            window.clearUnreadStatus(fid);
                        }
                        
                        // ✅ فتح المحادثة
                        openChat(fid);
                    };
                    
                    chatItem.setAttribute('data-friend-id', fid);
                    chatItem.setAttribute('data-type', 'friend');
                    
                    list.appendChild(chatItem);
                    
                    _currentChatsElements.friends.set(fid, chatItem);
                } 
            } catch (e) {
                console.warn('خطأ في تحميل صديق:', e);
            }
        }
        
        // 6. إعادة ترتيب القائمة
        reorderChatsList(list);
        
        // 7. إدارة الحالة الفارغة
        updateEmptyState(list);
        
    } finally {
        _updateLock = false;
    }
}

// ==================== ✅ إعادة ترتيب القائمة (بدون عداد) ====================
function reorderChatsList(list) {
    if (!list) return;
    
    // 1. جلب كل العناصر
    const requests = [];
    const unreadFriends = [];
    const readFriends = [];
    
    _currentChatsElements.requests.forEach(el => requests.push(el));
    
    _currentChatsElements.friends.forEach((el, fid) => {
        if (_unreadMessages.has(fid) && _unreadMessages.get(fid) > 0) {
            unreadFriends.push(el);
        } else {
            readFriends.push(el);
        }
    });
    
    // 2. ترتيب محادثات غير المقروءة
    unreadFriends.sort((a, b) => {
        const fidA = a.getAttribute('data-friend-id');
        const fidB = b.getAttribute('data-friend-id');
        const countA = _unreadMessages.get(fidA) || 0;
        const countB = _unreadMessages.get(fidB) || 0;
        return countB - countA;
    });
    
    // 3. إزالة كل العناصر
    [...requests, ...unreadFriends, ...readFriends].forEach(el => {
        if (el.parentNode === list) {
            el.remove();
        }
    });
    
    // 4. إعادة الإضافة بالترتيب
    requests.forEach(el => list.appendChild(el));
    unreadFriends.forEach(el => list.appendChild(el));
    readFriends.forEach(el => list.appendChild(el));
    
    // 5. ✅ تحديث الألوان فقط (بدون شارة)
    _currentChatsElements.friends.forEach((el, fid) => {
        const nameEl = el.querySelector('.chat-info h4');
        
        if (_unreadMessages.has(fid) && _unreadMessages.get(fid) > 0) {
            // ✅ أزرق للمرسل
            if (nameEl) nameEl.style.color = 'var(--primary)';
            el.classList.add('unread-dot');
        } else {
            // ⚪ أبيض عادي
            if (nameEl) nameEl.style.color = 'var(--text)';
            el.classList.remove('unread-dot');
        }
    });
}

// ==================== ✅ تسجيل رسالة غير مقروءة ====================
window.markMessageAsUnread = function(friendId) {
    if (!friendId) return;
    
    const currentCount = _unreadMessages.get(friendId) || 0;
    _unreadMessages.set(friendId, currentCount + 1);
    
    console.log(`📩 رسالة جديدة من ${friendId} - عدد غير المقروء: ${currentCount + 1}`);
    
    const list = document.getElementById('chatsList');
    if (list) {
        reorderChatsList(list);
    }
};

// ==================== ✅ مسح حالة غير المقروء (فوري) ====================
window.clearUnreadStatus = function(friendId) {
    if (!friendId) return;
    
    // 1. مسح من الذاكرة
    if (_unreadMessages.has(friendId)) {
        _unreadMessages.delete(friendId);
        console.log(`✅ تم مسح حالة غير المقروء لـ ${friendId}`);
    }
    
    // 2. ✅ تحديث فوري للعنصر في DOM (بدون انتظار)
    const element = _currentChatsElements.friends.get(friendId);
    if (element) {
        const nameEl = element.querySelector('.chat-info h4');
        if (nameEl) {
            nameEl.style.color = 'var(--text)';  // ← أبيض
        }
        element.classList.remove('unread-dot');  // ← إزالة الخط الأزرق
        console.log('✅ تم تحديث العنصر مباشرة');
    }
    
    // 3. إعادة الترتيب (لتحديث المواقع)
    setTimeout(() => {
        const list = document.getElementById('chatsList');
        if (list && typeof reorderChatsList === 'function') {
            reorderChatsList(list);
        }
    }, 50);
};

// ==================== إدارة الحالة الفارغة ====================
function updateEmptyState(list) {
    const hasRequests = _currentChatsElements.requests.size > 0;
    const hasFriends = _currentChatsElements.friends.size > 0;
    
    const existingEmpty = list.querySelector('.empty-state');
    
    if (!hasRequests && !hasFriends) {
        if (!existingEmpty) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'empty-state';
            emptyEl.innerHTML = `
                <i class="fas fa-comments"></i>
                <h3>لا توجد محادثات</h3>
                <p>أضف أصدقاء لبدء المحادثة</p>
            `;
            list.appendChild(emptyEl);
        }
    } else {
        if (existingEmpty) {
            existingEmpty.remove();
        }
    }
}

// ==================== مسح الكاش ====================
function resetChatsCache() {
    _currentChatsElements.requests.clear();
    _currentChatsElements.friends.clear();
    _unreadMessages.clear();
}

// ==================== تأكيد حذف الصديق ====================
window.confirmRemoveFriend = function(friendId, friendName) {
    const confirmed = confirm(`هل أنت متأكد من حذف "${friendName}" من قائمة الأصدقاء؟`);
    if (confirmed) {
        removeFriend(friendId);
    }
};

// ==================== حذف الصديق ====================
window.removeFriend = async function(friendId) {
    if (!window.auth?.currentUser) return;
    try { 
        const uid = window.auth.currentUser.uid; 
        const FieldValue = firebase.firestore.FieldValue;
        
        await window.db.collection('users').doc(uid).update({ 
            friends: FieldValue.arrayRemove(friendId) 
        }); 
        
        await window.db.collection('users').doc(friendId).update({ 
            friends: FieldValue.arrayRemove(uid) 
        }); 
        
        const userKey = `chat_${uid}_${friendId}`;
        localStorage.removeItem(userKey);
        if (typeof ChatSystem !== 'undefined' && ChatSystem.messages) {
            delete ChatSystem.messages[friendId];
        }
        
        _unreadMessages.delete(friendId);
        
        const element = _currentChatsElements.friends.get(friendId);
        if (element) {
            element.remove();
            _currentChatsElements.friends.delete(friendId);
            const list = document.getElementById('chatsList');
            if (list) updateEmptyState(list);
        }
        
        console.log(`✅ تم حذف الصديق ${friendId} بنجاح`);
        
    } catch (e) { 
        console.error('❌ خطأ في حذف الصديق:', e);
        alert('حدث خطأ في حذف الصديق'); 
    }
};

// ==================== باقي الدوال ====================
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
        'man_light': '🧔🏻‍♂️', 'man_medium': '🧔🏼‍♂️', 'man_dark': '🧔🏽‍♂️',
        'woman_light': '👩🏻', 'woman_medium': '👩🏼', 'woman_dark': '👩🏽'
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
        'man_light': '🧔🏻‍♂️', 'man_medium': '🧔🏼‍♂️', 'man_dark': '🧔🏽‍♂️',
        'woman_light': '👩🏻', 'woman_medium': '👩🏼', 'woman_dark': '👩🏽'
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

function ensureSinglePage() { 
    document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); 
    document.querySelectorAll('.page').forEach(p => { 
        p.style.display = p.classList.contains('active') ? 'block' : 'none'; 
    }); 
}

// ==================== التنقل ====================
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
            const titles = { 'home': 'الرئيسية', 'chat': 'الدردشة', 'profile': 'الملف الشخصي', 'settings': 'الإعدادات' };
            pageTitle.textContent = titles[id] || id;
            pageTitle.setAttribute('data-i18n', id);
        }
        
        // ✅ عرض فوري بدون إعادة تحميل
        if (id === 'chat') {
            const list = document.getElementById('chatsList');
            if (chatsLoaded && list && list.children.length > 0) {
                console.log('✅ عرض فوري');
            } else {
                console.log('🔄 تحميل أول مرة');
                loadChats();
            }
        }
        
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

window.updateCharCounter = function() {
    const nameInput = document.getElementById('editName');
    const counter = document.getElementById('charCounter');
    if (!nameInput || !counter) return;
    
    const length = nameInput.value.length;
    const maxLength = 15;
    
    counter.textContent = `${length}/${maxLength}`;
    counter.classList.remove('warning', 'full');
    
    if (length >= maxLength) {
        counter.classList.add('full');
    } else if (length >= maxLength - 3) {
        counter.classList.add('warning');
    }
};

window.openEditProfileModal = function() {
    const modal = document.getElementById('editProfileModal');
    if (!modal) return;
    
    const nameInput = document.getElementById('editName');
    const currentName = document.getElementById('profileName')?.textContent;
    const currentEmoji = document.getElementById('profileAvatarEmoji')?.textContent;
    
    if (nameInput) nameInput.value = currentName || '';
    
    const avatarPreview = document.getElementById('currentAvatarEmoji');
    if (avatarPreview) avatarPreview.textContent = currentEmoji || '🧔🏻‍♂️';
    
    window.updateCharCounter();
    modal.classList.add('active');
};

window.saveProfile = function() {
    const n = document.getElementById('editName')?.value?.trim();
    if (!n || n.length > 15) {
        alert('الاسم مطلوب ولا يزيد عن 15 حرف');
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

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 تهيئة ui-functions...');
    ensureSinglePage();
    setupNavigation();
    setupModals();
    loadChats();
    setupChatListeners();
    
    const nameInput = document.getElementById('editName');
    if (nameInput) {
        nameInput.addEventListener('input', window.updateCharCounter);
    }
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

// ✅ تصدير الدوال
window.smartUpdateChatsList = smartUpdateChatsList;
window.resetChatsCache = resetChatsCache;
window.reorderChatsList = reorderChatsList;
window._unreadMessages = _unreadMessages;
