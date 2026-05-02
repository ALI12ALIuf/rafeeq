// ========== نظام التشفير E2EE + ضغط + حذف 24 ساعة ==========
const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    keyCache: new Map(), // تخزين مؤقت للمفاتيح
    sharedKeyCache: new Map(), // تخزين مؤقت للمفاتيح المشتركة
    
    async init() {
        if (!window.auth?.currentUser) { 
            console.error('❌ لا يوجد مستخدم مسجل');
            return false; 
        }
        
        try {
            console.log('🔐 بدء تهيئة نظام التشفير...');
            await this.setupKeys();
            this.startReceiving();
            PresenceSystem.setOnline();
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
            
            const privateExport = await window.crypto.subtle.exportKey(
                'pkcs8', 
                keyPair.privateKey
            );
            
            localStorage.setItem(
                `enc_private_key_${uid}`, 
                btoa(String.fromCharCode(...new Uint8Array(privateExport)))
            );
            
            this.keyCache.set(uid, keyPair.privateKey);
            console.log('✅ تم إنشاء المفاتيح بنجاح');
        } else {
            // التحقق من وجود المفتاح العام على الخادم
            const doc = await window.db.collection('users').doc(uid).get();
            
            if (!doc.exists || !doc.data()?.publicKey) {
                console.log('⚠️ المفتاح العام مفقود، إعادة إنشاء المفاتيح...');
                const keyPair = await this.generateKeyPair();
                const publicKey = await this.exportPublicKey(keyPair.publicKey);
                
                await window.db.collection('users').doc(uid).update({ 
                    publicKey,
                    publicKeyCreatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                const privateExport = await window.crypto.subtle.exportKey(
                    'pkcs8', 
                    keyPair.privateKey
                );
                
                localStorage.setItem(
                    `enc_private_key_${uid}`, 
                    btoa(String.fromCharCode(...new Uint8Array(privateExport)))
                );
                
                this.keyCache.set(uid, keyPair.privateKey);
            }
        }
    },
    
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
        
        try {
            const binary = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
            return await window.crypto.subtle.importKey(
                'raw', 
                binary, 
                { name: 'ECDH', namedCurve: 'P-256' }, 
                true, 
                []
            );
        } catch (error) {
            console.error('❌ فشل استيراد المفتاح العام:', error);
            throw error;
        }
    },
    
    async getMyPrivateKey() {
        const uid = window.auth?.currentUser?.uid;
        if (!uid) return null;
        
        // استخدام الذاكرة المؤقتة إذا كانت موجودة
        if (this.keyCache.has(uid)) {
            return this.keyCache.get(uid);
        }
        
        const stored = localStorage.getItem(`enc_private_key_${uid}`);
        if (!stored) {
            console.error('❌ المفتاح الخاص غير موجود');
            return null;
        }
        
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
            console.error('❌ فشل استيراد المفتاح الخاص:', error);
            return null;
        }
    },
    
    async getReceiverPublicKey(userId) {
        if (!userId) return null;
        
        try {
            const doc = await window.db.collection('users').doc(userId).get();
            if (!doc.exists) {
                console.warn('⚠️ المستخدم غير موجود:', userId);
                return null;
            }
            
            const userData = doc.data();
            if (!userData?.publicKey) {
                console.warn('⚠️ المفتاح العام للمستخدم غير موجود:', userId);
                return null;
            }
            
            return await this.importPublicKey(userData.publicKey);
        } catch (error) {
            console.error('❌ فشل جلب المفتاح العام:', error);
            return null;
        }
    },
    
    async deriveSharedKey(privateKey, publicKey) {
        const cacheKey = `${window.auth.currentUser.uid}_${await this.exportPublicKey(publicKey)}`;
        
        // استخدام الذاكرة المؤقتة إذا كانت موجودة
        if (this.sharedKeyCache.has(cacheKey)) {
            return this.sharedKeyCache.get(cacheKey);
        }
        
        try {
            const sharedKey = await window.crypto.subtle.deriveKey(
                { name: 'ECDH', public: publicKey },
                privateKey,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            
            // تخزين في الذاكرة المؤقتة مع وقت انتهاء
            this.sharedKeyCache.set(cacheKey, sharedKey);
            setTimeout(() => this.sharedKeyCache.delete(cacheKey), 300000); // 5 دقائق
            
            return sharedKey;
        } catch (error) {
            console.error('❌ فشل اشتقاق المفتاح المشترك:', error);
            throw error;
        }
    },
    
    async encryptData(data, sharedKey) {
        const encoder = new TextEncoder();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        try {
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
        } catch (error) {
            console.error('❌ فشل التشفير:', error);
            throw error;
        }
    },
    
    async decryptData(encryptedBase64, sharedKey) {
        const encoder = new TextEncoder();
        
        try {
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
        } catch (error) {
            console.error('❌ فشل فك التشفير:', error);
            throw error;
        }
    },
    
    async compressImage(file) { 
        return new Promise((resolve, reject) => { 
            const img = new Image(); 
            const canvas = document.createElement('canvas'); 
            const ctx = canvas.getContext('2d');
            
            // إنشاء URL للصورة مع التأكد من تنظيفه لاحقاً
            const url = URL.createObjectURL(file);
            
            img.onload = () => { 
                URL.revokeObjectURL(url);
                
                let w = img.width, h = img.height; 
                
                // تقليل الأبعاد للملفات الكبيرة
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
                
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('فشل ضغط الصورة'));
                        }
                    }, 
                    'image/jpeg', 
                    0.8
                ); 
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('فشل تحميل الصورة'));
            };
            
            img.src = url;
        }); 
    },
    
    async compressVideo(file) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video'); 
            const canvas = document.createElement('canvas'); 
            const ctx = canvas.getContext('2d');
            const url = URL.createObjectURL(file);
            
            video.preload = 'metadata';
            
            video.onloadedmetadata = () => {
                URL.revokeObjectURL(url);
                
                let width = video.videoWidth, height = video.videoHeight;
                
                // تحديد الأبعاد القصوى
                if (height > 480) { 
                    width *= 480 / height; 
                    height = 480; 
                }
                
                canvas.width = Math.round(width); 
                canvas.height = Math.round(height);
                
                const stream = canvas.captureStream(30);
                
                // التحقق من أنواع MIME المدعومة
                let mimeType = 'video/webm;codecs=vp8';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/webm';
                }
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/mp4';
                }
                
                const mediaRecorder = new MediaRecorder(stream, { 
                    mimeType: mimeType,
                    videoBitsPerSecond: 300000 
                });
                
                const chunks = [];
                let timeout;
                
                mediaRecorder.ondataavailable = e => {
                    if (e.data.size > 0) {
                        chunks.push(e.data);
                    }
                };
                
                mediaRecorder.onstop = () => {
                    if (timeout) clearTimeout(timeout);
                    const blob = new Blob(chunks, { type: mimeType });
                    resolve(blob);
                };
                
                mediaRecorder.onerror = (e) => {
                    if (timeout) clearTimeout(timeout);
                    reject(new Error('فشل تسجيل الفيديو'));
                };
                
                video.currentTime = 0; 
                
                const playPromise = video.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        mediaRecorder.start();
                        
                        // تحديد مدة التسجيل (حد أقصى 30 دقيقة)
                        const duration = Math.min(video.duration * 1000, 1800000);
                        timeout = setTimeout(() => { 
                            if (mediaRecorder.state === 'recording') {
                                mediaRecorder.stop(); 
                            }
                            video.pause(); 
                        }, duration);
                    }).catch(error => {
                        reject(new Error('فشل تشغيل الفيديو'));
                    });
                } else {
                    reject(new Error('المتصفح لا يدعم تشغيل الفيديو'));
                }
            };
            
            video.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('فشل تحميل الفيديو'));
            };
            
            video.src = url;
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
        if (!receiverId || !encryptedPackage) {
            throw new Error('بيانات غير صالحة للإرسال');
        }
        
        try {
            await window.db.collection('secure_messages').add({ 
                to: receiverId, 
                from: window.auth.currentUser.uid, 
                package: encryptedPackage, 
                timestamp: firebase.firestore.FieldValue.serverTimestamp(), 
                expiresAt: firebase.firestore.Timestamp.fromDate(
                    new Date(Date.now() + this.MESSAGE_EXPIRY_HOURS * 3600000)
                ) 
            });
            
            console.log('✅ تم إرسال الرسالة بنجاح');
        } catch (error) {
            console.error('❌ فشل إرسال الرسالة للخادم:', error);
            throw error;
        }
    },
    
    startReceiving() { 
        if (!window.auth?.currentUser) {
            console.warn('⚠️ لا يوجد مستخدم لبدء استقبال الرسائل');
            return null;
        }
        
        const uid = window.auth.currentUser.uid;
        console.log('👂 بدء الاستماع للرسائل الواردة...');
        
        return window.db.collection('secure_messages')
            .where('to', '==', uid)
            .onSnapshot(async snapshot => { 
                for (const change of snapshot.docChanges()) { 
                    if (change.type === 'added') { 
                        const msg = { id: change.doc.id, ...change.doc.data() }; 
                        await this.processReceivedMessage(msg); 
                        // حذف الرسالة بعد المعالجة
                        try {
                            await change.doc.ref.delete();
                        } catch (deleteError) {
                            console.warn('⚠️ فشل حذف الرسالة:', deleteError);
                        }
                    } 
                } 
            }, error => {
                console.error('❌ خطأ في الاستماع للرسائل:', error);
                // محاولة إعادة الاتصال بعد 5 ثوان
                setTimeout(() => this.startReceiving(), 5000);
            }); 
    },
    
    async processReceivedMessage(msg) {
        try {
            const myPrivateKey = await this.getMyPrivateKey(); 
            const senderPublicKey = await this.getReceiverPublicKey(msg.from);
            
            if (!myPrivateKey) {
                console.error('❌ المفتاح الخاص غير متوفر');
                return;
            }
            
            if (!senderPublicKey) {
                console.error('❌ المفتاح العام للمرسل غير متوفر');
                return;
            }
            
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
                }
                
                ChatSystem.updateLastMessage(msg.from, decryptedText); 
            }
            else if (msg.package.type === 'webrtc') { 
                const signalData = await this.decryptData(msg.package.data, sharedKey); 
                CallSystem.handleSignaling(JSON.parse(signalData)); 
            }
            
            // تحديث قائمة الدردشات
            if (typeof loadChats === 'function') {
                loadChats();
            }
        } catch (error) {
            console.error('❌ فشل معالجة الرسالة المستلمة:', error);
        }
    }
};

