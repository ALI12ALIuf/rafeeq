// ========== chat-system.js - النسخة النهائية (معزول + تحميل صحيح) ==========
// نظام الدردشة E2EE - نصوص فقط - كل حساب معزول في localStorage

const ChatSystem = {
    currentChat: null, messages: {},
    friendInConversation: false,
    chatItemTemplate: null,
    _displayedIds: new Set(),
    _isProcessing: false,
    
    // ==================== القسم 1: init ====================
    init() { 
        this.loadAllChats(); 
        this.chatItemTemplate = document.getElementById('chatItemTemplate');
        if (!this.chatItemTemplate) {
            console.warn('⚠️ قالب chatItemTemplate غير موجود في HTML');
        } else {
            console.log('✅ تم تحميل قالب chatItemTemplate بنجاح');
        }
    },
    
    // ==================== القسم 2: loadAllChats (معزول لكل حساب) ====================
    loadAllChats() { 
        const uid = window.auth?.currentUser?.uid;
        if (!uid) {
            console.warn('⚠️ لا يوجد مستخدم مسجل - تخطي تحميل الرسائل');
            this.messages = {};
            return;
        }
        
        this.messages = {};
        
        const prefix = `chat_${uid}_`;
        let loadedCount = 0;
        
        for (let i = 0; i < localStorage.length; i++) { 
            const k = localStorage.key(i); 
            if (k && k.startsWith(prefix)) { 
                const fid = k.replace(prefix, ''); 
                try { 
                    const data = JSON.parse(localStorage.getItem(k)) || [];
                    const textOnly = data.filter(msg => msg.type === 'text').slice(-25);
                    this.messages[fid] = textOnly;
                    loadedCount++;
                    
                    if (textOnly.length !== data.length) {
                        localStorage.setItem(k, JSON.stringify(textOnly));
                        console.log(`🧹 تم حذف ${data.length - textOnly.length} رسالة غير نصية من ${fid}`);
                    }
                } catch (e) { 
                    this.messages[fid] = []; 
                } 
            } 
        }
        
        console.log(`✅ تم تحميل ${loadedCount} محادثة للمستخدم ${uid.substring(0, 8)}...`);
    },
    
    // ==================== القسم 2.1: loadChatMessages (تحميل رسائل صديق معين) ====================
    loadChatMessages(friendId) {
        const uid = window.auth?.currentUser?.uid;
        if (!uid || !friendId) return [];
        
        const key = `chat_${uid}_${friendId}`;
        try {
            const data = JSON.parse(localStorage.getItem(key)) || [];
            const textOnly = data.filter(msg => msg.type === 'text').slice(-25);
            this.messages[friendId] = textOnly;
            console.log(`✅ تم تحميل ${textOnly.length} رسالة للصديق ${friendId}`);
            return textOnly;
        } catch (e) {
            this.messages[friendId] = [];
            return [];
        }
    },
    
    // ==================== القسم 3: openChat (مع تحميل فوري) ====================
    openChat(friendId, friendName, friendAvatar) {
        if (this.currentChat && this.currentChat !== friendId) {
            console.log('🧹 تنظيف المحادثة السابقة:', this.currentChat);
            this.cleanConversationData(this.currentChat, false);
        }
        
        this.currentChat = friendId;
        this.friendInConversation = true;
        this._displayedIds = new Set();
        this._isProcessing = false;
        
        // ✅ تحميل رسائل هذا الصديق مباشرة
        this.loadChatMessages(friendId);
        
        document.body.classList.add('conversation-open');
        const nameEl = document.getElementById('conversationName'), avatarEl = document.getElementById('conversationAvatar');
        if (nameEl) nameEl.textContent = friendName;
        if (avatarEl) avatarEl.textContent = friendAvatar || '👤';
        document.querySelector('.chat-page').style.display = 'none'; 
        document.getElementById('conversationPage').style.display = 'flex';
        
        this.displayMessages(friendId);
        
        setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
    },
    
    // ==================== القسم 4: closeChat ====================
    closeChat() {
        console.log('🔴 closeChat - بدء إغلاق المحادثة');
        const chatId = this.currentChat;
        const uid = window.auth?.currentUser?.uid;
        
        if (chatId && uid) {
            const key = `chat_${uid}_${chatId}`;
            const messages = this.messages[chatId] || [];
            const textOnly = messages.filter(msg => msg.type === 'text').slice(-25);
            localStorage.setItem(key, JSON.stringify(textOnly));
            console.log(`✅ تم حفظ ${textOnly.length} رسالة نصية فقط`);
            
            const container = document.getElementById('messagesContainer');
            if (container) {
                container.innerHTML = '';
            }
            
            this.messages[chatId] = textOnly;
        }
        
        this._displayedIds = new Set();
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        this.currentChat = null;
        this.friendInConversation = false;
        console.log('✅ closeChat - انتهى');
    },
    
    // ==================== القسم 5: cleanConversationData ====================
    cleanConversationData(chatId, cleanAll = false) {
        console.log('🧹 بدء مسح بيانات المحادثة:', chatId);
        const uid = window.auth?.currentUser?.uid;
        if (!uid) return;
        
        const key = `chat_${uid}_${chatId}`;
        
        if (!cleanAll) {
            const messages = this.messages[chatId] || [];
            const textOnly = messages.filter(msg => msg.type === 'text').slice(-25);
            this.messages[chatId] = textOnly;
            localStorage.setItem(key, JSON.stringify(textOnly));
            console.log(`✅ تم الاحتفاظ بـ ${textOnly.length} رسالة نصية فقط`);
        } else {
            localStorage.removeItem(key);
            delete this.messages[chatId];
            console.log('✅ تم مسح localStorage بالكامل');
        }
        
        const container = document.getElementById('messagesContainer');
        if (container) {
            container.innerHTML = '';
        }
        
        console.log('✅ اكتمل مسح بيانات المحادثة:', chatId);
    },
    
    // ==================== القسم 6: displayMessages (مع تحميل احتياطي) ====================
    displayMessages(friendId) { 
        if (this._isProcessing) return;
        this._isProcessing = true;
        
        const c = document.getElementById('messagesContainer'); 
        if (!c) {
            this._isProcessing = false;
            return; 
        }
        
        // ✅ تحميل الرسائل من localStorage إذا كانت فارغة
        if (!this.messages[friendId] || this.messages[friendId].length === 0) {
            console.log(`📂 تحميل احتياطي للرسائل من localStorage للصديق ${friendId}`);
            this.loadChatMessages(friendId);
        }
        
        if (this._displayedIds.size === 0) {
            c.innerHTML = '';
        }
        
        const messages = this.messages[friendId] || [];
        console.log(`📨 عرض ${messages.length} رسالة للمحادثة ${friendId}`);
        
        messages.forEach(msg => { 
            if (!this._displayedIds.has(msg.id)) {
                this.displayMessage(msg);
            }
        });
        
        setTimeout(() => {
            c.scrollTop = c.scrollHeight;
            this._isProcessing = false;
        }, 50);
    },

    // ==================== القسم 7: displayMessage ====================
    displayMessage(msg) {
        if (this._displayedIds.has(msg.id)) return;
        this._displayedIds.add(msg.id);
        
        const c = document.getElementById('messagesContainer'); 
        if (!c) return;
        
        const borderColor = msg.sender === 'me' ? '#2196F3' : '#4CAF50';
        
        const template = document.getElementById('messageWrapperTemplate');
        let div;
        if (template) {
            div = template.content.cloneNode(true).firstElementChild;
        } else {
            div = document.createElement('div');
            div.className = 'message';
        }
        
        div.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`;
        div.id = `msg-${msg.id}`;
        
        if (msg.type === 'text') {
            const textTemplate = document.getElementById('textMessageTemplate');
            if (textTemplate) {
                const clone = textTemplate.content.cloneNode(true);
                const contentDiv = clone.querySelector('.message-content');
                const textSpan = contentDiv?.querySelector('span');
                if (contentDiv) {
                    contentDiv.style.border = `1.5px solid ${borderColor}`;
                }
                if (textSpan) {
                    textSpan.innerHTML = this.escapeHtml(msg.text || '');
                }
                div.appendChild(clone);
            }
        }
        
        if (!c.querySelector(`#msg-${msg.id}`)) {
            c.appendChild(div);
        }
        
        setTimeout(() => {
            c.scrollTop = c.scrollHeight;
        }, 50);
    },
    
    // ==================== القسم 12: sendMessage ====================
    async sendMessage(text) { 
        if (!this.currentChat || !text.trim()) return false; 
        
        const mid = Date.now().toString(); 
        const messageText = text.trim();
        const chatId = this.currentChat;
        
        const msg = { 
            id: mid, 
            type: 'text', 
            text: messageText, 
            sender: 'me', 
            time: new Date().toISOString()
        };
        
        this.saveMessage(chatId, msg); 
        this.displayMessage(msg); 
        
        console.log('⚡ تم عرض الرسالة فوراً - جاري الإرسال في الخلفية');
        
        this._sendMessageInBackground(chatId, mid, messageText);
        
        return true; 
    },
    
    async _sendMessageInBackground(chatId, messageId, text) {
        try {
            console.log(`📤 بدء إرسال الرسالة ${messageId} في الخلفية...`);
            
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(chatId);
            
            if (!myPrivateKey || !receiverPublicKey) {
                console.error('❌ فشل الحصول على المفاتيح');
                return;
            }
            
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(text, sharedKey);
            
            await SecureChatSystem.sendToServer(chatId, { 
                id: messageId, 
                type: 'text', 
                data: encrypted, 
                timestamp: Date.now() 
            });
            
            console.log(`✅ تم إرسال الرسالة ${messageId} بنجاح`);
            
        } catch (e) { 
            console.error('❌ فشل إرسال الرسالة في الخلفية:', e);
        }
    },

    // ==================== القسم 14: saveMessage ====================
    saveMessage(friendId, message) { 
        if (!friendId || !message) return;
        
        if (message.type !== 'text') {
            console.log(`🚫 نوع الرسالة (${message.type}) غير مدعوم - النصوص فقط`);
            return;
        }
        
        const uid = window.auth?.currentUser?.uid;
        if (!uid) {
            console.warn('⚠️ لا يوجد مستخدم مسجل');
            return;
        }
        
        const key = `chat_${uid}_${friendId}`; 
        let messages = []; 
        try { 
            messages = JSON.parse(localStorage.getItem(key)) || []; 
        } catch (e) { 
            messages = []; 
        }
        
        const exists = messages.some(m => m.id === message.id);
        if (exists) {
            console.log(`⚠️ رسالة مكررة ${message.id}، تم تخطيها`);
            return;
        }
        
        messages.push(message); 
        
        if (messages.length > 25) {
            messages = messages.slice(-25);
            console.log(`🧹 تم الاقتصار على آخر 25 رسالة`);
        }
        
        try { 
            localStorage.setItem(key, JSON.stringify(messages)); 
            this.messages[friendId] = messages;
            console.log(`✅ تم حفظ رسالة نصية (${message.id})`);
        } catch (e) {
            console.error('❌ فشل حفظ في localStorage:', e);
        }
    },

    // ==================== القسم 15: updateLastMessage ====================
    updateLastMessage(friendId, lastMessage) { 
        document.querySelectorAll('.chat-item').forEach(item => { 
            if (item.getAttribute('onclick')?.includes(friendId)) { 
                const lm = item.querySelector('.last-message'), tm = item.querySelector('.chat-time'); 
                if (lm) lm.textContent = lastMessage; 
                if (tm) tm.textContent = 'الآن'; 
            } 
        }); 
    },

    // ==================== القسم 16: escapeHtml ====================
    escapeHtml(text) { 
        if (!text) return '';
        const div = document.createElement('div'); 
        div.textContent = text; 
        return div.innerHTML; 
    },
    
    // ==================== القسم 17: مسح كل رسائل المستخدم ====================
    clearAllMyMessages() {
        const uid = window.auth?.currentUser?.uid;
        if (!uid) return;
        
        const confirmDelete = confirm('هل أنت متأكد من مسح جميع رسائلك؟ لا يمكن التراجع.');
        if (!confirmDelete) return;
        
        const prefix = `chat_${uid}_`;
        let count = 0;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                localStorage.removeItem(key);
                count++;
            }
        }
        
        this.messages = {};
        console.log(`🗑️ تم مسح ${count} محادثة`);
        alert(`✅ تم مسح ${count} محادثة`);
        
        setTimeout(() => location.reload(), 500);
    }
};

