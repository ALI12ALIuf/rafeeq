// ========== نظام التشفير E2EE + ضغط + حذف 24 ساعة ==========
const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    keyCache: new Map(),
    sharedKeyCache: new Map(),
    
    VIDEO_MAX_DURATION: 600, // 10 دقائق
    VIDEO_MAX_INPUT_SIZE: 250 * 1024 * 1024, // 250MB
    VIDEO_MAX_OUTPUT_SIZE: 50 * 1024 * 1024, // 50MB بعد الضغط
    
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
    
    // ========== اختيار أفضل تنسيق متوافق مع جميع المتصفحات ==========
    getBestVideoMimeType() {
        const types = [
            'video/webm;codecs=vp8,opus',  // Chrome, Firefox, Edge
            'video/webm;codecs=vp8',       // معظم المتصفحات
            'video/webm;codecs=vp9,opus',  // Chrome, Firefox
            'video/webm',                   // WebM عام
            'video/mp4'                     // Safari, iOS
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return 'video/webm';
    },
    
    // ========== ضغط الفيديو - متوافق مع جميع المتصفحات ==========
    async compressVideo(file) {
        // 1. فحص المدة
        let duration;
        try {
            duration = await this.getVideoDuration(file);
        } catch (error) {
            throw new Error('❌ فشل قراءة الفيديو');
        }
        
        // 2. رفض الفيديوهات الطويلة
        if (duration > this.VIDEO_MAX_DURATION) {
            const mins = Math.floor(duration / 60), secs = Math.floor(duration % 60), maxMins = Math.floor(this.VIDEO_MAX_DURATION / 60);
            throw new Error(`❌ الفيديو طويل جداً (${mins}:${secs.toString().padStart(2, '0')})\nالحد الأقصى: ${maxMins} دقائق`);
        }
        
        // 3. رفض الملفات الكبيرة
        if (file.size > this.VIDEO_MAX_INPUT_SIZE) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(1), maxMB = (this.VIDEO_MAX_INPUT_SIZE / 1024 / 1024).toFixed(0);
            throw new Error(`❌ حجم الفيديو كبير جداً (${sizeMB}MB)\nالحد الأقصى: ${maxMB}MB`);
        }
        
        // 4. فيديو صغير = بدون ضغط
        if (file.size <= 15 * 1024 * 1024 && duration <= 60) {
            console.log('⚡ فيديو صغير - إرسال مباشر بدون ضغط');
            return file;
        }
        
        console.log(`🎬 ضغط فيديو: ${Math.floor(duration)}s | ${(file.size/1024/1024).toFixed(1)}MB`);
        
        // 5. بدء الضغط
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const url = URL.createObjectURL(file);
            video.preload = 'auto';
            video.muted = true;
            
            video.onloadedmetadata = () => {
                URL.revokeObjectURL(url);
                
                // إعدادات الضغط
                const targetHeight = 360, targetBitrate = 400000, targetFPS = 20;
                let width = video.videoWidth, height = video.videoHeight;
                if (height > targetHeight) { width = Math.round((width * targetHeight) / height); height = targetHeight; }
                canvas.width = Math.round(width / 2) * 2;
                canvas.height = Math.round(height / 2) * 2;
                
                const mimeType = this.getBestVideoMimeType();
                console.log('📼 تنسيق الضغط:', mimeType);
                
                const stream = canvas.captureStream(targetFPS);
                const mediaRecorder = new MediaRecorder(stream, { 
                    mimeType, 
                    videoBitsPerSecond: targetBitrate,
                    audioBitsPerSecond: 32000 
                });
                
                const chunks = [];
                const startTime = Date.now();
                let lastProgressUpdate = 0;
                
                mediaRecorder.ondataavailable = e => {
                    if (e.data.size > 0) {
                        chunks.push(e.data);
                        const now = Date.now();
                        if (now - lastProgressUpdate > 200) {
                            lastProgressUpdate = now;
                            const elapsed = (now - startTime) / 1000;
                            const progress = Math.min((elapsed / duration) * 100, 95);
                            const currentSize = chunks.reduce((sum, c) => sum + c.size, 0);
                            ChatSystem.updateProgressBar(progress, `جاري ضغط الفيديو... ${(currentSize/1024/1024).toFixed(1)}MB`);
                        }
                    }
                };
                
                mediaRecorder.onstop = () => {
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                    if (chunks.length === 0) { ChatSystem.hideProgressBar(); reject(new Error('❌ فشل تسجيل الفيديو')); return; }
                    
                    const blob = new Blob(chunks, { type: mimeType });
                    const finalSizeMB = (blob.size / 1024 / 1024).toFixed(1);
                    const originalSizeMB = (file.size / 1024 / 1024).toFixed(1);
                    const ratio = ((1 - blob.size / file.size) * 100).toFixed(0);
                    
                    console.log(`✅ ضغط في ${elapsed}s | ${originalSizeMB}MB → ${finalSizeMB}MB (توفير ${ratio}%)`);
                    
                    ChatSystem.updateProgressBar(100, '✅ الضغط مكتمل!');
                    
                    if (blob.size > this.VIDEO_MAX_OUTPUT_SIZE) {
                        ChatSystem.hideProgressBar();
                        reject(new Error(`❌ الحجم بعد الضغط كبير (${finalSizeMB}MB)`));
                        return;
                    }
                    
                    setTimeout(() => { ChatSystem.hideProgressBar(); resolve(blob); }, 500);
                };
                
                mediaRecorder.onerror = () => { ChatSystem.hideProgressBar(); reject(new Error('❌ فشل تسجيل الفيديو')); };
                
                video.currentTime = 0;
                const playPromise = video.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        ChatSystem.showProgressBar('جاري ضغط الفيديو...', 0);
                        mediaRecorder.start(500);
                        setTimeout(() => { if (mediaRecorder.state === 'recording') mediaRecorder.stop(); video.pause(); }, duration * 1000);
                    }).catch(() => { ChatSystem.hideProgressBar(); reject(new Error('❌ فشل تشغيل الفيديو')); });
                } else { reject(new Error('❌ المتصفح لا يدعم تشغيل الفيديو')); }
            };
            
            video.onerror = () => { URL.revokeObjectURL(url); ChatSystem.hideProgressBar(); reject(new Error('❌ فشل تحميل الفيديو')); };
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
        if (!receiverId || !encryptedPackage) throw new Error('بيانات غير صالحة للإرسال');
        try {
            await window.db.collection('secure_messages').add({ 
                to: receiverId, from: window.auth.currentUser.uid, package: encryptedPackage, 
                timestamp: firebase.firestore.FieldValue.serverTimestamp(), 
                expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + this.MESSAGE_EXPIRY_HOURS * 3600000))
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
                ChatSystem.updateLastMessage(msg.from, decryptedText); 
            } else if (msg.package.type === 'webrtc') { 
                const signalData = await this.decryptData(msg.package.data, sharedKey); 
                CallSystem.handleSignaling(JSON.parse(signalData)); 
            }
            if (typeof loadChats === 'function') loadChats();
        } catch (error) {}
    }
};

