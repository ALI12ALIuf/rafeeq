// ========== secure-chat.js ==========
// نظام التشفير E2EE + ضغط الصور + فحص الفيديو + إرسال مباشر + حذف 24 ساعة

// ========== نظام تصحيح الأخطاء (Debug Panel) ==========
const DebugSystem = {
    logs: [],
    isVisible: false,
    panel: null,
    
    init() {
        // إنشاء لوحة التصحيح
        this.panel = document.createElement('div');
        this.panel.id = 'debugPanel';
        this.panel.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            width: 400px;
            max-height: 300px;
            background: rgba(0,0,0,0.9);
            color: #0f0;
            font-family: monospace;
            font-size: 11px;
            z-index: 99999;
            border-radius: 8px;
            overflow: hidden;
            display: none;
            flex-direction: column;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
        `;
        this.panel.innerHTML = `
            <div style="background:#333;padding:8px;display:flex;justify-content:space-between;cursor:move;">
                <span>🐛 Debug Console</span>
                <div>
                    <button id="debugClear" style="background:#555;border:none;color:white;margin-right:5px;cursor:pointer;">🗑️</button>
                    <button id="debugClose" style="background:#f44336;border:none;color:white;cursor:pointer;">✖️</button>
                </div>
            </div>
            <div id="debugLogs" style="padding:8px;overflow-y:auto;flex:1;max-height:250px;"></div>
        `;
        document.body.appendChild(this.panel);
        
        document.getElementById('debugClear')?.addEventListener('click', () => this.clear());
        document.getElementById('debugClose')?.addEventListener('click', () => this.hide());
        
        // إضافة زر عائم لإظهار اللوحة
        const floatBtn = document.createElement('div');
        floatBtn.id = 'debugFloatBtn';
        floatBtn.innerHTML = '🐛';
        floatBtn.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            width: 40px;
            height: 40px;
            background: #333;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 99998;
            font-size: 20px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        `;
        floatBtn.onclick = () => this.show();
        document.body.appendChild(floatBtn);
        
        console.log('✅ Debug Panel initialized');
    },
    
    log(level, module, message, data = null) {
        const timestamp = new Date().toLocaleTimeString();
        const colors = { error: '#f44336', warn: '#ff9800', info: '#2196F3', success: '#4CAF50', debug: '#9C27B0' };
        const color = colors[level] || '#0f0';
        
        const logEntry = { timestamp, level, module, message, data };
        this.logs.unshift(logEntry);
        if (this.logs.length > 100) this.logs.pop();
        
        if (this.isVisible) {
            this.renderLogs();
        }
        
        // طباعة في console العادي أيضاً
        const consoleMsg = `[${timestamp}] [${module}] ${message}`;
        if (level === 'error') console.error(consoleMsg, data);
        else if (level === 'warn') console.warn(consoleMsg, data);
        else console.log(consoleMsg, data);
    },
    
    renderLogs() {
        const container = document.getElementById('debugLogs');
        if (!container) return;
        container.innerHTML = this.logs.map(log => `
            <div style="border-bottom:1px solid #333;padding:4px 0;margin-bottom:2px;">
                <span style="color:#888;">[${log.timestamp}]</span>
                <span style="color:${log.level === 'error' ? '#f44336' : log.level === 'warn' ? '#ff9800' : '#4CAF50'};">[${log.module}]</span>
                <span style="color:#fff;">${log.message}</span>
                ${log.data ? `<div style="color:#aaa;font-size:9px;margin-top:2px;">${typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data}</div>` : ''}
            </div>
        `).join('');
        container.scrollTop = 0;
    },
    
    show() {
        this.isVisible = true;
        this.panel.style.display = 'flex';
        this.renderLogs();
        const floatBtn = document.getElementById('debugFloatBtn');
        if (floatBtn) floatBtn.style.display = 'none';
    },
    
    hide() {
        this.isVisible = false;
        this.panel.style.display = 'none';
        const floatBtn = document.getElementById('debugFloatBtn');
        if (floatBtn) floatBtn.style.display = 'flex';
    },
    
    clear() {
        this.logs = [];
        this.renderLogs();
    },
    
    error(module, message, data) { this.log('error', module, message, data); },
    warn(module, message, data) { this.log('warn', module, message, data); },
    info(module, message, data) { this.log('info', module, message, data); },
    success(module, message, data) { this.log('success', module, message, data); },
    debug(module, message, data) { this.log('debug', module, message, data); }
};

