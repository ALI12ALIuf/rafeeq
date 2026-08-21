// ========== secure-chat.js - النسخة المعدلة (تصحيح تجميع الصور) ==========
// نظام التشفير E2EE + ضغط الصور + إرسال مباشر + حذف 24 ساعة

const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    keyCache: new Map(),
    sharedKeyCache: new Map(),
    
    // ==================== القسم 1: init ====================
    async init() {
        if (!window.auth?.currentUser) { 
            console.error('❌ لا يوجد مستخدم مسجل');
            return false; 
        }
        
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
    
    // ==================== القسم 2: setupKeys ====================
    async setupKeys() {
        const uid = window.auth.currentUser.uid;
        const existingKey = localStorage.getItem(`enc_private_key_${uid}`);
        
        if (!existingKey) {
            console.log('🔑 إنشاء مفاتيح تشفير جديدة...');
            const keyPair = await this.generateKeyPair();
            const publicKey = await this.exportPublicKey(keyPair.publicKey);
            
            await window.db.collection('users').doc(uid).update({ 
                publicKey,
                publicKeyCreatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            const privateExport = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
            
            localStorage.setItem(`enc_private_key_${uid}`, btoa(String.fromCharCode(...new Uint8Array(privateExport))));
            this.keyCache.set(uid, keyPair.privateKey);
            console.log('✅ تم إنشاء المفاتيح بنجاح');
        } else {
            const doc = await window.db.collection('users').doc(uid).get();
            
            if (!doc.exists || !doc.data()?.publicKey) {
                console.log('⚠️ المفتاح العام مفقود، إعادة إنشاء المفاتيح...');
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
    
    // ==================== القسم 3: دوال المفاتيح ====================
    async generateKeyPair() { return await window.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']); },
    async exportPublicKey(key) { const raw = await window.crypto.subtle.exportKey('raw', key); return btoa(String.fromCharCode(...new Uint8Array(raw))); },
    
    async importPublicKey(base64Key) { 
        if (!base64Key) throw new Error('المفتاح العام فارغ');
        try {
            const binary = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
            return await window.crypto.subtle.importKey('raw', binary, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
        } catch (error) { throw error; }
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
        
        try {
            const sharedKey = await window.crypto.subtle.deriveKey({ name: 'ECDH', public: publicKey }, privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
            this.sharedKeyCache.set(cacheKey, sharedKey);
            setTimeout(() => this.sharedKeyCache.delete(cacheKey), 300000);
            return sharedKey;
        } catch (error) { throw error; }
    },
    
    // ==================== القسم 4: دوال التشفير ====================
    async encryptData(data, sharedKey) {
        const encoder = new TextEncoder();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        try {
            const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('rafeeq-secure') }, sharedKey, typeof data === 'string' ? encoder.encode(data) : data);
            const combined = new Uint8Array(iv.length + encrypted.byteLength);
            combined.set(iv);
            combined.set(new Uint8Array(encrypted), iv.length);
            return btoa(String.fromCharCode(...combined));
        } catch (error) { throw error; }
    },
    
    async decryptData(encryptedBase64, sharedKey) {
        const encoder = new TextEncoder();
        try {
            const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
            const iv = combined.slice(0, 12);
            const data = combined.slice(12);
            const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('rafeeq-secure') }, sharedKey, data);
            return new TextDecoder().decode(decrypted);
        } catch (error) { throw error; }
    },
    
    // ==================== القسم 5: ضغط الصور ====================
    async compressImage(file) { 
        return new Promise((resolve, reject) => { 
            const img = new Image(); 
            const canvas = document.createElement('canvas'); 
            const ctx = canvas.getContext('2d');
            const url = URL.createObjectURL(file);
            img.onload = () => { 
                URL.revokeObjectURL(url);
                let w = img.width, h = img.height; 
                if (w > 1200 || h > 1200) { 
                    if (w > h) { 
                        h *= 1200 / w; 
                        w = 1200; 
                    } else { 
                        w *= 1200 / h; 
                        h = 1200; 
                    } 
                } 
                canvas.width = w; 
                canvas.height = h; 
                ctx.drawImage(img, 0, 0, w, h); 
                canvas.toBlob((blob) => { 
                    if (blob) resolve(blob); 
                    else reject(new Error('فشل ضغط الصورة')); 
                }, 'image/jpeg', 0.8); 
            };
            img.onerror = () => { 
                URL.revokeObjectURL(url); 
                reject(new Error('فشل تحميل الصورة')); 
            };
            img.src = url;
        }); 
    },
    
    // ==================== القسم 6: إرسال واستقبال الرسائل ====================
    async sendToServer(receiverId, encryptedPackage) { 
        if (!receiverId || !encryptedPackage) throw new Error('بيانات غير صالحة للإرسال');
        
        let expiryHours = 24;
        let expiresAt = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + expiryHours * 3600000));
        
        try {
            await window.db.collection('secure_messages').add({ 
                to: receiverId, 
                from: window.auth.currentUser.uid, 
                package: encryptedPackage, 
                timestamp: firebase.firestore.FieldValue.serverTimestamp(), 
                expiresAt: expiresAt
            });
        } catch (error) { throw error; }
    },

    // ==================== القسم 6.1: استقبال الرسائل ====================
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

    // ==================== القسم 7: معالجة الرسائل المستلمة ====================
    async processReceivedMessage(msg) {
        try {
            const myPrivateKey = await this.getMyPrivateKey(); 
            const senderPublicKey = await this.getReceiverPublicKey(msg.from);
            if (!myPrivateKey || !senderPublicKey) return;
            const sharedKey = await this.deriveSharedKey(myPrivateKey, senderPublicKey);
            
            if (msg.package.type === 'text') { 
                const decryptedText = await this.decryptData(msg.package.data, sharedKey); 
                ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'text', text: decryptedText, sender: 'friend', time: new Date().toISOString() }); 
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
            }
            else if (msg.package.type === 'image_chunk') {
                // ✅ تصحيح: استخدام packageId من البيانات المشفرة
                try {
                    const decrypted = await this.decryptData(msg.package.data, sharedKey);
                    const chunkData = JSON.parse(decrypted);
                    
                    // ✅ استخدام packageId لتجميع الأجزاء
                    const packageId = chunkData.packageId || msg.package.id.split('_')[0];
                    
                    if (!this._imageChunks) this._imageChunks = {};
                    if (!this._imageChunks[packageId]) {
                        this._imageChunks[packageId] = {
                            total: chunkData.total,
                            chunks: [],
                            fileName: chunkData.fileName || 'صورة',
                            received: 0
                        };
                    }
                    
                    this._imageChunks[packageId].chunks[chunkData.chunk] = chunkData.data;
                    this._imageChunks[packageId].received++;
                    
                    console.log(`📥 استلام قطعة صورة ${this._imageChunks[packageId].received}/${this._imageChunks[packageId].total}`);
                    
                    if (this._imageChunks[packageId].received === this._imageChunks[packageId].total) {
                        let fullData = '';
                        const total = this._imageChunks[packageId].total;
                        for (let i = 0; i < total; i++) {
                            fullData += this._imageChunks[packageId].chunks[i] || '';
                        }
                        
                        const msgId = packageId.split('_')[0];
                        const tempUrl = fullData;
                        
                        ChatSystem.saveMessage(msg.from, { 
                            id: msgId, 
                            type: 'image', 
                            data: tempUrl, 
                            fileName: this._imageChunks[packageId].fileName || 'صورة',
                            sender: 'friend', 
                            time: new Date().toISOString(),
                            _blobUrl: tempUrl
                        });
                        if (ChatSystem.currentChat === msg.from) {
                            ChatSystem.displayMessage({ 
                                id: msgId, 
                                type: 'image', 
                                data: tempUrl, 
                                fileName: this._imageChunks[packageId].fileName || 'صورة',
                                sender: 'friend', 
                                time: new Date().toISOString(),
                                _blobUrl: tempUrl
                            });
                        }
                        
                        console.log('✅ تم تجميع الصورة بنجاح');
                        delete this._imageChunks[packageId];
                    }
                } catch (e) {
                    console.error('❌ خطأ في معالجة قطعة الصورة:', e);
                }
            }
            else if (msg.package.type === 'voice_chunk') {
                // ✅ تصحيح: استخدام packageId من البيانات المشفرة
                try {
                    const decrypted = await this.decryptData(msg.package.data, sharedKey);
                    const chunkData = JSON.parse(decrypted);
                    
                    const packageId = chunkData.packageId || msg.package.id.split('_')[0];
                    
                    if (!this._voiceChunks) this._voiceChunks = {};
                    if (!this._voiceChunks[packageId]) {
                        this._voiceChunks[packageId] = {
                            total: chunkData.total,
                            chunks: [],
                            received: 0
                        };
                    }
                    
                    this._voiceChunks[packageId].chunks[chunkData.chunk] = chunkData.data;
                    this._voiceChunks[packageId].received++;
                    
                    console.log(`📥 استلام قطعة صوت ${this._voiceChunks[packageId].received}/${this._voiceChunks[packageId].total}`);
                    
                    if (this._voiceChunks[packageId].received === this._voiceChunks[packageId].total) {
                        let fullData = '';
                        const total = this._voiceChunks[packageId].total;
                        for (let i = 0; i < total; i++) {
                            fullData += this._voiceChunks[packageId].chunks[i] || '';
                        }
                        
                        const msgId = packageId.split('_')[0];
                        const tempUrl = fullData;
                        
                        ChatSystem.saveMessage(msg.from, { 
                            id: msgId, 
                            type: 'voice', 
                            data: tempUrl, 
                            sender: 'friend', 
                            time: new Date().toISOString(),
                            _blobUrl: tempUrl
                        });
                        if (ChatSystem.currentChat === msg.from) {
                            ChatSystem.displayMessage({ 
                                id: msgId, 
                                type: 'voice', 
                                data: tempUrl, 
                                sender: 'friend', 
                                time: new Date().toISOString(),
                                _blobUrl: tempUrl
                            });
                        }
                        
                        console.log('✅ تم تجميع البصمة الصوتية بنجاح');
                        delete this._voiceChunks[packageId];
                    }
                } catch (e) {
                    console.error('❌ خطأ في معالجة قطعة الصوت:', e);
                }
            }
            
            if (typeof loadChats === 'function') loadChats();
        } catch (error) {
            console.error('❌ خطأ في معالجة الرسالة:', error);
        }
    }
};

// ==================== التنظيف الموحد ====================
async function cleanAllExpiredData() {
    try {
        const now = new Date();
        const batch = window.db.batch();
        let totalDeleted = 0;
        
        const messagesSnapshot = await window.db.collection('secure_messages')
            .where('expiresAt', '<', firebase.firestore.Timestamp.fromDate(now))
            .get();
        
        messagesSnapshot.forEach(doc => {
            batch.delete(doc.ref);
            totalDeleted++;
        });
        
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const signalsSnapshot = await window.db.collection('secure_messages')
            .where('timestamp', '<', firebase.firestore.Timestamp.fromDate(oneDayAgo))
            .get();
        
        signalsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
            totalDeleted++;
        });
        
        if (totalDeleted > 0) {
            await batch.commit();
            console.log(`🗑️ [تنظيف موحد] تم حذف ${totalDeleted} عنصر منتهي الصلاحية`);
        }
        
        return totalDeleted;
        
    } catch (e) {
        console.warn('⚠️ خطأ في التنظيف الموحد:', e);
        return 0;
    }
}

function startUnifiedCleanup() {
    cleanAllExpiredData();
    setInterval(cleanAllExpiredData, 24 * 60 * 60 * 1000);
}