// ========== نظام الحضور Presence ==========
const PresenceSystem = {
    listeners: {}, heartbeatInterval: null,
    async setOnline() { if (!window.auth?.currentUser) return; try { await window.db.collection('users').doc(window.auth.currentUser.uid).update({ online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); this.startHeartbeat(); } catch (e) {} },
    async setOffline() { if (!window.auth?.currentUser) return; try { await window.db.collection('users').doc(window.auth.currentUser.uid).update({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }); this.stopHeartbeat(); } catch (e) {} },
    startHeartbeat() { this.stopHeartbeat(); this.heartbeatInterval = setInterval(() => { if (window.auth?.currentUser) window.db.collection('users').doc(window.auth.currentUser.uid).update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {}); }, 30000); },
    stopHeartbeat() { if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; } },
    watchFriend(friendId) { if (!friendId) return; if (this.listeners[friendId]) this.listeners[friendId](); this.listeners[friendId] = window.db.collection('users').doc(friendId).onSnapshot(doc => { if (doc.exists) ChatSystem.updateFriendStatus(friendId, doc.data().online === true); else ChatSystem.updateFriendStatus(friendId, false); }, () => {}); },
    stopAll() { Object.values(this.listeners).forEach(unsub => { if (typeof unsub === 'function') unsub(); }); this.listeners = {}; this.stopHeartbeat(); }
};

