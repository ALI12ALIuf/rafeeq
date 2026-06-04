// ========== secure-chat.js - النسخة المتوافقة مع الفصل ==========
// نظام التشفير E2EE + ضغط الصور + فحص الفيديو

const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    keyCache: new Map(),
    sharedKeyCache: new Map(),
    
    VIDEO_MAX_DURATION: 180,
    VIDEO_WARNING_DURATION: 170,
    VIDEO_MAX_INPUT_SIZE: 250 * 1024 * 1024,
    
    async init() {
        if (!window.auth?.currentUser) { 
            console.error('❌ لا يوجد مستخدم مسجل');
            return false; 
        }
        try {
            console.log('🔐 بدء تهيئة نظام التشفير...');
            await this.setupKeys();
            this.startReceiving();
            if (typeof PresenceSystem !== 'undefined') PresenceSystem.setOnline();
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
                throw new Error(`❌ الفيديو طويل جداً (${mins}:${secs.toString().padStart(2, '0')})\nالحد الأقصى: ${warnMins}:${warnSecs.toString().padStart(2, '0')} دقائق`);
            }
            
            if (file.size > this.VIDEO_MAX_INPUT_SIZE) {
                const sizeMB = (file.size / 1024 / 1024).toFixed(1), maxMB = (this.VIDEO_MAX_INPUT_SIZE / 1024 / 1024).toFixed(0);
                throw new Error(`❌ حجم الفيديو كبير جداً (${sizeMB}MB)\nالحد الأقصى: ${maxMB}MB`);
            }
            
            console.log(`⚡ فيديو جاهز للإرسال: ${mins}:${secs.toString().padStart(2, '0')} | ${(file.size/1024/1024).toFixed(1)}MB`);
            return file;
        });
    },
    
    fileToBase64(blob) { 
        return new Promise((resolve, reject) => { 
            const reader = new FileReader(); 
            reader.onloadend = () => resolve(reader.result); 
            reader.onerror = () => reject(new Error('فشل قراءة الملف'));
            reader.readAsDataURL(blob); 
        }); 
    },
    
    async sendToServer(receiverId, encryptedPackage) { 
        if (!receiverId || !encryptedPackage) throw new Error('بيانات غير صالحة للإرسال');
        
        let expirySeconds = null;
        if (encryptedPackage.type === 'webrtc' || 
            encryptedPackage.type === 'file_offer' ||
            encryptedPackage.type === 'file_answer' || 
            encryptedPackage.type === 'file_ice' ||
            encryptedPackage.type === 'feature_request' || 
            encryptedPackage.type === 'feature_response') {
            expirySeconds = 30;
        }
        
        let expiresAt;
        if (expirySeconds) {
            expiresAt = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + expirySeconds * 1000));
        } else {
            expiresAt = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 3600000));
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
        }, error => { setTimeout(() => this.startReceiving(), 5000); }); 
    },
    
    // ========== الدالة الرئيسية لمعالجة الرسائل ==========
    async processReceivedMessage(msg) {
        try {
            const myPrivateKey = await this.getMyPrivateKey(); 
            const senderPublicKey = await this.getReceiverPublicKey(msg.from);
            if (!myPrivateKey || !senderPublicKey) return;
            const sharedKey = await this.deriveSharedKey(myPrivateKey, senderPublicKey);
            
            // رسائل نصية
            if (msg.package.type === 'text') { 
                const decryptedText = await this.decryptData(msg.package.data, sharedKey); 
                ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'text', text: decryptedText, sender: 'friend', time: new Date().toISOString() }); 
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
                ChatSystem.updateLastMessage(msg.from, decryptedText); 
            }
            
            // ==================== إشارات WebRTC (للمكالمات - تبقى على النظام القديم) ====================
            else if (msg.package.type === 'webrtc') { 
                if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation || ChatSystem.currentChat !== msg.from) {
                    console.log('📞 تجاهل إشارة WebRTC - الميزات غير مفعلة');
                    return;
                }
                
                const signalData = await this.decryptData(msg.package.data, sharedKey);
                const parsedData = JSON.parse(signalData);
                
                console.log('📞 استلام إشارة WebRTC من:', msg.from);
                console.log('📞 نوع الإشارة:', parsedData.sdp?.type || parsedData.type || 'ICE candidate');
                
                // ✅ استخدام CallSystem الأصلي للمكالمات
                if (parsedData.sdp && parsedData.sdp.type === 'offer') {
                    console.log('📞 مكالمة واردة جديدة من:', msg.from);
                    if (typeof CallSystem !== 'undefined' && CallSystem.showIncomingCall) {
                        CallSystem.showIncomingCall(msg.from, parsedData);
                    } else {
                        console.error('❌ CallSystem.showIncomingCall غير موجود');
                    }
                } 
                else {
                    if (typeof CallSystem !== 'undefined' && CallSystem.handleSignaling) {
                        CallSystem.handleSignaling(parsedData);
                    }
                }
            }
            
            // ==================== إشارات الملفات (ChatDataSystem - نظام جديد) ====================
            else if (msg.package.type === 'file_offer' || 
                     msg.package.type === 'file_answer' || 
                     msg.package.type === 'file_ice' ||
                     msg.package.type === 'file_signal') {
                
                if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation || ChatSystem.currentChat !== msg.from) {
                    console.log('📁 تجاهل إشارة ملف');
                    return;
                }
                
                const signalData = await this.decryptData(msg.package.data, sharedKey);
                const parsedData = JSON.parse(signalData);
                
                console.log('📁 استلام إشارة ملف من:', msg.from, 'نوع:', msg.package.type);
                
                if (typeof ChatDataSystem !== 'undefined' && ChatDataSystem.handleSignaling) {
                    await ChatDataSystem.handleSignaling(parsedData);
                } else {
                    console.error('❌ ChatDataSystem.handleSignaling غير موجود');
                }
            }
            
            // ==================== طلبات الميزات ====================
            else if (msg.package.type === 'feature_request') {
                console.log('🔓 استلام طلب تفعيل ميزات من:', msg.from);
                if (typeof ChatSystem !== 'undefined' && ChatSystem.handleFeatureRequest) {
                    ChatSystem.handleFeatureRequest(msg.from);
                }
            }
            else if (msg.package.type === 'feature_response') {
                const decryptedData = await this.decryptData(msg.package.data, sharedKey);
                const responseData = JSON.parse(decryptedData);
                console.log('🔓 استلام رد على طلب التفعيل من:', msg.from, '| الحالة:', responseData.action);
                if (typeof ChatSystem !== 'undefined' && ChatSystem.handleFeatureResponse) {
                    ChatSystem.handleFeatureResponse(msg.from, responseData.action);
                }
            }
            else if (msg.package.type === 'force_disable_features') {
                console.log('🔴 استلام إشارة إلغاء الميزات من:', msg.from);
                if (typeof ChatSystem !== 'undefined' && ChatSystem.currentChat === msg.from) {
                    ChatSystem.disableFeatures();
                }
            }
            
            // ==================== الملفات والوسائط ====================
            else if (msg.package.type === 'location') {
                const decryptedLocation = await this.decryptData(msg.package.data, sharedKey);
                const locationData = JSON.parse(decryptedLocation);
                ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'location', data: locationData, sender: 'friend', time: new Date().toISOString() });
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
            }
            else if (msg.package.type === 'file' || msg.package.type === 'image' || msg.package.type === 'video' || msg.package.type === 'voice') {
                const decryptedFile = await this.decryptData(msg.package.data, sharedKey);
                ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: msg.package.type, data: decryptedFile, fileName: msg.package.fileName, sender: 'friend', time: new Date().toISOString() });
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
            }
            
            if (typeof loadChats === 'function') loadChats();
        } catch (error) {
            console.error('❌ خطأ في معالجة الرسالة:', error);
        }
    }
};
