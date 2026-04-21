// ========== نظام الدردشة المتكامل ==========

class ChatManager {
    constructor() {
        this.currentChat = null;
        this.currentUser = null;
        this.chats = new Map(); // peerId -> { messages, userInfo, sharedSecret }
        this.pendingMessages = new Map(); // peerId -> array of pending messages
    }

    // تهيئة مدير الدردشة
    init(user) {
        this.currentUser = user;
    }

    // فتح محادثة مع مستخدم
    async openChat(peerId, peerName, peerAvatar) {
        this.currentChat = peerId;
        
        // إظهار واجهة الدردشة
        document.getElementById('chatArea').style.display = 'flex';
        document.getElementById('noChatSelected').style.display = 'none';
        document.getElementById('chatsSidebar').classList.add('collapsed');
        
        // تحديث معلومات الرأس
        document.getElementById('chatUserName').textContent = peerName;
        document.getElementById('chatAvatar').textContent = peerAvatar;
        
        // مسح الرسائل السابقة
        document.getElementById('messagesContainer').innerHTML = '';
        
        // عرض الرسائل المخزنة محلياً
        this.displayLocalMessages(peerId);
        
        // بدء الاتصال P2P
        await this.establishP2PConnection(peerId);
        
        // تحميل المفتاح المشترك
        await this.loadSharedSecret(peerId);
    }

    // إنشاء اتصال P2P
    async establishP2PConnection(peerId) {
        // التحقق من وجود اتصال مسبق
        if (window.p2pManager.isConnected(peerId)) {
            this.updateConnectionStatus('p2p');
            return;
        }
        
        this.updateConnectionStatus('connecting');
        
        // بدء الاتصال
        await window.p2pManager.startConnection(peerId, {
            onOpen: () => {
                console.log('P2P connection opened with:', peerId);
                this.updateConnectionStatus('p2p');
                
                // إرسال الرسائل المعلقة
                this.sendPendingMessages(peerId);
            },
            onMessage: async (data) => {
                await this.handleIncomingMessage(peerId, data);
            },
            onReady: () => {
                console.log('P2P ready with:', peerId);
                this.updateConnectionStatus('p2p');
            }
        });
    }

    // تحديث حالة الاتصال في الواجهة
    updateConnectionStatus(type) {
        const badge = document.getElementById('connectionBadge');
        const statusDot = badge.querySelector('.status-dot');
        const statusText = badge.querySelector('span:last-child');
        
        if (type === 'p2p') {
            statusDot.style.background = '#4caf50';
            statusText.textContent = 'P2P مشفر 🔒';
        } else if (type === 'connecting') {
            statusDot.style.background = '#ff9800';
            statusText.textContent = 'جاري الاتصال...';
        } else {
            statusDot.style.background = '#f44336';
            statusText.textContent = 'غير متصل';
        }
    }

    // تحميل المفتاح المشترك
    async loadSharedSecret(peerId) {
        try {
            // الحصول على المفتاح العام للطرف الآخر
            const peerDoc = await window.db.collection('users').doc(peerId).get();
            const peerPublicKeyBase64 = peerDoc.data().publicKey;
            const peerPublicKey = await window.cryptoSystem.importPublicKey(peerPublicKeyBase64);
            
            // الحصول على مفتاحي الخاص
            const myKeyPair = window.cryptoSystem.keyPairs.get(this.currentUser.uid);
            
            // توليد السر المشترك
            const sharedSecret = await window.cryptoSystem.deriveSharedSecret(
                myKeyPair.privateKey,
                peerPublicKey
            );
            
            // تخزين السر المشترك
            if (!this.chats.has(peerId)) {
                this.chats.set(peerId, {});
            }
            this.chats.get(peerId).sharedSecret = sharedSecret;
            
            console.log('Shared secret established with:', peerId);
            
        } catch (error) {
            console.error('Error loading shared secret:', error);
        }
    }

    // إرسال رسالة نصية
    async sendTextMessage(message) {
        if (!this.currentChat) return false;
        
        const peerId = this.currentChat;
        const chat = this.chats.get(peerId);
        
        if (!chat || !chat.sharedSecret) {
            console.warn('No shared secret available');
            return false;
        }
        
        try {
            // تشفير الرسالة
            const encrypted = await window.cryptoSystem.encryptMessage(message, chat.sharedSecret);
            
            // إنشاء كائن الرسالة
            const messageObj = {
                id: `${Date.now()}_${Math.random()}`,
                type: 'text',
                content: encrypted,
                sender: this.currentUser.uid,
                timestamp: new Date().toISOString()
            };
            
            // حفظ محلياً
            this.saveLocalMessage(peerId, messageObj);
            
            // عرض في الواجهة
            this.displayMessage(messageObj);
            
            // إرسال عبر P2P
            const sent = await window.p2pManager.sendMessage(peerId, JSON.stringify(messageObj));
            
            if (!sent) {
                // حفظ للإرسال لاحقاً
                this.queuePendingMessage(peerId, messageObj);
            }
            
            return true;
            
        } catch (error) {
            console.error('Error sending message:', error);
            return false;
        }
    }

