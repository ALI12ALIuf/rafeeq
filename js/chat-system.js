// ========== chat-system.js - النسخة النهائية ==========

const ChatSystem = {
    currentChat: null, messages: {},
    friendInConversation: false,
    chatItemTemplate: null,
    _displayedIds: new Set(),
    _isProcessing: false,
    
    init() { 
        this.loadAllChats(); 
        this.chatItemTemplate = document.getElementById('chatItemTemplate');
    },
    
    loadAllChats() { 
        const uid = window.auth?.currentUser?.uid;
        if (!uid) { this.messages = {}; return; }
        
        this.messages = {};
        const prefix = `chat_${uid}_`;
        
        for (let i = 0; i < localStorage.length; i++) { 
            const k = localStorage.key(i); 
            if (k && k.startsWith(prefix)) { 
                const fid = k.replace(prefix, ''); 
                try { 
                    const data = JSON.parse(localStorage.getItem(k)) || [];
                    const textOnly = data.filter(msg => msg.type === 'text').slice(-25);
                    this.messages[fid] = textOnly;
                } catch (e) { 
                    this.messages[fid] = []; 
                } 
            } 
        }
    },
    
    loadChatMessages(friendId) {
        const uid = window.auth?.currentUser?.uid;
        if (!uid || !friendId) return [];
        
        const key = `chat_${uid}_${friendId}`;
        try {
            const data = JSON.parse(localStorage.getItem(key)) || [];
            const textOnly = data.filter(msg => msg.type === 'text').slice(-25);
            this.messages[friendId] = textOnly;
            return textOnly;
        } catch (e) {
            this.messages[friendId] = [];
            return [];
        }
    },
    
    openChat(friendId, friendName, friendAvatar) {
        if (typeof window.clearUnreadStatus === 'function') {
            window.clearUnreadStatus(friendId);
        }
        
        if (this.currentChat && this.currentChat !== friendId) {
            this.cleanConversationData(this.currentChat, false);
        }
        
        this.currentChat = friendId;
        this.friendInConversation = true;
        this._displayedIds = new Set();
        this._isProcessing = false;
        
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
    
    closeChat() {
        if (typeof window.clearUnreadStatus === 'function' && this.currentChat) {
            window.clearUnreadStatus(this.currentChat);
        }
        
        const chatId = this.currentChat;
        const uid = window.auth?.currentUser?.uid;
        
        if (chatId && uid) {
            const key = `chat_${uid}_${chatId}`;
            const messages = this.messages[chatId] || [];
            const textOnly = messages.filter(msg => msg.type === 'text').slice(-25);
            localStorage.setItem(key, JSON.stringify(textOnly));
            
            const container = document.getElementById('messagesContainer');
            if (container) container.innerHTML = '';
            
            this.messages[chatId] = textOnly;
        }
        
        this._displayedIds = new Set();
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        this.currentChat = null;
        this.friendInConversation = false;
    },
    
    cleanConversationData(chatId, cleanAll = false) {
        const uid = window.auth?.currentUser?.uid;
        if (!uid) return;
        
        const key = `chat_${uid}_${chatId}`;
        
        if (!cleanAll) {
            const messages = this.messages[chatId] || [];
            const textOnly = messages.filter(msg => msg.type === 'text').slice(-25);
            this.messages[chatId] = textOnly;
            localStorage.setItem(key, JSON.stringify(textOnly));
        } else {
            localStorage.removeItem(key);
            delete this.messages[chatId];
        }
        
        const container = document.getElementById('messagesContainer');
        if (container) container.innerHTML = '';
    },
    
    displayMessages(friendId) { 
        if (this._isProcessing) return;
        this._isProcessing = true;
        
        const c = document.getElementById('messagesContainer'); 
        if (!c) { this._isProcessing = false; return; }
        
        if (!this.messages[friendId] || this.messages[friendId].length === 0) {
            this.loadChatMessages(friendId);
        }
        
        if (this._displayedIds.size === 0) c.innerHTML = '';
        
        const messages = this.messages[friendId] || [];
        
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
                if (contentDiv) contentDiv.style.border = `1.5px solid ${borderColor}`;
                if (textSpan) textSpan.innerHTML = this.escapeHtml(msg.text || '');
                div.appendChild(clone);
            }
        }
        
        if (!c.querySelector(`#msg-${msg.id}`)) c.appendChild(div);
        
        setTimeout(() => { c.scrollTop = c.scrollHeight; }, 50);
    },
    
    async sendMessage(text) { 
        if (!this.currentChat || !text.trim()) return false; 
        
        const mid = Date.now().toString(); 
        const messageText = text.trim();
        const chatId = this.currentChat;
        
        const msg = { 
            id: mid, type: 'text', text: messageText, 
            sender: 'me', time: new Date().toISOString()
        };
        
        this.saveMessage(chatId, msg); 
        this.displayMessage(msg); 
        
        // ✅ إعادة الترتيب
        if (typeof window.reorderChatsList === 'function') {
            const list = document.getElementById('chatsList');
            if (list) window.reorderChatsList(list);
        }
        
        this._sendMessageInBackground(chatId, mid, messageText);
        
        return true; 
    },
    
    async _sendMessageInBackground(chatId, messageId, text) {
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(chatId);
            
            if (!myPrivateKey || !receiverPublicKey) return;
            
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(text, sharedKey);
            
            await SecureChatSystem.sendToServer(chatId, { 
                id: messageId, type: 'text', data: encrypted, timestamp: Date.now() 
            });
        } catch (e) { 
            console.error('❌ فشل إرسال الرسالة:', e);
        }
    },

    saveMessage(friendId, message) { 
        if (!friendId || !message) return;
        if (message.type !== 'text') return;
        
        const uid = window.auth?.currentUser?.uid;
        if (!uid) return;
        
        const key = `chat_${uid}_${friendId}`; 
        let messages = []; 
        try { messages = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { messages = []; }
        
        const exists = messages.some(m => m.id === message.id);
        if (exists) return;
        
        messages.push(message); 
        
        if (messages.length > 25) messages = messages.slice(-25);
        
        try { 
            localStorage.setItem(key, JSON.stringify(messages)); 
            this.messages[friendId] = messages;
        } catch (e) {
            console.error('❌ فشل حفظ في localStorage:', e);
        }
    },

    updateLastMessage(friendId, lastMessage) { 
        document.querySelectorAll('.chat-item').forEach(item => { 
            if (item.getAttribute('onclick')?.includes(friendId)) { 
                const lm = item.querySelector('.last-message'), tm = item.querySelector('.chat-time'); 
                if (lm) lm.textContent = lastMessage; 
                if (tm) tm.textContent = 'الآن'; 
            } 
        }); 
    },

    escapeHtml(text) { 
        if (!text) return '';
        const div = document.createElement('div'); 
        div.textContent = text; 
        return div.innerHTML; 
    }
};

ChatSystem.chatItemTemplate = document.getElementById('chatItemTemplate');

window.addEventListener('authReady', function() {
    setTimeout(() => {
        ChatSystem.loadAllChats();
        if (typeof loadChats === 'function') {
            chatsLoaded = false;
            loadChats(true);
        }
    }, 100);
});

if (window.auth?.currentUser) {
    setTimeout(() => ChatSystem.loadAllChats(), 100);
}

window.sendMessage = () => { 
    const inp = document.getElementById('messageInput'); 
    if (inp && inp.value.trim()) {
        ChatSystem.sendMessage(inp.value.trim()).then(s => { 
            if (s) { 
                inp.value = ''; 
                inp.style.height = 'auto';
                if (typeof window.toggleSendButton === 'function') window.toggleSendButton();
            } 
        }); 
    }
};

window.handleMessageKeyPress = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) e.preventDefault();
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
    if (input.value.trim().length > 0) window.sendMessage();
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

function performGlobalCleanup() {
    const container = document.getElementById('messagesContainer');
    if (container) container.innerHTML = '';
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', performGlobalCleanup);
} else {
    performGlobalCleanup();
}

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
        if (!isMessagesContainer) e.preventDefault();
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