// ========== نظام الحضور Presence ==========
const PresenceSystem = {
    listeners: {},
    heartbeatInterval: null,
    
    async setOnline() { 
        if (!window.auth?.currentUser) return; 
        
        try {
            console.log('🟢 تحديث الحالة: متصل');
            await window.db.collection('users').doc(window.auth.currentUser.uid).update({ 
                online: true, 
                lastSeen: firebase.firestore.FieldValue.serverTimestamp() 
            });
            
            // بدء نبض القلب للحفاظ على حالة الاتصال
            this.startHeartbeat();
        } catch (e) {
            console.error('❌ فشل تحديث الحالة لمتصل:', e);
        }
    },
    
    async setOffline() { 
        if (!window.auth?.currentUser) return; 
        
        try {
            console.log('🔴 تحديث الحالة: غير متصل');
            await window.db.collection('users').doc(window.auth.currentUser.uid).update({ 
                online: false, 
                lastSeen: firebase.firestore.FieldValue.serverTimestamp() 
            });
            
            // إيقاف نبض القلب
            this.stopHeartbeat();
        } catch (e) {
            console.error('❌ فشل تحديث الحالة لغير متصل:', e);
        }
    },
    
    startHeartbeat() {
        this.stopHeartbeat(); // إيقاف أي نبض سابق
        
        // تحديث الحالة كل 30 ثانية
        this.heartbeatInterval = setInterval(() => {
            if (window.auth?.currentUser) {
                window.db.collection('users')
                    .doc(window.auth.currentUser.uid)
                    .update({ 
                        lastSeen: firebase.firestore.FieldValue.serverTimestamp() 
                    })
                    .catch(err => console.warn('⚠️ فشل نبض القلب:', err));
            }
        }, 30000);
    },
    
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    },
    
    watchFriend(friendId) { 
        if (!friendId) return;
        
        // إلغاء المستمع السابق إذا وجد
        if (this.listeners[friendId]) {
            this.listeners[friendId]();
        }
        
        this.listeners[friendId] = window.db.collection('users')
            .doc(friendId)
            .onSnapshot(doc => { 
                if (doc.exists) { 
                    const isOnline = doc.data().online === true;
                    console.log(`👤 حالة المستخدم ${friendId}: ${isOnline ? 'متصل' : 'غير متصل'}`);
                    ChatSystem.updateFriendStatus(friendId, isOnline); 
                } else {
                    console.warn(`⚠️ المستخدم ${friendId} غير موجود`);
                    ChatSystem.updateFriendStatus(friendId, false);
                }
            }, error => {
                console.error(`❌ خطأ في مراقبة المستخدم ${friendId}:`, error);
            }); 
    },
    
    stopAll() { 
        console.log('🛑 إيقاف جميع مستمعي الحالة');
        Object.values(this.listeners).forEach(unsub => {
            if (typeof unsub === 'function') {
                unsub();
            }
        }); 
        this.listeners = {}; 
        this.stopHeartbeat();
    }
};

