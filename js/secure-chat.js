// ========== secure-chat.js ==========
// نظام التشفير E2EE + ضغط الصور + فحص الفيديو + إرسال مباشر + حذف 24 ساعة

const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    keyCache: new Map(),
    sharedKeyCache: new Map(),
    
    VIDEO_MAX_DURATION: 180,
    VIDEO_WARNING_DURATION: 170,
    VIDEO_MAX_INPUT_SIZE: 250 * 1024 * 1024,
    
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
            this.startExpiredMessagesCleanup(); // ✅ تنظيف الرسائل المنتهية
            this.startSignalCleanup(); // ✅ تنظيف الإشارات المنتهية
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
    
    // ==================== القسم 5: معالجة الملفات ====================
    async compressImage(file) { 
        return new Promise((resolve, reject) => { 
            const img = new Image(); const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            const url = URL.createObjectURL(file);
            img.onload = () => { 
                URL.revokeObjectURL(url);
                let w = img.width, h = img.height; 
                if (w > 1200 || h > 1200) { if (w > h) { h *= 1200 / w; w = 1200; } else { w *= 1200 / h; h = 1200; } } 
                canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h); 
                canvas.toBlob((blob) => { if (blob) resolve(blob); else reject(new Error('فشل ضغط الصورة')); }, 'image/jpeg', 0.8); 
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('فشل تحميل الصورة')); };
            img.src = url;
        }); 
    },
    
    getVideoDuration(file) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            const url = URL.createObjectURL(file);
            const timeout = setTimeout(() => { URL.revokeObjectURL(url); reject(new Error('انتهت مهلة قراءة الفيديو')); }, 10000);
            video.onloadedmetadata = () => { clearTimeout(timeout); URL.revokeObjectURL(url); resolve(video.duration); };
            video.onerror = () => { clearTimeout(timeout); URL.revokeObjectURL(url); reject(new Error('فشل تحميل الفيديو')); };
            video.preload = 'metadata';
            video.src = url;
        });
    },
    
    validateVideo(file) {
        return this.getVideoDuration(file).then(duration => {
            const durationSec = Math.floor(duration);
            const mins = Math.floor(durationSec / 60);
            const secs = durationSec % 60;
            
            if (duration > this.VIDEO_MAX_DURATION) {
                const warnMins = Math.floor(this.VIDEO_WARNING_DURATION / 60);
                const warnSecs = this.VIDEO_WARNING_DURATION % 60;
                throw new Error(
                    `❌ الفيديو طويل جداً (${mins}:${secs.toString().padStart(2, '0')})\n` +
                    `الحد الأقصى: ${warnMins}:${warnSecs.toString().padStart(2, '0')} دقائق\n` +
                    `💡 قم بقص الفيديو قبل الإرسال`
                );
            }
            
            if (file.size > this.VIDEO_MAX_INPUT_SIZE) {
                const sizeMB = (file.size / 1024 / 1024).toFixed(1), maxMB = (this.VIDEO_MAX_INPUT_SIZE / 1024 / 1024).toFixed(0);
                throw new Error(`❌ حجم الفيديو كبير جداً (${sizeMB}MB)\nالحد الأقصى: ${maxMB}MB`);
            }
            
            console.log(`⚡ فيديو جاهز للإرسال المباشر: ${mins}:${secs.toString().padStart(2, '0')} | ${(file.size/1024/1024).toFixed(1)}MB`);
            return file;
        });
    },
    
    // ==================== القسم 6: إرسال واستقبال الرسائل ====================
