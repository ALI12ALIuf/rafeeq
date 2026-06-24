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
            
            // ✅ التحقق من صحة المفاتيح (جديد)
            await this.ensureValidKeys();
            
            await this.setupKeys();
            this.startReceiving();
            this.startExpiredMessagesCleanup();
            this.startSignalCleanup();
            console.log('✅ تم تهيئة نظام التشفير بنجاح');
            return true;
        } catch (error) {
            console.error('❌ فشل تهيئة نظام التشفير:', error);
            return false;
        }
    },
    
    // ==================== القسم 1.5: التحقق من صحة المفاتيح (معدل - مع اختبار التوافق) ====================
async ensureValidKeys() {
    const uid = window.auth.currentUser.uid;
    
    // 1. التحقق من وجود المفتاح الخاص في localStorage
    const privateKey = localStorage.getItem(`enc_private_key_${uid}`);
    if (!privateKey) {
        console.log('🔑 المفتاح الخاص مفقود، إعادة إنشاء المفاتيح...');
        await this.setupKeys();
        return true;
    }
    
    // 2. التحقق من وجود المفتاح العام في Firebase
    let publicKeyFromFirebase = null;
    try {
        const doc = await window.db.collection('users').doc(uid).get();
        if (!doc.exists || !doc.data()?.publicKey) {
            console.log('🔑 المفتاح العام مفقود في Firebase، إعادة إنشاء المفاتيح...');
            await this.setupKeys();
            return true;
        }
        publicKeyFromFirebase = doc.data().publicKey;
    } catch (e) {
        console.warn('⚠️ فشل التحقق من المفتاح العام، إعادة إنشاء المفاتيح...');
        await this.setupKeys();
        return true;
    }
    
    // 3. ✅ التحقق من تطابق المفتاحين (جديد - لحل مشكلة OperationError)
    try {
        // استيراد المفتاح العام من Firebase
        const publicKey = await this.importPublicKey(publicKeyFromFirebase);
        
        // الحصول على المفتاح الخاص
        const privateKeyObj = await this.getMyPrivateKey();
        if (!privateKeyObj) {
            console.log('🔑 المفتاح الخاص غير صالح، إعادة إنشاء المفاتيح...');
            await this.setupKeys();
            return true;
        }
        
        // ✅ اختبار التوافق: محاولة اشتقاق مفتاح مشترك
        try {
            // نشتق مفتاحاً مشتركاً مع المفتاح العام الخاص بنا (اختبار فقط)
            const testKey = await this.deriveSharedKey(privateKeyObj, publicKey);
            console.log('✅ المفاتيح متطابقة وصالحة');
        } catch (e) {
            console.log('🔑 المفاتيح غير متطابقة (خطأ في الاشتقاق)، إعادة إنشاء المفاتيح...');
            console.log('   سبب الخطأ:', e.message);
            await this.setupKeys();
            return true;
        }
    } catch (e) {
        console.log('🔑 فشل اختبار المفاتيح، إعادة إنشاء المفاتيح...');
        console.log('   سبب الخطأ:', e.message);
        await this.setupKeys();
        return true;
    }
    
    console.log('✅ المفاتيح صالحة ومتطابقة');
    return true;
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
    
    // ❌ تم حذف fileToBase64 (غير مستخدمة، الملفات تمر مباشرة عبر Data Channel P2P)
    
    // ==================== القسم 6: إرسال واستقبال الرسائل ====================
async sendToServer(receiverId, encryptedPackage) { 
    if (!receiverId || !encryptedPackage) throw new Error('بيانات غير صالحة للإرسال');
    
    // ✅ تحديد مدة الصلاحية حسب نوع الإشارة
    let expiryHours = 24; // الافتراضي 24 ساعة
    let expirySeconds = null;
    
    // ✅ فقط feature_request و feature_response تحتاج مدة قصيرة
    if (encryptedPackage.type === 'feature_request' || 
        encryptedPackage.type === 'feature_response') {
        expirySeconds = 60; // 60 ثانية لتفعيل الميزات (تتوافق مع blinking)
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


// ==================== القسم 7: معالجة الرسائل المستلمة (معدل - مع إعادة المحاولة التلقائية) ====================
async processReceivedMessage(msg) {
    try {
        let decryptedData = null;
        let sharedKey = null;
        let retryCount = 0;
        const maxRetries = 2;
        let lastError = null;
        
        // ✅ محاولة فك التشفير مع إعادة المحاولة التلقائية
        while (retryCount <= maxRetries) {
            try {
                const myPrivateKey = await this.getMyPrivateKey();
                const senderPublicKey = await this.getReceiverPublicKey(msg.from);
                
                if (!myPrivateKey || !senderPublicKey) {
                    console.log('❌ مفاتيح غير صالحة للمستخدم:', msg.from);
                    return;
                }
                
                sharedKey = await this.deriveSharedKey(myPrivateKey, senderPublicKey);
                
                // ✅ فك تشفير البيانات
                if (msg.package.data) {
                    decryptedData = await this.decryptData(msg.package.data, sharedKey);
                }
                
                // ✅ إذا وصلنا هنا، فك التشفير نجح
                break;
                
            } catch (e) {
                lastError = e;
                retryCount++;
                console.log(`🔄 محاولة فك التشفير ${retryCount}/${maxRetries} فشلت:`, e.message);
                
                if (retryCount <= maxRetries) {
                    // ✅ طلب المفتاح العام الجديد من الطرف الآخر
                    console.log('📤 طلب مفتاح عام جديد من:', msg.from);
                    await this.requestPublicKeyUpdate(msg.from);
                    
                    // انتظار وصول المفتاح الجديد
                    await new Promise(r => setTimeout(r, 1500));
                    
                    // مسح الكاش المؤقت للمفتاح المشترك
                    this.sharedKeyCache.clear();
                }
            }
        }
        
        // ✅ إذا فشلت جميع المحاولات
        if (!decryptedData && lastError) {
            console.error('❌ فشل فك التشفير بعد المحاولات:', lastError.message);
            return;
        }
        
        // ============================================================
        // القسم 7.1: رسائل نصية
        // ============================================================
        if (msg.package.type === 'text') {
            try {
                const decryptedText = await this.decryptData(msg.package.data, sharedKey);
                ChatSystem.saveMessage(msg.from, {
                    id: msg.package.id,
                    type: 'text',
                    text: decryptedText,
                    sender: 'friend',
                    time: new Date().toISOString()
                });
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
                ChatSystem.updateLastMessage(msg.from, decryptedText);
            } catch (e) {
                console.error('❌ فشل فك تشفير النص:', e);
            }
        }
        
        // ============================================================
        // القسم 7.2: إشارات WebRTC
        // ============================================================
        else if (msg.package.type === 'webrtc') {
            if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation || ChatSystem.currentChat !== msg.from) {
                console.log('📞 تجاهل إشارة WebRTC - سبب:', {
                    featuresEnabled: ChatSystem.featuresEnabled,
                    friendInConversation: ChatSystem.friendInConversation,
                    currentChat: ChatSystem.currentChat,
                    sender: msg.from
                });
                return;
            }
            
            try {
                const signalData = await this.decryptData(msg.package.data, sharedKey);
                const parsedData = JSON.parse(signalData);
                
                console.log('📞 استلام إشارة WebRTC من:', msg.from);
                console.log('📞 نوع الإشارة:', parsedData.sdp?.type || parsedData.type || 'ICE candidate');
                
                if (parsedData.sdp && parsedData.sdp.type === 'offer') {
                    console.log('📞 مكالمة واردة جديدة من:', msg.from, 'نوع:', parsedData.type || 'audio');
                    if (typeof CallSystem !== 'undefined' && CallSystem.showIncomingCall) {
                        CallSystem.showIncomingCall(msg.from, parsedData);
                    } else {
                        console.error('❌ CallSystem.showIncomingCall غير موجود');
                    }
                } else {
                    if (typeof CallSystem !== 'undefined' && CallSystem.handleSignaling) {
                        CallSystem.handleSignaling(parsedData);
                    }
                }
            } catch (e) {
                console.error('❌ فشل معالجة إشارة WebRTC:', e);
            }
        }
        
        // ============================================================
        // القسم 7.3: طلب تفعيل الميزات
        // ============================================================
        else if (msg.package.type === 'feature_request') {
            console.log('🔓 استلام طلب تفعيل ميزات من:', msg.from);
            if (typeof ChatSystem !== 'undefined' && ChatSystem.handleFeatureRequest) {
                ChatSystem.handleFeatureRequest(msg.from, msg.package.data);
            }
        }
        
        // ============================================================
        // القسم 7.4: رد على طلب التفعيل
        // ============================================================
        else if (msg.package.type === 'feature_response') {
            try {
                const responseData = JSON.parse(decryptedData);
                console.log('🔓 استلام رد على طلب التفعيل من:', msg.from, '| الحالة:', responseData.action);
                
                // ✅ معالجة الدفعة (answer_batch)
                if (responseData.action === 'answer_batch' && responseData.sdp) {
                    console.log(`📦 استلام دفعة الرد (Answer + ${responseData.iceCandidates?.length || 0} ICE candidates) من:`, msg.from);
                    
                    if (typeof ChatSystem !== 'undefined') {
                        ChatSystem.featureRequestPending = false;
                        ChatSystem.featureRequestReceived = false;
                        if (ChatSystem.featureBlinkInterval) {
                            clearInterval(ChatSystem.featureBlinkInterval);
                            ChatSystem.featureBlinkInterval = null;
                        }
                        const switchLabel = document.getElementById('featureSwitchLabel');
                        if (switchLabel) switchLabel.classList.remove('blinking');
                        ChatSystem.featuresEnabled = true;
                        if (ChatSystem.currentChat === msg.from) {
                            ChatSystem.friendInConversation = true;
                        }
                        const toggleInput = document.getElementById('featureToggleInput');
                        if (toggleInput) toggleInput.checked = true;
                        ChatSystem.updateAllButtons();
                        console.log('✅ تم تحديث حالة المرسل بعد استلام answer_batch');
                    }
                    
                    if (typeof CallSystem !== 'undefined' && CallSystem.pc && CallSystem.pc.signalingState !== 'closed') {
                        try {
                            const answerSdp = new RTCSessionDescription({
                                type: responseData.sdp.type,
                                sdp: responseData.sdp.sdp
                            });
                            await CallSystem.pc.setRemoteDescription(answerSdp);
                            console.log('✅ تم تعيين Answer SDP');
                            
                            for (const ice of (responseData.iceCandidates || [])) {
                                try {
                                    await CallSystem.pc.addIceCandidate(new RTCIceCandidate(ice));
                                    console.log('✅ تم إضافة ICE candidate من الدفعة');
                                } catch(e) {
                                    console.warn('فشل إضافة ICE candidate:', e);
                                }
                            }
                            console.log('✅ تم معالجة دفعة الرد بنجاح');
                        } catch(e) {
                            console.error('❌ فشل معالجة دفعة الرد:', e);
                        }
                    }
                }
                // ✅ معالجة answer العادي
                else if (responseData.action === 'answer' && responseData.sdp) {
                    console.log('📞 استلام Answer منفرد (دعم خلفي)');
                    
                    if (typeof ChatSystem !== 'undefined') {
                        ChatSystem.featureRequestPending = false;
                        ChatSystem.featureRequestReceived = false;
                        if (ChatSystem.featureBlinkInterval) {
                            clearInterval(ChatSystem.featureBlinkInterval);
                            ChatSystem.featureBlinkInterval = null;
                        }
                        const switchLabel = document.getElementById('featureSwitchLabel');
                        if (switchLabel) switchLabel.classList.remove('blinking');
                        ChatSystem.featuresEnabled = true;
                        if (ChatSystem.currentChat === msg.from) {
                            ChatSystem.friendInConversation = true;
                        }
                        const toggleInput = document.getElementById('featureToggleInput');
                        if (toggleInput) toggleInput.checked = true;
                        ChatSystem.updateAllButtons();
                    }
                    
                    if (typeof CallSystem !== 'undefined' && CallSystem.pc && CallSystem.pc.signalingState !== 'closed') {
                        try {
                            const answerSdp = new RTCSessionDescription({
                                type: responseData.sdp.type,
                                sdp: responseData.sdp.sdp
                            });
                            await CallSystem.pc.setRemoteDescription(answerSdp);
                            console.log('✅ تم تعيين Answer SDP');
                        } catch(e) {
                            console.error('❌ فشل تعيين Answer:', e);
                        }
                    }
                }
                // ✅ معالجة ice منفرد
                else if (responseData.action === 'ice' && responseData.candidate) {
                    console.log('📞 استلام ICE candidate منفرد (دعم خلفي)');
                    if (typeof CallSystem !== 'undefined' && CallSystem.pc) {
                        try {
                            await CallSystem.pc.addIceCandidate(new RTCIceCandidate(responseData.candidate.candidate));
                            console.log('✅ تم إضافة ICE candidate منفرد');
                        } catch(e) {
                            console.warn('فشل إضافة ICE candidate:', e);
                        }
                    }
                }
                // ✅ معالجة accepted
                else if (responseData.action === 'accepted') {
                    console.log('✅ تم قبول طلب التفعيل من:', msg.from);
                    if (typeof ChatSystem !== 'undefined' && ChatSystem.handleFeatureResponse) {
                        ChatSystem.handleFeatureResponse(msg.from, responseData.action);
                    }
                }
                // ✅ معالجة rejected
                else if (responseData.action === 'rejected') {
                    console.log('❌ تم رفض طلب التفعيل من:', msg.from);
                    if (typeof ChatSystem !== 'undefined' && ChatSystem.handleFeatureResponse) {
                        ChatSystem.handleFeatureResponse(msg.from, responseData.action);
                    }
                }
                // ✅ معالجة disable
                else if (responseData.action === 'disable') {
                    console.log('🔴 استلام إشارة إيقاف من:', msg.from);
                    if (typeof ChatSystem !== 'undefined' && ChatSystem.handleFeatureResponse) {
                        ChatSystem.handleFeatureResponse(msg.from, responseData.action);
                    }
                } else {
                    if (typeof ChatSystem !== 'undefined' && ChatSystem.handleFeatureResponse) {
                        ChatSystem.handleFeatureResponse(msg.from, responseData.action);
                    }
                }
            } catch (e) {
                console.error('❌ فشل معالجة رد التفعيل:', e);
            }
        }
        
        // ============================================================
        // القسم 7.5: إشارة إلغاء الميزات
        // ============================================================
        else if (msg.package.type === 'force_disable_features') {
            console.log('🔴 استلام إشارة إلغاء الميزات من:', msg.from);
            
            if (typeof ChatSystem !== 'undefined' && ChatSystem.currentChat === msg.from) {
                console.log('⚠️ تم إلغاء الميزات بناءً على طلب الطرف الآخر (انتهاء الـ 120 ثانية)');
                
                ChatSystem.featuresEnabled = false;
                ChatSystem.featureRequestPending = false;
                ChatSystem.featureRequestReceived = false;
                
                const toggleInput = document.getElementById('featureToggleInput');
                if (toggleInput) toggleInput.checked = false;
                
                const kickBtn = document.getElementById('kickBtn');
                if (kickBtn) {
                    kickBtn.classList.remove('active');
                    kickBtn.style.opacity = '0.5';
                    kickBtn.style.pointerEvents = 'none';
                }
                
                ChatSystem.updateAllButtons();
            }
        }
        
        // ============================================================
        // القسم 7.6: مشاركة الموقع
        // ============================================================
        else if (msg.package.type === 'location') {
            try {
                const decryptedLocation = await this.decryptData(msg.package.data, sharedKey);
                const locationData = JSON.parse(decryptedLocation);
                ChatSystem.saveMessage(msg.from, {
                    id: msg.package.id,
                    type: 'location',
                    data: locationData,
                    sender: 'friend',
                    time: new Date().toISOString()
                });
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
            } catch (e) {
                console.error('❌ فشل معالجة الموقع:', e);
            }
        }
        
        // ============================================================
        // القسم 7.7: تحديث المفتاح العام (جديد)
        // ============================================================
        else if (msg.package.type === 'public_key_update') {
            console.log('📥 استلام تحديث مفتاح عام من:', msg.from);
            try {
                const publicKey = msg.package.data;
                if (publicKey && msg.from) {
                    await window.db.collection('users').doc(msg.from).update({
                        publicKey: publicKey,
                        publicKeyUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    this.sharedKeyCache.clear();
                    console.log('✅ تم تحديث المفتاح العام في Firebase للمستخدم:', msg.from);
                }
            } catch (e) {
                console.warn('⚠️ فشل تحديث المفتاح العام:', e);
            }
        }
        
        // ============================================================
        // القسم 7.8: طلب تحديث المفتاح العام (جديد)
        // ============================================================
        else if (msg.package.type === 'request_public_key') {
            console.log('📥 استلام طلب تحديث مفتاح من:', msg.from);
            if (typeof ChatSystem !== 'undefined' && ChatSystem.currentChat === msg.from) {
                ChatSystem.sendPublicKeyToFriend(msg.from);
            }
        }
        
        if (typeof loadChats === 'function') loadChats();
        
    } catch (error) {
        console.error('❌ خطأ في معالجة الرسالة:', error);
    }
},

// ==================== القسم 7.9: طلب تحديث المفتاح العام (جديد) ====================
async requestPublicKeyUpdate(friendId) {
    try {
        await this.sendToServer(friendId, {
            type: 'request_public_key',
            from: window.auth.currentUser.uid,
            timestamp: Date.now()
        });
        console.log('📤 تم إرسال طلب تحديث المفتاح إلى:', friendId);
    } catch (e) {
        console.warn('⚠️ فشل إرسال طلب تحديث المفتاح:', e);
    }
},
    
    // ==================== القسم 8: تنظيف الرسائل المنتهية الصلاحية (جميع المستخدمين) ====================
async cleanExpiredMessages() {
    // ✅ لا نتحقق من المستخدم (تنظيف عام لجميع الرسائل المنتهية)
    
    try {
        const now = new Date();
        const snapshot = await window.db.collection('secure_messages')
            .where('expiresAt', '<', firebase.firestore.Timestamp.fromDate(now))
            .get();
        
        for (const doc of snapshot.docs) {
            await doc.ref.delete();
            console.log('🗑️ تم حذف رسالة منتهية الصلاحية (لجميع المستخدمين)');
        }
    } catch (e) {
        console.warn('خطأ في تنظيف الرسائل المنتهية:', e);
    }
},

// ==================== القسم 9: بدء التنظيف (مرة واحدة في اليوم) ====================
startExpiredMessagesCleanup() {
    // ✅ التنظيف مرة واحدة فقط في اليوم (بدلاً من كل 6 ساعات)
    const lastCleanup = localStorage.getItem('lastCleanup_sms');
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000; // 24 ساعة
    
    if (!lastCleanup || (now - parseInt(lastCleanup)) > oneDay) {
        this.cleanExpiredMessages();
        localStorage.setItem('lastCleanup_sms', now.toString());
        console.log('🧹 تم تنظيف الرسائل (مرة واحدة في اليوم)');
    } else {
        console.log('⏸️ تخطي تنظيف الرسائل (تم اليوم بالفعل)');
    }
},
    
    // ==================== القسم 10: تنظيف إشارات تفعيل الميزات (لجميع المستخدمين) ====================
async cleanOldSignals() {
    // ✅ لا نتحقق من المستخدم (تنظيف عام لجميع المستخدمين)
    const sixtySecondsAgo = new Date(Date.now() - 60000);
    
    try {
        // ✅ البحث عن جميع الإشارات المنتهية (بدون شرط 'to')
        const featureSnapshot = await window.db.collection('secure_messages')
            .where('timestamp', '<', firebase.firestore.Timestamp.fromDate(sixtySecondsAgo))
            .get();
        
        for (const doc of featureSnapshot.docs) {
            const data = doc.data();
            // ✅ حذف إشارات التفعيل فقط (بغض النظر عن المستخدم)
            if (data.package?.type === 'feature_request' || data.package?.type === 'feature_response') {
                await doc.ref.delete();
                console.log(`🗑️ تم حذف إشارة تفعيل ميزات قديمة (60 ثانية) للمستخدم: ${data.to || 'غير معروف'}`);
            }
        }
    } catch (e) {
        console.warn('خطأ في تنظيف الإشارات القديمة:', e);
    }
},
    
    // ==================== القسم 11: بدء التنظيف الدوري للإشارات (كل 30 ثانية) ====================
    startSignalCleanup() {
        this.cleanOldSignals();
        setInterval(() => this.cleanOldSignals(), 30000);
    }
};