// ========== نظام اتصال WebRTC مباشر ==========
const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false,
    incomingChunks: {}, incomingFileInfo: {},
    reconnectTimer: null, maxReconnectAttempts: 3, reconnectAttempts: 0,
    servers: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' },{ urls: 'stun:stun1.l.google.com:19302' },{ urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },{ urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }] },
    
    async ensureDataChannel(calleeId) {
        if (!calleeId) return;
        if (this.dc && this.dc.readyState === 'open') return;
        if (this.dc && this.dc.readyState === 'connecting') {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => { clearInterval(checkInterval); reject(new Error('انتهت مهلة انتظار القناة')); }, 10000);
                const checkInterval = setInterval(() => {
                    if (!this.dc) { clearInterval(checkInterval); clearTimeout(timeout); this.createNewDataChannel(calleeId).then(resolve).catch(reject); }
                    else if (this.dc.readyState === 'open') { clearInterval(checkInterval); clearTimeout(timeout); resolve(); }
                    else if (this.dc.readyState === 'failed' || this.dc.readyState === 'closed') { clearInterval(checkInterval); clearTimeout(timeout); this.createNewDataChannel(calleeId).then(resolve).catch(reject); }
                }, 500);
            });
        }
        return this.createNewDataChannel(calleeId);
    },
    
    async createNewDataChannel(calleeId) {
        this.reconnectAttempts = 0; this.cleanupConnections();
        try {
            this.pc = new RTCPeerConnection(this.servers);
            this.dc = this.pc.createDataChannel('chat', { ordered: true, maxRetransmits: 3 });
            this.setupDataChannel(this.dc);
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }).catch(() => {}); };
            this.pc.oniceconnectionstatechange = () => { if (this.pc?.iceConnectionState === 'failed') this.pc.restartIce(); };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            this.pc.onconnectionstatechange = () => { switch(this.pc?.connectionState) { case 'connected': this.reconnectAttempts = 0; break; case 'failed': case 'disconnected': this.scheduleReconnect(); break; } };
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription });
        } catch (error) { throw error; }
    },
    
    setupDataChannel(channel) {
        if (!channel) return;
        channel.onmessage = e => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.chunk !== undefined) { this.handleChunkMessage(msg); return; }
                const displayMsg = { id: msg.id || Date.now().toString(), type: msg.type, data: msg.data, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() };
                if (ChatSystem.currentChat) { ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg); ChatSystem.displayMessage(displayMsg); }
            } catch (error) {}
        };
        channel.onopen = () => { if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } this.reconnectAttempts = 0; };
        channel.onclose = () => this.scheduleReconnect();
        channel.onerror = () => this.scheduleReconnect();
    },
    
    handleChunkMessage(msg) {
        if (!this.incomingChunks[msg.id]) { 
            this.incomingChunks[msg.id] = []; 
            this.incomingFileInfo[msg.id] = { type: msg.type, fileName: msg.fileName, total: msg.total, received: 0 };
            ChatSystem.showProgressBar('جاري استلام الملف...', 0);
        }
        this.incomingChunks[msg.id][msg.chunk] = msg.data;
        this.incomingFileInfo[msg.id].received++;
        const progress = (this.incomingFileInfo[msg.id].received / msg.total) * 100;
        const fileType = msg.type === 'video' ? 'الفيديو' : msg.type === 'image' ? 'الصورة' : 'الملف';
        ChatSystem.updateProgressBar(progress, `جاري استلام ${fileType}...`);
        if (this.incomingFileInfo[msg.id].received === msg.total) {
            const fullData = this.incomingChunks[msg.id].join('');
            const displayMsg = { id: msg.id, type: msg.type === 'location' ? 'text' : msg.type, data: fullData, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() };
            if (ChatSystem.currentChat) { ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg); ChatSystem.displayMessage(displayMsg); }
            ChatSystem.hideProgressBar();
            delete this.incomingChunks[msg.id]; delete this.incomingFileInfo[msg.id];
        }
    },
    
    scheduleReconnect() {
        if (!ChatSystem.currentChat || !ChatSystem.friendOnline) return;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
        this.reconnectTimer = setTimeout(async () => { try { if (ChatSystem.currentChat && ChatSystem.friendOnline) await this.ensureDataChannel(ChatSystem.currentChat); } catch (error) {} this.reconnectTimer = null; }, delay);
    },
    
    async startCall(calleeId, callType = 'video') {
        if (!window.auth?.currentUser || this.isInCall) return;
        this.isInCall = true;
        try {
            const constraints = { audio: true, video: callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.showCallUI(callType);
            this.pc = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            this.dc = this.pc.createDataChannel('chat'); this.setupDataChannel(this.dc);
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }); };
            this.pc.ontrack = e => { const rv = document.getElementById('remoteVideo'); if (rv && e.streams[0]) rv.srcObject = e.streams[0]; };
            this.pc.onconnectionstatechange = () => { if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) this.endCall(); };
            const offer = await this.pc.createOffer(); await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription });
        } catch (e) { this.endCall(); if (e.name === 'NotAllowedError') alert('يرجى السماح بالوصول إلى الكاميرا والميكروفون'); }
    },
    
    // ========== إرسال الملفات (مع ضغط الفيديو) ==========
    async sendFileDirect(file, type) {
        if (!this.dc || this.dc.readyState !== 'open') return false;
        try {
            let blobToSend = file;
            if (type === 'image') blobToSend = await SecureChatSystem.compressImage(file);
            else if (type === 'video') blobToSend = await SecureChatSystem.compressVideo(file);
            
            const b64 = await SecureChatSystem.fileToBase64(blobToSend);
            const chunkSize = 16000;
            const totalChunks = Math.ceil(b64.length / chunkSize);
            const fileId = Date.now().toString();
            
            console.log(`📤 إرسال ${type}: ${file.name || 'ملف'} (${totalChunks} جزء | ${(blobToSend.size/1024/1024).toFixed(1)}MB)`);
            
            for (let i = 0; i < totalChunks; i++) {
                if (this.dc.readyState !== 'open') { ChatSystem.hideProgressBar(); return false; }
                const chunk = { type, data: b64.substring(i * chunkSize, (i + 1) * chunkSize), chunk: i, total: totalChunks, id: fileId, fileName: file.name || 'ملف' };
                this.dc.send(JSON.stringify(chunk));
                const progress = ((i + 1) / totalChunks) * 100;
                const typeLabel = type === 'video' ? 'الفيديو' : type === 'image' ? 'الصورة' : 'الملف';
                ChatSystem.updateProgressBar(progress, `جاري إرسال ${typeLabel}...`);
                await new Promise(r => setTimeout(r, 50));
            }
            ChatSystem.hideProgressBar();
            console.log('✅ تم الإرسال بنجاح');
            return true;
        } catch (e) { ChatSystem.hideProgressBar(); return false; }
    },
    
    showIncomingCall(callerId, callData) {
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const overlay = document.createElement('div'); overlay.id = 'incomingCall';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:30px;';
        overlay.innerHTML = `<div style="font-size:1.5rem;">📞 ${contactName} يتصل بك...</div><div style="display:flex;gap:30px;"><button id="btnAccept" style="width:70px;height:70px;border-radius:50%;background:#4CAF50;color:white;border:none;font-size:2rem;cursor:pointer;">✅</button><button id="btnReject" style="width:70px;height:70px;border-radius:50%;background:#f44336;color:white;border:none;font-size:2rem;cursor:pointer;">❌</button></div>`;
        document.body.appendChild(overlay);
        document.getElementById('btnAccept').onclick = () => { overlay.remove(); this.receiveCall(callerId, callData); };
        document.getElementById('btnReject').onclick = () => { overlay.remove(); };
    },
    
    async receiveCall(callerId, callData) {
        if (this.isInCall) return;
        this.isInCall = true;
        try {
            const hasVideo = callData.sdp?.sdp?.includes('video') !== false;
            const constraints = { audio: true, video: hasVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.showCallUI(hasVideo ? 'video' : 'audio');
            this.pc = new RTCPeerConnection(this.servers);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(callerId, { candidate: e.candidate }); };
            this.pc.ontrack = e => { const rv = document.getElementById('remoteVideo'); if (rv && e.streams[0]) rv.srcObject = e.streams[0]; };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            this.pc.onconnectionstatechange = () => { if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) this.endCall(); };
            if (callData.sdp) { await this.pc.setRemoteDescription(new RTCSessionDescription(callData.sdp)); const answer = await this.pc.createAnswer(); await this.pc.setLocalDescription(answer); await this.sendSignal(callerId, { sdp: this.pc.localDescription }); }
        } catch (e) { this.endCall(); if (e.name === 'NotAllowedError') alert('يرجى السماح بالوصول إلى الكاميرا والميكروفون'); }
    },
    
    async handleSignaling(data) {
        try {
            if (!this.pc) { this.pc = new RTCPeerConnection(this.servers); this.pc.ondatachannel = e => { this.dc = e.channel; this.setupDataChannel(this.dc); }; this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(ChatSystem.currentChat, { candidate: e.candidate }).catch(() => {}); }; }
            if (data.sdp) { await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); if (data.sdp.type === 'offer') { const answer = await this.pc.createAnswer(); await this.pc.setLocalDescription(answer); await this.sendSignal(ChatSystem.currentChat, { sdp: this.pc.localDescription }); } }
            else if (data.candidate) await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {}
    },
    
    async sendSignal(calleeId, data) {
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, { id: Date.now().toString(), type: 'webrtc', data: encrypted, timestamp: Date.now() });
        } catch (error) {}
    },
    
    showCallUI(callType) { document.body.classList.add('in-call'); const ui = document.createElement('div'); ui.id = 'callUI'; ui.innerHTML = `<video id="remoteVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;position:fixed;top:0;left:0;z-index:9998;background:#000;"></video><video id="localVideo" autoplay playsinline muted style="width:100px;height:150px;object-fit:cover;position:fixed;bottom:100px;right:20px;z-index:9999;border-radius:12px;border:2px solid white;background:#333;"></video><div style="position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;gap:30px;"><button onclick="CallSystem.toggleAudio()" style="width:50px;height:50px;border-radius:50%;background:#333;color:white;border:none;font-size:1.2rem;cursor:pointer;">🎤</button><button onclick="CallSystem.endCall()" style="width:60px;height:60px;border-radius:50%;background:#f44336;color:white;border:none;font-size:1.5rem;cursor:pointer;">📞</button><button onclick="CallSystem.toggleVideo()" style="width:50px;height:50px;border-radius:50%;background:#333;color:white;border:none;font-size:1.2rem;cursor:pointer;">📹</button></div>`; document.body.appendChild(ui); const lv = document.getElementById('localVideo'); if (lv && this.localStream) lv.srcObject = this.localStream; },
    toggleAudio() { if (this.localStream) { const at = this.localStream.getAudioTracks()[0]; if (at) at.enabled = !at.enabled; } },
    toggleVideo() { if (this.localStream) { const vt = this.localStream.getVideoTracks()[0]; if (vt) vt.enabled = !vt.enabled; } },
    endCall() { this.isInCall = false; document.body.classList.remove('in-call'); if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; } this.cleanupConnections(); const ui = document.getElementById('callUI'); if (ui) ui.remove(); const inc = document.getElementById('incomingCall'); if (inc) inc.remove(); },
    cleanupConnections() { if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; } if (this.dc) { this.dc.close(); this.dc = null; } if (this.pc) { this.pc.close(); this.pc = null; } this.incomingChunks = {}; this.incomingFileInfo = {}; }
};

