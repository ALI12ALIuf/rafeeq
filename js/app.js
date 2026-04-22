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
        const binaryKey = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
        return await window.crypto.subtle.importKey(
            "spki",
            binaryKey,
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["encrypt"]
        );
    },
    
    async exportPrivateKey(key) {
        const exported = await window.crypto.subtle.exportKey("pkcs8", key);
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    },
    
    async importPrivateKey(base64Key) {
        const binaryKey = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
        return await window.crypto.subtle.importKey(
            "pkcs8",
            binaryKey,
            { name: "RSA-OAEP", hash: "SHA-256" },
            false,
            ["decrypt"]
        );
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
    
    async encryptImage(imageFile, receiverPublicKey) {
        const compressed = await this.compressImage(imageFile);
        const base64 = await this.blobToBase64(compressed);
        return await this.encryptMessage(base64, receiverPublicKey);
    },
    
    async encryptVoice(audioBlob, receiverPublicKey) {
        const base64 = await this.blobToBase64(audioBlob);
        return await this.encryptMessage(base64, receiverPublicKey);
    },
    
    async encryptVideo(videoFile, receiverPublicKey) {
        const base64 = await this.blobToBase64(videoFile);
        return await this.encryptMessage(base64, receiverPublicKey);
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
    onlineUsers: new Set(), // تتبع المستخدمين المتصلين
    
    init() {
        this.loadAllChats();
        this.setupOnlinePresence();
    },
    
    setupOnlinePresence() {
        if (!window.auth?.currentUser) return;
        
        // تحديث حالة الاتصال
        const userStatusRef = window.db.collection('users').doc(window.auth.currentUser.uid);
        
        userStatusRef.update({
            online: true,
            lastSeen: new Date()
        });
        
        // عند الخروج
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
        
        setTimeout(() => {
            const container = document.getElementById('messagesContainer');
            if (container) container.scrollTop = container.scrollHeight;
        }, 100);
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
    },
    
    async displayMessage(msg, privateKey) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`;
        messageDiv.id = `msg-${msg.id}`;
        
        const time = new Date(msg.time).toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let statusHtml = '';
        if (msg.sender === 'me') {
            let statusIcon = '✓';
            let statusClass = 'sent';
            
            if (msg.status === 'sending') {
                statusIcon = '⏳';
                statusClass = 'sending';
            } else if (msg.status === 'delivered') {
                statusIcon = '✓✓';
                statusClass = 'delivered';
            } else if (msg.status === 'read') {
                statusIcon = '✓✓';
                statusClass = 'read';
            }
            
            statusHtml = `<span class="message-status ${statusClass}">${statusIcon}</span>`;
        }
        
        let displayContent = '';
        
        if (msg.type === 'encrypted') {
            if (msg.sender === 'me') {
                displayContent = msg.plainText || '📝 رسالة مشفرة';
            } else {
                try {
                    const decrypted = await CryptoSystem.decryptMessage(msg.encrypted, privateKey);
                    displayContent = decrypted || '🔒 رسالة مشفرة (تعذر فك التشفير)';
                    msg.plainText = displayContent;
                } catch (e) {
                    displayContent = '🔒 رسالة مشفرة';
                }
            }
            
            messageDiv.innerHTML = `
                <div class="message-content">${this.escapeHtml(displayContent)}</div>
                <div class="message-info">
                    <span class="message-time">${time}</span>
                    ${statusHtml}
                </div>
            `;
        } else if (msg.type === 'encrypted_image') {
            if (msg.sender === 'me') {
                messageDiv.innerHTML = `
                    <img src="${msg.plainData}" class="message-image" onclick="window.open('${msg.plainData}')">
                    <div class="message-info">
                        <span class="message-time">${time}</span>
                        ${statusHtml}
                    </div>
                `;
            } else {
                try {
                    const decrypted = await CryptoSystem.decryptMessage(msg.encrypted, privateKey);
                    messageDiv.innerHTML = `
                        <img src="${decrypted}" class="message-image" onclick="window.open('${decrypted}')">
                        <div class="message-info">
                            <span class="message-time">${time}</span>
                            ${statusHtml}
                        </div>
                    `;
                } catch (e) {
                    messageDiv.innerHTML = `
                        <div class="message-content">🖼️ صورة مشفرة</div>
                        <div class="message-info">
                            <span class="message-time">${time}</span>
                        </div>
                    `;
                }
            }
        } else if (msg.type === 'encrypted_voice') {
            if (msg.sender === 'me') {
                messageDiv.innerHTML = `
                    <audio controls src="${msg.plainData}" class="message-audio"></audio>
                    <div class="message-info">
                        <span class="message-time">${time}</span>
                        ${statusHtml}
                    </div>
                `;
            } else {
                try {
                    const decrypted = await CryptoSystem.decryptMessage(msg.encrypted, privateKey);
                    messageDiv.innerHTML = `
                        <audio controls src="${decrypted}" class="message-audio"></audio>
                        <div class="message-info">
                            <span class="message-time">${time}</span>
                        </div>
                    `;
                } catch (e) {
                    messageDiv.innerHTML = `
                        <div class="message-content">🎤 بصمة صوتية مشفرة</div>
                        <div class="message-info">
                            <span class="message-time">${time}</span>
                        </div>
                    `;
                }
            }
        } else if (msg.type === 'encrypted_video') {
            if (msg.sender === 'me') {
                messageDiv.innerHTML = `
                    <video controls src="${msg.plainData}" class="message-video"></video>
                    <div class="message-info">
                        <span class="message-time">${time}</span>
                        ${statusHtml}
                    </div>
                `;
            } else {
                try {
                    const decrypted = await CryptoSystem.decryptMessage(msg.encrypted, privateKey);
                    messageDiv.innerHTML = `
                        <video controls src="${decrypted}" class="message-video"></video>
                        <div class="message-info">
                            <span class="message-time">${time}</span>
                        </div>
                    `;
                } catch (e) {
                    messageDiv.innerHTML = `
                        <div class="message-content">🎬 فيديو مشفر</div>
                        <div class="message-info">
                            <span class="message-time">${time}</span>
                        </div>
                    `;
                }
            }
        } else if (msg.type === 'encrypted_file') {
            if (msg.sender === 'me') {
                messageDiv.innerHTML = `
                    <div class="message-content">
                        📎 <a href="${msg.plainData}" download="${msg.fileName}">${msg.fileName}</a>
                    </div>
                    <div class="message-info">
                        <span class="message-time">${time}</span>
                        ${statusHtml}
                    </div>
                `;
            } else {
                try {
                    const decrypted = await CryptoSystem.decryptMessage(msg.encrypted, privateKey);
                    messageDiv.innerHTML = `
                        <div class="message-content">
                            📎 <a href="${decrypted}" download="${msg.fileName}">${msg.fileName}</a>
                        </div>
                        <div class="message-info">
                            <span class="message-time">${time}</span>
                        </div>
                    `;
                } catch (e) {
                    messageDiv.innerHTML = `
                        <div class="message-content">📁 ملف مشفر: ${msg.fileName}</div>
                        <div class="message-info">
                            <span class="message-time">${time}</span>
                        </div>
                    `;
                }
            }
        }
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    },
    
    async sendMessage(text) {
        if (!this.currentChat || !text.trim()) return false;
        
        const messageId = Date.now().toString();
        
        const receiverDoc = await window.db.collection('users').doc(this.currentChat).get();
        const receiverData = receiverDoc.data();
        
        if (!receiverData.publicKey) {
            console.error('المستخدم ليس لديه مفتاح عام');
            return false;
        }
        
        const receiverPublicKey = await CryptoSystem.importPublicKey(receiverData.publicKey);
        const encrypted = await CryptoSystem.encryptMessage(text, receiverPublicKey);
        
        const message = {
            id: messageId,
            type: 'encrypted',
            encrypted: encrypted,
            plainText: text,
            sender: 'me',
            time: new Date().toISOString(),
            status: 'sending'
        };
        
        const privateKey = await getMyPrivateKey();
        await this.displayMessage(message, privateKey);
        this.saveMessage(this.currentChat, message);
        
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
                    time: message.time
                },
                timestamp: new Date()
            };
            
            // إذا المستلم متصل، نحذف بعد 10 ثواني (بعد ما توصل)
            // إذا غير متصل، نحذف بعد 24 ساعة
            if (!isReceiverOnline) {
                messageData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            }
            
            const docRef = await window.db.collection('temp_messages').add(messageData);
            
            this.updateMessageStatus(messageId, 'sent');
            
            // إذا المستلم متصل، ننتظر وصولها ثم نحذف
            if (isReceiverOnline) {
                this.waitForDeliveryAndDelete(messageId, docRef.id);
            } else {
                this.waitForDelivery(messageId, docRef.id);
            }
            
        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
            this.updateMessageStatus(messageId, 'error');
        }
        
        return true;
    },
    
    async sendImage(file) {
        return new Promise(async (resolve) => {
            const messageId = Date.now().toString();
            
            const receiverDoc = await window.db.collection('users').doc(this.currentChat).get();
            const receiverData = receiverDoc.data();
            
            if (!receiverData.publicKey) {
                console.error('المستخدم ليس لديه مفتاح عام');
                resolve();
                return;
            }
            
            const receiverPublicKey = await CryptoSystem.importPublicKey(receiverData.publicKey);
            const encrypted = await CryptoSystem.encryptImage(file, receiverPublicKey);
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                const message = {
                    id: messageId,
                    type: 'encrypted_image',
                    encrypted: encrypted,
                    plainData: e.target.result,
                    sender: 'me',
                    time: new Date().toISOString(),
                    status: 'sending'
                };
                
                const privateKey = await getMyPrivateKey();
                await this.displayMessage(message, privateKey);
                this.saveMessage(this.currentChat, message);
                
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
                            time: message.time
                        },
                        timestamp: new Date()
                    };
                    
                    if (!isReceiverOnline) {
                        messageData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                    }
                    
                    const docRef = await window.db.collection('temp_messages').add(messageData);
                    
                    this.updateMessageStatus(messageId, 'sent');
                    
                    if (isReceiverOnline) {
                        this.waitForDeliveryAndDelete(messageId, docRef.id);
                    } else {
                        this.waitForDelivery(messageId, docRef.id);
                    }
                    
                } catch (error) {
                    console.error('خطأ في إرسال الصورة:', error);
                    this.updateMessageStatus(messageId, 'error');
                }
                resolve();
            };
            reader.readAsDataURL(file);
        });
    },
    
    async sendVoiceNote(audioBlob) {
        return new Promise(async (resolve) => {
            const messageId = Date.now().toString();
            
            const receiverDoc = await window.db.collection('users').doc(this.currentChat).get();
            const receiverData = receiverDoc.data();
            
            if (!receiverData.publicKey) {
                console.error('المستخدم ليس لديه مفتاح عام');
                resolve();
                return;
            }
            
            const receiverPublicKey = await CryptoSystem.importPublicKey(receiverData.publicKey);
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                const encrypted = await CryptoSystem.encryptVoice(audioBlob, receiverPublicKey);
                
                const message = {
                    id: messageId,
                    type: 'encrypted_voice',
                    encrypted: encrypted,
                    plainData: e.target.result,
                    sender: 'me',
                    time: new Date().toISOString(),
                    status: 'sending'
                };
                
                const privateKey = await getMyPrivateKey();
                await this.displayMessage(message, privateKey);
                this.saveMessage(this.currentChat, message);
                
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
                            time: message.time
                        },
                        timestamp: new Date()
                    };
                    
                    if (!isReceiverOnline) {
                        messageData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                    }
                    
                    const docRef = await window.db.collection('temp_messages').add(messageData);
                    
                    this.updateMessageStatus(messageId, 'sent');
                    
                    if (isReceiverOnline) {
                        this.waitForDeliveryAndDelete(messageId, docRef.id);
                    } else {
                        this.waitForDelivery(messageId, docRef.id);
                    }
                    
                } catch (error) {
                    console.error('خطأ في إرسال البصمة:', error);
                    this.updateMessageStatus(messageId, 'error');
                }
                resolve();
            };
            reader.readAsDataURL(audioBlob);
        });
    },
    
    async sendVideo(file) {
        return new Promise(async (resolve) => {
            const messageId = Date.now().toString();
            
            const receiverDoc = await window.db.collection('users').doc(this.currentChat).get();
            const receiverData = receiverDoc.data();
            
            if (!receiverData.publicKey) {
                console.error('المستخدم ليس لديه مفتاح عام');
                resolve();
                return;
            }
            
            const receiverPublicKey = await CryptoSystem.importPublicKey(receiverData.publicKey);
            const encrypted = await CryptoSystem.encryptVideo(file, receiverPublicKey);
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                const message = {
                    id: messageId,
                    type: 'encrypted_video',
                    encrypted: encrypted,
                    plainData: e.target.result,
                    sender: 'me',
                    time: new Date().toISOString(),
                    status: 'sending'
                };
                
                const privateKey = await getMyPrivateKey();
                await this.displayMessage(message, privateKey);
                this.saveMessage(this.currentChat, message);
                
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
                            time: message.time
                        },
                        timestamp: new Date()
                    };
                    
                    if (!isReceiverOnline) {
                        messageData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                    }
                    
                    const docRef = await window.db.collection('temp_messages').add(messageData);
                    
                    this.updateMessageStatus(messageId, 'sent');
                    
                    if (isReceiverOnline) {
                        this.waitForDeliveryAndDelete(messageId, docRef.id);
                    } else {
                        this.waitForDelivery(messageId, docRef.id);
                    }
                    
                } catch (error) {
                    console.error('خطأ في إرسال الفيديو:', error);
                    this.updateMessageStatus(messageId, 'error');
                }
                resolve();
            };
            reader.readAsDataURL(file);
        });
    },
    
    async sendFile(file) {
        return new Promise(async (resolve) => {
            const messageId = Date.now().toString();
            
            const receiverDoc = await window.db.collection('users').doc(this.currentChat).get();
            const receiverData = receiverDoc.data();
            
            if (!receiverData.publicKey) {
                console.error('المستخدم ليس لديه مفتاح عام');
                resolve();
                return;
            }
            
            const receiverPublicKey = await CryptoSystem.importPublicKey(receiverData.publicKey);
            const encrypted = await CryptoSystem.encryptFile(file, receiverPublicKey);
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                const message = {
                    id: messageId,
                    type: 'encrypted_file',
                    encrypted: encrypted,
                    plainData: e.target.result,
                    fileName: file.name,
                    sender: 'me',
                    time: new Date().toISOString(),
                    status: 'sending'
                };
                
                const privateKey = await getMyPrivateKey();
                await this.displayMessage(message, privateKey);
                this.saveMessage(this.currentChat, message);
                
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
                            fileName: file.name
                        },
                        timestamp: new Date()
                    };
                    
                    if (!isReceiverOnline) {
                        messageData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                    }
                    
                    const docRef = await window.db.collection('temp_messages').add(messageData);
                    
                    this.updateMessageStatus(messageId, 'sent');
                    
                    if (isReceiverOnline) {
                        this.waitForDeliveryAndDelete(messageId, docRef.id);
                    } else {
                        this.waitForDelivery(messageId, docRef.id);
                    }
                    
                } catch (error) {
                    console.error('خطأ في إرسال الملف:', error);
                    this.updateMessageStatus(messageId, 'error');
                }
                resolve();
            };
            reader.readAsDataURL(file);
        });
    },
    
    updateMessageStatus(messageId, status) {
        const messageElement = document.getElementById(`msg-${messageId}`);
        if (!messageElement) return;
        
        const statusElement = messageElement.querySelector('.message-status');
        if (!statusElement) return;
        
        statusElement.className = `message-status ${status}`;
        
        if (status === 'sending') {
            statusElement.innerHTML = '⏳';
        } else if (status === 'sent') {
            statusElement.innerHTML = '✓';
        } else if (status === 'delivered') {
            statusElement.innerHTML = '✓✓';
        } else if (status === 'read') {
            statusElement.innerHTML = '✓✓';
            statusElement.style.color = '#4fc3f7';
        } else if (status === 'error') {
            statusElement.innerHTML = '⚠️';
            statusElement.style.color = '#f44336';
        }
        
        this.updateMessageStatusInStorage(messageId, status);
    },
    
    updateMessageStatusInStorage(messageId, status) {
        const key = `chat_${this.currentChat}`;
        try {
            let history = JSON.parse(localStorage.getItem(key)) || [];
            history = history.map(msg => {
                if (msg.id === messageId) {
                    return { ...msg, status: status };
                }
                return msg;
            });
            localStorage.setItem(key, JSON.stringify(history));
            this.messages[this.currentChat] = history;
        } catch (e) {
            console.error('خطأ في تحديث الحالة:', e);
        }
    },
    
    waitForDelivery(messageId, firebaseDocId) {
        const unsubscribe = window.db.collection('temp_messages')
            .doc(firebaseDocId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    if (data.delivered) {
                        this.updateMessageStatus(messageId, 'delivered');
                    }
                    if (data.read) {
                        this.updateMessageStatus(messageId, 'read');
                        unsubscribe();
                    }
                }
            });
    },
    
    // جديد: انتظار التسليم ثم الحذف فوراً
    waitForDeliveryAndDelete(messageId, firebaseDocId) {
        const unsubscribe = window.db.collection('temp_messages')
            .doc(firebaseDocId)
            .onSnapshot(async (doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    if (data.delivered) {
                        this.updateMessageStatus(messageId, 'delivered');
                        // حذف الرسالة من السيرفر فوراً بعد التسليم
                        await window.db.collection('temp_messages').doc(firebaseDocId).delete();
                        unsubscribe();
                        console.log('🗑️ تم حذف الرسالة من السيرفر بعد التسليم الفوري');
                    }
                    if (data.read) {
                        this.updateMessageStatus(messageId, 'read');
                    }
                }
            });
    },
    
    saveMessage(friendId, message) {
        const key = `chat_${friendId}`;
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem(key)) || [];
        } catch (e) {
            history = [];
        }
        
        const existingIndex = history.findIndex(m => m.id === message.id);
        if (existingIndex >= 0) {
            history[existingIndex] = message;
        } else {
            history.push(message);
        }
        
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
                
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        const docRef = change.doc.ref;
                        
                        // تحديث حالة التسليم فوراً
                        await docRef.update({
                            delivered: true,
                            deliveredAt: new Date()
                        });
                        
                        const message = { 
                            ...data.message, 
                            sender: 'friend',
                            status: 'delivered'
                        };
                        
                        this.saveMessage(friendId, message);
                        
                        if (this.currentChat === friendId) {
                            await this.displayMessage(message, privateKey);
                            
                            // تحديث حالة القراءة
                            await docRef.update({
                                read: true,
                                readAt: new Date()
                            });
                            
                            // حذف الرسالة من السيرفر فوراً بعد القراءة
                            await docRef.delete();
                            console.log('🗑️ تم حذف الرسالة من السيرفر بعد القراءة');
                            
                        } else {
                            let lastMessageText = '📝 رسالة جديدة';
                            try {
                                if (message.type === 'encrypted') {
                                    lastMessageText = await CryptoSystem.decryptMessage(message.encrypted, privateKey);
                                } else if (message.type === 'encrypted_image') {
                                    lastMessageText = '📷 صورة جديدة';
                                } else if (message.type === 'encrypted_voice') {
                                    lastMessageText = '🎤 بصمة صوتية';
                                } else if (message.type === 'encrypted_video') {
                                    lastMessageText = '🎬 فيديو';
                                } else if (message.type === 'encrypted_file') {
                                    lastMessageText = `📁 ${message.fileName || 'ملف'}`;
                                }
                            } catch (e) {}
                            
                            this.updateLastMessage(friendId, lastMessageText);
                        }
                    }
                });
            });
    },
    
    updateLastMessage(friendId, lastMessage) {
        const chatItems = document.querySelectorAll('.chat-item');
        for (const item of chatItems) {
            if (item.getAttribute('onclick')?.includes(friendId)) {
                const lastMsgEl = item.querySelector('.last-message');
                const timeEl = item.querySelector('.chat-time');
                if (lastMsgEl) lastMsgEl.textContent = lastMessage;
                if (timeEl) timeEl.textContent = 'الآن';
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

// ========== حذف الرسائل منتهية الصلاحية (للرسائل اللي ما وصلت) ==========

async function cleanupExpiredMessages() {
    try {
        const now = new Date();
        const snapshot = await window.db.collection('temp_messages')
            .where('expiresAt', '<=', now)
            .get();
        
        if (!snapshot.empty) {
            const batch = window.db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            console.log(`🗑️ تم حذف ${snapshot.size} رسالة منتهية الصلاحية`);
        }
    } catch (error) {
        console.error('خطأ في تنظيف الرسائل:', error);
    }
}

// تشغيل التنظيف كل ساعة
setInterval(cleanupExpiredMessages, 60 * 60 * 1000);

ChatSystem.init();

async function loadChats() {
    if (!window.auth || !window.auth.currentUser) return;
    
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) return;
    
    try {
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (!userDoc.exists) return;
        
        const friends = userDoc.data().friends || [];
        
        if (friends.length === 0) {
            chatsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <h3>لا توجد محادثات</h3>
                    <p>أضف أصدقاء لبدء المحادثة</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        const privateKey = await getMyPrivateKey();
        
        for (const friendId of friends) {
            try {
                const friendDoc = await window.db.collection('users').doc(friendId).get();
                if (friendDoc.exists) {
                    const friend = friendDoc.data();
                    const avatarEmoji = window.getEmojiForUser(friend);
                    const isOnline = friend.online || false;
                    
                    const key = `chat_${friendId}`;
                    let lastMessage = 'اضغط لبدء المحادثة';
                    let lastTime = '';
                    let unreadCount = 0;
                    
                    try {
                        const history = JSON.parse(localStorage.getItem(key)) || [];
                        if (history.length > 0) {
                            const last = history[history.length - 1];
                            
                            if (last.sender === 'friend') {
                                if (last.type === 'encrypted') {
                                    try {
                                        lastMessage = await CryptoSystem.decryptMessage(last.encrypted, privateKey);
                                    } catch (e) {
                                        lastMessage = '🔒 رسالة مشفرة';
                                    }
                                } else if (last.type === 'encrypted_image') {
                                    lastMessage = '📷 صورة';
                                } else if (last.type === 'encrypted_voice') {
                                    lastMessage = '🎤 بصمة';
                                } else if (last.type === 'encrypted_video') {
                                    lastMessage = '🎬 فيديو';
                                } else if (last.type === 'encrypted_file') {
                                    lastMessage = `📁 ${last.fileName || 'ملف'}`;
                                }
                            } else {
                                lastMessage = last.plainText || '📝 رسالة';
                            }
                            
                            lastTime = new Date(last.time).toLocaleTimeString('ar-EG', {
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                            
                            unreadCount = history.filter(msg => 
                                msg.sender === 'friend' && msg.status !== 'read'
                            ).length;
                        }
                    } catch (e) {}
                    
                    const unreadBadge = unreadCount > 0 ? 
                        `<span class="unread-badge">${unreadCount}</span>` : '';
                    
                    const onlineIndicator = isOnline ? 
                        '<span class="online-indicator" style="width:10px;height:10px;background:#4CAF50;border-radius:50%;display:inline-block;margin-right:5px;"></span>' : '';
                    
                    html += `
                        <div class="chat-item" onclick="openChat('${friendId}')">
                            <div class="chat-avatar-emoji">${avatarEmoji}</div>
                            <div class="chat-info">
                                <h4>${onlineIndicator}${friend.name || 'مستخدم'}</h4>
                                <p class="last-message">${lastMessage}</p>
                            </div>
                            <div class="chat-meta">
                                <span class="chat-time">${lastTime || ''}</span>
                                ${unreadBadge}
                            </div>
                        </div>
                    `;
                }
            } catch (e) {
                console.error('Error loading friend:', e);
            }
        }
        
        chatsList.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading chats:', error);
        chatsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ في تحميل المحادثات</h3>
                <p>حاول مرة أخرى</p>
            </div>
        `;
    }
}