async sendToServer(receiverId, encryptedPackage) { 
    if (!receiverId || !encryptedPackage) throw new Error('بيانات غير صالحة للإرسال');
    
    let expiryHours = 24; 
    let expirySeconds = null;
    
    if (encryptedPackage.type === 'feature_request' || 
        encryptedPackage.type === 'feature_response') {
        expirySeconds = 60; 
    }
    
    let expiresAt;
    if (expirySeconds) {
        expiresAt = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + expirySeconds * 1000));
    } else {
        expiresAt = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + expiryHours * 3600000));
    }
    
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

   // ==================== القسم 7: معالجة الرسائل المستلمة (معدل) ====================
    async processReceivedMessage(msg) {
        try {
            const myPrivateKey = await this.getMyPrivateKey(); 
            const senderPublicKey = await this.getReceiverPublicKey(msg.from);
            if (!myPrivateKey || !senderPublicKey) return;
            const sharedKey = await this.deriveSharedKey(myPrivateKey, senderPublicKey);
            
            // 7.1: أنواع الرسائل القابلة للحفظ
            const storableTypes = ['text', 'friend_request_card', 'friend_request_status'];
            if (storableTypes.includes(msg.package.type)) {
                const decryptedData = await this.decryptData(msg.package.data, sharedKey);
                const parsedData = JSON.parse(decryptedData);
                
                ChatSystem.saveMessage(msg.from, parsedData);
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
                
                const lastMsgText = parsedData.type === 'text' ? parsedData.text : 
                                  parsedData.type === 'friend_request_card' ? 'طلب صداقة' : 'حالة طلب الصداقة';
                ChatSystem.updateLastMessage(msg.from, lastMsgText);
            } 
            
            // 7.2: إشارات WebRTC
            else if (msg.package.type === 'webrtc') { 
                if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation || ChatSystem.currentChat !== msg.from) return;
                const signalData = await this.decryptData(msg.package.data, sharedKey);
                const parsedData = JSON.parse(signalData);
                if (parsedData.sdp && parsedData.sdp.type === 'offer') {
                    if (typeof CallSystem !== 'undefined') CallSystem.showIncomingCall(msg.from, parsedData);
                } else if (parsedData.sdp && parsedData.sdp.type === 'answer') {
                    if (CallSystem.pc) await CallSystem.pc.setRemoteDescription(new RTCSessionDescription(parsedData.sdp));
                } else if (parsedData.candidate) {
                    if (CallSystem.pc) await CallSystem.pc.addIceCandidate(new RTCIceCandidate(parsedData.candidate));
                }
            }
            
            // 7.3: طلبات تفعيل الميزات
            else if (msg.package.type === 'feature_request') {
                const featureData = await this.decryptData(msg.package.data, sharedKey);
                const parsed = JSON.parse(featureData);
                if (parsed.action === 'offer') {
                    ChatSystem.featureRequestReceived = true;
                    ChatSystem.receivedOffer = parsed.sdp;
                    ChatSystem.receivedCandidates = parsed.candidates;
                    ChatSystem.startFeatureBlink();
                } else if (parsed.action === 'answer') {
                    ChatSystem.featureRequestPending = false;
                    ChatSystem.featuresEnabled = true;
                    if (CallSystem.pc) {
                        await CallSystem.pc.setRemoteDescription(new RTCSessionDescription(parsed.sdp));
                        if (parsed.candidates) {
                            for (const c of parsed.candidates) await CallSystem.pc.addIceCandidate(new RTCIceCandidate(c));
                        }
                    }
                    ChatSystem.updateAllButtons();
                }
            }
        } catch (error) {
            console.error('❌ خطأ في معالجة الرسالة المستلمة:', error);
        }
    },

    // ==================== القسم 8: تنظيف الرسائل المنتهية (معدل لـ 24 ساعة) ====================
    startExpiredMessagesCleanup() {
        setInterval(async () => {
            console.log('🧹 تنظيف الرسائل المنتهية (24 ساعة)...');
            const now = new Date();
            
            // 1. تنظيف Firestore (يتم تلقائياً عبر expiresAt ولكن نؤكده)
            try {
                const snapshot = await window.db.collection('secure_messages')
                    .where('expiresAt', '<=', now)
                    .get();
                snapshot.forEach(doc => doc.ref.delete());
            } catch(e) {}

            // 2. تنظيف Firestore لطلبات الصداقة المنتهية
            try {
                const requests = await window.db.collection('friendRequests')
                    .where('status', '==', 'pending')
                    .where('expiresAt', '<=', now)
                    .get();
                
                requests.forEach(async doc => {
                    const data = doc.data();
                    // تحديث الحالة إلى منتهية
                    await doc.ref.update({ status: 'expired' });
                    
                    // إرسال رسالة انتهاء الصلاحية للدردشة
                    const expiredMsg = {
                        id: 'expired-' + doc.id,
                        type: 'friend_request_status',
                        text: 'انتهت صلاحية طلب الصداقة (24 ساعة).',
                        sender: 'system',
                        receiver: data.to,
                        requestId: doc.id,
                        timestamp: new Date().toISOString()
                    };
                    
                    ChatSystem.saveMessage(data.from, expiredMsg);
                    ChatSystem.saveMessage(data.to, expiredMsg);
                });
            } catch(e) {}

            // 3. تنظيف localStorage (حذف الرسائل التي مضى عليها 24 ساعة)
            const expiryLimit = now.getTime() - (24 * 3600 * 1000);
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('chat_')) {
                    let messages = JSON.parse(localStorage.getItem(key)) || [];
                    const filtered = messages.filter(m => {
                        const msgTime = new Date(m.time || m.timestamp).getTime();
                        return msgTime > expiryLimit;
                    });
                    if (filtered.length !== messages.length) {
                        localStorage.setItem(key, JSON.stringify(filtered));
                    }
                }
            }
        }, 3600000); // كل ساعة
    },

    startSignalCleanup() {
        setInterval(async () => {
            const now = new Date();
            try {
                const snapshot = await window.db.collection('secure_messages')
                    .where('expiresAt', '<=', now)
                    .get();
                snapshot.forEach(doc => doc.ref.delete());
            } catch(e) {}
        }, 60000); // كل دقيقة للإشارات القصيرة
    }
};

window.SecureChatSystem = SecureChatSystem;