window.startVideoCall = async () => { if (!ChatSystem.currentChat) return; await CallSystem.startCall(ChatSystem.currentChat, 'video'); };
window.startAudioCall = async () => { if (!ChatSystem.currentChat) return; await CallSystem.startCall(ChatSystem.currentChat, 'audio'); };

// ========== نظام الدردشة E2EE ==========
const ChatSystem = {
    currentChat: null, messages: {}, friendOnline: false,
    
    init() { this.loadAllChats(); },
    
    loadAllChats() { 
        for (let i = 0; i < localStorage.length; i++) { 
            const k = localStorage.key(i); 
            if (k && k.startsWith('chat_')) { 
                const fid = k.replace('chat_', ''); 
                try { this.messages[fid] = JSON.parse(localStorage.getItem(k)) || []; } catch (e) { this.messages[fid] = []; } 
            } 
        } 
    },
    
    showProgressBar(message, percent) {
        let bar = document.getElementById('progressBar');
        if (!bar) {
            bar = document.createElement('div'); bar.id = 'progressBar';
            bar.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:white;padding:15px 20px;border-radius:15px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:10000;min-width:250px;direction:rtl;';
            bar.innerHTML = `<div style="margin-bottom:8px;font-size:14px;text-align:center;" id="progressText">${message}</div><div style="background:#eee;height:6px;border-radius:3px;overflow:hidden;"><div id="progressFill" style="background:#4CAF50;height:100%;width:0%;transition:width 0.3s;"></div></div><div style="text-align:center;margin-top:5px;font-size:12px;color:#666;" id="progressPercent">0%</div>`;
            document.body.appendChild(bar);
        }
    },
    
    updateProgressBar(percent, message) {
        const fill = document.getElementById('progressFill'), text = document.getElementById('progressText'), perc = document.getElementById('progressPercent');
        if (fill) fill.style.width = Math.min(percent, 100) + '%';
        if (text && message) text.textContent = message;
        if (perc) perc.textContent = Math.round(percent) + '%';
    },
    
    hideProgressBar() { const bar = document.getElementById('progressBar'); if (bar) bar.remove(); },
    
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId; document.body.classList.add('conversation-open');
        const nameEl = document.getElementById('conversationName'), avatarEl = document.getElementById('conversationAvatar');
        if (nameEl) nameEl.textContent = friendName;
        if (avatarEl) avatarEl.textContent = friendAvatar || '👤';
        document.querySelector('.chat-page').style.display = 'none'; 
        document.getElementById('conversationPage').style.display = 'flex';
        this.displayMessages(friendId);
        PresenceSystem.watchFriend(friendId);
        setTimeout(() => { if (this.friendOnline) CallSystem.ensureDataChannel(friendId).catch(() => {}); }, 500);
        setTimeout(() => { const inp = document.getElementById('messageInput'); if (inp) inp.focus(); }, 300);
        setTimeout(() => { const c = document.getElementById('messagesContainer'); if (c) c.scrollTop = c.scrollHeight; }, 100);
    },
    
    updateFriendStatus(friendId, isOnline) {
        if (this.currentChat !== friendId) return;
        this.friendOnline = isOnline;
        if (isOnline) CallSystem.ensureDataChannel(friendId).catch(() => {});
        const statusEl = document.getElementById('conversationStatus');
        if (statusEl) { statusEl.textContent = isOnline ? '🟢 متصل' : '🔴 غير متصل'; statusEl.className = `conversation-status ${isOnline ? 'online' : 'offline'}`; }
        this.updateAttachmentButtons(isOnline);
    },
    
    updateAttachmentButtons(isOnline) {
        const btns = document.querySelectorAll('#attachmentMenu button[data-dc]');
        btns.forEach(btn => { if (isOnline) { btn.classList.remove('locked'); btn.title = ''; } else { btn.classList.add('locked'); btn.title = 'غير متاح - المستخدم غير متصل'; } });
    },
    
    displayMessages(friendId) { const c = document.getElementById('messagesContainer'); if (!c) return; c.innerHTML = ''; (this.messages[friendId] || []).forEach(m => this.displayMessage(m)); },
    
    displayMessage(msg) {
        const c = document.getElementById('messagesContainer'); if (!c) return;
        const div = document.createElement('div'); div.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`; div.id = `msg-${msg.id}`;
        const time = new Date(msg.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        let statusHtml = ''; 
        if (msg.sender === 'me') { let icon = '✓', cls = 'sent'; if (msg.status === 'delivered') { icon = '✓✓'; cls = 'delivered'; } else if (msg.status === 'read') { icon = '✓✓'; cls = 'read'; } statusHtml = `<span class="message-status ${cls}">${icon}</span>`; }
        
        if (msg.type === 'text') div.innerHTML = `<div class="message-content">${this.escapeHtml(msg.text)}</div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        else if (msg.type === 'image') div.innerHTML = `<img src="${msg.data}" class="message-image" onclick="window.openImage('${msg.data}')" loading="lazy"><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        else if (msg.type === 'voice') div.innerHTML = `<audio controls src="${msg.data}" class="message-audio" preload="metadata"></audio><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        else if (msg.type === 'video') div.innerHTML = `<div style="position:relative;max-width:280px;border-radius:12px;overflow:hidden;background:#000;"><video controls preload="metadata" playsinline style="width:100%;max-height:250px;display:block;"><source src="${msg.data}" type="video/webm"><source src="${msg.data}" type="video/mp4"><source src="${msg.data}" type="video/ogg"></video></div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        else if (msg.type === 'file') div.innerHTML = `<div class="message-content" onclick="window.openFile('${msg.data}', '${msg.fileName || 'ملف'}')" style="cursor:pointer;">📎 ${msg.fileName || 'ملف'}</div><div class="message-info"><span class="message-time">${time}</span>${statusHtml}</div>`;
        
        c.appendChild(div); c.scrollTop = c.scrollHeight;
    },
    
    async sendMessage(text) { 
        if (!this.currentChat || !text.trim()) return false; 
        const mid = Date.now().toString(); 
        try { 
            const pr = await SecureChatSystem.getMyPrivateKey(), pu = await SecureChatSystem.getReceiverPublicKey(this.currentChat); 
            if (!pr || !pu) return false;
            const sk = await SecureChatSystem.deriveSharedKey(pr, pu), enc = await SecureChatSystem.encryptData(text.trim(), sk); 
            await SecureChatSystem.sendToServer(this.currentChat, { id: mid, type: 'text', data: enc, timestamp: Date.now() }); 
            this.saveMessage(this.currentChat, { id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            this.displayMessage({ id: mid, type: 'text', text: text.trim(), sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            return true; 
        } catch (e) { return false; } 
    },
    
    async sendFileWithRetry(file, type, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.showProgressBar(`جاري ${type === 'video' ? 'ضغط وإرسال' : 'إرسال'} ${type === 'video' ? 'الفيديو' : type === 'image' ? 'الصورة' : 'الملف'}...`, 0);
                const success = await CallSystem.sendFileDirect(file, type);
                if (success) { this.hideProgressBar(); return true; }
                if (attempt < maxRetries) { this.updateProgressBar(0, `إعادة المحاولة ${attempt + 1}...`); await new Promise(r => setTimeout(r, 2000 * attempt)); }
            } catch (error) {}
        }
        this.hideProgressBar(); return false;
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
                    this.saveMessage(this.currentChat, { id: msgId, type: 'image', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
                    this.displayMessage({ id: msgId, type: 'image', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                } else alert('فشل إرسال الصورة');
            }
        } else alert('المستخدم غير متصل حالياً');
    },
    
    // ========== إرسال الفيديو مع ضغط ==========
    async sendVideoFile(file) { 
        if (!this.currentChat) return;
        
        // فحص الفيديو (المدة والحجم)
        try {
            const duration = await SecureChatSystem.getVideoDuration(file);
            if (duration > SecureChatSystem.VIDEO_MAX_DURATION) {
                const mins = Math.floor(duration / 60), secs = Math.floor(duration % 60), maxMins = Math.floor(SecureChatSystem.VIDEO_MAX_DURATION / 60);
                alert(`❌ الفيديو طويل جداً (${mins}:${secs.toString().padStart(2, '0')})\nالحد الأقصى: ${maxMins} دقائق`);
                return;
            }
            if (file.size > SecureChatSystem.VIDEO_MAX_INPUT_SIZE) {
                const sizeMB = (file.size / 1024 / 1024).toFixed(1), maxMB = (SecureChatSystem.VIDEO_MAX_INPUT_SIZE / 1024 / 1024).toFixed(0);
                alert(`❌ حجم الفيديو كبير جداً (${sizeMB}MB)\nالحد الأقصى: ${maxMB}MB`);
                return;
            }
        } catch (error) { alert('❌ فشل قراءة الفيديو'); return; }
        
        if (!this.friendOnline) { alert('المستخدم غير متصل حالياً'); return; }
        await CallSystem.ensureDataChannel(this.currentChat);
        
        if (CallSystem.dc && CallSystem.dc.readyState === 'open') { 
            console.log(`🎬 بدء معالجة الفيديو: ${file.name} | ${(file.size/1024/1024).toFixed(1)}MB`);
            const success = await this.sendFileWithRetry(file, 'video');
            if (success) {
                try {
                    // ضغط الفيديو للعرض
                    const compressed = await SecureChatSystem.compressVideo(file);
                    const b64 = await SecureChatSystem.fileToBase64(compressed); 
                    const msgId = Date.now().toString();
                    
                    this.displayMessage({ id: msgId, type: 'video', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                    this.saveMessage(this.currentChat, { id: msgId, type: 'video', data: b64.substring(0, 100) + '...', _videoPlaceholder: true, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                    
                } catch (error) { console.error('❌ فشل معالجة الفيديو:', error); }
            } else alert('فشل إرسال الفيديو');
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
                    if (b64.length < 500000) {
                        this.saveMessage(this.currentChat, { id: msgId, type: 'file', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                    } else {
                        this.saveMessage(this.currentChat, { id: msgId, type: 'file', data: b64.substring(0, 100) + '...', _filePlaceholder: true, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                    }
                    this.displayMessage({ id: msgId, type: 'file', data: b64, fileName: file.name, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                } else alert('فشل إرسال الملف');
            }
        } else alert('المستخدم غير متصل حالياً');
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
                    this.saveMessage(this.currentChat, { id: msgId, type: 'voice', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
                    this.displayMessage({ id: msgId, type: 'voice', data: b64, sender: 'me', time: new Date().toISOString(), status: 'sent' });
                } else alert('فشل إرسال البصمة الصوتية');
            }
        } else alert('المستخدم غير متصل حالياً');
    },
    
    async shareLocationDirect() { 
        if (!this.currentChat) return; 
        if (this.friendOnline && CallSystem.dc && CallSystem.dc.readyState === 'open') { 
            if (!navigator.geolocation) { alert('المتصفح لا يدعم تحديد الموقع'); return; }
            navigator.geolocation.getCurrentPosition(p => { 
                const locMsg = `📍 موقعي: https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`; 
                CallSystem.dc.send(JSON.stringify({ type: 'location', data: locMsg, id: Date.now().toString() })); 
                const msgId = Date.now().toString();
                this.saveMessage(this.currentChat, { id: msgId, type: 'text', text: locMsg, sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
                this.displayMessage({ id: msgId, type: 'text', text: locMsg, sender: 'me', time: new Date().toISOString(), status: 'sent' }); 
            }, () => alert('فشل تحديد الموقع'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        }
    },
    
    saveMessage(friendId, message) { 
        const key = `chat_${friendId}`; 
        let h = []; 
        try { h = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { h = []; }
        h.push(message); 
        let serialized = JSON.stringify(h);
        while (serialized.length > 4000000) {
            let removed = false;
            for (let i = 0; i < h.length; i++) {
                if (h[i].type === 'video' || h[i].type === 'image' || h[i].type === 'file') { h.splice(i, 1); removed = true; break; }
            }
            if (!removed) h.splice(0, 1);
            serialized = JSON.stringify(h);
        }
        try { localStorage.setItem(key, JSON.stringify(h)); } catch (e) {
            h = h.slice(Math.floor(h.length * 0.2));
            try { localStorage.setItem(key, JSON.stringify(h)); } catch (e2) { h = h.slice(-10); try { localStorage.setItem(key, JSON.stringify(h)); } catch (e3) {} }
        }
        this.messages[friendId] = h; 
    },
    
    updateLastMessage(friendId, lastMessage) { 
        document.querySelectorAll('.chat-item').forEach(item => { 
            if (item.getAttribute('onclick')?.includes(friendId)) { 
                const lm = item.querySelector('.last-message'), tm = item.querySelector('.chat-time'); 
                if (lm) lm.textContent = lastMessage; 
                if (tm) tm.textContent = 'الآن'; 
            } 
        }); 
    },
    
    closeChat() {
        document.body.classList.remove('conversation-open');
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        PresenceSystem.stopAll();
        if (!CallSystem.isInCall) CallSystem.cleanupConnections();
        this.currentChat = null; this.friendOnline = false;
    },
    
    escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
};

ChatSystem.init();

// ========== وظائف الواجهة العامة ==========
async function loadChats() { if (!window.auth || !window.auth.currentUser) return; const list = document.getElementById('chatsList'); if (!list) return; try { const udoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); if (!udoc.exists) return; const friends = udoc.data().friends || []; if (!friends.length) { list.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>لا توجد محادثات</h3></div>`; return; } let html = ''; for (const fid of friends) { try { const fdoc = await window.db.collection('users').doc(fid).get(); if (fdoc.exists) { const f = fdoc.data(); const key = `chat_${fid}`; let lm = 'اضغط لبدء المحادثة', lt = ''; try { const h = JSON.parse(localStorage.getItem(key)) || []; if (h.length > 0) { const l = h[h.length - 1]; if (l.type === 'text') lm = l.text.length > 30 ? l.text.substring(0, 30) + '...' : l.text; else if (l.type === 'image') lm = '📷 صورة'; else if (l.type === 'voice') lm = '🎤 بصمة'; else if (l.type === 'video') lm = '🎥 فيديو'; else if (l.type === 'file') lm = '📎 ملف'; lt = new Date(l.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); } } catch (e) {} html += `<div class="chat-item" onclick="openChat('${fid}')"><div class="chat-avatar-emoji">${window.getEmojiForUser(f)}</div><div class="chat-info"><h4>${f.name || 'مستخدم'}</h4><p class="last-message">${lm}</p></div><div class="chat-meta"><span class="chat-time">${lt || ''}</span></div></div>`; } } catch (e) {} } list.innerHTML = html || `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد محادثات نشطة</h3></div>`; } catch (e) {} }