function setupChatListeners() {
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('attachmentMenu');
        const attachBtn = document.querySelector('.attach-btn');
        if (menu && attachBtn && !menu.contains(e.target) && !attachBtn.contains(e.target)) {
            menu.style.display = 'none';
        }
        
        const emojiPicker = document.getElementById('emojiPicker');
        const emojiBtn = document.querySelector('.emoji-btn');
        if (emojiPicker && emojiBtn && !emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
            emojiPicker.style.display = 'none';
        }
    });
    
    if (window.auth?.currentUser) {
        window.db.collection('temp_messages')
            .where('to', '==', window.auth.currentUser.uid)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        loadChats();
                    }
                });
            });
    }
}

// ========== دوال عامة للواجهة ==========

window.openChat = function(friendId) {
    window.db.collection('users').doc(friendId).get().then((doc) => {
        if (doc.exists) {
            const friend = doc.data();
            const avatarEmoji = window.getEmojiForUser ? 
                window.getEmojiForUser(friend) : '👤';
            ChatSystem.openChat(friendId, friend.name, avatarEmoji);
        }
    }).catch(error => {
        console.error('خطأ في فتح المحادثة:', error);
    });
};

window.sendMessage = function() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (text) {
        ChatSystem.sendMessage(text).then(sent => {
            if (sent) input.value = '';
        });
    }
};