// ========== نظام اتصال WebRTC مباشر ==========
const CallSystem = {
    pc: null, 
    dc: null, 
    localStream: null, 
    isInCall: false,
    incomingChunks: {}, 
    incomingFileInfo: {},
    reconnectTimer: null,
    maxReconnectAttempts: 3,
    reconnectAttempts: 0,
    
    servers: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ]
    },
    
    async ensureDataChannel(calleeId) {
        if (!calleeId) {
            console.error('❌ معرف المستلم مطلوب');
            return;
        }
        
        // التحقق من وجود قناة مفتوحة بالفعل
        if (this.dc && this.dc.readyState === 'open') {
            console.log('✅ Data Channel موجودة ومفتوحة');
            return;
        }
        
        // إذا كانت القناة في حالة اتصال، انتظر
        if (this.dc && this.dc.readyState === 'connecting') {
            console.log('⏳ Data Channel قيد الاتصال، انتظار...');
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    clearInterval(checkInterval);
                    reject(new Error('انتهت مهلة انتظار القناة'));
                }, 10000);
                
                const checkInterval = setInterval(() => {
                    if (!this.dc) {
                        clearInterval(checkInterval);
                        clearTimeout(timeout);
                        this.createNewDataChannel(calleeId).then(resolve).catch(reject);
                    } else if (this.dc.readyState === 'open') {
                        clearInterval(checkInterval);
                        clearTimeout(timeout);
                        resolve();
                    } else if (this.dc.readyState === 'failed' || this.dc.readyState === 'closed') {
                        clearInterval(checkInterval);
                        clearTimeout(timeout);
                        this.createNewDataChannel(calleeId).then(resolve).catch(reject);
                    }
                }, 500);
            });
        }
        
        // إنشاء قناة جديدة
        return this.createNewDataChannel(calleeId);
    },
    
    async createNewDataChannel(calleeId) {
        console.log('🔨 إنشاء Data Channel جديدة...');
        
        // إعادة تعيين عداد المحاولات
        this.reconnectAttempts = 0;
        
        // إغلاق القنوات القديمة
        this.cleanupConnections();
        
        try {
            // إنشاء اتصال Peer جديد
            this.pc = new RTCPeerConnection(this.servers);
            
            // إنشاء قناة البيانات مع خيارات محسنة
            this.dc = this.pc.createDataChannel('chat', {
                ordered: true,
                maxRetransmits: 3,
                // يمكن استخدام maxPacketLifeTime بدلاً من maxRetransmits
                // maxPacketLifeTime: 3000
            });
            
            this.setupDataChannel(this.dc);
            
            // إعداد معالجات ICE
            this.pc.onicecandidate = e => {
                if (e.candidate) {
                    console.log('🧊 مرشح ICE جديد');
                    this.sendSignal(calleeId, { candidate: e.candidate }).catch(err => {
                        console.warn('⚠️ فشل إرسال مرشح ICE:', err);
                    });
                }
            };
            
            this.pc.oniceconnectionstatechange = () => {
                console.log('🔍 حالة اتصال ICE:', this.pc?.iceConnectionState);
                
                if (this.pc?.iceConnectionState === 'failed') {
                    console.log('⚠️ فشل اتصال ICE، محاولة إعادة التشغيل...');
                    this.pc.restartIce();
                }
            };
            
            // استقبال قناة البيانات من الطرف الآخر
            this.pc.ondatachannel = e => {
                console.log('📞 استلام Data Channel من الطرف الآخر');
                this.setupDataChannel(e.channel);
                this.dc = e.channel;
            };
            
            // مراقبة حالة الاتصال العامة
            this.pc.onconnectionstatechange = () => {
                console.log('🔍 حالة الاتصال:', this.pc?.connectionState);
                
                switch(this.pc?.connectionState) {
                    case 'connected':
                        console.log('✅ تم الاتصال بنجاح');
                        this.reconnectAttempts = 0;
                        break;
                    case 'failed':
                    case 'disconnected':
                        console.log('❌ انقطع الاتصال');
                        this.scheduleReconnect();
                        break;
                    case 'connecting':
                        console.log('⏳ جاري الاتصال...');
                        break;
                }
            };
            
            // إنشاء العرض وإرساله
            const offer = await this.pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await this.pc.setLocalDescription(offer);
            
            await this.sendSignal(calleeId, { 
                sdp: this.pc.localDescription 
            });
            
            console.log('📤 تم إرسال العرض للطرف الآخر');
            
        } catch (error) {
            console.error('❌ خطأ في إنشاء Data Channel:', error);
            throw error;
        }
    },
    
    setupDataChannel(channel) {
        if (!channel) return;
        
        channel.onmessage = e => {
            try {
                const msg = JSON.parse(e.data);
                
                // معالجة الملفات المجزأة
                if (msg.chunk !== undefined) {
                    this.handleChunkMessage(msg);
                    return;
                }
                
                // معالجة الرسائل العادية
                const displayMsg = { 
                    id: msg.id || Date.now().toString(), 
                    type: msg.type, 
                    data: msg.data, 
                    fileName: msg.fileName, 
                    sender: 'friend', 
                    time: new Date().toISOString() 
                };
                
                if (ChatSystem.currentChat) { 
                    ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg); 
                    ChatSystem.displayMessage(displayMsg); 
                }
            } catch (error) {
                console.error('❌ فشل معالجة رسالة Data Channel:', error);
            }
        };
        
        channel.onopen = () => {
            console.log('📡 Data Channel مفتوح');
            // إلغاء أي محاولة إعادة اتصال معلقة
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            this.reconnectAttempts = 0;
        };
        
        channel.onclose = () => {
            console.log('⚠️ Data Channel انغلق');
            this.scheduleReconnect();
        };
        
        channel.onerror = (error) => {
            console.error('❌ خطأ في Data Channel:', error);
            this.scheduleReconnect();
        };
    },
    
    handleChunkMessage(msg) {
        // تخزين الأجزاء الواردة
        if (!this.incomingChunks[msg.id]) { 
            this.incomingChunks[msg.id] = []; 
            this.incomingFileInfo[msg.id] = { 
                type: msg.type, 
                fileName: msg.fileName, 
                total: msg.total, 
                received: 0 
            }; 
        }
        
        this.incomingChunks[msg.id][msg.chunk] = msg.data;
        this.incomingFileInfo[msg.id].received++;
        
        // التحقق من اكتمال الملف
        if (this.incomingFileInfo[msg.id].received === msg.total) {
            const fullData = this.incomingChunks[msg.id].join('');
            const displayMsg = { 
                id: msg.id, 
                type: msg.type === 'location' ? 'text' : msg.type, 
                data: fullData, 
                fileName: msg.fileName, 
                sender: 'friend', 
                time: new Date().toISOString() 
            };
            
            if (ChatSystem.currentChat) { 
                ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg); 
                ChatSystem.displayMessage(displayMsg); 
            }
            
            // تنظيف الذاكرة
            delete this.incomingChunks[msg.id]; 
            delete this.incomingFileInfo[msg.id];
        }
    },
    
    scheduleReconnect() {
        if (!ChatSystem.currentChat || !ChatSystem.friendOnline) {
            console.log('ℹ️ لا حاجة لإعادة الاتصال - لا توجد محادثة نشطة');
            return;
        }
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ تم تجاوز الحد الأقصى لمحاولات إعادة الاتصال');
            return;
        }
        
        // إلغاء المؤقت السابق إذا وجد
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        // زيادة عدد المحاولات
        this.reconnectAttempts++;
        
        // حساب وقت الانتظار (تزايدي)
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
        
        console.log(`🔄 محاولة إعادة الاتصال ${this.reconnectAttempts}/${this.maxReconnectAttempts} بعد ${delay/1000} ثواني...`);
        
        this.reconnectTimer = setTimeout(async () => {
            try {
                if (ChatSystem.currentChat && ChatSystem.friendOnline) {
                    await this.ensureDataChannel(ChatSystem.currentChat);
                }
            } catch (error) {
                console.error('❌ فشلت محاولة إعادة الاتصال:', error);
            }
            this.reconnectTimer = null;
        }, delay);
    },
    
    async startCall(calleeId, callType = 'video') {
        if (!window.auth?.currentUser || this.isInCall) {
            console.warn('⚠️ لا يمكن بدء مكالمة جديدة');
            return;
        }
        
        this.isInCall = true;
        console.log(`📞 بدء مكالمة ${callType} مع ${calleeId}`);
        
        try {
            const constraints = { 
                audio: true, 
                video: callType === 'video' ? { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 } 
                } : false 
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.showCallUI(callType);
            
            // إنشاء اتصال جديد
            this.pc = new RTCPeerConnection(this.servers);
            
            // إضافة المسارات المحلية
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
            });
            
            // إنشاء قناة البيانات
            this.dc = this.pc.createDataChannel('chat');
            this.setupDataChannel(this.dc);
            
            // معالجات ICE
            this.pc.onicecandidate = e => {
                if (e.candidate) {
                    this.sendSignal(calleeId, { candidate: e.candidate });
                }
            };
            
            // استقبال الفيديو من الطرف الآخر
            this.pc.ontrack = e => {
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo && e.streams[0]) {
                    remoteVideo.srcObject = e.streams[0];
                }
            };
            
            // معالجات الاتصال
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || 
                               this.pc.connectionState === 'disconnected')) {
                    console.log('❌ انقطعت المكالمة');
                    this.endCall();
                }
            };
            
            // إنشاء وإرسال العرض
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription });
            
        } catch (e) {
            console.error('❌ فشل بدء المكالمة:', e);
            this.endCall();
            
            // عرض رسالة خطأ للمستخدم
            if (e.name === 'NotAllowedError') {
                alert('يرجى السماح بالوصول إلى الكاميرا والميكروفون');
            } else {
                alert('فشل بدء المكالمة. يرجى المحاولة مرة أخرى.');
            }
        }
    },
    
    async sendFileDirect(file, type) {
        if (!this.dc || this.dc.readyState !== 'open') {
            console.error('❌ Data Channel غير متاحة للإرسال');
            return false;
        }
        
        try {
            let b64;
            
            // ضغط الملف حسب النوع
            if (type === 'image') { 
                const compressed = await SecureChatSystem.compressImage(file); 
                b64 = await SecureChatSystem.fileToBase64(compressed); 
            } else if (type === 'video') { 
                const compressed = await SecureChatSystem.compressVideo(file); 
                b64 = await SecureChatSystem.fileToBase64(compressed); 
            } else { 
                b64 = await SecureChatSystem.fileToBase64(file); 
            }
            
            // تقسيم الملف إلى أجزاء
            const chunkSize = 16000;
            const totalChunks = Math.ceil(b64.length / chunkSize);
            const fileId = Date.now().toString();
            
            console.log(`📤 إرسال ملف: ${file.name} (${totalChunks} جزء)`);
            
            // إرسال الأجزاء
            for (let i = 0; i < totalChunks; i++) {
                if (this.dc.readyState !== 'open') {
                    console.error('❌ تم إغلاق القناة أثناء الإرسال');
                    return false;
                }
                
                const chunk = {
                    type, 
                    data: b64.substring(i * chunkSize, (i + 1) * chunkSize), 
                    chunk: i, 
                    total: totalChunks, 
                    id: fileId, 
                    fileName: file.name
                };
                
                this.dc.send(JSON.stringify(chunk));
                
                // انتظار قصير بين الأجزاء لتجنب ازدحام القناة
                await new Promise(r => setTimeout(r, 50));
            }
            
            console.log('✅ تم إرسال الملف بنجاح');
            return true;
        } catch (e) {
            console.error('❌ فشل إرسال الملف:', e);
            return false;
        }
    },
    
    showIncomingCall(callerId, callData) {
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        
        const overlay = document.createElement('div'); 
        overlay.id = 'incomingCall';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:30px;';
        overlay.innerHTML = `
            <div style="font-size: 1.5rem;">📞 ${contactName} يتصل بك...</div>
            <div style="display:flex;gap:30px;">
                <button id="btnAccept" style="width:70px;height:70px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;">✅</button>
                <button id="btnReject" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;">❌</button>
            </div>`;
        
        document.body.appendChild(overlay);
        
        document.getElementById('btnAccept').onclick = () => { 
            overlay.remove(); 
            this.receiveCall(callerId, callData); 
        };
        
        document.getElementById('btnReject').onclick = () => { 
            overlay.remove();
            // إشعار المتصل بالرفض
            this.sendSignal(callerId, { type: 'call-rejected' });
        };
    },
    
    async receiveCall(callerId, callData) {
        if (this.isInCall) {
            console.warn('⚠️ هناك مكالمة جارية بالفعل');
            return;
        }
        
        this.isInCall = true;
        console.log('📞 استقبال مكالمة واردة');
        
        try {
            const hasVideo = callData.sdp?.sdp?.includes('video') !== false;
            const constraints = { 
                audio: true, 
                video: hasVideo ? { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 } 
                } : false 
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.showCallUI(hasVideo ? 'video' : 'audio');
            
            this.pc = new RTCPeerConnection(this.servers);
            
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
            });
            
            this.pc.onicecandidate = e => {
                if (e.candidate) {
                    this.sendSignal(callerId, { candidate: e.candidate });
                }
            };
            
            this.pc.ontrack = e => {
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo && e.streams[0]) {
                    remoteVideo.srcObject = e.streams[0];
                }
            };
            
            this.pc.ondatachannel = e => {
                this.setupDataChannel(e.channel);
                this.dc = e.channel;
            };
            
            this.pc.onconnectionstatechange = () => {
                if (this.pc && (this.pc.connectionState === 'failed' || 
                               this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            if (callData.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp));
                const answer = await this.pc.createAnswer();
                await this.pc.setLocalDescription(answer);
                await this.sendSignal(callerId, { sdp: this.pc.localDescription });
            }
            
        } catch (e) {
            console.error('❌ فشل استقبال المكالمة:', e);
            this.endCall();
            
            if (e.name === 'NotAllowedError') {
                alert('يرجى السماح بالوصول إلى الكاميرا والميكروفون');
            }
        }
    },
    
    async handleSignaling(data) {
        try {
            if (!this.pc) {
                console.log('🔨 إنشاء PeerConnection جديد للإشارات');
                this.pc = new RTCPeerConnection(this.servers);
                
                this.pc.ondatachannel = e => {
                    this.dc = e.channel;
                    this.setupDataChannel(this.dc);
                };
                
                this.pc.onicecandidate = e => {
                    if (e.candidate) {
                        this.sendSignal(ChatSystem.currentChat, { 
                            candidate: e.candidate 
                        }).catch(err => {
                            console.warn('⚠️ فشل إرسال مرشح ICE:', err);
                        });
                    }
                };
            }
            
            if (data.sdp) {
                await this.pc.setRemoteDescription(
                    new RTCSessionDescription(data.sdp)
                );
                
                if (data.sdp.type === 'offer') {
                    const answer = await this.pc.createAnswer();
                    await this.pc.setLocalDescription(answer);
                    await this.sendSignal(ChatSystem.currentChat, { 
                        sdp: this.pc.localDescription 
                    });
                }
            } else if (data.candidate) {
                await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (e) {
            console.error('❌ فشل معالجة الإشارات:', e);
        }
    },
    
    async sendSignal(calleeId, data) {
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            
            if (!myPrivateKey || !receiverPublicKey) {
                console.error('❌ مفاتيح التشفير غير متوفرة');
                return;
            }
            
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
            
            await SecureChatSystem.sendToServer(calleeId, { 
                id: Date.now().toString(), 
                type: 'webrtc', 
                data: encrypted, 
                timestamp: Date.now() 
            });
            
            console.log('📤 تم إرسال الإشارة بنجاح');
        } catch (error) {
            console.error('❌ فشل إرسال الإشارة:', error);
            throw error;
        }
    },
    
    showCallUI(callType) {
        document.body.classList.add('in-call');
        
        const ui = document.createElement('div'); 
        ui.id = 'callUI';
        ui.innerHTML = `
            <video id="remoteVideo" autoplay playsinline 
                   style="width:100%;height:100%;object-fit:cover;position:fixed;top:0;left:0;z-index:9998;background:#000;">
            </video>
            <video id="localVideo" autoplay playsinline muted 
                   style="width:100px;height:150px;object-fit:cover;position:fixed;bottom:100px;right:20px;z-index:9999;border-radius:12px;border:2px solid white;background:#333;">
            </video>
            <div style="position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:30px;">
                <button onclick="CallSystem.toggleAudio()" 
                        style="width:50px;height:50px;border-radius:50%;background:#333;color:white;border:none;font-size:1.2rem;cursor:pointer;">
                    🎤
                </button>
                <button onclick="CallSystem.endCall()" 
                        style="width:60px;height:60px;border-radius:50%;background:#f44336;color:white;border:none;font-size:1.5rem;cursor:pointer;">
                    📞
                </button>
                <button onclick="CallSystem.toggleVideo()" 
                        style="width:50px;height:50px;border-radius:50%;background:#333;color:white;border:none;font-size:1.2rem;cursor:pointer;">
                    📹
                </button>
            </div>`;
        
        document.body.appendChild(ui);
        
        const localVideo = document.getElementById('localVideo');
        if (localVideo && this.localStream) {
            localVideo.srcObject = this.localStream;
        }
    },
    
    toggleAudio() { 
        if (this.localStream) { 
            const audioTrack = this.localStream.getAudioTracks()[0]; 
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                console.log(`🎤 الميكروفون ${audioTrack.enabled ? 'مفعل' : 'مكتوم'}`);
            }
        } 
    },
    
    toggleVideo() { 
        if (this.localStream) { 
            const videoTrack = this.localStream.getVideoTracks()[0]; 
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                console.log(`📹 الكاميرا ${videoTrack.enabled ? 'مفعلة' : 'مغلقة'}`);
            }
        } 
    },
    
    endCall() {
        console.log('📞 إنهاء المكالمة');
        this.isInCall = false; 
        document.body.classList.remove('in-call');
        
        if (this.localStream) { 
            this.localStream.getTracks().forEach(t => t.stop()); 
            this.localStream = null; 
        }
        
        this.cleanupConnections();
        
        const ui = document.getElementById('callUI'); 
        if (ui) ui.remove();
        
        const inc = document.getElementById('incomingCall'); 
        if (inc) inc.remove();
    },
    
    cleanupConnections() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.dc) { 
            this.dc.close(); 
            this.dc = null; 
        }
        
        if (this.pc) { 
            this.pc.close(); 
            this.pc = null; 
        }
        
        // تنظيف الأجزاء غير المكتملة
        this.incomingChunks = {};
        this.incomingFileInfo = {};
    }
};