function setupChatListeners() { document.addEventListener('click', e => { const m = document.getElementById('attachmentMenu'), ab = document.querySelector('.attach-btn'); if (m && ab && !m.contains(e.target) && !ab.contains(e.target)) m.style.display = 'none'; const ep = document.getElementById('emojiPicker'), eb = document.querySelector('.emoji-btn'); if (ep && eb && !ep.contains(e.target) && !eb.contains(e.target)) ep.style.display = 'none'; }); }

window.openChat = friendId => { window.db.collection('users').doc(friendId).get().then(doc => { if (doc.exists) { const f = doc.data(); ChatSystem.openChat(friendId, f.name, window.getEmojiForUser ? window.getEmojiForUser(f) : '👤'); } }).catch(() => {}); };
window.sendMessage = () => { const inp = document.getElementById('messageInput'); if (inp && inp.value.trim()) ChatSystem.sendMessage(inp.value.trim()).then(s => { if (s) { inp.value = ''; inp.style.height = 'auto'; } }); };
window.handleMessageKeyPress = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendMessage(); } };
window.showAttachmentMenu = () => { const m = document.getElementById('attachmentMenu'); if (m) m.style.display = m.style.display === 'none' ? 'flex' : 'none'; const ep = document.getElementById('emojiPicker'); if (ep) ep.style.display = 'none'; };
window.showEmojiPicker = () => { const p = document.getElementById('emojiPicker'); if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none'; const m = document.getElementById('attachmentMenu'); if (m) m.style.display = 'none'; };
window.sendImage = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = e => { const f = e.target.files[0]; if (f && ChatSystem.currentChat) ChatSystem.sendImage(f); }; i.click(); document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendVideo = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'video/*'; i.onchange = e => { const f = e.target.files[0]; if (f && ChatSystem.currentChat) ChatSystem.sendVideoFile(f); }; i.click(); document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendFile = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '*/*'; i.onchange = e => { const f = e.target.files[0]; if (f && ChatSystem.currentChat) ChatSystem.sendFile(f); }; i.click(); document.getElementById('attachmentMenu').style.display = 'none'; };
window.sendVoiceNote = () => { if (!navigator.mediaDevices?.getUserMedia) { alert('المتصفح لا يدعم تسجيل الصوت'); return; } navigator.mediaDevices.getUserMedia({ audio: true }).then(s => { const mr = new MediaRecorder(s); const ch = []; mr.ondataavailable = e => { if (e.data.size > 0) ch.push(e.data); }; mr.onstop = () => { s.getTracks().forEach(t => t.stop()); const blob = new Blob(ch, { type: 'audio/webm' }); if (blob.size > 0) ChatSystem.sendVoiceNote(blob); const sb = document.querySelector('.send-btn'), vb = document.querySelector('.voice-btn'); if (sb) sb.style.display = 'flex'; if (vb) vb.style.display = 'none'; }; mr.start(); const sb = document.querySelector('.send-btn'), vb = document.querySelector('.voice-btn'); if (sb) sb.style.display = 'none'; if (vb) { vb.style.display = 'flex'; vb.onclick = () => { if (mr.state === 'recording') mr.stop(); }; } setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, 900000); }).catch(() => alert('يرجى السماح بالوصول إلى الميكروفون')); document.getElementById('attachmentMenu').style.display = 'none'; };
window.shareLocation = () => { if (ChatSystem.friendOnline && CallSystem.dc?.readyState === 'open') ChatSystem.shareLocationDirect(); else if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => ChatSystem.sendMessage(`📍 موقعي: https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`), () => alert('فشل تحديد الموقع')); document.getElementById('attachmentMenu').style.display = 'none'; };
window.closeConversation = () => { CallSystem.endCall(); ChatSystem.closeChat(); };
window.openImage = (data) => { const win = window.open('', '_blank'); if (win) win.document.write(`<img src="${data}" style="max-width:100%;height:auto;">`); };
window.openFile = (data, fileName) => { const link = document.createElement('a'); link.href = data; link.download = fileName || 'file'; link.click(); };
window.getEmojiForUser = u => { const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; return m[u?.avatarType] || '👤'; };

