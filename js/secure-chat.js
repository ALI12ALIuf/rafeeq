// ========== secure-chat.js - Rafeeq E2E Encryption via Cloudflare ==========

const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    keyCache: new Map(),
    sharedKeyCache: new Map(),
    
    // ==================== التهيئة ====================
    async init() {
        const user = RafeeqAPI.getUser();
        if (!user || !user.id) {
            console.warn('⚠️ SecureChat: لا يوجد مستخدم');
            return false;
        }
        
        try {
            console.log('🔐 بدء تهيئة نظام التشفير...');
            await this.setupKeys();
            console.log('✅ تم تهيئة نظام التشفير بنجاح');
            return true;
        } catch (error) {
            console.error('❌ فشل تهيئة نظام التشفير:', error);
            return false;
        }
    },
    
    // ==================== إعداد المفاتيح ====================
    async setupKeys() {
        const user = RafeeqAPI.getUser();
        if (!user || !user.id) return;
        
        const uid = user.id;
        const existingKey = localStorage.getItem(`enc_private_key_${uid}`);
        
        // ✅ إذا كان المفتاح موجود محلياً، نتحقق من المفتاح العام
        if (existingKey) {
            try {
                const result = await RafeeqAPI.users.getProfile();
                if (result.success && result.user && result.user.publicKey) {
                    console.log('✅ المفاتيح موجودة');
                    return;
                }
            } catch (e) {
                console.warn('⚠️ فشل جلب الملف الشخصي');
            }
        }
        
        // ✅ إنشاء مفتاح جديد
        console.log('🔑 إنشاء مفتاح جديد...');
        const keyPair = await this.generateKeyPair();
        const publicKey = await this.exportPublicKey(keyPair.publicKey);
        
        // ✅ حفظ المفتاح العام في الـ API
        try {
            await RafeeqAPI.users.updateProfile({ publicKey });
            console.log('✅ تم حفظ المفتاح العام في API');
        } catch (e) {
            console.warn('⚠️ فشل حفظ المفتاح العام في API:', e.message);
        }
        
        // ✅ حفظ المفتاح الخاص محلياً
        const privateExport = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
        localStorage.setItem(
            `enc_private_key_${uid}`, 
            btoa(String.fromCharCode(...new Uint8Array(privateExport)))
        );
        
        this.keyCache.set(uid, keyPair.privateKey);
        console.log('✅ تم إنشاء وحفظ المفاتيح');
    },
    
    // ==================== توليد مفتاح ====================
    async generateKeyPair() { 
        return await window.crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' }, 
            true, 
            ['deriveKey']
        ); 
    },
    
    async exportPublicKey(key) { 
        const raw = await window.crypto.subtle.exportKey('raw', key); 
        return btoa(String.fromCharCode(...new Uint8Array(raw))); 
    },
    
    async importPublicKey(base64Key) { 
        if (!base64Key) throw new Error('المفتاح العام فارغ');
        const binary = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
        return await window.crypto.subtle.importKey(
            'raw', 
            binary, 
            { name: 'ECDH', namedCurve: 'P-256' }, 
            true, 
            []
        );
    },
    
    // ==================== جلب المفاتيح ====================
    async getMyPrivateKey() {
        const user = RafeeqAPI.getUser();
        if (!user || !user.id) return null;
        
        const uid = user.id;
        if (this.keyCache.has(uid)) return this.keyCache.get(uid);
        
        const stored = localStorage.getItem(`enc_private_key_${uid}`);
        if (!stored) return null;
        
        try {
            const binary = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
            const key = await window.crypto.subtle.importKey(
                'pkcs8', 
                binary, 
                { name: 'ECDH', namedCurve: 'P-256' }, 
                false, 
                ['deriveKey']
            );
            this.keyCache.set(uid, key);
            return key;
        } catch (error) { 
            console.error('فشل تحميل المفتاح الخاص:', error);
            return null; 
        }
    },
    
    async getReceiverPublicKey(userId) {
        if (!userId) return null;
        try {
            const result = await RafeeqAPI.users.getById(userId);
            if (!result.success || !result.user || !result.user.publicKey) {
                console.warn('⚠️ لا يوجد مفتاح عام للمستخدم:', userId);
                return null;
            }
            return await this.importPublicKey(result.user.publicKey);
        } catch (error) { 
            console.error('فشل جلب المفتاح العام:', error);
            return null; 
        }
    },
    
    // ==================== اشتقاق المفتاح المشترك ====================
    async deriveSharedKey(privateKey, publicKey) {
        const user = RafeeqAPI.getUser();
        if (!user || !user.id) return null;
        
        const cacheKey = `${user.id}_${await this.exportPublicKey(publicKey)}`;
        if (this.sharedKeyCache.has(cacheKey)) return this.sharedKeyCache.get(cacheKey);
        
        const sharedKey = await window.crypto.subtle.deriveKey(
            { name: 'ECDH', public: publicKey }, 
            privateKey, 
            { name: 'AES-GCM', length: 256 }, 
            false, 
            ['encrypt', 'decrypt']
        );
        
        this.sharedKeyCache.set(cacheKey, sharedKey);
        setTimeout(() => this.sharedKeyCache.delete(cacheKey), 300000);
        return sharedKey;
    },
    
    // ==================== التشفير وفك التشفير ====================
    async encryptData(data, sharedKey) {
        const encoder = new TextEncoder();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt(
            { 
                name: 'AES-GCM', 
                iv, 
                additionalData: encoder.encode('rafeeq-secure') 
            }, 
            sharedKey, 
            typeof data === 'string' ? encoder.encode(data) : data
        );
        
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...combined));
    },
    
    async decryptData(encryptedBase64, sharedKey) {
        const encoder = new TextEncoder();
        const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12);
        const data = combined.slice(12);
        
        const decrypted = await window.crypto.subtle.decrypt(
            { 
                name: 'AES-GCM', 
                iv, 
                additionalData: encoder.encode('rafeeq-secure') 
            }, 
            sharedKey, 
            data
        );
        
        return new TextDecoder().decode(decrypted);
    }
};

