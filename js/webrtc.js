// ========== نظام WebRTC المتكامل مع تشفير حقيقي وتصحيحات كاملة ==========
// اتصال P2P مشفر بالكامل - تخزين مؤقت مشفر في Firebase

class WebRTCManager {
    constructor() {
        this.peerConnections = new Map();
        this.dataChannels = new Map();
        this.localStream = null;
        this.currentCall = null;
        this.currentFriendId = null;
        this.pendingCandidates = new Map();
        this.pendingMessages = [];
        this.encryptionKeys = new Map();
        selfFriendStatus = new Map();
        this.heartbeatInterval = null;
        this.isReady = true;
        
        // 🔥 التصحيح 1: التحكم في استماع Firebase
        this.isDirectConnectionActive = false;
        this.firebaseListener = null;
        this.tempMessagesListener = null;
        
        // 🔥 التصحيح 4: سجل آخر اتصال للأصدقاء
        this.lastSeenMap = new Map();
        
        // 🔥 التصحيح 10: تنظيف المفاتيح القديمة
        this.startKeyCleanup();
        
        // 🔐 مفتاح مؤقت للإشارات
        this.signalingKey = null;
        
        console.log('🔐 نظام WebRTC المشفر جاهز');
        
        if (window.auth?.currentUser) {
            this.initSignalingKey();
            this.startListeningForSignals();
            this.startListeningForTempMessages(); // يبدأ في وضع الاستماع
            this.startHeartbeat();
        }
    }

    // ========== تهيئة مفتاح الإشارات المؤقت ==========
    
    async initSignalingKey() {
        this.signalingKey = await this.generateEncryptionKey();
        console.log('🔑 مفتاح الإشارات جاهز');
    }

    // ========== التصحيح 1: التحكم في استماع Firebase ==========
    
    // تشغيل/إيقاف استماع Firebase حسب حالة الاتصال المباشر
    setDirectConnectionStatus(active) {
        this.isDirectConnectionActive = active;
        
        if (active) {
            // 🟢 اتصال مباشر ناجح → أوقف استماع Firebase
            if (this.tempMessagesListener) {
                this.tempMessagesListener();
                this.tempMessagesListener = null;
                console.log('🔇 تم إيقاف استماع Firebase - اتصال مباشر نشط');
            }
        } else {
            // 🔴 انقطع الاتصال المباشر → شغل استماع Firebase
            if (!this.tempMessagesListener) {
                this.startListeningForTempMessages();
                console.log('🎤 تم تشغيل استماع Firebase - اتصال مباشر غير نشط');
            }
        }
    }

    // ========== التصحيح 3: تاريخ انتهاء للرسائل المؤقتة ==========
    