    // إرسال ملف (صورة، مستند، بصمة)
    async sendFile(file, type = 'file') {
        if (!this.currentChat) return false;
        
        const peerId = this.currentChat;
        const chat = this.chats.get(peerId);
        
        if (!chat || !chat.sharedSecret) {
            console.warn('No shared secret available');
            return false;
        }
        
        try {
            // تشفير الملف
            const encrypted = await window.cryptoSystem.encryptFile(file, chat.sharedSecret);
            
            // إنشاء كائن الرسالة
            const messageObj = {
                id: `${Date.now()}_${Math.random()}`,
                type: type,
                content: encrypted,
                sender: this.currentUser.uid,
                timestamp: new Date().toISOString(),
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type
            };
            
            // حفظ محلياً
            this.saveLocalMessage(peerId, messageObj);
            
            // عرض في الواجهة
            this.displayMessage(messageObj);
            
            // إرسال عبر P2P
            const sent = await window.p2pManager.sendMessage(peerId, JSON.stringify(messageObj));
            
            if (!sent) {
                this.queuePendingMessage(peerId, messageObj);
            }
            
            return true;
            
        } catch (error) {
            console.error('Error sending file:', error);
            return false;
        }
    }

    // معالجة الرسالة الواردة
    async handleIncomingMessage(peerId, rawData) {
        try {
            const messageObj = JSON.parse(rawData);
            const chat = this.chats.get(peerId);
            
            if (!chat || !chat.sharedSecret) {
                console.warn('No shared secret for incoming message');
                return;
            }
            
            let decryptedContent;
            
            if (messageObj.type === 'text') {
                // فك تشفير النص
                decryptedContent = await window.cryptoSystem.decryptMessage(
                    messageObj.content,
                    chat.sharedSecret
                );
                messageObj.content = decryptedContent;
            } else {
                // الملفات تحتاج معالجة خاصة
                messageObj.content.original = await window.cryptoSystem.decryptFile(
                    messageObj.content,
                    chat.sharedSecret
                );
            }
            
            // حفظ في المحلي
            this.saveLocalMessage(peerId, messageObj);
            
            // عرض في الواجهة
            if (this.currentChat === peerId) {
                this.displayMessage(messageObj);
            }
            
            // تحديث قائمة المحادثات
            this.updateChatsList(peerId, messageObj);
            
        } catch (error) {
            console.error('Error handling incoming message:', error);
        }
    }

    // حفظ الرسالة محلياً
    saveLocalMessage(peerId, messageObj) {
        const key = `chat_${peerId}`;
        let history = [];
        
        try {
            history = JSON.parse(localStorage.getItem(key)) || [];
        } catch (e) {
            history = [];
        }
        
        history.push(messageObj);
        
        // الاحتفاظ بآخر 500 رسالة فقط
        if (history.length > 500) {
            history = history.slice(-500);
        }
        
        localStorage.setItem(key, JSON.stringify(history));
        
        if (!this.chats.has(peerId)) {
            this.chats.set(peerId, {});
        }
        this.chats.get(peerId).messages = history;
    }

    // عرض الرسائل المخزنة محلياً
    displayLocalMessages(peerId) {
        const key = `chat_${peerId}`;
        
        try {
            const history = JSON.parse(localStorage.getItem(key)) || [];
            history.forEach(msg => this.displayMessage(msg));
        } catch (e) {
            console.error('Error loading local messages:', e);
        }
    }

    // عرض رسالة في الواجهة
    displayMessage(messageObj) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        
        const isSent = messageObj.sender === this.currentUser.uid;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
        
        const time = new Date(messageObj.timestamp).toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let contentHtml = '';
        
        if (messageObj.type === 'text') {
            contentHtml = `<div class="message-content">${this.escapeHtml(messageObj.content)}</div>`;
        } else if (messageObj.type === 'image') {
            // إنشاء رابط للصورة المفككة
            const blob = new Blob([messageObj.content.original], { type: messageObj.fileType });
            const url = URL.createObjectURL(blob);
            contentHtml = `<img src="${url}" class="message-image" onclick="window.open('${url}')">`;
        } else if (messageObj.type === 'voice') {
            const blob = new Blob([messageObj.content.original], { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            contentHtml = `<audio controls src="${url}" class="message-audio"></audio>`;
        } else if (messageObj.type === 'file') {
            const blob = new Blob([messageObj.content.original], { type: messageObj.fileType });
            const url = URL.createObjectURL(blob);
            contentHtml = `
                <div class="file-message">
                    <i class="fas fa-file"></i>
                    <span>${messageObj.fileName}</span>
                    <button onclick="window.open('${url}')">تحميل</button>
                </div>
            `;
        }
        
        messageDiv.innerHTML = `
            ${contentHtml}
            <div class="message-info">
                <span class="message-time">${time}</span>
                ${isSent ? '<span class="message-status">✓✓</span>' : ''}
            </div>
        `;
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    }

    // إضافة رسالة لقائمة الانتظار
    queuePendingMessage(peerId, messageObj) {
        if (!this.pendingMessages.has(peerId)) {
            this.pendingMessages.set(peerId, []);
        }
        this.pendingMessages.get(peerId).push(messageObj);
    }

    // إرسال الرسائل المعلقة
    async sendPendingMessages(peerId) {
        const pending = this.pendingMessages.get(peerId) || [];
        
        for (const message of pending) {
            const sent = await window.p2pManager.sendMessage(peerId, JSON.stringify(message));
            if (sent) {
                // إزالة من قائمة الانتظار
                this.pendingMessages.set(peerId, this.pendingMessages.get(peerId).filter(m => m.id !== message.id));
            }
        }
    }

    // تحديث قائمة المحادثات
    updateChatsList(peerId, lastMessage) {
        if (window.loadChats) {
            window.loadChats();
        }
    }

    // إغلاق المحادثة الحالية
    closeChat() {
        this.currentChat = null;
        document.getElementById('chatArea').style.display = 'none';
        document.getElementById('noChatSelected').style.display = 'flex';
        document.getElementById('chatsSidebar').classList.remove('collapsed');
    }

    // مساعدة: تنصير النص
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// إنشاء نسخة عامة
window.chatManager = new ChatManager();
console.log('✅ Chat manager initialized');
