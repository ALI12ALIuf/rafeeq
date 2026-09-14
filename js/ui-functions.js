// ========== ui-functions.js - النسخة المُحسّنة (تحديث بدون وميض) ==========

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
    requests: new Map(),   // requestId → element
    friends: new Map()     // friendId → element
};

// ==================== تحميل المحادثات (الأولية) ====================
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
        
        // ✅ تحديث ذكي (لا يمسح القائمة)
        await smartUpdateChatsList(friends, chatTemplate, requestTemplate, list);
        
        chatsLoaded = true;
        isLoadingChats = false;
        
    } catch (e) {
        console.error('خطأ في loadChats:', e);
        list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>حدث خطأ</h3><p>حاول تحديث الصفحة</p></div>`;
        chatsLoaded = true;
        isLoadingChats = false;
    } 
}

// ==================== ✅ التحديث الذكي للقائمة ====================
async function smartUpdateChatsList(friends, chatTemplate, requestTemplate, list) {
    const uid = window.auth?.currentUser?.uid;
    if (!uid) return;
    
    // ✅ 1. جلب طلبات الصداقة
    const pendingRequests = await window.loadFriendRequestsForChat 
        ? await window.loadFriendRequestsForChat() 
        : [];
    
    // ✅ 2. بناء قوائم المعرفات الحالية
    const currentRequestIds = new Set();
    const currentFriendIds = new Set(friends);
    
    // ✅ 3. إزالة العناصر غير الموجودة
    _currentChatsElements.requests.forEach((el, id) => {
        const stillExists = pendingRequests.some(r => r.id === id);
        if (!stillExists) {
            el.remove();
            _currentChatsElements.requests.delete(id);
            console.log(`🗑️ تم إزالة طلب صداقة: ${id}`);
        }
    });
    
    _currentChatsElements.friends.forEach((el, id) => {
        if (!currentFriendIds.has(id)) {
            el.remove();
            _currentChatsElements.friends.delete(id);
            console.log(`🗑️ تم إزالة صديق: ${id}`);
        }
    });
    
    // ✅ 4. إضافة طلبات الصداقة الجديدة
    for (const req of pendingRequests) {
        currentRequestIds.add(req.id);
        
        // ✅ إذا كان الطلب موجوداً بالفعل، تخطيه
        if (_currentChatsElements.requests.has(req.id)) continue;
        
        try {
            const senderDoc = await window.db.collection('users').doc(req.from).get();
            if (!senderDoc.exists) continue;
            
            const sender = senderDoc.data();
            const clone = requestTemplate.content.cloneNode(true);
            const requestItem = clone.querySelector('.friend-request-item');
            
            // ✅ إعداد العنصر
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
            
            // ✅ إضافة في بداية القائمة
            const element = requestItem;
            element.setAttribute('data-request-id', req.id);
            element.setAttribute('data-type', 'request');
            
            // ✅ إضافة بتأثير ظهور سلس
            element.style.opacity = '0';
            element.style.transform = 'translateY(-20px)';
            element.style.transition = 'all 0.3s ease';
            
            if (list.firstChild) {
                list.insertBefore(element, list.firstChild);
            } else {
                list.appendChild(element);
            }
            
            // ✅ تأثير الظهور
            setTimeout(() => {
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            }, 10);
            
            _currentChatsElements.requests.set(req.id, element);
            console.log(`✨ تم إضافة طلب صداقة جديد من: ${sender.name}`);
            
        } catch (e) {
            console.warn('خطأ في عرض طلب صداقة:', e);
        }
    }
    
    // ✅ 5. إضافة الأصدقاء الجدد
    for (const fid of friends) {
        // ✅ إذا كان الصديق موجوداً بالفعل، تخطيه
        if (_currentChatsElements.friends.has(fid)) continue;
        
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
                
                // ✅ زر نسخ ID
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
                
                // ✅ زر حذف الصديق
                if (removeBtn) {
                    removeBtn.onclick = (e) => {
                        e.stopPropagation();
                        window.confirmRemoveFriend(fid, f.name || 'مستخدم');
                    };
                }
                
                // ✅ فتح المحادثة
                chatItem.onclick = (e) => {
                    if (e.target.closest('.remove-friend-btn') || e.target.closest('.copy-chat-id-btn')) return;
                    openChat(fid);
                };
                
                // ✅ إضافة العنصر
                const element = chatItem;
                element.setAttribute('data-friend-id', fid);
                element.setAttribute('data-type', 'friend');
                
                // ✅ تأثير ظهور سلس
                element.style.opacity = '0';
                element.style.transform = 'translateY(-20px)';
                element.style.transition = 'all 0.3s ease';
                
                list.appendChild(element);
                
                // ✅ تأثير الظهور
                setTimeout(() => {
                    element.style.opacity = '1';
                    element.style.transform = 'translateY(0)';
                }, 10);
                
                _currentChatsElements.friends.set(fid, element);
                console.log(`✨ تم إضافة صديق جديد: ${f.name}`);
            } 
        } catch (e) {
            console.warn('خطأ في تحميل صديق:', e);
        }
    }
    
    // ✅ 6. إدارة الحالة الفارغة
    updateEmptyState(list);
}

// ==================== ✅ إدارة الحالة الفارغة ====================
function updateEmptyState(list) {
    const hasRequests = _currentChatsElements.requests.size > 0;
    const hasFriends = _currentChatsElements.friends.size > 0;
    
    // ✅ البحث عن حالة فارغة موجودة
    const existingEmpty = list.querySelector('.empty-state');
    
    if (!hasRequests && !hasFriends) {
        // ✅ لا طلبات ولا أصدقاء → عرض الحالة الفارغة
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
        // ✅ يوجد عناصر → إزالة الحالة الفارغة
        if (existingEmpty) {
            existingEmpty.remove();
        }
    }
}

// ==================== مسح وتحديث القائمة (عند الحاجة) ====================
function resetChatsCache() {
    _currentChatsElements.requests.clear();
    _currentChatsElements.friends.clear();
}

// ==================== تأكيد حذف الصديق ====================
window.confirmRemoveFriend = function(friendId, friendName) {
    const confirmed = confirm(`هل أنت متأكد من حذف "${friendName}" من قائمة الأصدقاء؟`);
    if (confirmed) {
        removeFriend(friendId);
    }
};

// ==================== حذف الصديق (مع حذف الرسائل) ====================
window.removeFriend = async function(friendId) {
    if (!window.auth?.currentUser) return;
    try { 
        const uid = window.auth.currentUser.uid; 
        const FieldValue = firebase.firestore.FieldValue;
        
        // 1. حذف الصديق من قائمة المستخدم
        await window.db.collection('users').doc(uid).update({ 
            friends: FieldValue.arrayRemove(friendId) 
        }); 
        
        // 2. حذف المستخدم من قائمة الصديق
        await window.db.collection('users').doc(friendId).update({ 
            friends: FieldValue.arrayRemove(uid) 
        }); 
        
        // 3. حذف رسائل هذا الصديق فقط
        const userKey = `chat_${uid}_${friendId}`;
        localStorage.removeItem(userKey);
        if (typeof ChatSystem !== 'undefined' && ChatSystem.messages) {
            delete ChatSystem.messages[friendId];
        }
        console.log(`🗑️ تم حذف رسائل الصديق ${friendId}`);
        
        // 4. ✅ إزالة فورية من القائمة (بدون إعادة تحميل)
        const element = _currentChatsElements.friends.get(friendId);
        if (element) {
            element.style.opacity = '0';
            element.style.transform = 'translateX(100%)';
            element.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                element.remove();
                _currentChatsElements.friends.delete(friendId);
                const list = document.getElementById('chatsList');
                if (list) updateEmptyState(list);
            }, 300);
        }
        
        console.log(`✅ تم حذف الصديق ${friendId} بنجاح`);
        
    } catch (e) { 
        console.error('❌ خطأ في حذف الصديق:', e);
        alert('حدث خطأ في حذف الصديق'); 
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

// ==================== اختيار الأفاتار ====================
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
        
        // ✅ إعادة تعيين الكاش عند الدخول للدردشة
        if (id === 'chat') {
            resetChatsCache();
            chatsLoaded = false;
            loadChats(true);
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

// ==================== دوال التعديل + العداد ====================

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

// ==================== تهيئة الصفحة ====================
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
