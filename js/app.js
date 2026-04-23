document.addEventListener('DOMContentLoaded', () => {
    console.log('App loaded, setting up navigation...');
    ensureSinglePage();
    setupNavigation();
    setupModals();
    loadChats();
    setupChatListeners();
    setupCryptoKeys();
    
    updateTripsCount();
});

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
}

async function updateTripsCount() {
    if (!window.auth || !window.auth.currentUser) return;
    try {
        const snapshot = await window.db.collection('trips')
            .where('userId', '==', window.auth.currentUser.uid)
            .where('status', '==', 'ended')
            .get();
        const tripsCount = document.getElementById('tripsCount');
        if (tripsCount) tripsCount.textContent = formatNumber(snapshot.size);
    } catch (error) {
        console.error('Error updating trips count:', error);
    }
}

function ensureSinglePage() {
    const pages = document.querySelectorAll('.page');
    const subpages = document.querySelectorAll('.profile-subpage');
    subpages.forEach(page => page.style.display = 'none');
    pages.forEach(page => {
        page.style.display = page.classList.contains('active') ? 'block' : 'none';
    });
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');
    
    if (!navItems.length || !pages.length) return;
    
    function switchPage(pageId) {
        pages.forEach(page => page.classList.remove('active'));
        const targetPage = document.querySelector(`.page.${pageId}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
            targetPage.style.display = 'block';
        }
        pages.forEach(page => {
            if (!page.classList.contains('active')) page.style.display = 'none';
        });
        document.querySelectorAll('.profile-subpage').forEach(sp => sp.style.display = 'none');
        if (pageId === 'chat') loadChats();
        
        const conversationPage = document.getElementById('conversationPage');
        if (conversationPage) {
            conversationPage.style.display = 'none';
            document.body.classList.remove('conversation-open');
        }
        
        navItems.forEach(item => item.classList.toggle('active', item.dataset.page === pageId));
    }
    
    navItems.forEach(item => item.addEventListener('click', () => switchPage(item.dataset.page)));
}

function setupModals() {
    window.openLanguageModal = () => {
        document.getElementById('languageModal')?.classList.add('active');
    };
    
    window.closeModal = () => {
        document.querySelectorAll('.modal').forEach(modal => modal.classList.remove('active'));
    };
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
    
    document.querySelectorAll('.settings-item').forEach(item => {
        if (item.querySelector('[data-i18n="language"]')) {
            item.addEventListener('click', openLanguageModal);
        }
    });
}

// ========== نظام التشفير E2EE ==========

const CryptoSystem = {
    async generateKeyPair() {
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256"
            },
            true,
            ["encrypt", "decrypt"]
        );
        return keyPair;
    },
    
    async exportPublicKey(key) {
        const exported = await window.crypto.subtle.exportKey("spki", key);
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    },
    
    async importPublicKey(base64Key) {
        try {
            const binaryKey = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
            return await window.crypto.subtle.importKey(
                "spki",
                binaryKey,
                { name: "RSA-OAEP", hash: "SHA-256" },
                true,
                ["encrypt"]
            );
        } catch (e) {
            console.error('فشل استيراد المفتاح العام:', e);
            return null;
        }
    },
    
    async exportPrivateKey(key) {
        const exported = await window.crypto.subtle.exportKey("pkcs8", key);
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    },
    
    async importPrivateKey(base64Key) {
        try {
            const binaryKey = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
            return await window.crypto.subtle.importKey(
                "pkcs8",
                binaryKey,
                { name: "RSA-OAEP", hash: "SHA-256" },
                false,
                ["decrypt"]
            );
        } catch (e) {
            console.error('فشل استيراد المفتاح الخاص:', e);
            return null;
        }
    },
    
    async generateSessionKey() {
        return await window.crypto.subtle.generateKey(
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    },
    
    async encryptMessage(message, receiverPublicKey) {
        try {
            const sessionKey = await this.generateSessionKey();
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encodedMessage = new TextEncoder().encode(message);
            
            const encryptedContent = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                sessionKey,
                encodedMessage
            );
            
            const rawSessionKey = await window.crypto.subtle.exportKey("raw", sessionKey);
            const encryptedSessionKey = await window.crypto.subtle.encrypt(
                { name: "RSA-OAEP" },
                receiverPublicKey,
                rawSessionKey
            );
            
            return {
                content: btoa(String.fromCharCode(...new Uint8Array(encryptedContent))),
                key: btoa(String.fromCharCode(...new Uint8Array(encryptedSessionKey))),
                iv: btoa(String.fromCharCode(...iv)),
                version: 1
            };
        } catch (error) {
            console.error('Encryption error:', error);
            return null;
        }
    },
    
    async decryptMessage(encryptedPackage, privateKey) {
        try {
            const encryptedKey = Uint8Array.from(atob(encryptedPackage.key), c => c.charCodeAt(0));
            const rawSessionKey = await window.crypto.subtle.decrypt(
                { name: "RSA-OAEP" },
                privateKey,
                encryptedKey
            );
            
            const sessionKey = await window.crypto.subtle.importKey(
                "raw",
                rawSessionKey,
                { name: "AES-GCM" },
                false,
                ["decrypt"]
            );
            
            const iv = Uint8Array.from(atob(encryptedPackage.iv), c => c.charCodeAt(0));
            const encryptedContent = Uint8Array.from(atob(encryptedPackage.content), c => c.charCodeAt(0));
            
            const decryptedContent = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                sessionKey,
                encryptedContent
            );
            
            return new TextDecoder().decode(decryptedContent);
        } catch (error) {
            console.error('Decryption error:', error);
            return null;
        }
    },
    
    async compressImage(file) {
        return new Promise((resolve) => {
            const img = new Image();
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            img.onload = () => {
                const maxSize = 800;
                let width = img.width;
                let height = img.height;
                
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = (height / width) * maxSize;
                        width = maxSize;
                    } else {
                        width = (width / height) * maxSize;
                        height = maxSize;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', 0.7);
            };
            
            img.src = URL.createObjectURL(file);
        });
    },
    
    blobToBase64(blob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    },
    
    async encryptFile(file, receiverPublicKey) {
        const base64 = await this.blobToBase64(file);
        return await this.encryptMessage(base64, receiverPublicKey);
    }
};

// ========== إعداد مفاتيح التشفير ==========

async function setupCryptoKeys() {
    if (!window.auth || !window.auth.currentUser) return;
    
    const currentUser = window.auth.currentUser;
    const userDoc = await window.db.collection('users').doc(currentUser.uid).get();
    const userData = userDoc.data();
    
    if (!userData.publicKey) {
        const keyPair = await CryptoSystem.generateKeyPair();
        const publicKey = await CryptoSystem.exportPublicKey(keyPair.publicKey);
        const privateKey = await CryptoSystem.exportPrivateKey(keyPair.privateKey);
        
        await window.db.collection('users').doc(currentUser.uid).update({
            publicKey: publicKey
        });
        
        localStorage.setItem(`private_key_${currentUser.uid}`, privateKey);
        console.log('✅ تم إنشاء مفاتيح التشفير');
    }
}

async function getMyPrivateKey() {
    if (!window.auth || !window.auth.currentUser) return null;
    const privateKeyBase64 = localStorage.getItem(`private_key_${window.auth.currentUser.uid}`);
    if (!privateKeyBase64) return null;
    return await CryptoSystem.importPrivateKey(privateKeyBase64);
}

// ========== نظام الدردشة المشفر ==========

const ChatSystem = {
    currentChat: null,
    messages: {},
    
    init() {
        this.loadAllChats();
        this.setupOnlinePresence();
    },
    
    setupOnlinePresence() {
        if (!window.auth?.currentUser) return;
        
        const userStatusRef = window.db.collection('users').doc(window.auth.currentUser.uid);
        
        userStatusRef.update({
            online: true,
            lastSeen: new Date()
        }).catch(() => {});
        
        window.addEventListener('beforeunload', () => {
            userStatusRef.update({
                online: false,
                lastSeen: new Date()
            });
        });
    },
    
    async isUserOnline(userId) {
        try {
            const doc = await window.db.collection('users').doc(userId).get();
            return doc.data()?.online || false;
        } catch {
            return false;
        }
    },
    
    loadAllChats() {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('chat_')) {
                const friendId = key.replace('chat_', '');
                try {
                    this.messages[friendId] = JSON.parse(localStorage.getItem(key)) || [];
                } catch (e) {
                    this.messages[friendId] = [];
                }
            }
        }
    },
    
    async openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId;
        
        document.body.classList.add('conversation-open');
        
        const nameElement = document.getElementById('conversationName');
        const avatarElement = document.getElementById('conversationAvatar');
        const statusElement = document.getElementById('conversationStatus');
        
        if (nameElement) nameElement.textContent = friendName;
        if (avatarElement) avatarElement.textContent = friendAvatar || '👤';
        
        const isOnline = await this.isUserOnline(friendId);
        if (statusElement) {
            statusElement.textContent = isOnline ? 'متصل الآن' : 'آخر زيارة اليوم';
            statusElement.style.color = isOnline ? '#4CAF50' : '';
        }
        
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'flex';
        
        await this.displayMessages(friendId);
        this.listenForNewMessages(friendId);
        
        setTimeout(() => {
            const input = document.getElementById('messageInput');
            if (input) input.focus();
        }, 300);
    },
    
    async displayMessages(friendId) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        container.innerHTML = '';
        
        const messages = this.messages[friendId] || [];
        const privateKey = await getMyPrivateKey();
        
        for (const msg of messages) {
            await this.displayMessage(msg, privateKey);
        }
        
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    },
    
    async displayMessage(msg, privateKey) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`;
        messageDiv.id = `msg-${msg.id}`;
        
        const time = new Date(msg.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        
        let statusHtml = '';
        if (msg.sender === 'me') {
            let statusIcon = '✓';
            let statusClass = 'sent';
            if (msg.status === 'sending') { statusIcon = '⏳'; statusClass = 'sending'; }
            else if (msg.status === 'delivered') { statusIcon = '✓✓'; statusClass = 'delivered'; }
            else if (msg.status === 'read') { statusIcon = '✓✓'; statusClass = 'read'; }
            statusHtml = `<span class="message-status ${statusClass}">${statusIcon}</span>`;
        }
        
        let displayContent = '';
        let mediaUrl = '';
        
        if (msg.sender === 'me' && msg.plainText) {
            displayContent = msg.plainText;
            mediaUrl = msg.plainData;
        } else if (msg.encrypted && privateKey) {
            try {
                const decrypted = await CryptoSystem.decryptMessage(msg.encrypted, privateKey);
                if (msg.type === 'encrypted_text') {
                    displayContent = decrypted;
                } else {
                    mediaUrl = decrypted;
                }
            } catch (e) {
                displayContent = '🔒 تعذر فك التشفير';
            }
        }
        
        if (msg.type === 'encrypted_text' || msg.type === 'text') {
            messageDiv.innerHTML = `
                <div class="message-content">${this.escapeHtml(displayContent || msg.text || '')}</div>
                <div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>
            `;
        } else if (msg.type.includes('image')) {
            messageDiv.innerHTML = `
                <img src="${mediaUrl}" class="message-image" onclick="window.open('${mediaUrl}')">
                <div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>
            `;
        } else if (msg.type.includes('voice')) {
            messageDiv.innerHTML = `
                <audio controls src="${mediaUrl}" class="message-audio"></audio>
                <div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>
            `;
        } else if (msg.type.includes('video')) {
            messageDiv.innerHTML = `
                <video controls src="${mediaUrl}" class="message-video" style="max-width:250px;max-height:250px;"></video>
                <div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>
            `;
        } else if (msg.type.includes('file')) {
            messageDiv.innerHTML = `
                <div class="message-content"><a href="${mediaUrl}" download="${msg.fileName}">📁 ${msg.fileName}</a></div>
                <div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>
            `;
        }
        
        container.appendChild(messageDiv);
    },
    
    async sendMessage(text, type = 'text', file = null) {
        if (!this.currentChat) {
            alert('الرجاء فتح محادثة أولاً');
            return false;
        }
        
        const messageId = Date.now().toString();
        const receiverDoc = await window.db.collection('users').doc(this.currentChat).get();
        const receiverData = receiverDoc.data();
        
        if (!receiverData.publicKey) {
            console.error('المستخدم ليس لديه مفتاح عام');
            alert('المستخدم ليس لديه مفتاح تشفير');
            return false;
        }
        
        const receiverPublicKey = await CryptoSystem.importPublicKey(receiverData.publicKey);
        if (!receiverPublicKey) return false;
        
        let message = {
            id: messageId,
            type: 'encrypted_' + type,
            sender: 'me',
            time: new Date().toISOString(),
            status: 'sending'
        };
        
        // تجهيز المحتوى
        let contentToEncrypt = text;
        if (type === 'text') {
            message.plainText = text;
            contentToEncrypt = text;
        } else if (file) {
            const base64 = await CryptoSystem.blobToBase64(file);
            message.plainData = base64;
            message.fileName = file.name;
            contentToEncrypt = base64;
        }
        
        // تشفير
        message.encrypted = await CryptoSystem.encryptMessage(contentToEncrypt, receiverPublicKey);
        if (!message.encrypted) return false;
        
        const privateKey = await getMyPrivateKey();
        await this.displayMessage(message, privateKey);
        this.saveMessage(this.currentChat, message);
        this.updateMessageStatus(messageId, 'sent');
        
        // إرسال للسيرفر
        try {
            const isReceiverOnline = await this.isUserOnline(this.currentChat);
            const messageData = {
                to: this.currentChat,
                from: window.auth.currentUser.uid,
                message: {
                    id: message.id,
                    type: message.type,
                    encrypted: message.encrypted,
                    sender: message.sender,
                    time: message.time,
                    fileName: message.fileName
                },
                timestamp: new Date()
            };
            
            if (!isReceiverOnline) {
                messageData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            }
            
            const docRef = await window.db.collection('temp_messages').add(messageData);
            
            if (isReceiverOnline) {
                this.waitForDeliveryAndDelete(messageId, docRef.id);
            }
        } catch (error) {
            console.error('خطأ في الإرسال:', error);
            this.updateMessageStatus(messageId, 'error');
        }
        
        return true;
    },
    
    updateMessageStatus(messageId, status) {
        const messageElement = document.getElementById(`msg-${messageId}`);
        if (!messageElement) return;
        
        const statusElement = messageElement.querySelector('.message-status');
        if (!statusElement) return;
        
        statusElement.className = `message-status ${status}`;
        if (status === 'sending') statusElement.innerHTML = '⏳';
        else if (status === 'sent') statusElement.innerHTML = '✓';
        else if (status === 'delivered') statusElement.innerHTML = '✓✓';
        else if (status === 'read') { statusElement.innerHTML = '✓✓'; statusElement.style.color = '#4fc3f7'; }
        else if (status === 'error') { statusElement.innerHTML = '⚠️'; statusElement.style.color = '#f44336'; }
        
        const key = `chat_${this.currentChat}`;
        try {
            let history = JSON.parse(localStorage.getItem(key)) || [];
            history = history.map(msg => msg.id === messageId ? { ...msg, status } : msg);
            localStorage.setItem(key, JSON.stringify(history));
            this.messages[this.currentChat] = history;
        } catch (e) {}
    },
    
    waitForDeliveryAndDelete(messageId, firebaseDocId) {
        const unsubscribe = window.db.collection('temp_messages').doc(firebaseDocId)
            .onSnapshot(async (doc) => {
                if (doc.exists && doc.data().delivered) {
                    this.updateMessageStatus(messageId, 'delivered');
                    await window.db.collection('temp_messages').doc(firebaseDocId).delete();
                    unsubscribe();
                }
            });
    },
    
    saveMessage(friendId, message) {
        const key = `chat_${friendId}`;
        let history = [];
        try { history = JSON.parse(localStorage.getItem(key)) || []; } catch (e) {}
        
        const existingIndex = history.findIndex(m => m.id === message.id);
        if (existingIndex >= 0) history[existingIndex] = message;
        else history.push(message);
        
        if (history.length > 200) history = history.slice(-200);
        localStorage.setItem(key, JSON.stringify(history));
        this.messages[friendId] = history;
    },
    
    listenForNewMessages(friendId) {
        if (!window.auth?.currentUser) return;
        
        window.db.collection('temp_messages')
            .where('from', '==', friendId)
            .where('to', '==', window.auth.currentUser.uid)
            .onSnapshot(async (snapshot) => {
                const privateKey = await getMyPrivateKey();
                
                for (const change of snapshot.docChanges()) {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        const docRef = change.doc.ref;
                        
                        await docRef.update({ delivered: true, deliveredAt: new Date() });
                        
                        const message = { ...data.message, sender: 'friend', status: 'delivered' };
                        this.saveMessage(friendId, message);
                        
                        if (this.currentChat === friendId) {
                            await this.displayMessage(message, privateKey);
                            await docRef.update({ read: true, readAt: new Date() });
                            await docRef.delete();
                        } else {
                            this.updateLastMessage(friendId, '📩 رسالة جديدة');
                        }
                    }
                }
            });
    },
    
    updateLastMessage(friendId, lastMessage) {
        const chatItems = document.querySelectorAll('.chat-item');
        for (const item of chatItems) {
            if (item.getAttribute('onclick')?.includes(friendId)) {
                const lastMsgEl = item.querySelector('.last-message');
                if (lastMsgEl) lastMsgEl.textContent = lastMessage;
                break;
            }
        }
    },
    
    closeChat() {
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        this.currentChat = null;
    },
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// تنظيف الرسائل منتهية الصلاحية كل ساعة
setInterval(async () => {
    try {
        const snapshot = await window.db.collection('temp_messages')
            .where('expiresAt', '<=', new Date()).get();
        const batch = window.db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    } catch (e) {}
}, 60 * 60 * 1000);

ChatSystem.init();

// ========== دوال الواجهة ==========

window.openChat = function(friendId) {
    window.db.collection('users').doc(friendId).get().then(doc => {
        if (doc.exists) {
            const friend = doc.data();
            ChatSystem.openChat(friendId, friend.name, window.getEmojiForUser?.(friend) || '👤');
        }
    });
};

window.sendMessage = function() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (text) {
        ChatSystem.sendMessage(text, 'text').then(sent => { if (sent) input.value = ''; });
    }
};

window.handleMessageKeyPress = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        window.sendMessage();
    }
};