window.handleMessageKeyPress = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        window.sendMessage();
    }
};

window.showAttachmentMenu = function() {
    const menu = document.getElementById('attachmentMenu');
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    
    const emojiPicker = document.getElementById('emojiPicker');
    if (emojiPicker) emojiPicker.style.display = 'none';
};

window.showEmojiPicker = function() {
    const picker = document.getElementById('emojiPicker');
    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    
    const menu = document.getElementById('attachmentMenu');
    if (menu) menu.style.display = 'none';
    
    if (picker.querySelector('.emoji-grid').children.length === 0) {
        loadEmojis();
    }
};

function loadEmojis() {
    const emojis = ['😊', '😂', '❤️', '👍', '🎉', '😢', '😡', '😍', '🤔', '👌', '🙏', '🔥', '✨', '⭐', '🌙', '☀️'];
    const grid = document.querySelector('.emoji-grid');
    if (!grid) return;
    
    emojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.onclick = () => {
            const input = document.getElementById('messageInput');
            input.value += emoji;
            input.focus();
            document.getElementById('emojiPicker').style.display = 'none';
        };
        grid.appendChild(btn);
    });
}

window.sendImage = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file && ChatSystem.currentChat) ChatSystem.sendImage(file);
    };
    input.click();
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.sendVoiceNote = function() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            const mediaRecorder = new MediaRecorder(stream);
            const chunks = [];
            
            mediaRecorder.ondataavailable = e => chunks.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                ChatSystem.sendVoiceNote(blob);
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            
            const sendBtn = document.querySelector('.send-btn');
            const voiceBtn = document.querySelector('.voice-btn');
            if (sendBtn) sendBtn.style.display = 'none';
            if (voiceBtn) {
                voiceBtn.style.display = 'flex';
                voiceBtn.onclick = () => {
                    if (mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                        sendBtn.style.display = 'flex';
                        voiceBtn.style.display = 'none';
                    }
                };
            }
            
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    if (sendBtn) sendBtn.style.display = 'flex';
                    if (voiceBtn) voiceBtn.style.display = 'none';
                }
            }, 60000);
        });
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.sendVideo = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file && ChatSystem.currentChat) ChatSystem.sendVideo(file);
    };
    input.click();
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.sendFile = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '*/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file && ChatSystem.currentChat) ChatSystem.sendFile(file);
    };
    input.click();
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.shareLocation = function() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const locationUrl = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
            ChatSystem.sendMessage(`📍 موقعي: ${locationUrl}`);
        });
    }
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.closeConversation = function() {
    ChatSystem.closeChat();
};