window.startVideoCall = async () => { 
    if (!ChatSystem.currentChat) {
        alert('يرجى فتح محادثة أولاً');
        return;
    }
    await CallSystem.startCall(ChatSystem.currentChat, 'video'); 
};

window.startAudioCall = async () => { 
    if (!ChatSystem.currentChat) {
        alert('يرجى فتح محادثة أولاً');
        return;
    }
    await CallSystem.startCall(ChatSystem.currentChat, 'audio'); 
};

// ========== نظام الدردشة E2EE ==========
const ChatSystem = {
    currentChat: null, 
    messages: {}, 
    friendOnline: false,
    
    init() { 
        console.log('💬 تهيئة نظام الدردشة');
        this.loadAllChats(); 
    },
    
    loadAllChats() { 
        console.log('📂 تحميل جميع الدردشات المحفوظة');
        for (let i = 0; i < localStorage.length; i++) { 
            const k = localStorage.key(i); 
            if (k && k.startsWith('chat_')) { 
                const fid = k.replace('chat_', ''); 
                try { 
                    this.messages[fid] = JSON.parse(localStorage.getItem(k)) || []; 
                } catch (e) { 
                    console.error(`❌ فشل تحميل دردشة ${fid}:`, e);
                    this.messages[fid] = []; 
                } 
            } 
        } 
    },
    
    openChat(friendId, friendName, friendAvatar) {
        console.log(`💬 فتح محادثة مع ${friendName} (${friendId})`);
        
        this.currentChat = friendId; 
        document.body.classList.add('conversation-open');
        
        const nameEl = document.getElementById('conversationName');
        const avatarEl = document.getElementById('conversationAvatar');
        
        if (nameEl) nameEl.textContent = friendName;
        if (avatarEl) avatarEl.textContent = friendAvatar || '👤';
        
        document.querySelector('.chat-page').style.display = 'none'; 
        document.getElementById('conversationPage').style.display = 'flex';
        
        this.displayMessages(friendId);
        PresenceSystem.watchFriend(friendId);
        
        // محاولة فتح قناة البيانات بعد فترة قصيرة
        setTimeout(() => { 
            if (this.friendOnline) {
                CallSystem.ensureDataChannel(friendId).catch(err => {
                    console.warn('⚠️ فشل فتح Data Channel:', err);
                });
            }
        }, 500);
        
        setTimeout(() => { 
            const inp = document.getElementById('messageInput'); 
            if (inp) inp.focus(); 
        }, 300);
        
        setTimeout(() => { 
            const c = document.getElementById('messagesContainer'); 
            if (c) c.scrollTop = c.scrollHeight; 
        }, 100);
    },
    
    updateFriendStatus(friendId, isOnline) {
        if (this.currentChat !== friendId) return;
        
        this.friendOnline = isOnline;
        
        if (isOnline) {
            CallSystem.ensureDataChannel(friendId).catch(err => {
                console.warn('⚠️ فشل تحديث Data Channel:', err);
            });
        }
        
        const statusEl = document.getElementById('conversationStatus');
        if (statusEl) { 
            statusEl.textContent = isOnline ? '🟢 متصل' : '🔴 غير متصل'; 
            statusEl.className = `conversation-status ${isOnline ? 'online' : 'offline'}`; 
        }
        
        this.updateAttachmentButtons(isOnline);
    },
    
    updateAttachmentButtons(isOnline) {
        const btns = document.querySelectorAll('#attachmentMenu button[data-dc]');
        btns.forEach(btn => { 
            if (isOnline) { 
                btn.classList.remove('locked'); 
                btn.title = ''; 
            } else { 
                btn.classList.add('locked'); 
                btn.title = 'غير متاح - المستخدم غير متصل'; 
            } 
        });
    },
    
    displayMessages(friendId) { 
        const c = document.getElementById('messagesContainer'); 
        if (!c) return; 
        c.innerHTML = ''; 
        (this.messages[friendId] || []).forEach(m => this.displayMessage(m)); 
    },
    
    displayMessage(msg) {
        const c = document.getElementById('messagesContainer'); 
        if (!c) return;
        
        const div = document.createElement('div'); 
        div.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`; 
        div.id = `msg-${msg.id}`;
        
        const time = new Date(msg.time).toLocaleTimeString('ar-EG', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        let statusHtml = ''; 
        if (msg.sender === 'me') { 
            let icon = '✓', cls = 'sent'; 
            if (msg.status === 'delivered') { 
                icon = '✓✓'; 
                cls = 'delivered'; 
            } else if (msg.status === 'read') { 
                icon = '✓✓'; 
                cls = 'read'; 
            } 
            statusHtml = `<span class="message-status ${cls}">${icon}</span>`; 
        }
        
        if (msg.type === 'text') {
            div.innerHTML = `
                <div class="message-content">${this.escapeHtml(msg.text)}</div>
                <div class="message-info">
                    <span class="message-time">${time}</span>${statusHtml}
                </div>`;
        } else if (msg.type === 'image') {
            div.innerHTML = `
                <img src="${msg.data}" class="message-image" onclick="window.openImage('${msg.data}')">
                <div class="message-info">
                    <span class="message-time">${time}</span>${statusHtml}
                </div>`;
        } else if (msg.type === 'voice') {
            div.innerHTML = `
                <audio controls src="${msg.data}" class="message-audio"></audio>
                <div class="message-info">
                    <span class="message-time">${time}</span>${statusHtml}
                </div>`;
        } else if (msg.type === 'video') {
            div.innerHTML = `
                <video controls src="${msg.data}" style="max-width:250px;border-radius:12px;"></video>
                <div class="message-info">
                    <span class="message-time">${time}</span>${statusHtml}
                </div>`;
        } else if (msg.type === 'file') {
            div.innerHTML = `
                <div class="message-content" onclick="window.openFile('${msg.data}', '${msg.fileName || 'ملف'}')" style="cursor:pointer;">
                    📎 ${msg.fileName || 'ملف'}
                </div>
                <div class="message-info">
                    <span class="message-time">${time}</span>${statusHtml}
                </div>`;
        }
        
        c.appendChild(div); 
        c.scrollTop = c.scrollHeight;
    },
    
    async sendMessage(text) { 
        if (!this.currentChat || !text.trim()) return false; 
        
        const mid = Date.now().toString(); 
        try { 
            const pr = await SecureChatSystem.getMyPrivateKey(); 
            const pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); 
            
            if (!pr || !pu) {
                console.error('❌ مفاتيح التشفير غير متوفرة');
                return false;
            }
            
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu); 
            const enc = await SecureChatSystem.encryptData(text.trim(), sk); 
            
            await SecureChatSystem.sendToServer(this.currentChat, { 
                id: mid, 
                type: 'text', 
                data: enc, 
                timestamp: Date.now() 
            }); 
            
            this.saveMessage(this.currentChat, { 
                id: mid, 
                type: 'text', 
                text: text.trim(), 
                sender: 'me', 
                time: new Date().toISOString(), 
                status: 'sent' 
            }); 
            
            this.displayMessage({ 
                id: mid, 
                type: 'text', 
                text: text.trim(), 
                sender: 'me', 
                time: new Date().toISOString(), 
                status: 'sent' 
            }); 
            
            return true; 
        } catch (e) { 
            console.error('❌ فشل إرسال الرسالة:', e);
            return false; 
        } 
    },
    
    async sendFileWithRetry(file, type, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`📤 محاولة ${attempt}/${maxRetries} لإرسال ${type}`);
                
                const success = await CallSystem.sendFileDirect(file, type);
                if (success) return true;
                
                if (attempt < maxRetries) {
                    console.log(`⏳ انتظار قبل المحاولة التالية...`);
                    await new Promise(r => setTimeout(r, 2000 * attempt));
                }
            } catch (error) {
                console.error(`❌ فشلت المحاولة ${attempt}:`, error);
            }
        }
        
        console.error('❌ فشلت جميع محاولات الإرسال');
        return false;
    },
    
    async sendImage(file) { 
        if (!this.currentChat) return; 
        
        if (this.friendOnline) {
            await CallSystem.ensureDataChannel(this.currentChat);
            
            if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
                const success = await this.sendFileWithRetry(file, 'image');
                if (success) {
                    const comp = await SecureChatSystem.compressImage(file); 
                    const b64 = await SecureChatSystem.fileToBase64(comp); 
                    const msgId = Date.now().toString();
                    
                    this.saveMessage(this.currentChat, { 
                        id: msgId, 
                        type: 'image', 
                        data: b64, 
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent' 
                    }); 
                    
                    this.displayMessage({ 
                        id: msgId, 
                        type: 'image', 
                        data: b64, 
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent' 
                    });
                } else {
                    alert('فشل إرسال الصورة. يرجى المحاولة مرة أخرى.');
                }
            }
        } else {
            alert('المستخدم غير متصل حالياً');
        }
    },
    
    async sendVideoFile(file) { 
        if (!this.currentChat) return; 
        
        if (this.friendOnline) {
            await CallSystem.ensureDataChannel(this.currentChat);
            
            if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
                const success = await this.sendFileWithRetry(file, 'video');
                if (success) {
                    const compressed = await SecureChatSystem.compressVideo(file);
                    const b64 = await SecureChatSystem.fileToBase64(compressed); 
                    const msgId = Date.now().toString();
                    
                    this.saveMessage(this.currentChat, { 
                        id: msgId, 
                        type: 'video', 
                        data: b64, 
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent' 
                    }); 
                    
                    this.displayMessage({ 
                        id: msgId, 
                        type: 'video', 
                        data: b64, 
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent' 
                    });
                } else {
                    alert('فشل إرسال الفيديو. يرجى المحاولة مرة أخرى.');
                }
            }
        } else {
            alert('المستخدم غير متصل حالياً');
        }
    },
    
    async sendFile(file) { 
        if (!this.currentChat) return; 
        
        if (this.friendOnline) {
            await CallSystem.ensureDataChannel(this.currentChat);
            
            if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
                const success = await this.sendFileWithRetry(file, 'file');
                if (success) {
                    const b64 = await SecureChatSystem.fileToBase64(file); 
                    const msgId = Date.now().toString();
                    
                    this.saveMessage(this.currentChat, { 
                        id: msgId, 
                        type: 'file', 
                        data: b64, 
                        fileName: file.name, 
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent' 
                    }); 
                    
                    this.displayMessage({ 
                        id: msgId, 
                        type: 'file', 
                        data: b64, 
                        fileName: file.name, 
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent' 
                    });
                } else {
                    alert('فشل إرسال الملف. يرجى المحاولة مرة أخرى.');
                }
            }
        } else {
            alert('المستخدم غير متصل حالياً');
        }
    },
    
    async sendVoiceNote(audioBlob) { 
        if (!this.currentChat) return; 
        
        if (this.friendOnline) {
            await CallSystem.ensureDataChannel(this.currentChat);
            
            if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
                const success = await this.sendFileWithRetry(audioBlob, 'voice');
                if (success) {
                    const b64 = await SecureChatSystem.fileToBase64(audioBlob); 
                    const msgId = Date.now().toString();
                    
                    this.saveMessage(this.currentChat, { 
                        id: msgId, 
                        type: 'voice', 
                        data: b64, 
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent' 
                    }); 
                    
                    this.displayMessage({ 
                        id: msgId, 
                        type: 'voice', 
                        data: b64, 
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent' 
                    });
                } else {
                    alert('فشل إرسال البصمة الصوتية. يرجى المحاولة مرة أخرى.');
                }
            }
        } else {
            alert('المستخدم غير متصل حالياً');
        }
    },
    
    async shareLocationDirect() { 
        if (!this.currentChat) return; 
        
        if (this.friendOnline && CallSystem.dc && CallSystem.dc.readyState === 'open') { 
            if (!navigator.geolocation) {
                alert('المتصفح لا يدعم تحديد الموقع');
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                p => { 
                    const locMsg = `📍 موقعي: https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`; 
                    CallSystem.dc.send(JSON.stringify({ 
                        type: 'location', 
                        data: locMsg, 
                        id: Date.now().toString() 
                    })); 
                    
                    const msgId = Date.now().toString();
                    this.displayMessage({ 
                        id: msgId, 
                        type: 'text', 
                        text: locMsg, 
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent' 
                    }); 
                    
                    this.saveMessage(this.currentChat, { 
                        id: msgId, 
                        type: 'text', 
                        text: locMsg, 
                        sender: 'me', 
                        time: new Date().toISOString(), 
                        status: 'sent' 
                    }); 
                },
                error => {
                    console.error('❌ فشل تحديد الموقع:', error);
                    alert('فشل تحديد الموقع. يرجى المحاولة مرة أخرى.');
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            if (navigator.geolocation) {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject);
                });
                
                this.sendMessage(
                    `📍 موقعي: https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`
                );
            }
        }
    },
    
    saveMessage(friendId, message) { 
        const key = `chat_${friendId}`; 
        let h = []; 
        try { 
            h = JSON.parse(localStorage.getItem(key)) || []; 
        } catch (e) { 
            h = []; 
        } 
        
        h.push(message); 
        
        // الاحتفاظ بآخر 500 رسالة فقط لتوفير المساحة
        if (h.length > 500) {
            h = h.slice(-500);
        }
        
        localStorage.setItem(key, JSON.stringify(h)); 
        this.messages[friendId] = h; 
    },
    
    updateLastMessage(friendId, lastMessage) { 
        document.querySelectorAll('.chat-item').forEach(item => { 
            if (item.getAttribute('onclick')?.includes(friendId)) { 
                const lm = item.querySelector('.last-message'); 
                const tm = item.querySelector('.chat-time'); 
                if (lm) lm.textContent = lastMessage; 
                if (tm) tm.textContent = 'الآن'; 
            } 
        }); 
    },
    
    closeChat() {
        console.log('🚪 إغلاق المحادثة');
        
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        
        PresenceSystem.stopAll();
        
        // إغلاق اتصالات WebRTC إذا لم تكن هناك مكالمة نشطة
        if (!CallSystem.isInCall) {
            CallSystem.cleanupConnections();
        }
        
        this.currentChat = null; 
        this.friendOnline = false;
    },
    
    escapeHtml(text) { 
        const div = document.createElement('div'); 
        div.textContent = text; 
        return div.innerHTML; 
    }
};

// تهيئة نظام الدردشة
ChatSystem.init();

// ========== وظائف الواجهة العامة ==========

async function loadChats() { 
    if (!window.auth || !window.auth.currentUser) return; 
    
    const list = document.getElementById('chatsList'); 
    if (!list) return; 
    
    try { 
        const udoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); 
        if (!udoc.exists) return; 
        
        const friends = udoc.data().friends || []; 
        if (!friends.length) { 
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <h3>لا توجد محادثات</h3>
                    <p>أضف أصدقاء لبدء المحادثة</p>
                </div>`; 
            return; 
        } 
        
        let html = ''; 
        for (const fid of friends) { 
            try { 
                const fdoc = await window.db.collection('users').doc(fid).get(); 
                if (fdoc.exists) { 
                    const f = fdoc.data(); 
                    const key = `chat_${fid}`; 
                    let lm = 'اضغط لبدء المحادثة', lt = ''; 
                    
                    try { 
                        const h = JSON.parse(localStorage.getItem(key)) || []; 
                        if (h.length > 0) { 
                            const l = h[h.length - 1]; 
                            if (l.type === 'text') {
                                lm = l.text.length > 30 ? l.text.substring(0, 30) + '...' : l.text;
                            } else if (l.type === 'image') {
                                lm = '📷 صورة';
                            } else if (l.type === 'voice') {
                                lm = '🎤 بصمة صوتية';
                            } else if (l.type === 'video') {
                                lm = '🎥 فيديو';
                            } else if (l.type === 'file') {
                                lm = '📎 ملف';
                            }
                            lt = new Date(l.time).toLocaleTimeString('ar-EG', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                            }); 
                        } 
                    } catch (e) {
                        console.error('❌ فشل تحميل آخر رسالة:', e);
                    } 
                    
                    html += `
                        <div class="chat-item" onclick="openChat('${fid}')">
                            <div class="chat-avatar-emoji">${window.getEmojiForUser(f)}</div>
                            <div class="chat-info">
                                <h4>${f.name || 'مستخدم'}</h4>
                                <p class="last-message">${lm}</p>
                            </div>
                            <div class="chat-meta">
                                <span class="chat-time">${lt || ''}</span>
                            </div>
                        </div>`; 
                } 
            } catch (e) {
                console.error(`❌ فشل تحميل الصديق ${fid}:`, e);
            } 
        } 
        
        list.innerHTML = html || `
            <div class="empty-state">
                <i class="fas fa-user-friends"></i>
                <h3>لا توجد محادثات نشطة</h3>
                <p>ابدأ بإضافة أصدقاء جدد</p>
            </div>`; 
    } catch (e) {
        console.error('❌ فشل تحميل الدردشات:', e);
    } 
}