window.sendImage = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = e => {
        const file = e.target.files[0];
        if (file) ChatSystem.sendMessage('', 'image', file);
    };
    input.click();
};

window.sendVoiceNote = function() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        const recorder = new MediaRecorder(stream);
        const chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'audio/webm' });
            ChatSystem.sendMessage('', 'voice', blob);
            stream.getTracks().forEach(t => t.stop());
        };
        recorder.start();
        setTimeout(() => recorder.stop(), 60000);
        alert('🎤 جاري التسجيل... اضغط موافق للإيقاف', recorder.stop());
    });
};

window.sendVideo = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = e => {
        const file = e.target.files[0];
        if (file) ChatSystem.sendMessage('', 'video', file);
    };
    input.click();
};

window.sendFile = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = e => {
        const file = e.target.files[0];
        if (file) ChatSystem.sendMessage('', 'file', file);
    };
    input.click();
};

window.closeConversation = () => ChatSystem.closeChat();
window.showAttachmentMenu = () => document.getElementById('attachmentMenu').style.display = 'flex';
window.shareLocation = () => {
    navigator.geolocation.getCurrentPosition(pos => {
        ChatSystem.sendMessage(`📍 https://maps.google.com?q=${pos.coords.latitude},${pos.coords.longitude}`, 'text');
    });
};

// إخفاء القوائم عند النقر خارجها
document.addEventListener('click', e => {
    const menu = document.getElementById('attachmentMenu');
    if (menu && !e.target.closest('.attach-btn') && !e.target.closest('#attachmentMenu')) {
        menu.style.display = 'none';
    }
    const picker = document.getElementById('emojiPicker');
    if (picker && !e.target.closest('.emoji-btn') && !e.target.closest('#emojiPicker')) {
        picker.style.display = 'none';
    }
});

// باقي الدوال المساعدة
window.showEmojiPicker = () => {
    document.getElementById('emojiPicker').style.display = 'block';
    document.getElementById('attachmentMenu').style.display = 'none';
};
window.viewContactInfo = () => alert('معلومات الاتصال');

console.log('✅ Rafeeq E2EE جاهز - جميع الرسائل والملفات مشفرة بالكامل');