// ==================== Polling للرسائل ====================
let _secureChatPollingInterval = null;

function startSecureChatPolling() {
    if (_secureChatPollingInterval) {
        clearInterval(_secureChatPollingInterval);
    }
    
    console.log('🔄 بدء Polling للرسائل (كل 3 ثوانٍ)');
    
    _secureChatPollingInterval = setInterval(async () => {
        if (!RafeeqAPI.getToken()) return;
        
        try {
            const now = Math.floor(Date.now() / 1000);
            const lastCheck = parseInt(localStorage.getItem('last_message_check') || '0');
            
            // ✅ نستقبل الرسائل دائماً — حتى لو كنا في محادثة
            const result = await RafeeqAPI.messages.getPending(lastCheck);
            
            if (result.success && result.messages && result.messages.length > 0) {
                console.log('📨 استقبال', result.messages.length, 'رسالة جديدة');
                
                for (const msg of result.messages) {
                    await SecureChatSystem.processReceivedMessage(msg);
                }
            }
            
            localStorage.setItem('last_message_check', now.toString());
            
        } catch (error) {
            // نتجاهل الأخطاء
        }
    }, 3000);  // ← 3 ثوانٍ للتحديث الفوري
}

// ==================== معالجة الرسائل المستلمة ====================
SecureChatSystem.processReceivedMessage = async function(msg) {
    try {
        const user = RafeeqAPI.getUser();
        if (!user) return;
        
        // ✅ جلب المفاتيح
        const myPrivateKey = await this.getMyPrivateKey();
        const senderPublicKey = await this.getReceiverPublicKey(msg.fromUser);
        
        if (!myPrivateKey || !senderPublicKey) {
            console.warn('⚠️ لا يمكن فك التشفير - مفاتيح ناقصة');
            try { await RafeeqAPI.messages.markAsRead(msg.id); } catch(e) {}
            return;
        }
        
        const sharedKey = await this.deriveSharedKey(myPrivateKey, senderPublicKey);
        
        // ✅ فك التشفير
        if (msg.package && msg.package.type === 'text') {
            const decryptedText = await this.decryptData(msg.package.data, sharedKey);
            
            // ✅ حفظ الرسالة
            const messageData = {
                id: msg.package.id || msg.id,
                type: 'text',
                text: decryptedText,
                sender: 'friend',
                time: new Date(msg.createdAt * 1000).toISOString()
            };
            
            if (typeof ChatSystem !== 'undefined' && ChatSystem.saveMessage) {
                ChatSystem.saveMessage(msg.fromUser, messageData);
                
                // ✅ إذا كنا في نفس المحادثة — أضف الرسالة فوراً
                if (ChatSystem.currentChat === msg.fromUser) {
                    console.log('📩 عرض الرسالة فوراً في المحادثة الحالية');
                    
                    // ✅ عرض الرسالة مباشرة (بدون إعادة عرض الكل)
                    ChatSystem.displayMessage(messageData);
                    
                    // ✅ مرر للأسفل
                    const container = document.getElementById('messagesContainer');
                    if (container) {
                        setTimeout(() => {
                            container.scrollTop = container.scrollHeight;
                        }, 100);
                    }
                } else {
                    // ✅ إشعار كمقروءة
                    if (typeof window.markMessageAsUnread === 'function') {
                        window.markMessageAsUnread(msg.fromUser);
                    }
                }
                
                // ✅ تحديث آخر رسالة
                if (ChatSystem.updateLastMessage) {
                    ChatSystem.updateLastMessage(msg.fromUser, decryptedText);
                }
                
                // ✅ إعادة الترتيب
                if (typeof window.reorderChatsList === 'function') {
                    const list = document.getElementById('chatsList');
                    if (list) window.reorderChatsList(list);
                }
            }
        }
        
        // ✅ حذف الرسالة من السيرفر
        try { 
            await RafeeqAPI.messages.markAsRead(msg.id); 
        } catch(e) {
            console.warn('فشل حذف الرسالة:', e.message);
        }
        
    } catch (error) {
        console.error('❌ خطأ في معالجة الرسالة:', error);
    }
};

// ==================== تشغيل تلقائي ====================
window.addEventListener('authReady', () => {
    setTimeout(async () => {
        await SecureChatSystem.init();
        startSecureChatPolling();
    }, 500);
});

if (window.RafeeqAPI && RafeeqAPI.getToken()) {
    setTimeout(async () => {
        await SecureChatSystem.init();
        startSecureChatPolling();
    }, 1000);
}

window.SecureChatSystem = SecureChatSystem;

console.log('✅ secure-chat.js loaded - Cloudflare mode with 3s polling');