window.viewContactInfo = function() {
    alert('معلومات الاتصال - قيد التطوير');
};

// ========== باقي الدوال ==========

window.openEditProfileModal = function() {
    const currentName = document.getElementById('profileName').textContent;
    const currentNameInput = document.getElementById('editName');
    if (currentNameInput) currentNameInput.value = currentName;
    
    const currentEmoji = document.getElementById('profileAvatarEmoji').textContent;
    const currentAvatarEmoji = document.getElementById('currentAvatarEmoji');
    if (currentAvatarEmoji) currentAvatarEmoji.textContent = currentEmoji;
    
    document.getElementById('editProfileModal').classList.add('active');
};

window.saveProfile = function() {
    const newName = document.getElementById('editName').value.trim();
    if (!newName) { alert('الرجاء إدخال الاسم'); return; }
    if (newName.length > 25) { alert('الاسم يجب أن لا يتجاوز 25 حرف'); return; }
    
    if (auth && auth.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({
            name: newName
        }).then(() => {
            document.getElementById('profileName').textContent = newName;
            closeModal();
            alert('تم حفظ التغييرات');
        }).catch(error => {
            console.error('Error saving profile:', error);
            alert('حدث خطأ في الحفظ');
        });
    }
};

window.showUserTrips = function() {
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('tripsPage').style.display = 'block';
    loadUserTrips();
};

