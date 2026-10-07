// ========== ui-functions.js - Rafeeq UI with Polling ==========

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

let _currentChatsElements = {
    requests: new Map(),
    friends: new Map()
};

let _updateLock = false;
let _unreadMessages = new Map();

// ✅ Polling intervals
let _requestsPollingInterval = null;
let _friendsPollingInterval = null;
let _profilePollingInterval = null;

// ✅ تخزين مؤقت للطلبات
let _cachedRequests = [];
let _cachedFriends = [];

// ==================== دوال حفظ/تحميل حالة غير المقروء ====================
function saveUnreadMessages() {
    const uid = RafeeqAPI.getUser()?.id;
    if (!uid) return;
    
    try {
        const data = {};
        _unreadMessages.forEach((count, fid) => {
            data[fid] = count;
        });
        localStorage.setItem(`unread_${uid}`, JSON.stringify(data));
    } catch (e) {
        console.warn('⚠️ فشل حفظ حالة غير المقروء:', e);
    }
}

function loadUnreadMessages() {
    const uid = RafeeqAPI.getUser()?.id;
    if (!uid) return;
    
    _unreadMessages.clear();
    try {
        const data = JSON.parse(localStorage.getItem(`unread_${uid}`)) || {};
        Object.keys(data).forEach(fid => {
            if (data[fid] > 0) {
                _unreadMessages.set(fid, data[fid]);
            }
        });
    } catch (e) {
        console.warn('⚠️ فشل تحميل حالة غير المقروء:', e);
    }
}