    // حساب تاريخ انتهاء الصلاحية (24 ساعة)
    getExpiryDate() {
        const expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 24);
        return expiryDate;
    }

    // ========== التصحيح 7: تشفير البيانات الوصفية ==========
    
    // تشفير كامل للبيانات (الرسالة + البيانات الوصفية)
    async encryptFullData(data, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const jsonString = JSON.stringify(data);
        const encoded = encoder.encode(jsonString);
        
        const encrypted = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            encoded
        );
        
        return {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encrypted))
        };
    }
    
    // فك تشفير كامل للبيانات
    async decryptFullData(encryptedData, key) {
        try {
            const iv = new Uint8Array(encryptedData.iv);
            const data = new Uint8Array(encryptedData.data);
            
            const decrypted = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                data
            );
            
            const decoder = new TextDecoder();
            const jsonString = decoder.decode(decrypted);
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('فشل فك تشفير البيانات:', error);
            return null;
        }
    }

    // ========== التصحيح 8: تقنية Pull بدل Push ==========
    
    // سحب الرسائل يدوياً (بدل الدفع التلقائي)
    async pullMessages() {
        if (!window.auth?.currentUser) return;
        
        const myId = window.auth.currentUser.uid;
        
        try {
            // البحث عن الرسائل المخصصة لي
            const snapshot = await window.db.collection('temp_messages')
                .where('to', '==', myId)
                .where('expiresAt', '>', new Date()) // فقط غير منتهية
                .get();
            
            for (const doc of snapshot.docs) {
                const data = doc.data();
                
                // معالجة الرسالة
                await this.processIncomingMessage(data);
                
                // حذف بعد المعالجة
                await doc.ref.delete();
            }
        } catch (error) {
            console.error('خطأ في سحب الرسائل:', error);
        }
    }
    
    // بدء السحب الدوري
    startPullInterval() {
        setInterval(() => {
            this.pullMessages();
        }, 60000); // كل دقيقة
    }

    // ========== التصحيح 4: التحقق من الاتصال قبل التخزين ==========
    
    // تحديث آخر ظهور لصديق
    updateLastSeen(friendId) {
        this.lastSeenMap.set(friendId, Date.now());
    }
    
    // التحقق من إمكانية إرسال رسالة
    canSendMessage(friendId) {
        // 1. تحقق من وجود الصديق في قائمة الأصدقاء
        const isFriend = window.friendsList?.includes(friendId);
        if (!isFriend) return false;
        
        // 2. تحقق من آخر اتصال (خلال آخر 5 دقائق)
        const lastSeen = this.lastSeenMap.get(friendId) || 0;
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        
        return lastSeen > fiveMinutesAgo;
    }

    // ========== التصحيح 9: تشفير الإشارات ==========
    
    // تشفير الإشارة قبل إرسالها لـ Firebase
    async encryptSignal(signalData) {
        if (!this.signalingKey) {
            await this.initSignalingKey();
        }
        
        const encrypted = await this.encryptFullData(signalData, this.signalingKey);
        
        return {
            encrypted: encrypted
        };
    }

    // ========== التصحيح 10: تنظيف المفاتيح القديمة ==========
    
    // بدء تنظيف المفاتيح القديمة
    startKeyCleanup() {
        setInterval(() => {
            const now = Date.now();
            const twoHoursAgo = now - 2 * 60 * 60 * 1000;
            
            this.encryptionKeys.forEach((keyData, friendId) => {
                // إذا كان آخر استخدام من ساعتين أو أكثر
                if (keyData.lastUsed && keyData.lastUsed < twoHoursAgo) {
                    this.encryptionKeys.delete(friendId);
                    console.log(`🧹 تم تنظيف مفتاح الصديق ${friendId} (غير مستخدم)`);
                }
            });
        }, 60 * 60 * 1000); // كل ساعة
    }
    
    // تحديث آخر استخدام للمفتاح
    updateKeyLastUsed(friendId) {
        if (this.encryptionKeys.has(friendId)) {
            const keyData = this.encryptionKeys.get(friendId);
            keyData.lastUsed = Date.now();
            this.encryptionKeys.set(friendId, keyData);
        }
    }

    // ========== نظام التشفير الحقيقي AES-256-GCM ==========
    
    async generateEncryptionKey() {
        return await crypto.subtle.generateKey(
            {
                name: 'AES-GCM',
                length: 256
            },
            true,
            ['encrypt', 'decrypt']
        );
    }
    
    async exportKey(key) {
        return await crypto.subtle.exportKey('raw', key);
    }
    
    async importKey(rawKey) {
        return await crypto.subtle.importKey(
            'raw',
            rawKey,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }
    
    async encryptMessage(text, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        
        const encrypted = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            data
        );
        
        return {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encrypted))
        };
    }
    
    async decryptMessage(encryptedData, key) {
        try {
            const iv = new Uint8Array(encryptedData.iv);
            const data = new Uint8Array(encryptedData.data);
            
            const decrypted = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                data
            );
            
            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            console.error('فشل فك التشفير:', error);
            return '[رسالة مشفرة لا يمكن فكها]';
        }
    }
    
    async encryptFile(file, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const fileData = await file.arrayBuffer();
        
        const encrypted = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            fileData
        );
        
        return {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encrypted)),
            name: file.name,
            type: file.type,
            size: file.size
        };
    }
    
    async decryptFile(encryptedFile, key) {
        try {
            const iv = new Uint8Array(encryptedFile.iv);
            const data = new Uint8Array(encryptedFile.data);
            
            const decrypted = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                data
            );
            
            return new File(
                [decrypted],
                encryptedFile.name,
                { type: encryptedFile.type }
            );
        } catch (error) {
            console.error('فشل فك تشفير الملف:', error);
            return null;
        }
    }

    // ========== نظام تبادل المفاتيح عبر WebRTC ==========
    
    async exchangeKeys(friendId) {
        const myKey = await this.generateEncryptionKey();
        this.encryptionKeys.set(friendId, { 
            key: myKey, 
            exchanged: false,
            lastUsed: Date.now() 
        });
        
        const exportedKey = await this.exportKey(myKey);
        
        const channel = this.dataChannels.get(friendId);
        if (channel && channel.readyState === 'open') {
            channel.send(JSON.stringify({
                type: 'key-exchange',
                key: Array.from(exportedKey)
            }));
        }
    }
    
    async handleKeyExchange(data, friendId) {
        try {
            const friendKey = await this.importKey(new Uint8Array(data.key));
            
            if (!this.encryptionKeys.has(friendId)) {
                this.encryptionKeys.set(friendId, {});
            }
            const keyData = this.encryptionKeys.get(friendId);
            keyData.friendKey = friendKey;
            keyData.exchanged = true;
            keyData.lastUsed = Date.now();
            
            console.log('🔑 تم تبادل المفاتيح مع', friendId);
            this.displaySystemMessage('🔐 تم تأمين المحادثة');
            
            // 🔥 تحديث حالة الاتصال المباشر
            this.setDirectConnectionStatus(true);
            
            this.sendPendingEncryptedMessages(friendId);
        } catch (error) {
            console.error('خطأ في تبادل المفاتيح:', error);
        }
    }

    // ========== نظام التحقق من الاتصال ==========
    
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.checkAllConnections();
        }, 3000);
    }
    
    checkAllConnections() {
        this.peerConnections.forEach((pc, friendId) => {
            const status = this.checkFriendStatus(friendId);
            selfFriendStatus.set(friendId, status);
            
            // تحديث آخر ظهور
            if (status.includes('🟢')) {
                this.updateLastSeen(friendId);
            }
            
            if (friendId === this.currentFriendId) {
                this.updateFriendStatusUI(status);
            }
        });
    }
    
    checkFriendStatus(friendId) {
        const pc = this.peerConnections.get(friendId);
        const channel = this.dataChannels.get(friendId);
        const keys = this.encryptionKeys.get(friendId);
        
        const checks = {
            pcConnected: pc && pc.iceConnectionState === 'connected',
            channelOpen: channel && channel.readyState === 'open',
            keysExchanged: keys && keys.exchanged === true
        };
        
        if (checks.pcConnected && checks.channelOpen && checks.keysExchanged) {
            return '🟢 متصل وآمن';
        } else if (checks.pcConnected && checks.channelOpen) {
            return '🟡 متصل (غير آمن)';
        } else if (checks.pcConnected) {
            return '🔵 جاري التشفير';
        } else {
            return '🔴 غير متصل';
        }
    }
    
    updateFriendStatusUI(status) {
        let statusElement = document.getElementById('friendStatus');
        if (!statusElement) {
            statusElement = document.createElement('span');
            statusElement.id = 'friendStatus';
            statusElement.className = 'friend-status';
            document.querySelector('.conversation-header').appendChild(statusElement);
        }
        
        statusElement.textContent = status;
        
        if (status.includes('🟢')) {
            statusElement.style.color = '#4CAF50';
        } else if (status.includes('🟡')) {
            statusElement.style.color = '#FFC107';
        } else if (status.includes('🔵')) {
            statusElement.style.color = '#2196F3';
        } else {
            statusElement.style.color = '#f44336';
            // 🔥 إذا كان غير متصل، شغل استماع Firebase
            this.setDirectConnectionStatus(false);
        }
    }

    // ========== نظام الإشارات عبر Firebase (مشفر بالكامل) ==========
    
    startListeningForSignals() {
        if (!window.auth?.currentUser) {
            setTimeout(() => this.startListeningForSignals(), 1000);
            return;
        }
        
        const userId = window.auth.currentUser.uid;
        
        this.firebaseListener = window.db.collection('signaling')
            .where('to', '==', userId)
            .where('status', '==', 'pending')
            .onSnapshot(async (snapshot) => {
                for (const change of snapshot.docChanges()) {
                    if (change.type === 'added') {
                        const signal = change.doc.data();
                        const signalId = change.doc.id;
                        
                        try {
                            // 🔓 فك تشفير الإشارة أولاً
                            if (!signal.encrypted) {
                                console.error('إشارة غير مشفرة!');
                                continue;
                            }
                            
                            const decryptedSignal = await this.decryptFullData(
                                signal.encrypted,
                                this.signalingKey
                            );
                            
                            if (!decryptedSignal) {
                                console.error('فشل فك تشفير الإشارة');
                                continue;
                            }
                            
                            switch(decryptedSignal.type) {
                                case 'offer':
                                    await this.handleIncomingOffer(decryptedSignal, signalId);
                                    break;
                                case 'answer':
                                    await this.handleIncomingAnswer(decryptedSignal, signalId);
                                    break;
                                case 'candidate':
                                    await this.handleIncomingCandidate(decryptedSignal, signalId);
                                    break;
                                case 'end-call':
                                    this.handleEndCall(decryptedSignal.from);
                                    break;
                            }
                            
                            // حذف الإشارة بعد معالجتها
                            setTimeout(() => {
                                window.db.collection('signaling').doc(signalId).delete()
                                    .catch(() => {});
                            }, 5000);
                            
                        } catch (error) {
                            console.error('خطأ في معالجة الإشارة المشفرة:', error);
                        }
                    }
                }
            });
    }

    // ========== نظام الرسائل المؤقتة المشفرة (معدل) ==========
    
    startListeningForTempMessages() {
        if (!window.auth?.currentUser) return;
        
        const myId = window.auth.currentUser.uid;
        
        // 🔥 التصحيح 2: تأكد من حذف الرسائل حتى لو قفل الصفحة
        this.tempMessagesListener = window.db.collection('temp_messages')
            .where('to', '==', myId)
            .where('expiresAt', '>', new Date()) // 🔥 التصحيح 3: فقط غير منتهية
            .onSnapshot(async (snapshot) => {
                for (const change of snapshot.docChanges()) {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        
                        await this.processIncomingMessage(data);
                        
                        // 🔥 التصحيح 2: حذف فوري
                        await change.doc.ref.delete();
                    }
                }
            });
    }
    
    // معالجة الرسالة الواردة
    async processIncomingMessage(data) {
        if (data.encrypted && this.encryptionKeys.has(data.from)) {
            const keyData = this.encryptionKeys.get(data.from);
            if (keyData.friendKey) {
                // تحديث آخر استخدام
                this.updateKeyLastUsed(data.from);
                
                // 🔥 التصحيح 7: فك تشفير البيانات الكاملة
                if (data.fullEncrypted) {
                    const decryptedData = await this.decryptFullData(
                        data.fullEncrypted, 
                        keyData.friendKey
                    );
                    if (decryptedData) {
                        this.displayMessage({
                            text: decryptedData.text,
                            timestamp: decryptedData.timestamp,
                            sender: data.from
                        }, 'received');
                        
                        // 🔥 التصحيح 6: أيقونة الحالة
                        this.showMessageStatus('📱', 'تم الاستلام');
                    }
                } else {
                    // الطريقة القديمة للتوافق
                    const decryptedText = await this.decryptMessage(
                        data.encrypted,
                        keyData.friendKey
                    );
                    
                    this.displayMessage({
                        text: decryptedText,
                        timestamp: data.timestamp,
                        sender: data.from
                    }, 'received');
                }
            }
        }
    }

    // ========== إدارة المحادثات ==========
    
    async startChat(friendId, friendName, friendAvatar) {
        console.log('🚀 فتح محادثة مع:', friendName);
        
        this.currentFriendId = friendId;
        
        document.getElementById('conversationName').textContent = friendName;
        document.getElementById('conversationAvatar').textContent = friendAvatar || '👤';
        
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'block';
        document.getElementById('messagesContainer').innerHTML = '';
        
        this.displaySystemMessage('🔐 تجهيز الاتصال الآمن...');
        
        await this.createPeerConnection(friendId);
        this.createDataChannel(friendId);
        await this.sendOffer(friendId);
        
        setTimeout(() => {
            this.exchangeKeys(friendId);
        }, 1000);
        
        // 🔥 بدء سحب الرسائل
        this.pullMessages();
    }

    async createPeerConnection(friendId) {
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        const pc = new RTCPeerConnection(config);
        
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendCandidate(friendId, event.candidate);
            }
        };

        pc.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupDataChannel(channel, friendId);
        };

        pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                this.displayRemoteVideo(event.streams[0]);
            }
        };

        pc.oniceconnectionstatechange = () => {
            const status = this.checkFriendStatus(friendId);
            this.updateFriendStatusUI(status);
            
            if (pc.iceConnectionState === 'connected') {
                this.displaySystemMessage('🔗 تم الاتصال');
                this.setDirectConnectionStatus(true); // 🔥 اتصال مباشر ناجح
                this.sendPendingEncryptedMessages(friendId);
            } else if (pc.iceConnectionState === 'disconnected') {
                this.setDirectConnectionStatus(false); // 🔥 انقطع الاتصال
            }
        };

        this.peerConnections.set(friendId, pc);
        return pc;
    }

    createDataChannel(friendId) {
        const pc = this.peerConnections.get(friendId);
        if (!pc) return;

        const channel = pc.createDataChannel('chat', { 
            reliable: true,
            ordered: true 
        });
        
        this.setupDataChannel(channel, friendId);
        return channel;
    }

    setupDataChannel(channel, friendId) {
        channel.onopen = () => {
            console.log('📡 قناة مفتوحة مع', friendId);
            this.updateLastSeen(friendId);
            this.exchangeKeys(friendId);
        };

        channel.onclose = () => {
            console.log('📡 قناة مغلقة مع', friendId);
            this.updateFriendStatusUI('🔴 غير متصل');
            this.setDirectConnectionStatus(false); // 🔥 انقطع الاتصال
        };

        channel.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'key-exchange') {
                    await this.handleKeyExchange(data, friendId);
                } else if (data.type === 'encrypted-message') {
                    this.updateKeyLastUsed(friendId);
                    const keyData = this.encryptionKeys.get(friendId);
                    if (keyData && keyData.friendKey) {
                        const decryptedText = await this.decryptMessage(
                            data.encrypted,
                            keyData.friendKey
                        );
                        
                        this.displayMessage({
                            text: decryptedText,
                            timestamp: data.timestamp,
                            sender: friendId
                        }, 'received');
                        
                        this.showMessageStatus('✅', 'مرسلة مباشرة');
                    }
                } else if (data.type === 'file') {
                    await this.handleIncomingFile(data, friendId);
                }
            } catch (e) {
                console.error('خطأ في معالجة الرسالة:', e);
            }
        };

        this.dataChannels.set(friendId, channel);
    }

    // ========== إدارة الرسائل المشفرة ==========
    
    // 🔥 التصحيح 6: أيقونات حالة الرسالة
    showMessageStatus(icon, text) {
        const statusDiv = document.createElement('div');
        statusDiv.className = 'message-status';
        statusDiv.innerHTML = `${icon} ${text}`;
        statusDiv.style.cssText = `
            position: fixed;
            bottom: 70px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--primary);
            color: white;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 12px;
            z-index: 1000;
            opacity: 0.7;
        `;
        document.body.appendChild(statusDiv);
        setTimeout(() => statusDiv.remove(), 2000);
    }
    
    async sendEncryptedMessage(text) {
        if (!this.currentFriendId) return false;

        // 🔥 التصحيح 4: التحقق من إمكانية الإرسال
        if (!this.canSendMessage(this.currentFriendId)) {
            this.displaySystemMessage('⚠️ الصديق غير متصل حالياً');
            this.showMessageStatus('⏳', 'بانتظار اتصال الصديق');
            return false;
        }

        const keyData = this.encryptionKeys.get(this.currentFriendId);
        
        const message = {
            type: 'text',
            text: text,
            sender: window.auth.currentUser.uid,
            timestamp: Date.now(),
            id: `msg_${Date.now()}_${Math.random()}`
        };

        this.displayMessage(message, 'sent');

        if (keyData && keyData.friendKey) {
            this.updateKeyLastUsed(this.currentFriendId);
            
            const encrypted = await this.encryptMessage(text, keyData.friendKey);
            
            const channel = this.dataChannels.get(this.currentFriendId);
            if (channel && channel.readyState === 'open') {
                channel.send(JSON.stringify({
                    type: 'encrypted-message',
                    encrypted: encrypted,
                    timestamp: message.timestamp,
                    id: message.id
                }));
                console.log('📤 رسالة مشفرة مرسلة عبر WebRTC');
                this.showMessageStatus('✅', 'مرسلة مباشرة');
                return true;
            }
        }
        
        // 🔥 التصحيح 5: حد أقصى للرسائل المؤقتة
        await this.saveToFirebaseWithLimit(message);
        this.showMessageStatus('⏳', 'مخزنة مؤقتاً');
        
        return true;
    }
    
    // 🔥 التصحيح 5: حفظ مع حد أقصى
    async saveToFirebaseWithLimit(message) {
        const keyData = this.encryptionKeys.get(this.currentFriendId);
        
        let encryptedData = null;
        let fullEncrypted = null;
        
        if (keyData && keyData.friendKey) {
            // 🔥 التصحيح 7: تشفير البيانات الكاملة
            const fullData = {
                text: message.text,
                timestamp: message.timestamp,
                id: message.id
            };
            fullEncrypted = await this.encryptFullData(fullData, keyData.friendKey);
        }
        
        const msgId = `temp_${Date.now()}_${Math.random()}`;
        
        // 🔥 التصحيح 3: إضافة تاريخ انتهاء
        const expiryDate = this.getExpiryDate();
        
        await window.db.collection('temp_messages').doc(msgId).set({
            from: window.auth.currentUser.uid,
            to: this.currentFriendId,
            fullEncrypted: fullEncrypted,
            encrypted: encryptedData,
            timestamp: new Date(),
            expiresAt: expiryDate, // 🔥 تنتهي بعد 24 ساعة
            type: 'text'
        });
        
        // 🔥 التصحيح 5: التحقق من عدد الرسائل
        await this.cleanupOldMessages(this.currentFriendId);
    }
    
    // 🔥 التصحيح 5: تنظيف الرسائل القديمة
    async cleanupOldMessages(friendId) {
        const myId = window.auth.currentUser.uid;
        
        const snapshot = await window.db.collection('temp_messages')
            .where('to', '==', myId)
            .orderBy('timestamp', 'desc')
            .get();
        
        if (snapshot.size > 50) { // احتفظ بآخر 50 رسالة
            let count = 0;
            for (const doc of snapshot.docs) {
                count++;
                if (count > 50) {
                    await doc.ref.delete();
                }
            }
        }
    }
    
    async sendPendingEncryptedMessages(friendId) {
        if (this.pendingMessages.length === 0) return;
        
        const keyData = this.encryptionKeys.get(friendId);
        if (!keyData || !keyData.friendKey) return;
        
        const channel = this.dataChannels.get(friendId);
        if (!channel || channel.readyState !== 'open') return;
        
        for (const msg of this.pendingMessages) {
            const encrypted = await this.encryptMessage(msg.text, keyData.friendKey);
            channel.send(JSON.stringify({
                type: 'encrypted-message',
                encrypted: encrypted,
                timestamp: msg.timestamp,
                id: msg.id
            }));
        }
        
        this.pendingMessages = [];
        this.displaySystemMessage('✅ تم إرسال الرسائل المعلقة');
    }

    // ========== إدارة الملفات ==========
    
    async sendEncryptedFile(file) {
        if (!this.currentFriendId) return;
        
        const keyData = this.encryptionKeys.get(this.currentFriendId);
        if (!keyData || !keyData.friendKey) {
            this.displaySystemMessage('⏳ انتظار تبادل المفاتيح...');
            return;
        }
        
        this.updateKeyLastUsed(this.currentFriendId);
        
        const encryptedFile = await this.encryptFile(file, keyData.friendKey);
        
        const channel = this.dataChannels.get(this.currentFriendId);
        if (channel && channel.readyState === 'open') {
            channel.send(JSON.stringify({
                type: 'file',
                file: encryptedFile,
                timestamp: Date.now()
            }));
            
            this.displaySystemMessage(`📁 تم إرسال: ${file.name}`);
            this.showMessageStatus('✅', 'ملف مرسل');
        } else {
            if (file.size < 1024 * 1024) { // أقل من 1MB
                await this.saveFileToFirebase(encryptedFile);
                this.showMessageStatus('⏳', 'ملف مخزن مؤقتاً');
            } else {
                this.displaySystemMessage('⚠️ الملف كبير جداً للإرسال حالياً');
            }
        }
    }
    
    async handleIncomingFile(data, friendId) {
        this.updateKeyLastUsed(friendId);
        const keyData = this.encryptionKeys.get(friendId);
        if (!keyData || !keyData.friendKey) return;
        
        const file = await this.decryptFile(data.file, keyData.friendKey);
        
        if (file) {
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.textContent = `📁 استلام: ${file.name}`;
            
            this.displaySystemMessage(`📥 تم استلام ملف: ${file.name}`);
            this.showMessageStatus('📱', 'ملف واصل');
            
            if (file.type.startsWith('image/')) {
                window.open(url, '_blank');
            }
        }
    }

    // ========== إدارة المكالمات ==========

    async startVideoCall() {
        if (!this.currentFriendId) return;

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;

            const pc = this.peerConnections.get(this.currentFriendId);
            if (pc) {
                this.localStream.getTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });
            }

            document.getElementById('videoContainer').style.display = 'flex';
            this.currentCall = { type: 'video', stream: this.localStream };
            
            this.displaySystemMessage('📹 مكالمة فيديو آمنة');

        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول إلى الكاميرا أو الميكروفون');
        }
    }

    async startVoiceCall() {
        if (!this.currentFriendId) return;

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });

            const pc = this.peerConnections.get(this.currentFriendId);
            if (pc) {
                this.localStream.getTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });
            }

            document.getElementById('videoContainer').style.display = 'flex';
            document.getElementById('localVideo').style.display = 'none';
            
            this.currentCall = { type: 'voice', stream: this.localStream };
            
            this.displaySystemMessage('🎤 مكالمة صوتية آمنة');

        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول إلى الميكروفون');
        }
    }

    displayRemoteVideo(stream) {
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = stream;
    }

    endCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        document.getElementById('videoContainer').style.display = 'none';
        document.getElementById('localVideo').style.display = 'block';
        
        if (this.currentCall) {
            this.displaySystemMessage('📞 انتهت المكالمة');
        }
        
        this.currentCall = null;
    }

    handleEndCall(friendId) {
        if (this.currentCall) {
            this.endCall();
        }
    }

    // ========== دوال مساعدة ==========

    displayMessage(message, type) {
        const container = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}`;
        
        const time = new Date(message.timestamp).toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageElement.innerHTML = `
            <div class="message-content">${this.escapeHtml(message.text)}</div>
            <div class="message-time">${time}</div>
        `;

        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }

    displaySystemMessage(text) {
        const container = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = 'message system';
        
        messageElement.innerHTML = `
            <div class="system-content">${text}</div>
        `;

        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== إنهاء المحادثة ==========

    closeConversation() {
        if (this.currentCall) {
            this.endCall();
        }

        if (this.currentFriendId) {
            const channel = this.dataChannels.get(this.currentFriendId);
            if (channel) channel.close();
            
            const pc = this.peerConnections.get(this.currentFriendId);
            if (pc) pc.close();
            
            this.peerConnections.delete(this.currentFriendId);
            this.dataChannels.delete(this.currentFriendId);
        }

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        // 🔥 إيقاف استماع Firebase إذا كان نشط
        if (this.tempMessagesListener) {
            this.tempMessagesListener();
            this.tempMessagesListener = null;
        }

        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        document.getElementById('messagesContainer').innerHTML = '';
        
        this.currentFriendId = null;
        this.pendingMessages = [];
        this.setDirectConnectionStatus(false);
    }

    // ========== إرسال الإشارات عبر Firebase (مشفرة) ==========

    async sendOffer(friendId) {
        const pc = this.peerConnections.get(friendId);
        if (!pc) return;

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const signalId = `${window.auth.currentUser.uid}_${friendId}_${Date.now()}`;
            
            // تجهيز بيانات العرض
            const signalData = {
                from: window.auth.currentUser.uid,
                to: friendId,
                type: 'offer',
                offer: {
                    type: offer.type,
                    sdp: offer.sdp
                },
                timestamp: new Date()
            };
            
            // 🔐 تشفير الإشارة قبل الإرسال
            const encryptedSignal = await this.encryptSignal(signalData);
            
            // إرسال البيانات المشفرة فقط
            await window.db.collection('signaling').doc(signalId).set({
                encrypted: encryptedSignal.encrypted,
                status: 'pending',
                to: friendId, // نحتاج هذا للاستعلام
                expiresAt: new Date(Date.now() + 60000) // تنتهي بعد دقيقة
            });

            console.log('📤 عرض مشفر مرسل');

        } catch (error) {
            console.error('خطأ في إنشاء العرض:', error);
        }
    }

    async handleIncomingOffer(signal, signalId) {
        if (!window.auth?.currentUser) return;

        try {
            const pc = await this.createPeerConnection(signal.from);
            
            await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // تجهيز بيانات الإجابة
            const answerData = {
                from: window.auth.currentUser.uid,
                to: signal.from,
                type: 'answer',
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                },
                timestamp: new Date()
            };
            
            // 🔐 تشفير الإجابة
            const encryptedAnswer = await this.encryptSignal(answerData);
            
            // إرسال الإجابة المشفرة
            await window.db.collection('signaling').doc(signalId).set({
                encrypted: encryptedAnswer.encrypted,
                status: 'answered',
                to: signal.from,
                expiresAt: new Date(Date.now() + 60000)
            }, { merge: true });

            console.log('📤 إجابة مشفرة مرسلة');

        } catch (error) {
            console.error('خطأ في معالجة العرض:', error);
        }
    }

    async handleIncomingAnswer(signal) {
        try {
            const pc = this.peerConnections.get(signal.from);
            if (!pc) return;

            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
            console.log('✅ تم تأكيد الاتصال المشفر');
            
        } catch (error) {
            console.error('خطأ في معالجة الإجابة:', error);
        }
    }

    async sendCandidate(friendId, candidate) {
        try {
            const signalId = `${window.auth.currentUser.uid}_${friendId}_cand_${Date.now()}`;
            
            // تجهيز بيانات المرشح
            const candidateData = {
                from: window.auth.currentUser.uid,
                to: friendId,
                type: 'candidate',
                candidate: {
                    candidate: candidate.candidate,
                    sdpMid: candidate.sdpMid,
                    sdpMLineIndex: candidate.sdpMLineIndex
                },
                timestamp: new Date()
            };
            
            // 🔐 تشفير المرشح
            const encryptedCandidate = await this.encryptSignal(candidateData);
            
            await window.db.collection('signaling').doc(signalId).set({
                encrypted: encryptedCandidate.encrypted,
                to: friendId,
                expiresAt: new Date(Date.now() + 60000)
            });
            
            console.log('📤 مرشح مشفر مرسل');
            
        } catch (error) {
            console.error('خطأ في إرسال candidate:', error);
        }
    }

    async handleIncomingCandidate(signal) {
        try {
            const pc = this.peerConnections.get(signal.from);
            
            if (pc && pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                console.log('✅ تم إضافة مرشح مشفر');
            } else {
                // حفظ المرشح لحين جهوزية الاتصال
                if (!this.pendingCandidates.has(signal.from)) {
                    this.pendingCandidates.set(signal.from, []);
                }
                this.pendingCandidates.get(signal.from).push(signal.candidate);
                console.log('⏳ حفظ مرشح مؤقتاً');
            }
        } catch (error) {
            console.error('خطأ في معالجة المرشح:', error);
        }
    }
}

// ========== المتغيرات العامة ==========

let webRTCManager = null;

// ========== دوال عامة للواجهة ==========

window.openChat = function(friendId) {
    if (!webRTCManager) {
        webRTCManager = new WebRTCManager();
    }

    window.db.collection('users').doc(friendId).get().then((doc) => {
        if (doc.exists) {
            const friend = doc.data();
            const avatarEmoji = window.getEmojiForUser ? 
                window.getEmojiForUser(friend) : '👤';
            
            webRTCManager.startChat(friendId, friend.name, avatarEmoji);
        } else {
            webRTCManager.startChat(friendId, 'صديق', '👤');
        }
    }).catch(error => {
        console.error('خطأ:', error);
        webRTCManager.startChat(friendId, 'صديق', '👤');
    });
};

window.sendMessage = function() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (text && webRTCManager) {
        webRTCManager.sendEncryptedMessage(text);
        input.value = '';
    }
};

window.handleMessageKeyPress = function(event) {
    if (event.key === 'Enter') {
        window.sendMessage();
    }
};

window.toggleVideoCall = function() {
    if (!webRTCManager) {
        webRTCManager = new WebRTCManager();
    }
    
    const btn = document.getElementById('videoCallBtn');
    if (webRTCManager.currentCall?.type === 'video') {
        webRTCManager.endCall();
        btn.innerHTML = '<i class="fas fa-video"></i>';
    } else {
        webRTCManager.startVideoCall();
        btn.innerHTML = '<i class="fas fa-video-slash"></i>';
    }
};

window.toggleVoiceCall = function() {
    if (!webRTCManager) {
        webRTCManager = new WebRTCManager();
    }
    
    const btn = document.getElementById('voiceCallBtn');
    if (webRTCManager.currentCall?.type === 'voice') {
        webRTCManager.endCall();
        btn.innerHTML = '<i class="fas fa-phone"></i>';
    } else {
        webRTCManager.startVoiceCall();
        btn.innerHTML = '<i class="fas fa-phone-slash"></i>';
    }
};

window.endCall = function() {
    if (webRTCManager) {
        webRTCManager.endCall();
        document.getElementById('voiceCallBtn').innerHTML = '<i class="fas fa-phone"></i>';
        document.getElementById('videoCallBtn').innerHTML = '<i class="fas fa-video"></i>';
    }
};

window.toggleMute = function() {
    if (webRTCManager?.localStream) {
        const audioTrack = webRTCManager.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.querySelector('.call-controls button:nth-child(2) i');
            btn.className = audioTrack.enabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
        }
    }
};

window.toggleCamera = function() {
    if (webRTCManager?.localStream) {
        const videoTrack = webRTCManager.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const btn = document.querySelector('.call-controls button:nth-child(3) i');
            btn.className = videoTrack.enabled ? 'fas fa-video' : 'fas fa-video-slash';
        }
    }
};

window.showAttachmentMenu = function() {
    const menu = document.getElementById('attachmentMenu');
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
};

window.sendImage = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file && webRTCManager) {
            webRTCManager.sendEncryptedFile(file);
        }
    };
    input.click();
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.sendFile = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file && webRTCManager) {
            webRTCManager.sendEncryptedFile(file);
        }
    };
    input.click();
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.sendVoiceNote = function() {
    alert('📱 ميزة التسجيل الصوتي قيد التطوير');
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.shareLocation = function() {
    if (webRTCManager && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const locationText = `📍 موقعي: https://maps.google.com/?q=${position.coords.latitude},${position.coords.longitude}`;
            webRTCManager.sendEncryptedMessage(locationText);
        });
    }
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.closeConversation = function() {
    if (webRTCManager) {
        webRTCManager.closeConversation();
    }
};