async function loadUserTrips() {
    if (!window.auth || !window.auth.currentUser) return;
    
    const tripsGrid = document.getElementById('tripsGrid');
    if (!tripsGrid) return;
    
    try {
        const snapshot = await window.db.collection('trips')
            .where('userId', '==', window.auth.currentUser.uid)
            .orderBy('startTime', 'desc')
            .get();
        
        if (snapshot.empty) {
            tripsGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-map-marked-alt"></i>
                    <h3>${i18n ? i18n.t('no_trips') : 'لا توجد رحلات'}</h3>
                    <p>${i18n ? i18n.t('no_trips_desc') : 'لم تقم بأي رحلة بعد'}</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const trip = doc.data();
            const startTime = trip.startTime ? new Date(trip.startTime.seconds * 1000) : new Date();
            html += `
                <div class="trip-item" onclick="viewTripDetails('${doc.id}')">
                    <div class="trip-date">${startTime.toLocaleDateString('ar-EG')}</div>
                    <div class="trip-route">${trip.destination || 'رحلة'}</div>
                    <div class="trip-stats">
                        <span>⏱️ ${trip.duration || '--'}</span>
                    </div>
                </div>
            `;
        });
        tripsGrid.innerHTML = html;
        updateTripsCount();
        
    } catch (error) {
        console.error('Error loading trips:', error);
        tripsGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ في تحميل الرحلات</h3>
            </div>
        `;
    }
}

window.viewTripDetails = function(tripId) {
    alert('تفاصيل الرحلة - معرف: ' + tripId);
};

window.goBack = function() {
    document.querySelectorAll('.profile-subpage').forEach(page => page.style.display = 'none');
    document.querySelector('.profile-page').style.display = 'block';
    document.querySelector('.profile-page').classList.add('active');
    document.querySelectorAll('.page').forEach(page => {
        if (!page.classList.contains('profile-page')) {
            page.style.display = 'none';
            page.classList.remove('active');
        }
    });
};

window.selectAvatar = function(type) {
    const emojiMap = {
        'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧',
        'father': '👨‍🦳', 'mother': '👩‍🦳', 'grandfather': '👴', 'grandmother': '👵'
    };
    const selectedEmoji = emojiMap[type] || '👤';
    
    const profileAvatar = document.getElementById('profileAvatarEmoji');
    if (profileAvatar) profileAvatar.textContent = selectedEmoji;
    const currentAvatar = document.getElementById('currentAvatarEmoji');
    if (currentAvatar) currentAvatar.textContent = selectedEmoji;
    
    if (auth && auth.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({ avatarType: type })
            .catch(error => console.error('Error updating avatar:', error));
    }
    closeModal();
};

window.openAvatarModal = function() {
    const modal = document.getElementById('avatarModal');
    if (modal) modal.classList.add('active');
};

document.addEventListener('languageChanged', function() {
    console.log('Language changed');
    if (document.querySelector('.chat-page').style.display === 'block') loadChats();
});

window.getEmojiForUser = function(userData) {
    const emojiMap = {
        'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧',
        'father': '👨‍🦳', 'mother': '👩‍🦳', 'grandfather': '👴', 'grandmother': '👵'
    };
    return emojiMap[userData?.avatarType] || '👤';
};

window.clearMessages = function() {
    const container = document.getElementById('messagesContainer');
    if (container) container.innerHTML = '';
};

window.showNotification = function(title, message) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body: message });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') new Notification(title, { body: message });
        });
    }
};

if ('Notification' in window) Notification.requestPermission();

console.log('✅ app.js محدث - تشفير E2EE كامل مع حذف فوري بعد التسليم');
