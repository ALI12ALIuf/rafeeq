// ========== secure-chat.js - النسخة النهائية ==========

const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    keyCache: new Map(),
    sharedKeyCache: new Map(),
    
    async init() {
        if (!window.auth?.currentUser) { return false; }
        try {
            console.log('🔐 بدء تهيئة نظام التشفير...');
            await this.setupKeys();
            this.startReceiving();
            startUnifiedCleanup();
            console.log('✅ تم تهيئة نظام التشفير بنجاح');
            return true;
        } catch (error) {
            console.error('❌ فشل تهيئة نظام التشفير:', error);
            return false;
        }
    },
    
    async setupKeys() {
        const uid = window.auth.currentUser.uid;
        const existingKey = localStorage.getItem(`enc_private_key_${uid}`);
        
        if (!existingKey) {
            const keyPair = await this.generateKeyPair();
            const publicKey = await this.exportPublicKey(keyPair.publicKey);
            await window.db.collection('users').doc(uid).update({ 
                publicKey,
                publicKeyCreatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            const privateExport = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
            localStorage.setItem(`enc_private_key_${uid}`, btoa(String.fromCharCode(...new Uint8Array(privateExport))));
            this.keyCache.set(uid, keyPair.privateKey);
        } else {
            const doc = await window.db.collection('users').doc(uid).get();
            if (!doc.exists || !doc.data()?.publicKey) {
                const keyPair = await this.generateKeyPair();
                const publicKey = await this.exportPublicKey(keyPair.publicKey);
                await window.db.collection('users').doc(uid).update({ 
                    publicKey,
                    publicKeyCreatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                const privateExport = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
                localStorage.setItem(`enc_private_key_${uid}`, btoa(String.fromCharCode(...new Uint8Array(privateExport))));
                this.keyCache.set(uid, keyPair.privateKey);
            }
        }
    },
    
    async generateKeyPair() { 
        return await window.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']); 
    },
    
    async exportPublicKey(key) { 
        const raw = await window.crypto.subtle.exportKey('raw', key); 
        return btoa(String.fromCharCode(...new Uint8Array(raw))); 
    },
    
    async importPublicKey(base64Key) { 
        if (!base64Key) throw new Error('المفتاح العام فارغ');
        const binary = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
        return await window.crypto.subtle.importKey('raw', binary, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    },
    
    async getMyPrivateKey() {
        const uid = window.auth?.currentUser?.uid;
        if (!uid) return null;
        if (this.keyCache.has(uid)) return this.keyCache.get(uid);
        const stored = localStorage.getItem(`enc_private_key_${uid}`);
        if (!stored) return null;
        try {
            const binary = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
            const key = await window.crypto.subtle.importKey('pkcs8', binary, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
            this.keyCache.set(uid, key);
            return key;
        } catch (error) { return null; }
    },
    
    async getReceiverPublicKey(userId) {
        if (!userId) return null;
        try {
            const doc = await window.db.collection('users').doc(userId).get();
            if (!doc.exists || !doc.data()?.publicKey) return null;
            return await this.importPublicKey(doc.data().publicKey);
        } catch (error) { return null; }
    },
    
    async deriveSharedKey(privateKey, publicKey) {
        const cacheKey = `${window.auth.currentUser.uid}_${await this.exportPublicKey(publicKey)}`;
        if (this.sharedKeyCache.has(cacheKey)) return this.sharedKeyCache.get(cacheKey);
        const sharedKey = await window.crypto.subtle.deriveKey({ 
            name: 'ECDH', public: publicKey 
        }, privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        this.sharedKeyCache.set(cacheKey, sharedKey);
        setTimeout(() => this.sharedKeyCache.delete(cacheKey), 300000);
        return sharedKey;
    },
    
    async encryptData(data, sharedKey) {
        const encoder = new TextEncoder();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await window.crypto.subtle.encrypt({ 
            name: 'AES-GCM', iv, additionalData: encoder.encode('rafeeq-secure') 
        }, sharedKey, typeof data === 'string' ? encoder.encode(data) : data);
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
        const decrypted = await window.crypto.subtle.decrypt({ 
            name: 'AES-GCM', iv, additionalData: encoder.encode('rafeeq-secure') 
        }, sharedKey, data);
        return new TextDecoder().decode(decrypted);
    },
    
    async sendToServer(receiverId, encryptedPackage) { 
        if (!receiverId || !encryptedPackage) throw new Error('بيانات غير صالحة');
        let expiresAt = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 3600000));
        await window.db.collection('secure_messages').add({ 
            to: receiverId, 
            from: window.auth.currentUser.uid, 
            package: encryptedPackage, 
            timestamp: firebase.firestore.FieldValue.serverTimestamp(), 
            expiresAt: expiresAt
        });
    },

    startReceiving() { 
        if (!window.auth?.currentUser) return null;
        const uid = window.auth.currentUser.uid;
        return window.db.collection('secure_messages').where('to', '==', uid).onSnapshot(async snapshot => { 
            for (const change of snapshot.docChanges()) { 
                if (change.type === 'added') { 
                    const msg = { id: change.doc.id, ...change.doc.data() }; 
                    await this.processReceivedMessage(msg); 
                    try { await change.doc.ref.delete(); } catch (deleteError) {}
                } 
            } 
        }, error => { 
            console.warn('خطأ في الاستماع للرسائل:', error);
            setTimeout(() => this.startReceiving(), 5000); 
        }); 
    },

    async processReceivedMessage(msg) {
        try {
            const myPrivateKey = await this.getMyPrivateKey(); 
            const senderPublicKey = await this.getReceiverPublicKey(msg.from);
            if (!myPrivateKey || !senderPublicKey) return;
            const sharedKey = await this.deriveSharedKey(myPrivateKey, senderPublicKey);
            
            if (msg.package.type === 'text') { 
                const decryptedText = await this.decryptData(msg.package.data, sharedKey); 
                
                ChatSystem.saveMessage(msg.from, { 
                    id: msg.package.id, 
                    type: 'text', 
                    text: decryptedText, 
                    sender: 'friend', 
                    time: new Date().toISOString() 
                }); 
                
                if (ChatSystem.currentChat === msg.from) {
                    ChatSystem.displayMessages(msg.from);
                } else {
                    if (typeof window.markMessageAsUnread === 'function') {
                        window.markMessageAsUnread(msg.from);
                    }
                }
                
                ChatSystem.updateLastMessage(msg.from, decryptedText); 
                
                // ✅ إعادة الترتيب
                if (typeof window.reorderChatsList === 'function') {
                    const list = document.getElementById('chatsList');
                    if (list) window.reorderChatsList(list);
                }
            } 
            
            if (typeof loadChats === 'function') loadChats();
        } catch (error) {
            console.error('❌ خطأ في معالجة الرسالة:', error);
        }
    }
};

async function cleanAllExpiredData() {
    try {
        const now = new Date();
        const batch = window.db.batch();
        let totalDeleted = 0;
        
        const messagesSnapshot = await window.db.collection('secure_messages')
            .where('expiresAt', '<', firebase.firestore.Timestamp.fromDate(now))
            .get();
        messagesSnapshot.forEach(doc => { batch.delete(doc.ref); totalDeleted++; });
        
        const requestsSnapshot = await window.db.collection('friendRequests')
            .where('expiresAt', '<', firebase.firestore.Timestamp.fromDate(now))
            .get();
        requestsSnapshot.forEach(doc => { batch.delete(doc.ref); totalDeleted++; });
        
        if (totalDeleted > 0) {
            await batch.commit();
            console.log(`🗑️ تم حذف ${totalDeleted} عنصر منتهي الصلاحية`);
        }
        return totalDeleted;
    } catch (e) {
        console.warn('⚠️ خطأ في التنظيف:', e);
        return 0;
    }
}

function startUnifiedCleanup() {
    cleanAllExpiredData();
    setInterval(cleanAllExpiredData, 24 * 60 * 60 * 1000);
}