function setupChatListeners() { 
    document.addEventListener('click', e => { 
        const m = document.getElementById('attachmentMenu'); 
        const ab = document.querySelector('.attach-btn'); 
        if (m && ab && !m.contains(e.target) && !ab.contains(e.target)) {
            m.style.display = 'none'; 
        }
        
        const ep = document.getElementById('emojiPicker'); 
        const eb = document.querySelector('.emoji-btn'); 
        if (ep && eb && !ep.contains(e.target) && !eb.contains(e.target)) {
            ep.style.display = 'none'; 
        }
    }); 
}

window.openChat = friendId => { 
    window.db.collection('users').doc(friendId).get().then(doc => { 
        if (doc.exists) { 
            const f = doc.data(); 
            ChatSystem.openChat(
                friendId, 
                f.name, 
                window.getEmojiForUser ? window.getEmojiForUser(f) : '👤'
            ); 
        } else {
            console.error('❌ المستخدم غير موجود');
        }
    }).catch(error => {
        console.error('❌ فشل فتح المحادثة:', error);
    });
};

window.sendMessage = () => { 
    const inp = document.getElementById('messageInput'); 
    if (inp && inp.value.trim()) { 
        ChatSystem.sendMessage(inp.value.trim()).then(s => { 
            if (s) {
                inp.value = ''; 
                // تعديل ارتفاع input تلقائياً
                inp.style.height = 'auto';
            }
        }); 
    } 
};