const SecureChatSystem = {
    MESSAGE_EXPIRY_HOURS: 24,
    keyCache: new Map(),
    sharedKeyCache: new Map(),
    
    VIDEO_MAX_DURATION: 180,
    VIDEO_WARNING_DURATION: 170,
    VIDEO_MAX_INPUT_SIZE: 250 * 1024 * 1024,
    
    async init() {
        if (!window.auth?.currentUser) { 
            DebugSystem.error('SecureChat', 'لا يوجد مستخدم مسجل');
            return false; 
        }
        
        try {
            DebugSystem.info('SecureChat', 'بدء تهيئة نظام التشفير...');
            await this.setupKeys();
            this.startReceiving();
            PresenceSystem.setOnline();
            DebugSystem.success('SecureChat', 'تم تهيئة نظام التشفير بنجاح');
            return true;
        } catch (error) {
            DebugSystem.error('SecureChat', 'فشل تهيئة نظام التشفير', error.message);
            return false;
        }
    },
    
    async setupKeys() {
        const uid = window.auth.currentUser.uid;
        const existingKey = localStorage.getItem(`enc_private_key_${uid}`);
        
        if (!existingKey) {
            DebugSystem.info('SecureChat', 'إنشاء مفاتيح تشفير جديدة...');
            const keyPair = await this.generateKeyPair();
            const publicKey = await this.exportPublicKey(keyPair.publicKey);
            
            await window.db.collection('users').doc(uid).update({ 
                publicKey,
                publicKeyCreatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            const privateExport = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
            
            localStorage.setItem(`enc_private_key_${uid}`, btoa(String.fromCharCode(...new Uint8Array(privateExport))));
            this.keyCache.set(uid, keyPair.privateKey);
            DebugSystem.success('SecureChat', 'تم إنشاء المفاتيح بنجاح');
        } else {
            const doc = await window.db.collection('users').doc(uid).get();
            
            if (!doc.exists || !doc.data()?.publicKey) {
                DebugSystem.warn('SecureChat', 'المفتاح العام مفقود، إعادة إنشاء المفاتيح...');
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
            
            DebugSystem.success('SecureChat', `فيديو جاهز: ${mins}:${secs.toString().padStart(2, '0')} | ${(file.size/1024/1024).toFixed(1)}MB`);
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
        try {
            await window.db.collection('secure_messages').add({ 
                to: receiverId, from: window.auth.currentUser.uid, package: encryptedPackage, 
                timestamp: firebase.firestore.FieldValue.serverTimestamp(), 
                expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + this.MESSAGE_EXPIRY_HOURS * 3600000))
            });
            DebugSystem.debug('SecureChat', `إرسال إلى ${receiverId}`, encryptedPackage.type);
        } catch (error) { throw error; }
    },
    
    startReceiving() { 
        if (!window.auth?.currentUser) return null;
        const uid = window.auth.currentUser.uid;
        DebugSystem.info('SecureChat', `بدء استقبال الرسائل للمستخدم ${uid}`);
        return window.db.collection('secure_messages').where('to', '==', uid).onSnapshot(async snapshot => { 
            for (const change of snapshot.docChanges()) { 
                if (change.type === 'added') { 
                    const msg = { id: change.doc.id, ...change.doc.data() }; 
                    DebugSystem.debug('SecureChat', `رسالة واردة من ${msg.from}`, { type: msg.package?.type, id: msg.id });
                    await this.processReceivedMessage(msg); 
                    try { await change.doc.ref.delete(); } catch (deleteError) {}
                } 
            } 
        }, error => { 
            DebugSystem.error('SecureChat', 'خطأ في الاستماع للرسائل', error.message);
            setTimeout(() => this.startReceiving(), 5000); 
        }); 
    },
    
    // ========== الدالة المعدلة مع التصحيح ==========
    async processReceivedMessage(msg) {
        try {
            DebugSystem.debug('SecureChat', `معالجة رسالة من ${msg.from}`, { type: msg.package?.type });
            
            const myPrivateKey = await this.getMyPrivateKey(); 
            const senderPublicKey = await this.getReceiverPublicKey(msg.from);
            if (!myPrivateKey || !senderPublicKey) {
                DebugSystem.warn('SecureChat', 'فشل الحصول على المفاتيح', { hasPrivate: !!myPrivateKey, hasPublic: !!senderPublicKey });
                return;
            }
            const sharedKey = await this.deriveSharedKey(myPrivateKey, senderPublicKey);
            
            if (msg.package.type === 'text') { 
                const decryptedText = await this.decryptData(msg.package.data, sharedKey); 
                ChatSystem.saveMessage(msg.from, { id: msg.package.id, type: 'text', text: decryptedText, sender: 'friend', time: new Date().toISOString() }); 
                if (ChatSystem.currentChat === msg.from) ChatSystem.displayMessages(msg.from);
                ChatSystem.updateLastMessage(msg.from, decryptedText);
                DebugSystem.success('SecureChat', `رسالة نصية من ${msg.from}`);
            } 
            else if (msg.package.type === 'webrtc') { 
                DebugSystem.info('SecureChat', `إشارة WebRTC واردة من ${msg.from}`);
                const signalData = await this.decryptData(msg.package.data, sharedKey);
                const parsedData = JSON.parse(signalData);
                
                DebugSystem.debug('SecureChat', 'تفاصيل الإشارة', {
                    hasSdp: !!parsedData.sdp,
                    sdpType: parsedData.sdp?.type,
                    callType: parsedData.type,
                    hasCandidate: !!parsedData.candidate
                });
                
                // ✅ التحقق: هل هذه مكالمة واردة جديدة (offer)؟
                if (parsedData.sdp && parsedData.sdp.type === 'offer') {
                    DebugSystem.success('SecureChat', `🚨 مكالمة واردة جديدة من ${msg.from} - نوع: ${parsedData.type || 'audio'}`);
                    
                    if (typeof CallSystem !== 'undefined' && CallSystem.showIncomingCall) {
                        DebugSystem.info('SecureChat', 'عرض شاشة المكالمة الواردة...');
                        CallSystem.showIncomingCall(msg.from, parsedData);
                    } else {
                        DebugSystem.error('SecureChat', 'CallSystem أو showIncomingCall غير موجود!', {
                            hasCallSystem: typeof CallSystem !== 'undefined',
                            hasShowIncomingCall: typeof CallSystem?.showIncomingCall !== 'undefined'
                        });
                    }
                } 
                else {
                    DebugSystem.debug('SecureChat', `إشارة WebRTC أخرى (رد أو ICE candidate)`);
                    if (typeof CallSystem !== 'undefined' && CallSystem.handleSignaling) {
                        CallSystem.handleSignaling(parsedData);
                    }
                }
            }
            
            if (typeof loadChats === 'function') loadChats();
        } catch (error) {
            DebugSystem.error('SecureChat', 'خطأ في معالجة الرسالة', error.message);
        }
    }
};

// ========== تهيئة نظام التصحيح عند تحميل الصفحة ==========
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        DebugSystem.init();
        DebugSystem.success('System', 'نظام التصحيح جاهز - اضغط على زر 🐛 لعرض الأخطاء');
    });
}