// ==================== تشغيل النظام ====================
ChatSystem.chatItemTemplate = document.getElementById('chatItemTemplate');

// ✅ تحميل الرسائل بعد تسجيل الدخول
window.addEventListener('authReady', function() {
    console.log('✅ authReady - تحميل الرسائل');
    setTimeout(() => {
        ChatSystem.loadAllChats();
        if (typeof loadChats === 'function') {
            chatsLoaded = false;
            loadChats(true);
        }
    }, 100);
});

// ✅ إذا كان المستخدم مسجلاً بالفعل
if (window.auth?.currentUser) {
    setTimeout(() => ChatSystem.loadAllChats(), 100);
}

// ==================== دوال الواجهة العامة ====================
window.sendMessage = () => { 
    const inp = document.getElementById('messageInput'); 
    if (inp && inp.value.trim()) {
        ChatSystem.sendMessage(inp.value.trim()).then(s => { 
            if (s) { 
                inp.value = ''; 
                inp.style.height = 'auto';
                if (typeof window.toggleSendButton === 'function') {
                    window.toggleSendButton();
                }
            } 
        }); 
    }
};

window.handleMessageKeyPress = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
    }
};

window.toggleSendButton = function() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('actionBtn');
    if (!input || !btn) return;
    
    btn.className = 'send-mode';
    btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    btn.title = 'إرسال';
    btn.style.background = 'var(--primary)';
    btn.style.color = 'white';
    btn.style.display = 'flex';
};