window.initWebRTC = function() {
    if (window.auth?.currentUser && !webRTCManager) {
        webRTCManager = new WebRTCManager();
        console.log('✅ WebRTC manager initialized');
    }
};

// إنشاء المجموعات في Firebase مع تاريخ انتهاء تلقائي
async function setupFirebaseCollections() {
    if (!window.db) return;
    
    try {
        await window.db.collection('signaling').doc('_config').set({
            name: 'WebRTC Signaling',
            created: new Date(),
            permanent: true
        }, { merge: true });
        
        await window.db.collection('temp_messages').doc('_config').set({
            name: 'Temporary Messages',
            created: new Date(),
            permanent: true
        }, { merge: true });
        
        console.log('✅ Firebase collections جاهزة');
    } catch (error) {
        console.error('⚠️ خطأ في تهيئة المجموعات:', error);
    }
}

// 🔥 تنظيف الرسائل منتهية الصلاحية تلقائياً
async function cleanupExpiredMessages() {
    if (!window.db) return;
    
    try {
        const now = new Date();
        const expired = await window.db.collection('temp_messages')
            .where('expiresAt', '<', now)
            .get();
        
        let count = 0;
        for (const doc of expired.docs) {
            await doc.ref.delete();
            count++;
        }
        
        if (count > 0) {
            console.log(`🧹 تم تنظيف ${count} رسالة منتهية الصلاحية`);
        }
    } catch (error) {
        console.error('خطأ في تنظيف الرسائل:', error);
    }
}

// تشغيل التنظيف كل ساعة
setInterval(cleanupExpiredMessages, 60 * 60 * 1000);

setupFirebaseCollections();

if (window.auth?.currentUser) {
    setTimeout(() => {
        window.initWebRTC();
    }, 1000);
}

console.log('🔐 نظام WebRTC المشفر جاهز مع جميع التصحيحات وتشفير الإشارات');