window.handleMessageKeyPress = e => { 
    if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        window.sendMessage(); 
    } 
};

window.showAttachmentMenu = () => { 
    const m = document.getElementById('attachmentMenu'); 
    if (m) {
        m.style.display = m.style.display === 'none' ? 'flex' : 'none'; 
    }
    const ep = document.getElementById('emojiPicker');
    if (ep) ep.style.display = 'none'; 
};

window.showEmojiPicker = () => { 
    const p = document.getElementById('emojiPicker'); 
    if (p) {
        p.style.display = p.style.display === 'none' ? 'block' : 'none'; 
    }
    const m = document.getElementById('attachmentMenu');
    if (m) m.style.display = 'none'; 
};

window.sendImage = () => { 
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = 'image/*'; 
    i.onchange = e => { 
        const f = e.target.files[0]; 
        if (f && ChatSystem.currentChat) {
            ChatSystem.sendImage(f); 
        }
    }; 
    i.click(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

window.sendVideo = () => { 
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = 'video/*'; 
    i.onchange = e => { 
        const f = e.target.files[0]; 
        if (f && ChatSystem.currentChat) {
            ChatSystem.sendVideoFile(f); 
        }
    }; 
    i.click(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

window.sendFile = () => { 
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = '*/*'; 
    i.onchange = e => { 
        const f = e.target.files[0]; 
        if (f && ChatSystem.currentChat) {
            ChatSystem.sendFile(f); 
        }
    }; 
    i.click(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

window.sendVoiceNote = () => { 
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('المتصفح لا يدعم تسجيل الصوت');
        return;
    }
    
    navigator.mediaDevices.getUserMedia({ audio: true }).then(s => { 
        const mr = new MediaRecorder(s); 
        const ch = []; 
        
        mr.ondataavailable = e => {
            if (e.data.size > 0) {
                ch.push(e.data);
            }
        };
        
        mr.onstop = () => { 
            s.getTracks().forEach(t => t.stop());
            const blob = new Blob(ch, { type: 'audio/webm' });
            
            if (blob.size > 0) {
                ChatSystem.sendVoiceNote(blob); 
            }
            
            // إعادة إظهار زر الإرسال
            const sb = document.querySelector('.send-btn');
            const vb = document.querySelector('.voice-btn'); 
            if (sb) sb.style.display = 'flex'; 
            if (vb) vb.style.display = 'none'; 
        }; 
        
        mr.onerror = () => {
            s.getTracks().forEach(t => t.stop());
            const sb = document.querySelector('.send-btn');
            const vb = document.querySelector('.voice-btn'); 
            if (sb) sb.style.display = 'flex'; 
            if (vb) vb.style.display = 'none';
            alert('فشل تسجيل الصوت');
        };
        
        mr.start(); 
        
        // تغيير واجهة المستخدم للتسجيل
        const sb = document.querySelector('.send-btn');
        const vb = document.querySelector('.voice-btn'); 
        if (sb) sb.style.display = 'none'; 
        if (vb) { 
            vb.style.display = 'flex'; 
            vb.onclick = () => { 
                if (mr.state === 'recording') { 
                    mr.stop(); 
                } 
            }; 
        } 
        
        // حد أقصى للتسجيل 15 دقيقة
        setTimeout(() => { 
            if (mr.state === 'recording') { 
                mr.stop(); 
            } 
        }, 900000); 
    }).catch(error => {
        console.error('❌ فشل الوصول للميكروفون:', error);
        alert('يرجى السماح بالوصول إلى الميكروفون');
    });
    
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

window.shareLocation = () => { 
    if (ChatSystem.friendOnline && CallSystem.dc && CallSystem.dc.readyState === 'open') { 
        ChatSystem.shareLocationDirect(); 
    } else { 
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                p => {
                    ChatSystem.sendMessage(
                        `📍 موقعي: https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`
                    );
                },
                error => {
                    alert('فشل تحديد الموقع');
                }
            );
        } else {
            alert('المتصفح لا يدعم تحديد الموقع');
        }
    } 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

window.closeConversation = () => { 
    CallSystem.endCall(); 
    ChatSystem.closeChat(); 
};

// وظائف مساعدة للملفات
window.openImage = (data) => {
    const win = window.open('', '_blank');
    if (win) {
        win.document.write(`<img src="${data}" style="max-width:100%;height:auto;">`);
    }
};

window.openFile = (data, fileName) => {
    const link = document.createElement('a');
    link.href = data;
    link.download = fileName || 'file';
    link.click();
};

// وظائف إدارة الملف الشخصي
window.openEditProfileModal = () => { 
    const nameInput = document.getElementById('editName');
    const currentName = document.getElementById('profileName')?.textContent;
    const currentEmoji = document.getElementById('profileAvatarEmoji')?.textContent;
    
    if (nameInput) nameInput.value = currentName || '';
    const avatarPreview = document.getElementById('currentAvatarEmoji');
    if (avatarPreview) avatarPreview.textContent = currentEmoji || '👤';
    
    document.getElementById('editProfileModal')?.classList.add('active'); 
};

window.saveProfile = () => { 
    const n = document.getElementById('editName')?.value?.trim(); 
    if (!n || n.length > 25) {
        alert('الاسم مطلوب ولا يزيد عن 25 حرف');
        return;
    }
    
    if (auth?.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({ name: n }).then(() => { 
            const nameEl = document.getElementById('profileName');
            if (nameEl) nameEl.textContent = n; 
            closeModal(); 
        }).catch(error => {
            console.error('❌ فشل تحديث الاسم:', error);
            alert('فشل حفظ التغييرات');
        });
    }
};

window.showUserTrips = () => { 
    document.querySelector('.profile-page') && (document.querySelector('.profile-page').style.display = 'none'); 
    document.getElementById('tripsPage') && (document.getElementById('tripsPage').style.display = 'block'); 
};

window.goBack = () => { 
    document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); 
    const pp = document.querySelector('.profile-page'); 
    if (pp) { 
        pp.style.display = 'block'; 
        pp.classList.add('active'); 
    } 
};

window.selectAvatar = t => { 
    const m = {
        male:'👨', female:'👩', boy:'🧒', girl:'👧', 
        father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵'
    }; 
    const e = m[t] || '👤'; 
    
    const profileAvatar = document.getElementById('profileAvatarEmoji');
    const currentAvatar = document.getElementById('currentAvatarEmoji');
    
    if (profileAvatar) profileAvatar.textContent = e; 
    if (currentAvatar) currentAvatar.textContent = e; 
    
    if (auth?.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({ 
            avatarType: t 
        }).then(() => {
            closeModal(); 
        }).catch(error => {
            console.error('❌ فشل تحديث الصورة الرمزية:', error);
        });
    }
};

window.openAvatarModal = () => document.getElementById('avatarModal')?.classList.add('active');

window.getEmojiForUser = u => { 
    const m = {
        male:'👨', female:'👩', boy:'🧒', girl:'👧', 
        father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵'
    }; 
    return m[u?.avatarType] || '👤'; 
};

window.clearMessages = () => { 
    if (confirm('هل أنت متأكد من مسح جميع الرسائل؟')) {
        const c = document.getElementById('messagesContainer'); 
        if (c) c.innerHTML = ''; 
        
        if (ChatSystem.currentChat) {
            const key = `chat_${ChatSystem.currentChat}`;
            localStorage.removeItem(key);
            ChatSystem.messages[ChatSystem.currentChat] = [];
        }
    }
};

// وظائف مساعدة
function formatNumber(num) { 
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'; 
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'; 
    return num.toString(); 
}

async function updateTripsCount() { 
    if (!window.auth || !window.auth.currentUser) return; 
    try { 
        const s = await window.db.collection('trips')
            .where('userId', '==', window.auth.currentUser.uid)
            .where('status', '==', 'ended')
            .get(); 
        const c = document.getElementById('tripsCount'); 
        if (c) c.textContent = formatNumber(s.size); 
    } catch (error) {
        console.error('❌ فشل تحديث عدد الرحلات:', error);
    } 
}

function ensureSinglePage() { 
    document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); 
    document.querySelectorAll('.page').forEach(p => { 
        p.style.display = p.classList.contains('active') ? 'block' : 'none'; 
    }); 
}

function setupNavigation() { 
    const nav = document.querySelectorAll('.nav-item'); 
    const pages = document.querySelectorAll('.page'); 
    if (!nav.length || !pages.length) return; 
    
    function switchPage(id) { 
        pages.forEach(p => p.classList.remove('active')); 
        const t = document.querySelector(`.page.${id}-page`); 
        if (t) { 
            t.classList.add('active'); 
            t.style.display = 'block'; 
        } 
        pages.forEach(p => { 
            if (!p.classList.contains('active')) p.style.display = 'none'; 
        }); 
        document.querySelectorAll('.profile-subpage').forEach(s => s.style.display = 'none'); 
        if (id === 'chat') loadChats(); 
        document.body.classList.remove('conversation-open'); 
        nav.forEach(n => n.classList.toggle('active', n.dataset.page === id)); 
    } 
    
    nav.forEach(n => n.addEventListener('click', () => switchPage(n.dataset.page))); 
}

function setupModals() { 
    window.openLanguageModal = () => document.getElementById('languageModal')?.classList.add('active'); 
    window.closeModal = () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); 
    
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { 
        if (e.target === m) m.classList.remove('active'); 
    })); 
    
    document.querySelectorAll('.settings-item').forEach(i => { 
        if (i.querySelector('[data-i18n="language"]')) {
            i.addEventListener('click', window.openLanguageModal); 
        }
    }); 
}