function formatNumber(num) { if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'; if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'; return num.toString(); }
function setupNavigation() { const nav = document.querySelectorAll('.nav-item'); const pages = document.querySelectorAll('.page'); if (!nav.length || !pages.length) return; function switchPage(id) { pages.forEach(p => p.classList.remove('active')); const t = document.querySelector(`.page.${id}-page`); if (t) { t.classList.add('active'); t.style.display = 'block'; } pages.forEach(p => { if (!p.classList.contains('active')) p.style.display = 'none'; }); document.querySelectorAll('.profile-subpage').forEach(s => s.style.display = 'none'); if (id === 'chat') loadChats(); document.body.classList.remove('conversation-open'); nav.forEach(n => n.classList.toggle('active', n.dataset.page === id)); } nav.forEach(n => n.addEventListener('click', () => switchPage(n.dataset.page))); }

document.addEventListener('DOMContentLoaded', () => { document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); document.querySelectorAll('.page').forEach(p => { p.style.display = p.classList.contains('active') ? 'block' : 'none'; }); setupNavigation(); loadChats(); setupChatListeners(); });
window.addEventListener('authReady', async () => { if (window.auth?.currentUser) await SecureChatSystem.init(); });
window.addEventListener('beforeunload', () => { PresenceSystem.setOffline(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) PresenceSystem.setOffline(); else { PresenceSystem.setOnline(); if (ChatSystem.currentChat && ChatSystem.friendOnline) setTimeout(() => CallSystem.ensureDataChannel(ChatSystem.currentChat).catch(() => {}), 1000); } });
if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