window.handleActionButton = function() {
    const input = document.getElementById('messageInput');
    if (!input) return;
    const hasText = input.value.trim().length > 0;
    if (hasText) {
        window.sendMessage();
    }
};

window.closeConversation = () => { 
    ChatSystem.closeChat();
    
    setTimeout(() => {
        const lastPage = popPage();
        document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
        document.querySelectorAll('.profile-subpage').forEach(s => s.style.display = 'none');
        document.body.classList.remove('profile-subpage-open');
        
        if (lastPage && lastPage.type === 'subpage') {
            document.body.classList.add('profile-subpage-open');
            document.querySelector('.profile-page').style.display = 'none';
            if (lastPage.id && document.getElementById(lastPage.id)) {
                document.getElementById(lastPage.id).style.display = 'block';
            }
            document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); if (n.dataset.page === 'profile') n.classList.add('active'); });
        } else if (lastPage && lastPage.type === 'page' && lastPage.id === 'profile') {
            document.querySelector('.profile-page').classList.add('active');
            document.querySelector('.profile-page').style.display = 'block';
            document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); if (n.dataset.page === 'profile') n.classList.add('active'); });
        } else {
            document.querySelector('.chat-page').classList.add('active');
            document.querySelector('.chat-page').style.display = 'block';
            if (typeof loadChats === 'function') loadChats();
            document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); if (n.dataset.page === 'chat') n.classList.add('active'); });
        }
    }, 200);
};