// ========== تهيئة التطبيق ==========
document.addEventListener('DOMContentLoaded', () => { 
    console.log('🚀 تهيئة التطبيق...');
    ensureSinglePage(); 
    setupNavigation(); 
    setupModals(); 
    loadChats(); 
    setupChatListeners(); 
    updateTripsCount(); 
    console.log('✅ تم تهيئة التطبيق بنجاح');
});

window.addEventListener('authReady', async () => { 
    if (window.auth?.currentUser) { 
        console.log('🔐 تهيئة نظام التشفير بعد تسجيل الدخول...');
        await SecureChatSystem.init(); 
    } 
});

// معالجات تغيير حالة المتصفح
window.addEventListener('beforeunload', () => { 
    PresenceSystem.setOffline(); 
});

document.addEventListener('visibilitychange', () => { 
    if (document.hidden) { 
        console.log('👋 خروج من التطبيق');
        PresenceSystem.setOffline(); 
    } else { 
        console.log('👀 عودة للتطبيق');
        PresenceSystem.setOnline(); 
        
        // إعادة الاتصال عند العودة
        if (ChatSystem.currentChat && ChatSystem.friendOnline) {
            setTimeout(() => {
                CallSystem.ensureDataChannel(ChatSystem.currentChat).catch(err => {
                    console.warn('⚠️ فشل إعادة الاتصال:', err);
                });
            }, 1000);
        }
    } 
});

// طلب إذن الإشعارات
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            console.log('✅ تم منح إذن الإشعارات');
        }
    });
}

// معالجة الأخطاء العامة
window.addEventListener('error', (event) => {
    console.error('❌ خطأ عام:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ خطأ غير معالج:', event.reason);
});