// ==================== تحميل المحادثات ====================
async function loadChats(force = false) { 
    if (!RafeeqAPI.getToken()) return; 
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
        const friendsResult = await RafeeqAPI.friends.getMyFriends();
        const friends = friendsResult.success && friendsResult.friends 
            ? friendsResult.friends.map(f => f.id) 
            : [];
        
        loadUnreadMessages();
        
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

// ==================== التحديث الذكي ====================
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
        const uid = RafeeqAPI.getUser()?.id;
        if (!uid) {
            _updateLock = false;
            return;
        }
        
        const pendingRequests = await loadFriendRequestsForChat();
        _cachedRequests = pendingRequests;
        _cachedFriends = friends;
        
        const currentFriendIds = new Set(friends);
        
        // حذف الطلبات القديمة
        _currentChatsElements.requests.forEach((el, id) => {
            const stillExists = pendingRequests.some(r => r.id === id);
            if (!stillExists) {
                el.remove();
                _currentChatsElements.requests.delete(id);
            }
        });
        
        // حذف الأصدقاء القدامى
        _currentChatsElements.friends.forEach((el, id) => {
            if (!currentFriendIds.has(id)) {
                el.remove();
                _currentChatsElements.friends.delete(id);
                _unreadMessages.delete(id);
                saveUnreadMessages();
            }
        });
        
        // ✅ إضافة الطلبات الجديدة
        const addedRequestIds = new Set();
        for (const req of pendingRequests) {
            if (addedRequestIds.has(req.id)) continue;
            if (_currentChatsElements.requests.has(req.id)) continue;
            addedRequestIds.add(req.id);
            
            try {
                const clone = requestTemplate.content.cloneNode(true);
                const requestItem = clone.querySelector('.friend-request-item');
                
                const avatar = requestItem.querySelector('.chat-avatar-emoji');
                const nameSpan = requestItem.querySelector('.friend-request-name');
                const idSpan = requestItem.querySelector('.friend-request-id');
                const copyBtn = requestItem.querySelector('.copy-id-btn');
                const acceptBtn = requestItem.querySelector('.accept-friend-btn');
                const rejectBtn = requestItem.querySelector('.reject-friend-btn');
                
                if (avatar) avatar.textContent = getEmojiForUser({ avatarType: req.avatarType });
                if (nameSpan) nameSpan.textContent = req.name || 'مستخدم';
                if (idSpan) idSpan.textContent = req.shareableId || '0000000000';
                
                if (copyBtn) {
                    copyBtn.onclick = (e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(req.shareableId || '').then(() => {
                            const icon = copyBtn.querySelector('i');
                            if (icon) {
                                icon.className = 'fas fa-check';
                                setTimeout(() => { icon.className = 'far fa-copy'; }, 1500);
                            }
                        }).catch(() => {});
                    };
                }
                
                if (acceptBtn) acceptBtn.onclick = async (e) => { 
                    e.stopPropagation(); 
                    await window.acceptFriendRequest(req.id, req.from);
                    // ✅ فوراً أعد التحميل
                    chatsLoaded = false;
                    await loadChats(true);
                };
                if (rejectBtn) rejectBtn.onclick = async (e) => { 
                    e.stopPropagation(); 
                    await window.rejectFriendRequest(req.id);
                    // ✅ فوراً أعد التحميل
                    chatsLoaded = false;
                    await loadChats(true);
                };
                
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
        
        // ✅ إضافة الأصدقاء الجدد
        const addedFriendIds = new Set();
        for (const fid of friends) {
            if (addedFriendIds.has(fid)) continue;
            if (_currentChatsElements.friends.has(fid)) continue;
            addedFriendIds.add(fid);
            
            try { 
                const result = await RafeeqAPI.users.getById(fid);
                if (result.success && result.user) {
                    const f = result.user;
                    
                    const clone = chatTemplate.content.cloneNode(true);
                    const chatItem = clone.querySelector('.chat-item');
                    
                    const avatar = chatItem.querySelector('.chat-avatar-emoji');
                    const name = chatItem.querySelector('.chat-info h4');
                    const userIdSpan = chatItem.querySelector('.chat-user-id');
                    const copyIdBtn = chatItem.querySelector('.copy-chat-id-btn');
                    const removeBtn = chatItem.querySelector('.remove-friend-btn');
                    
                    if (avatar) avatar.textContent = getEmojiForUser(f);
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
                    
                    chatItem.onclick = (e) => {
                        if (e.target.closest('.remove-friend-btn') || e.target.closest('.copy-chat-id-btn')) return;
                        if (typeof window.clearUnreadStatus === 'function') {
                            window.clearUnreadStatus(fid);
                        }
                        window.openChat(fid);
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
        
        reorderChatsList(list);
        updateEmptyState(list);
        
    } finally {
        _updateLock = false;
    }
}

// ==================== إعادة الترتيب ====================
function reorderChatsList(list) {
    if (!list) return;
    
    const requests = [];
    const friendsWithTime = [];
    
    _currentChatsElements.requests.forEach(el => requests.push(el));
    
    _currentChatsElements.friends.forEach((el, fid) => {
        const lastTime = getLastMessageTime(fid);
        friendsWithTime.push({ el, fid, lastTime });
    });
    
    friendsWithTime.sort((a, b) => b.lastTime - a.lastTime);
    
    [...requests, ...friendsWithTime.map(f => f.el)].forEach(el => {
        if (el.parentNode === list) {
            el.remove();
        }
    });
    
    requests.forEach(el => list.appendChild(el));
    friendsWithTime.forEach(f => list.appendChild(f.el));
    
    _currentChatsElements.friends.forEach((el, fid) => {
        const nameEl = el.querySelector('.chat-info h4');
        
        if (_unreadMessages.has(fid) && _unreadMessages.get(fid) > 0) {
            if (nameEl) nameEl.style.color = 'var(--primary)';
            el.classList.add('unread-dot');
        } else {
            if (nameEl) nameEl.style.color = 'var(--text)';
            el.classList.remove('unread-dot');
        }
    });
}

// ==================== وقت آخر رسالة ====================
function getLastMessageTime(friendId) {
    const uid = RafeeqAPI.getUser()?.id;
    if (!uid || !friendId) return 0;
    
    const key = `chat_${uid}_${friendId}`;
    try {
        const messages = JSON.parse(localStorage.getItem(key)) || [];
        if (messages.length === 0) return 0;
        
        const lastMsg = messages[messages.length - 1];
        const time = new Date(lastMsg.time).getTime();
        return isNaN(time) ? 0 : time;
    } catch (e) {
        return 0;
    }
}

// ==================== Polling: تحديث الطلبات تلقائياً ====================
function startRequestsPolling() {
    if (_requestsPollingInterval) {
        clearInterval(_requestsPollingInterval);
    }
    
    console.log('🔄 بدء Polling للطلبات (كل 5 ثوانٍ)');
    
    _requestsPollingInterval = setInterval(async () => {
        if (!RafeeqAPI.getToken()) return;
        
        // لا نُحدّث إذا كنا في محادثة
        if (document.body.classList.contains('conversation-open')) return;
        
        try {
            const result = await RafeeqAPI.friends.getRequests();
            if (!result.success) return;
            
            const newRequests = result.requests || [];
            const oldIds = _cachedRequests.map(r => r.id).sort().join(',');
            const newIds = newRequests.map(r => r.id).sort().join(',');
            
            // إذا تغيّرت القائمة → أعد التحميل
            if (oldIds !== newIds) {
                console.log('🔄 طلبات جديدة — تحديث القائمة');
                _cachedRequests = newRequests;
                
                // أعد تحميل المحادثات
                const list = document.getElementById('chatsList');
                const chatTemplate = ChatSystem.chatItemTemplate || document.getElementById('chatItemTemplate');
                const requestTemplate = document.getElementById('friendRequestChatTemplate');
                
                if (list && chatTemplate && requestTemplate) {
                    const friendsResult = await RafeeqAPI.friends.getMyFriends();
                    const friends = friendsResult.success && friendsResult.friends 
                        ? friendsResult.friends.map(f => f.id) 
                        : [];
                    
                    await smartUpdateChatsList(friends, chatTemplate, requestTemplate, list);
                }
            }
        } catch (e) {
            // نتجاهل الأخطاء
        }
    }, 5000);
}

// ==================== Polling: تحديث الأصدقاء تلقائياً ====================
function startFriendsPolling() {
    if (_friendsPollingInterval) {
        clearInterval(_friendsPollingInterval);
    }
    
    console.log('🔄 بدء Polling للأصدقاء (كل 10 ثوانٍ)');
    
    _friendsPollingInterval = setInterval(async () => {
        if (!RafeeqAPI.getToken()) return;
        
        if (document.body.classList.contains('conversation-open')) return;
        
        try {
            const result = await RafeeqAPI.friends.getMyFriends();
            if (!result.success) return;
            
            const newFriends = (result.friends || []).map(f => f.id).sort();
            const oldFriends = _cachedFriends.slice().sort();
            
            if (JSON.stringify(newFriends) !== JSON.stringify(oldFriends)) {
                console.log('🔄 قائمة الأصدقاء تغيّرت — تحديث');
                _cachedFriends = newFriends;
                
                const list = document.getElementById('chatsList');
                const chatTemplate = ChatSystem.chatItemTemplate || document.getElementById('chatItemTemplate');
                const requestTemplate = document.getElementById('friendRequestChatTemplate');
                
                if (list && chatTemplate && requestTemplate) {
                    await smartUpdateChatsList(newFriends, chatTemplate, requestTemplate, list);
                }
            }
        } catch (e) {
            // نتجاهل
        }
    }, 10000);
}

// ==================== Polling: تحديث بيانات المستخدم ====================
function startProfilePolling() {
    if (_profilePollingInterval) {
        clearInterval(_profilePollingInterval);
    }
    
    console.log('🔄 بدء Polling للملف الشخصي (كل 30 ثانية)');
    
    _profilePollingInterval = setInterval(async () => {
        if (!RafeeqAPI.getToken()) return;
        
        try {
            const result = await RafeeqAPI.auth.me();
            if (!result.success || !result.user) return;
            
            const cachedUser = RafeeqAPI.getUser();
            
            // إذا تغيّرت البيانات → حدّث
            if (JSON.stringify(result.user) !== JSON.stringify(cachedUser)) {
                console.log('🔄 بيانات المستخدم تحدّثت');
                RafeeqAPI.setUser(result.user);
                
                // تحديث الواجهة
                if (typeof loadUserData === 'function') {
                    await loadUserData(result.user);
                }
            }
        } catch (e) {
            // نتجاهل
        }
    }, 30000);
}

// ==================== إيقاف جميع Pollings ====================
function stopAllPollings() {
    if (_requestsPollingInterval) {
        clearInterval(_requestsPollingInterval);
        _requestsPollingInterval = null;
    }
    if (_friendsPollingInterval) {
        clearInterval(_friendsPollingInterval);
        _friendsPollingInterval = null;
    }
    if (_profilePollingInterval) {
        clearInterval(_profilePollingInterval);
        _profilePollingInterval = null;
    }
    console.log('⏹️ تم إيقاف جميع Pollings');
}

// ==================== تسجيل رسالة غير مقروءة ====================
window.markMessageAsUnread = function(friendId) {
    if (!friendId) return;
    
    const currentCount = _unreadMessages.get(friendId) || 0;
    _unreadMessages.set(friendId, currentCount + 1);
    
    saveUnreadMessages();
    
    console.log(`📩 رسالة جديدة من ${friendId}`);
    
    const list = document.getElementById('chatsList');
    if (list) {
        reorderChatsList(list);
    }
};

// ==================== مسح حالة غير المقروء ====================
window.clearUnreadStatus = function(friendId) {
    if (!friendId) return;
    
    if (_unreadMessages.has(friendId)) {
        _unreadMessages.delete(friendId);
        saveUnreadMessages();
    }
    
    const element = _currentChatsElements.friends.get(friendId);
    if (element) {
        const nameEl = element.querySelector('.chat-info h4');
        if (nameEl) {
            nameEl.style.color = 'var(--text)';
        }
        element.classList.remove('unread-dot');
    }
    
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

// ==================== اختيار الأفاتار ====================
window.selectAvatar = async function(type) {
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
    
    if (RafeeqAPI.getToken()) {
        try {
            await RafeeqAPI.users.updateProfile({ avatarType: type });
            const user = RafeeqAPI.getUser();
            if (user) {
                user.avatarType = type;
                RafeeqAPI.setUser(user);
            }
            setTimeout(() => window.closeModal('avatarModal'), 500);
        } catch (e) {
            console.warn('فشل تحديث الأفاتار:', e);
        }
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
        }
        
        if (id === 'chat') {
            const list = document.getElementById('chatsList');
            if (chatsLoaded && list && list.children.length > 0) {
                if (typeof reorderChatsList === 'function') {
                    reorderChatsList(list);
                }
            } else {
                loadChats(true);
            }
        }
        
        if (typeof PostsSystem !== 'undefined' && PostsSystem.updateCountrySelectorVisibility) {
            PostsSystem.updateCountrySelectorVisibility();
        }
        
        nav.forEach(n => n.classList.toggle('active', n.dataset.page === id)); 
    } 
    
    window.switchPage = switchPage;
    nav.forEach(n => n.addEventListener('click', () => switchPage(n.dataset.page))); 
}

function setupModals() { 
    window.openLanguageModal = () => document.getElementById('languageModal')?.classList.add('active'); 
    
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { 
        if (e.target === m) m.classList.remove('active'); 
    })); 
    document.querySelectorAll('.settings-item').forEach(i => { 
        if (i.querySelector('[data-i18n="language"]')) i.addEventListener('click', window.openLanguageModal); 
    }); 
}

// ==================== closeModal ====================
window.closeModal = function(modalId) {
    if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
    } else {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    }
};

// ==================== عداد الاسم ====================
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

// ==================== فتح نافذة تعديل الملف ====================
window.openEditProfileModal = function() {
    const modal = document.getElementById('editProfileModal');
    if (!modal) return;
    
    const nameInput = document.getElementById('editName');
    const user = RafeeqAPI.getUser();
    
    if (nameInput) {
        nameInput.value = user?.name || '';
        nameInput.style.textAlign = 'center';
        nameInput.style.direction = 'rtl';
    }
    
    const avatarPreview = document.getElementById('currentAvatarEmoji');
    if (avatarPreview) avatarPreview.textContent = getEmojiForUser(user);
    
    window.updateCharCounter();
    modal.classList.add('active');
};

window.saveProfile = async function() {
    const n = document.getElementById('editName')?.value?.trim();
    if (!n || n.length > 15) {
        alert('الاسم مطلوب ولا يزيد عن 15 حرف');
        return;
    }
    
    if (!RafeeqAPI.getToken()) return;
    
    try {
        await RafeeqAPI.users.updateProfile({ name: n });
        
        const user = RafeeqAPI.getUser();
        if (user) {
            user.name = n;
            RafeeqAPI.setUser(user);
        }
        
        const nameEl = document.getElementById('profileName');
        if (nameEl) nameEl.textContent = n;
        
        window.closeModal('editProfileModal');
        alert('✅ تم حفظ التغييرات');
        
    } catch (e) {
        alert('فشل حفظ التغييرات: ' + e.message);
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

// ==================== الإيداع ====================
window.openDepositModal = function() {
    const modal = document.getElementById('depositModal');
    if (!modal) return;
    
    const amountInput = document.getElementById('depositAmount');
    if (amountInput) amountInput.value = '';
    
    const noteInput = document.getElementById('depositNote');
    if (noteInput) noteInput.value = '';
    
    const preview = document.getElementById('depositImagePreview');
    if (preview) preview.innerHTML = '<i class="fas fa-receipt" style="color: var(--text-light);"></i>';
    
    const input = document.getElementById('depositImage');
    if (input) input.value = '';
    
    modal.classList.add('active');
};

window.previewDepositImage = async function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    
    const preview = document.getElementById('depositImagePreview');
    if (!preview) return;
    
    preview.innerHTML = '<div style="color:#888;font-size:0.7rem;">...</div>';
    
    try {
        const compressed = await PostsSystem.compressImage(file);
        preview.innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;
    } catch (err) {
        alert('فشل معالجة الصورة: ' + err.message);
        preview.innerHTML = '<i class="fas fa-receipt" style="color: var(--text-light);"></i>';
        event.target.value = '';
    }
};

window.submitDeposit = async function() {
    if (!RafeeqAPI.getToken()) {
        alert('يجب تسجيل الدخول');
        return;
    }
    
    const amount = parseFloat(document.getElementById('depositAmount')?.value || '0');
    const note = document.getElementById('depositNote')?.value?.trim() || '';
    const imageInput = document.getElementById('depositImage');
    
    if (!amount || amount <= 0) {
        alert('يرجى إدخال مبلغ صحيح');
        return;
    }
    
    if (!imageInput || !imageInput.files[0]) {
        alert('يرجى رفع صورة الإيصال');
        return;
    }
    
    try {
        let receiptImage = null;
        try {
            receiptImage = await PostsSystem.compressImage(imageInput.files[0]);
        } catch (err) {
            alert('فشل معالجة الإيصال: ' + err.message);
            return;
        }
        
        const result = await RafeeqAPI.wallet.requestDeposit(amount, receiptImage, note);
        
        if (result.success) {
            window.closeModal('depositModal');
            alert('✅ تم إرسال طلب الإيداع\nسيتم مراجعته من قبل الإدارة');
        }
        
    } catch (e) {
        alert('❌ ' + (e.message || 'حدث خطأ'));
    }
};

// ==================== مستمعو النقرات ====================
function setupChatListeners() { 
    document.addEventListener('click', e => { 
        const m = document.getElementById('attachmentMenu'); 
        const ab = document.querySelector('.attach-btn'); 
        if (m && ab && !m.contains(e.target) && !ab.contains(e.target)) {
            m.style.display = 'none'; 
        }
    }); 
}

// ==================== تهيئة الصفحة ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 تهيئة ui-functions...');
    ensureSinglePage();
    setupNavigation();
    setupModals();
    setupChatListeners();
    
    const nameInput = document.getElementById('editName');
    if (nameInput) {
        nameInput.addEventListener('input', window.updateCharCounter);
    }
});

// ✅ authReady — بدء Pollings
window.addEventListener('authReady', function() {
    console.log('✅ authReady - بدء Pollings');
    setTimeout(() => {
        loadUnreadMessages();
        startRequestsPolling();      // 🔄 تحديث الطلبات
        startFriendsPolling();       // 🔄 تحديث الأصدقاء
        startProfilePolling();       // 🔄 تحديث الملف الشخصي
    }, 100);
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
window.reorderChatsList = reorderChatsList;
window.getLastMessageTime = getLastMessageTime;
window._unreadMessages = _unreadMessages;
window.saveUnreadMessages = saveUnreadMessages;
window.loadUnreadMessages = loadUnreadMessages;
window.loadChats = loadChats;
window.stopAllPollings = stopAllPollings;

console.log('✅ ui-functions.js loaded - with Polling (requests/friends/profile)');