window.openChat = friendId => {
    if (document.getElementById('friendsPage') && document.getElementById('friendsPage').style.display === 'block') {
        pushPage('subpage', 'friendsPage');
    } else if (document.getElementById('tripsPage') && document.getElementById('tripsPage').style.display === 'block') {
        pushPage('subpage', 'tripsPage');
    } else if (document.querySelector('.profile-page') && getComputedStyle(document.querySelector('.profile-page')).display === 'block') {
        pushPage('page', 'profile');
    } else {
        pushPage('page', 'chat');
    }
    
    window.db.collection('users').doc(friendId).get().then(doc => {
        if (doc.exists) {
            const f = doc.data();
            ChatSystem.openChat(friendId, f.name, window.getEmojiForUser ? window.getEmojiForUser(f) : '🧔🏻‍♂️');
        }
    }).catch(() => {});
};

// ==================== التنظيف الشامل ====================
function performGlobalCleanup() {
    console.log('🧹 بدء التنظيف الشامل للموقع...');
    
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.innerHTML = '';
    }
    
    console.log('✅ اكتمل التنظيف الشامل للموقع');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', performGlobalCleanup);
} else {
    performGlobalCleanup();
}

// ==================== إصلاح الكيبورد ====================
const initVisualViewportFix = () => {
    if (!window.visualViewport) return;
    const fixViewportHeight = () => {
        const conversationPage = document.querySelector('.conversation-page');
        const messagesContainer = document.querySelector('.messages-container');
        if (conversationPage && document.body.classList.contains('conversation-open')) {
            const currentViewportHeight = window.visualViewport.height;
            conversationPage.style.height = `${currentViewportHeight}px`;
            if (messagesContainer) {
                setTimeout(() => { messagesContainer.scrollTop = messagesContainer.scrollHeight; }, 30);
            }
        }
    };
    window.visualViewport.addEventListener('resize', fixViewportHeight);
    window.visualViewport.addEventListener('scroll', fixViewportHeight);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVisualViewportFix);
} else {
    initVisualViewportFix();
}

document.addEventListener('touchmove', function(e) {
    if (document.body.classList.contains('conversation-open')) {
        const isMessagesContainer = e.target.closest('.messages-container');
        if (!isMessagesContainer) {
            e.preventDefault();
        }
    }
}, { passive: false });

document.addEventListener('touchstart', function (e) {
    if (e.touches.length > 1) { e.preventDefault(); }
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', function (e) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) { e.preventDefault(); }
    lastTouchEnd = now;
}, { passive: false });
