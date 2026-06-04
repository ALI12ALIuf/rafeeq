// ========== webrtc-call.js - النسخة النهائية المعدلة بالكامل ==========
// CallSystem: للميزات والملفات فقط (DataChannel)
// MediaCallSystem: للمكالمات الصوتية والمرئية فقط (منفصل تماماً)

const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false, callType: null, currentCallId: null,
    incomingChunks: {}, incomingFileInfo: {},
    reconnectTimer: null, maxReconnectAttempts: 3, reconnectAttempts: 0,
    callTimerInterval: null, keepAliveInterval: null,
    isAudioMuted: false, isVideoMuted: false, isSpeakerEnabled: false,
    remoteAudioElement: null,
    servers: { 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ] 
    },
    
    async deleteAllWebRTCSignals(chatId) {
        if (!chatId) return;
        try {
            const messagesRef = window.db.collection('secure_messages');
            const snapshot = await messagesRef
                .where('to', '==', chatId)
                .where('package.type', '==', 'webrtc')
                .get();
            if (snapshot.empty) return;
            const batch = window.db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        } catch(e) {}
    },
    
    async deleteAllMyWebRTCSignals() {
        if (!window.auth?.currentUser) return;
        const myId = window.auth.currentUser.uid;
        try {
            const messagesRef = window.db.collection('secure_messages');
            const snapshot = await messagesRef
                .where('to', '==', myId)
                .where('package.type', '==', 'webrtc')
                .get();
            if (snapshot.empty) return;
            const batch = window.db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        } catch(e) {}
    },
    
    async autoCleanupOnLoad() {
        console.log('🧹 تشغيل التنظيف التلقائي للميزات العالقة...');
        await this.deleteAllMyWebRTCSignals();
        this.isInCall = false;
        this.callType = null;
        this.currentCallId = null;
        this.isAudioMuted = false;
        this.isVideoMuted = false;
        this.isSpeakerEnabled = false;
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.remoteAudioElement) {
            this.remoteAudioElement.pause();
            this.remoteAudioElement.srcObject = null;
            this.remoteAudioElement = null;
        }
        if (this.localStream) {
            try {
                this.localStream.getTracks().forEach(t => t.stop());
            } catch(e) {}
            this.localStream = null;
        }
        this.cleanupConnections();
        if (typeof PresenceSystem !== 'undefined' && window.auth?.currentUser) {
            try {
                await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                    online: true,
                    inCall: false,
                    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
                });
            } catch(e) {}
        }
        console.log('✅ اكتمل التنظيف التلقائي للميزات');
    },
    
    async ensureDataChannelOnly(calleeId) {
        if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
            console.log('🚫 منع فتح Data Channel - الميزات غير مفعلة');
            return false;
        }
        if (!calleeId) return false;
        if (this.dc && this.dc.readyState === 'open') {
            console.log('✅ Data Channel موجود ومفتوح');
            return true;
        }
        if (this.dc && this.dc.readyState === 'connecting') {
            return new Promise((resolve) => {
                const timeout = setTimeout(() => resolve(false), 10000);
                const check = setInterval(() => {
                    if (this.dc && this.dc.readyState === 'open') {
                        clearInterval(check);
                        clearTimeout(timeout);
                        resolve(true);
                    } else if (this.dc && (this.dc.readyState === 'failed' || this.dc.readyState === 'closed')) {
                        clearInterval(check);
                        clearTimeout(timeout);
                        this.createDataChannelOnly(calleeId).then(resolve);
                    }
                }, 500);
            });
        }
        return this.createDataChannelOnly(calleeId);
    },
    
    async createDataChannelOnly(calleeId) {
        if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
            console.log('🚫 منع إنشاء Data Channel - الميزات غير مفعلة');
            return false;
        }
        this.cleanupConnections();
        try {
            console.log('🔧 إنشاء Data Channel فقط (بدون مكالمة)...');
            this.pc = new RTCPeerConnection(this.servers);
            this.dc = this.pc.createDataChannel('chat', { ordered: true, maxRetransmits: 3 });
            this.setupDataChannel(this.dc);
            this.pc.onicecandidate = e => { 
                if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }).catch(() => {});
            };
            this.pc.ondatachannel = e => { 
                this.setupDataChannel(e.channel); 
                this.dc = e.channel; 
            };
            const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription, type: 'datachannel' });
            console.log('✅ تم إرسال طلب فتح Data Channel');
            return true;
        } catch (error) {
            console.error('❌ فشل إنشاء Data Channel:', error);
            return false;
        }
    },
    
    setupDataChannel(channel) {
        if (!channel) return;
        console.log('📡 إعداد Data Channel للميزات والملفات');
        channel.onmessage = e => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'direct_text') {
                    const displayMsg = { id: msg.id, type: 'text', text: msg.text, sender: 'friend', time: msg.time || new Date().toISOString() };
                    if (ChatSystem.currentChat) {
                        ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg);
                        ChatSystem.displayMessage(displayMsg);
                    }
                    return;
                }
                if (msg.type === 'webrtc_signal') {
                    this.handleSignaling(msg.data);
                    return;
                }
                if (msg.type === 'force_close_conversation') {
                    if (ChatSystem.currentChat) {
                        ChatSystem.closeChat();
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
                    }
                    return;
                }
                if (msg.type === 'force_disable_features') {
                    if (ChatSystem.currentChat) {
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
                    return;
                }
                if (msg.type === 'ping') return;
                if (msg.type === 'call_status') {
                    this.handleCallStatus(msg);
                    return;
                }
                if (msg.chunk !== undefined) {
                    this.handleChunkMessage(msg);
                    return;
                }
                const displayMsg = { id: msg.id || Date.now().toString(), type: msg.type, data: msg.data, fileName: msg.fileName, sender: 'friend', time: new Date().toISOString() };
                if (ChatSystem.currentChat) {
                    ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg);
                    ChatSystem.displayMessage(displayMsg);
                }
            } catch (error) {
                console.error('خطأ في معالجة الرسالة:', error);
            }
        };
        channel.onopen = () => {
            console.log('✅ Data Channel مفتوح للميزات');
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            this.reconnectAttempts = 0;
            this.sendCallStatus('connected');
            if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = setInterval(() => {
                if (this.dc && this.dc.readyState === 'open') {
                    this.dc.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
                }
            }, 2000);
        };
        channel.onclose = () => {
            console.log('❌ Data Channel مغلق للميزات');
            this.sendCallStatus('disconnected');
            if (this.keepAliveInterval) {
                clearInterval(this.keepAliveInterval);
                this.keepAliveInterval = null;
            }
            this.scheduleReconnect();
            if (ChatSystem.currentChat && ChatSystem.featuresEnabled) {
                ChatSystem.featuresEnabled = false;
                ChatSystem.featureRequestPending = false;
                ChatSystem.featureRequestReceived = false;
                if (ChatSystem.featureBlinkInterval) {
                    clearInterval(ChatSystem.featureBlinkInterval);
                    ChatSystem.featureBlinkInterval = null;
                }
                const btn = document.getElementById('enableFeaturesBtn');
                if (btn) {
                    btn.style.background = '#f44336';
                    btn.title = 'تفعيل الميزات';
                }
                ChatSystem.updateAllButtons();
            }
        };
        channel.onerror = (e) => {
            console.error('❌ خطأ في Data Channel:', e);
            this.scheduleReconnect();
            if (ChatSystem.currentChat && ChatSystem.featuresEnabled) {
                ChatSystem.featuresEnabled = false;
                ChatSystem.featureRequestPending = false;
                ChatSystem.featureRequestReceived = false;
                if (ChatSystem.featureBlinkInterval) {
                    clearInterval(ChatSystem.featureBlinkInterval);
                    ChatSystem.featureBlinkInterval = null;
                }
                const btn = document.getElementById('enableFeaturesBtn');
                if (btn) {
                    btn.style.background = '#f44336';
                    btn.title = 'تفعيل الميزات';
                }
                ChatSystem.updateAllButtons();
            }
        };
    },
    
    handleCallStatus(msg) {
        if (msg.status === 'connected') {
            console.log('📞 الطرف الآخر متصل (ميزات)');
        } else if (msg.status === 'disconnected') {
            console.log('📞 الطرف الآخر قطع الاتصال (ميزات)');
        }
    },
    
    sendCallStatus(status) {
        if (this.dc && this.dc.readyState === 'open') {
            this.dc.send(JSON.stringify({ type: 'call_status', status: status, timestamp: Date.now() }));
        }
    },
    
    scheduleReconnect() {
        if (!ChatSystem.currentChat) return;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
        this.reconnectTimer = setTimeout(async () => {
            try {
                if (ChatSystem.currentChat) {
                    await this.ensureDataChannelOnly(ChatSystem.currentChat);
                }
            } catch (error) {}
            this.reconnectTimer = null;
        }, delay);
    },
    
    async ensureDataChannel(calleeId) {
        if (!calleeId) return;
        if (this.dc && this.dc.readyState === 'open') return;
        if (this.dc && this.dc.readyState === 'connecting') {
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
        return this.createNewDataChannel(calleeId);
    },
    
    async createNewDataChannel(calleeId) {
        if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
            console.log('🚫 منع إنشاء Data Channel جديد - الميزات غير مفعلة');
            return;
        }
        this.reconnectAttempts = 0;
        this.cleanupConnections();
        try {
            this.pc = new RTCPeerConnection(this.servers);
            this.dc = this.pc.createDataChannel('chat', { ordered: true, maxRetransmits: 3 });
            this.setupDataChannel(this.dc);
            this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(calleeId, { candidate: e.candidate }).catch(() => {}); };
            this.pc.oniceconnectionstatechange = () => { if (this.pc?.iceConnectionState === 'failed') this.pc.restartIce(); };
            this.pc.ondatachannel = e => { this.setupDataChannel(e.channel); this.dc = e.channel; };
            this.pc.onconnectionstatechange = () => {
                switch(this.pc?.connectionState) {
                    case 'connected': this.reconnectAttempts = 0; break;
                    case 'failed': case 'disconnected': this.scheduleReconnect(); break;
                }
            };
            const offer = await this.pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
            await this.pc.setLocalDescription(offer);
            await this.sendSignal(calleeId, { sdp: this.pc.localDescription });
        } catch (error) {
            throw error;
        }
    },
    
    async handleSignaling(data) {
        try {
            if (data.type === 'reject') {
                console.log('📞 الطرف الآخر رفض المكالمة (ميزات)');
                return;
            }
            if (data.type === 'call_ended') {
                console.log('📞 المتصل أنهى المكالمة قبل الرد (ميزات)');
                return;
            }
            if (!this.pc) {
                this.pc = new RTCPeerConnection(this.servers);
                this.pc.ondatachannel = e => { this.dc = e.channel; this.setupDataChannel(this.dc); };
                this.pc.onicecandidate = e => { if (e.candidate) this.sendSignal(ChatSystem.currentChat, { candidate: e.candidate }).catch(() => {}); };
            }
            if (data.sdp) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                if (data.sdp.type === 'offer') {
                    const answer = await this.pc.createAnswer();
                    await this.pc.setLocalDescription(answer);
                    await this.sendSignal(ChatSystem.currentChat, { sdp: this.pc.localDescription });
                }
            } else if (data.candidate) {
                if (this.pc && data.candidate) {
                    await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            }
        } catch (e) {
            console.warn('Signaling error (ميزات):', e);
        }
    },
    
    async sendSignal(calleeId, data) {
        if (!ChatSystem.featuresEnabled || !ChatSystem.friendInConversation) {
            console.log('📡 تجاهل إرسال إشارة WebRTC - الميزات غير مفعلة');
            return;
        }
        if (this.dc && this.dc.readyState === 'open') {
            try {
                this.dc.send(JSON.stringify({ type: 'webrtc_signal', data: data }));
                console.log('📡 تم إرسال الإشارة مباشرة عبر Data Channel');
                return;
            } catch(e) {
                console.log('⚠️ فشل الإرسال المباشر، الإرسال عبر Firebase بدلاً من ذلك:', e);
            }
        }
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(calleeId);
            if (!myPrivateKey || !receiverPublicKey) return;
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encrypted = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
            await SecureChatSystem.sendToServer(calleeId, { id: Date.now().toString(), type: 'webrtc', data: encrypted, timestamp: Date.now() });
            console.log('📡 تم إرسال الإشارة عبر Firebase (حل احتياطي)');
        } catch (error) {
            console.error('خطأ في إرسال الإشارة:', error);
        }
    },
    
    async sendFileDirect(file, type) {
        if (!this.dc || this.dc.readyState !== 'open') {
            console.log('❌ Data Channel غير مفتوح');
            return false;
        }
        try {
            let blobToSend = file;
            if (type === 'image') {
                blobToSend = await this.compressImage(file);
            }
            const b64 = await this.fileToBase64(blobToSend);
            const chunkSize = 16000;
            const totalChunks = Math.ceil(b64.length / chunkSize);
            const fileId = Date.now().toString();
            console.log(`📤 إرسال ${type}: ${file.name || 'ملف'} (${totalChunks} جزء)`);
            for (let i = 0; i < totalChunks; i++) {
                if (this.dc.readyState !== 'open') {
                    ChatSystem.hideProgressBar();
                    return false;
                }
                const chunk = {
                    type: type,
                    data: b64.substring(i * chunkSize, (i + 1) * chunkSize),
                    chunk: i,
                    total: totalChunks,
                    id: fileId,
                    fileName: file.name || 'ملف'
                };
                this.dc.send(JSON.stringify(chunk));
                const progress = ((i + 1) / totalChunks) * 100;
                const typeLabel = type === 'video' ? 'الفيديو' : type === 'image' ? 'الصورة' : 'الملف';
                ChatSystem.updateProgressBar(progress, `جاري إرسال ${typeLabel}...`);
                await new Promise(r => setTimeout(r, 50));
            }
            ChatSystem.hideProgressBar();
            console.log('✅ تم إرسال الملف بنجاح');
            return true;
        } catch (e) {
            console.error('❌ فشل إرسال الملف:', e);
            ChatSystem.hideProgressBar();
            return false;
        }
    },
    
    handleChunkMessage(msg) {
        if (!this.incomingChunks[msg.id]) {
            this.incomingChunks[msg.id] = [];
            this.incomingFileInfo[msg.id] = {
                type: msg.type,
                fileName: msg.fileName,
                total: msg.total,
                received: 0
            };
            ChatSystem.showProgressBar('جاري استلام الملف...', 0);
        }
        this.incomingChunks[msg.id][msg.chunk] = msg.data;
        this.incomingFileInfo[msg.id].received++;
        const progress = (this.incomingFileInfo[msg.id].received / msg.total) * 100;
        const fileType = msg.type === 'video' ? 'الفيديو' : msg.type === 'image' ? 'الصورة' : 'الملف';
        ChatSystem.updateProgressBar(progress, `جاري استلام ${fileType}...`);
        if (this.incomingFileInfo[msg.id].received === msg.total) {
            const fullData = this.incomingChunks[msg.id].join('');
            let finalData = fullData;
            if (msg.type === 'image' && !fullData.startsWith('data:image')) {
                finalData = 'data:image/jpeg;base64,' + fullData;
            } else if (msg.type === 'video' && !fullData.startsWith('data:video')) {
                finalData = 'data:video/mp4;base64,' + fullData;
            } else if (msg.type === 'voice' && !fullData.startsWith('data:audio')) {
                finalData = 'data:audio/webm;base64,' + fullData;
            }
            const displayMsg = {
                id: msg.id,
                type: msg.type === 'location' ? 'text' : msg.type,
                data: finalData,
                fileName: msg.fileName || (msg.type === 'image' ? 'صورة' : msg.type === 'video' ? 'فيديو' : 'ملف'),
                sender: 'friend',
                time: new Date().toISOString()
            };
            if (ChatSystem.currentChat) {
                ChatSystem.saveMessage(ChatSystem.currentChat, displayMsg);
                ChatSystem.displayMessage(displayMsg);
            }
            ChatSystem.hideProgressBar();
            delete this.incomingChunks[msg.id];
            delete this.incomingFileInfo[msg.id];
        }
    },
    
    compressImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width, height = img.height;
                    const maxSize = 800;
                    if (width > height && width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    } else if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.7);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    },
    
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1] || reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },
    
    cleanupConnections() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
        if (this.dc) {
            try { this.dc.close(); } catch(e) {}
            this.dc = null;
        }
        if (this.pc) {
            try { this.pc.close(); } catch(e) {}
            this.pc = null;
        }
        this.incomingChunks = {};
        this.incomingFileInfo = {};
    }
};

// ==================== كائن مستقل تماماً للمكالمات الصوتية والمرئية ====================
const MediaCallSystem = {
    pc: null,
    localStream: null,
    isInCall: false,
    callType: null,
    currentCallId: null,
    callTimerInterval: null,
    remoteAudioElementForCall: null,
    isAudioMuted: false,
    isVideoMuted: false,
    isSpeakerEnabled: false,
    
    servers: CallSystem.servers,
    
    // دالة إرسال الإشارات مع تشفير كامل
    async sendSignalingMessage(chatId, data) {
        if (!window.db || !window.auth?.currentUser) {
            console.error('❌ Firebase أو المستخدم غير متاح');
            return;
        }
        
        try {
            const myPrivateKey = await SecureChatSystem.getMyPrivateKey();
            const receiverPublicKey = await SecureChatSystem.getReceiverPublicKey(chatId);
            if (!myPrivateKey || !receiverPublicKey) {
                console.error('❌ فشل الحصول على المفاتيح للتشفير');
                return;
            }
            
            const sharedKey = await SecureChatSystem.deriveSharedKey(myPrivateKey, receiverPublicKey);
            const encryptedData = await SecureChatSystem.encryptData(JSON.stringify(data), sharedKey);
            
            await window.db.collection('secure_messages').add({
                to: chatId,
                from: window.auth.currentUser.uid,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                package: {
                    type: 'media_call',
                    data: encryptedData,
                    mediaCall: true
                },
                expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 30000))
            });
            console.log('📡 تم إرسال إشارة المكالمة:', data.type);
        } catch (e) {
            console.error('❌ فشل إرسال إشارة المكالمة:', e);
        }
    },
    
    async startCall(chatId, type) {
        if (this.isInCall) {
            console.log('❌ مكالمة نشطة بالفعل');
            return;
        }
        if (!ChatSystem.friendInConversation) {
            console.log('❌ لا يمكن بدء المكالمة: الطرف الآخر ليس في المحادثة');
            return;
        }
        
        this.isInCall = true;
        this.callType = type;
        this.currentCallId = chatId;
        
        try {
            console.log(`📞 بدء مكالمة ${type === 'video' ? 'فيديو' : 'صوتية'} باستخدام MediaCallSystem...`);
            
            if (window.auth?.currentUser) {
                await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                    inCall: true,
                    callType: type
                }).catch(() => {});
            }
            
            const constraints = { 
                audio: true, 
                video: type === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' } : false
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (this.localStream.getAudioTracks().length === 0) {
                this.endCall();
                return;
            }
            
            this.showCallUI(type);
            
            this.pc = new RTCPeerConnection(this.servers);
            
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
                console.log(`➕ تم إضافة مسار ${track.kind} إلى MediaCallSystem`);
            });
            
            this.pc.onicecandidate = e => { 
                if (e.candidate) {
                    this.sendSignalingMessage(chatId, { 
                        type: 'candidate', 
                        candidate: e.candidate,
                        mediaCall: true
                    });
                }
            };
            
            this.pc.ontrack = e => {
                console.log(`📞 استقبال مسار ${e.track.kind} في MediaCallSystem`);
                if (e.track.kind === 'video') {
                    const rv = document.getElementById('remoteVideo');
                    if (rv && e.streams[0]) {
                        rv.srcObject = e.streams[0];
                        rv.play().catch(err => console.log('خطأ في تشغيل الفيديو البعيد:', err));
                    }
                } else if (e.track.kind === 'audio') {
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pc.onconnectionstatechange = () => {
                console.log(`🔄 حالة اتصال MediaCallSystem: ${this.pc?.connectionState}`);
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });
            await this.pc.setLocalDescription(offer);
            
            this.sendSignalingMessage(chatId, { 
                type: 'offer', 
                offer: offer, 
                callType: type,
                mediaCall: true
            });
            
            console.log('✅ تم إرسال عرض المكالمة من MediaCallSystem');
            
            if (type === 'video') {
                setTimeout(() => {
                    const lv = document.getElementById('localVideo');
                    if (lv && this.localStream) {
                        lv.srcObject = this.localStream;
                        console.log('✅ تم ربط الفيديو المحلي');
                    }
                }, 500);
            }
            
            this.startCallTimer();
            
        } catch (e) {
            console.error('❌ خطأ في بدء المكالمة:', e);
            this.endCall();
        }
    },
    
    async handleIncomingOffer(callerId, offerData) {
        if (this.isInCall) {
            console.log('❌ مكالمة نشطة بالفعل، رفض المكالمة الواردة');
            this.sendSignalingMessage(callerId, { type: 'reject', mediaCall: true });
            return;
        }
        
        this.isInCall = true;
        this.callType = offerData.callType || 'audio';
        this.currentCallId = callerId;
        
        try {
            console.log(`📞 استقبال مكالمة ${this.callType === 'video' ? 'فيديو' : 'صوتية'} من ${callerId} عبر MediaCallSystem`);
            
            if (window.auth?.currentUser) {
                await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                    inCall: true,
                    callType: this.callType
                }).catch(() => {});
            }
            
            const constraints = { 
                audio: true, 
                video: this.callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' } : false
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            if (this.localStream.getAudioTracks().length === 0) {
                this.endCall();
                return;
            }
            
            if (this.callType === 'video') {
                const videoTrack = this.localStream.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.enabled = false;
                    this.isVideoMuted = true;
                }
            }
            
            this.showCallUI(this.callType);
            
            this.pc = new RTCPeerConnection(this.servers);
            
            this.localStream.getTracks().forEach(track => {
                this.pc.addTrack(track, this.localStream);
                console.log(`➕ تم إضافة مسار ${track.kind} إلى MediaCallSystem`);
            });
            
            this.pc.onicecandidate = e => { 
                if (e.candidate) {
                    this.sendSignalingMessage(callerId, { 
                        type: 'candidate', 
                        candidate: e.candidate,
                        mediaCall: true
                    });
                }
            };
            
            this.pc.ontrack = e => {
                console.log(`📞 استقبال مسار ${e.track.kind} في MediaCallSystem`);
                if (e.track.kind === 'video') {
                    const rv = document.getElementById('remoteVideo');
                    if (rv && e.streams[0]) {
                        rv.srcObject = e.streams[0];
                        rv.play().catch(err => console.log('خطأ في تشغيل الفيديو البعيد:', err));
                    }
                } else if (e.track.kind === 'audio') {
                    this.setupRemoteAudio(e.streams[0]);
                }
            };
            
            this.pc.onconnectionstatechange = () => {
                console.log(`🔄 حالة اتصال MediaCallSystem: ${this.pc?.connectionState}`);
                if (this.pc && (this.pc.connectionState === 'failed' || this.pc.connectionState === 'disconnected')) {
                    this.endCall();
                }
            };
            
            if (offerData.offer) {
                await this.pc.setRemoteDescription(new RTCSessionDescription(offerData.offer));
                const answer = await this.pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: this.callType === 'video' });
                await this.pc.setLocalDescription(answer);
                
                this.sendSignalingMessage(callerId, { 
                    type: 'answer', 
                    answer: this.pc.localDescription,
                    mediaCall: true
                });
                console.log('✅ تم إرسال الرد من MediaCallSystem');
            }
            
            if (this.callType === 'video') {
                setTimeout(() => {
                    const lv = document.getElementById('localVideo');
                    if (lv && this.localStream) {
                        lv.srcObject = this.localStream;
                        console.log('✅ تم ربط الفيديو المحلي');
                    }
                }, 500);
            }
            
            this.startCallTimer();
            
        } catch (e) {
            console.error('❌ خطأ في استقبال المكالمة:', e);
            this.sendSignalingMessage(callerId, { type: 'reject', mediaCall: true });
            this.endCall();
        }
    },
    
    setupRemoteAudio(stream) {
        console.log('🔊 إعداد الصوت عن بعد في MediaCallSystem...');
        if (this.remoteAudioElementForCall) {
            this.remoteAudioElementForCall.pause();
            this.remoteAudioElementForCall.srcObject = null;
        }
        this.remoteAudioElementForCall = new Audio();
        this.remoteAudioElementForCall.srcObject = stream;
        this.remoteAudioElementForCall.autoplay = true;
        this.applySpeakerSettings();
        this.remoteAudioElementForCall.play().then(() => {
            console.log('✅ بدء تشغيل الصوت عن بعد');
        }).catch(e => {
            console.log('❌ فشل تشغيل الصوت:', e);
        });
    },
    
    applySpeakerSettings() {
        if (!this.remoteAudioElementForCall) return;
        if (this.remoteAudioElementForCall.setSinkId) {
            if (this.isSpeakerEnabled) {
                this.remoteAudioElementForCall.setSinkId('speaker').then(() => {
                    console.log('✅ تم التبديل إلى السماعة الخارجية');
                }).catch(e => console.log('❌ فشل التبديل إلى السماعة:', e));
            } else {
                this.remoteAudioElementForCall.setSinkId('default').then(() => {
                    console.log('✅ تم التبديل إلى السماعة الداخلية');
                }).catch(e => console.log('❌ فشل التبديل:', e));
            }
        }
    },
    
    toggleMute() {
        this.isAudioMuted = !this.isAudioMuted;
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) audioTrack.enabled = !this.isAudioMuted;
        }
        console.log(`🎤 كتم الصوت: ${this.isAudioMuted ? 'مفعل' : 'ملغي'}`);
    },
    
    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                console.log(`📹 كتم الفيديو: ${!videoTrack.enabled ? 'مفعل' : 'ملغي'}`);
            }
        }
        this.isVideoMuted = this.localStream?.getVideoTracks()[0]?.enabled === false;
    },
    
    toggleSpeaker() {
        this.isSpeakerEnabled = !this.isSpeakerEnabled;
        this.applySpeakerSettings();
        console.log(`🔊 وضع السماعة: ${this.isSpeakerEnabled ? 'خارجية' : 'داخلية'}`);
    },
    
    async switchCamera() {
        if (!this.localStream) return;
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (!videoTrack) return;
        const currentFacing = videoTrack.getSettings().facingMode;
        const newFacing = currentFacing === 'user' ? 'environment' : 'user';
        videoTrack.stop();
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: newFacing, width: { ideal: 640 }, height: { ideal: 480 } }
            });
            const newVideoTrack = newStream.getVideoTracks()[0];
            if (this.pc) {
                const sender = this.pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) await sender.replaceTrack(newVideoTrack);
            }
            const audioTrack = this.localStream.getAudioTracks()[0];
            this.localStream = new MediaStream([newVideoTrack, audioTrack].filter(Boolean));
            const lv = document.getElementById('localVideo');
            if (lv) lv.srcObject = this.localStream;
            console.log(`🔄 تبديل الكاميرا إلى ${newFacing === 'user' ? 'أمامية' : 'خلفية'}`);
        } catch (e) {
            console.error('❌ فشل تبديل الكاميرا:', e);
        }
    },
    
    showCallUI(type) {
        const existingUi = document.getElementById('callUI');
        if (existingUi) existingUi.remove();
        
        const contactName = document.querySelector('#conversationName')?.textContent || 'مستخدم';
        const contactAvatar = document.querySelector('#conversationAvatar')?.textContent || '👤';
        const appColor = '#2196F3';
        const bgColor = '#0a0e27';
        
        let uiHTML = '';
        if (type === 'video') {
            uiHTML = `
                <style>
                    @keyframes pulse { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4); } 70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(244, 67, 54, 0); } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244, 67, 54, 0); } }
                    .call-btn { transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); backdrop-filter: blur(10px); background: rgba(30, 30, 40, 0.85) !important; border: 1px solid rgba(255,255,255,0.15) !important; }
                    .call-btn:active { transform: scale(1.1); background: rgba(50, 50, 60, 0.95) !important; }
                    .end-call-btn { background: linear-gradient(135deg, #f44336, #d32f2f) !important; animation: pulse 1.5s infinite; }
                    .end-call-btn:active { transform: scale(1.1); background: linear-gradient(135deg, #ff6659, #e53935) !important; }
                    .local-video { border: 3px solid rgba(255,255,255,0.3); transition: all 0.3s ease; box-shadow: 0 5px 20px rgba(0,0,0,0.3); }
                </style>
                <video id="remoteVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover;position:fixed;top:0;left:0;z-index:9998;background:${bgColor};"></video>
                <video id="localVideo" autoplay playsinline muted class="local-video" style="width:120px;height:170px;object-fit:cover;position:fixed;bottom:100px;right:20px;z-index:9999;border-radius:16px;cursor:pointer;"></video>
                <div style="position:fixed;bottom:40px;left:0;right:0;z-index:9999;display:flex;justify-content:center;gap:25px;flex-wrap:wrap;padding:0 20px;">
                    <button id="switchCameraBtn" class="call-btn" style="width:60px;height:60px;border-radius:50%;border:none;font-size:1.5rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.2);color:${appColor};" title="تبديل الكاميرا"><i class="fas fa-sync-alt"></i></button>
                    <button id="muteAudioBtn" class="call-btn" style="width:60px;height:60px;border-radius:50%;border:none;font-size:1.5rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.2);color:${appColor};" title="كتم الميكروفون"><i class="fas fa-microphone"></i></button>
                    <button id="endCallBtn" class="end-call-btn" style="width:75px;height:75px;border-radius:50%;border:none;font-size:2rem;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);color:white;" title="إنهاء المكالمة"><i class="fas fa-phone-slash"></i></button>
                    <button id="muteVideoBtn" class="call-btn" style="width:60px;height:60px;border-radius:50%;border:none;font-size:1.5rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.2);color:${appColor};" title="إيقاف الكاميرا"><i class="fas fa-video"></i></button>
                </div>`;
        } else {
            uiHTML = `
                <style>
                    @keyframes pulse { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4); } 70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(244, 67, 54, 0); } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244, 67, 54, 0); } }
                    .call-btn { transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); backdrop-filter: blur(10px); background: rgba(30, 30, 40, 0.85) !important; border: 1px solid rgba(255,255,255,0.15) !important; }
                    .call-btn:active { transform: scale(1.1); background: rgba(50, 50, 60, 0.95) !important; }
                    .end-call-btn { background: linear-gradient(135deg, #f44336, #d32f2f) !important; animation: pulse 1.5s infinite; }
                    .end-call-btn:active { transform: scale(1.1); background: linear-gradient(135deg, #ff6659, #e53935) !important; }
                    .avatar-animation { animation: float 3s ease-in-out infinite; }
                    @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0px); } }
                </style>
                <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(145deg, #1a1a2e, #16213e);z-index:9997;"></div>
                <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;text-align:center;">
                    <div class="avatar-animation" style="font-size:6rem;margin-bottom:15px;filter:drop-shadow(0 10px 20px rgba(0,0,0,0.3));">${contactAvatar}</div>
                    <div style="font-size:1.8rem;color:white;font-weight:bold;margin-bottom:5px;text-shadow:0 2px 10px rgba(0,0,0,0.3);">${contactName}</div>
                    <div style="margin-top:8px;color:#4CAF50;font-size:0.9rem;background:rgba(76,175,80,0.2);padding:5px 15px;border-radius:20px;display:inline-block;">
                        <i class="fas fa-phone-alt" style="margin-left:5px;"></i> <span id="callTimer">00:00</span>
                    </div>
                </div>
                <div style="position:fixed;bottom:40px;left:0;right:0;z-index:9999;display:flex;justify-content:center;gap:30px;flex-wrap:wrap;padding:0 20px;">
                    <button id="speakerBtn" class="call-btn" style="width:65px;height:65px;border-radius:50%;border:none;font-size:1.6rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.2);color:${appColor};" title="تبديل السماعة"><i class="fas fa-volume-up"></i></button>
                    <button id="endCallBtn" class="end-call-btn" style="width:80px;height:80px;border-radius:50%;border:none;font-size:2.2rem;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.3);color:white;" title="إنهاء المكالمة"><i class="fas fa-phone-slash"></i></button>
                    <button id="muteBtn" class="call-btn" style="width:65px;height:65px;border-radius:50%;border:none;font-size:1.6rem;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.2);color:${appColor};" title="كتم الميكروفون"><i class="fas fa-microphone"></i></button>
                </div>`;
        }
        
        const ui = document.createElement('div');
        ui.id = 'callUI';
        ui.innerHTML = uiHTML;
        document.body.appendChild(ui);
        
        document.getElementById('endCallBtn')?.addEventListener('click', () => this.endCall());
        
        if (type === 'video') {
            const lv = document.getElementById('localVideo');
            if (lv && this.localStream) lv.srcObject = this.localStream;
            document.getElementById('switchCameraBtn')?.addEventListener('click', () => this.switchCamera());
            
            const muteAudioBtn = document.getElementById('muteAudioBtn');
            muteAudioBtn?.addEventListener('click', () => {
                this.toggleMute();
                const icon = muteAudioBtn.querySelector('i');
                if (icon) {
                    if (this.isAudioMuted) {
                        icon.className = 'fas fa-microphone-slash';
                        muteAudioBtn.style.color = '#f44336';
                    } else {
                        icon.className = 'fas fa-microphone';
                        muteAudioBtn.style.color = appColor;
                    }
                }
            });
            
            const muteVideoBtn = document.getElementById('muteVideoBtn');
            muteVideoBtn?.addEventListener('click', () => {
                this.toggleVideo();
                const icon = muteVideoBtn.querySelector('i');
                if (icon) {
                    if (this.isVideoMuted) {
                        icon.className = 'fas fa-video-slash';
                        muteVideoBtn.style.color = '#f44336';
                    } else {
                        icon.className = 'fas fa-video';
                        muteVideoBtn.style.color = appColor;
                    }
                }
            });
            
            if (this.isVideoMuted) {
                const muteVideoBtn = document.getElementById('muteVideoBtn');
                if (muteVideoBtn) {
                    const icon = muteVideoBtn.querySelector('i');
                    if (icon) {
                        icon.className = 'fas fa-video-slash';
                        muteVideoBtn.style.color = '#f44336';
                    }
                }
            }
        } else {
            const speakerBtn = document.getElementById('speakerBtn');
            speakerBtn?.addEventListener('click', () => {
                this.toggleSpeaker();
                const icon = speakerBtn.querySelector('i');
                if (icon) {
                    if (this.isSpeakerEnabled) {
                        icon.className = 'fas fa-volume-up';
                    } else {
                        icon.className = 'fas fa-volume-mute';
                    }
                }
            });
            
            const muteBtn = document.getElementById('muteBtn');
            muteBtn?.addEventListener('click', () => {
                this.toggleMute();
                const icon = muteBtn.querySelector('i');
                if (icon) {
                    if (this.isAudioMuted) {
                        icon.className = 'fas fa-microphone-slash';
                        muteBtn.style.color = '#f44336';
                    } else {
                        icon.className = 'fas fa-microphone';
                        muteBtn.style.color = appColor;
                    }
                }
            });
        }
    },
    
    showIncomingCall(callerId, offerData) {
        console.log('🔔 عرض شاشة المكالمة الواردة من MediaCallSystem...');
        this.currentCallId = callerId;
        
        const callType = offerData.callType === 'video' ? 'video' : 'audio';
        const appColor = '#2196F3';
        const acceptIcon = callType === 'video' ? 'fa-video' : 'fa-phone';
        
        const fetchUserName = async () => {
            try {
                const userDoc = await window.db.collection('users').doc(callerId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    return userData.name || 'مستخدم';
                }
            } catch (e) {}
            return 'مستخدم';
        };
        
        const fetchUserAvatar = async () => {
            try {
                const userDoc = await window.db.collection('users').doc(callerId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const emojiMap = { 'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧' };
                    return emojiMap[userData.avatarType] || '👤';
                }
            } catch (e) {}
            return '👤';
        };
        
        Promise.all([fetchUserName(), fetchUserAvatar()]).then(([contactName, contactAvatar]) => {
            const existingOverlay = document.getElementById('incomingCall');
            if (existingOverlay) existingOverlay.remove();
            
            const overlay = document.createElement('div');
            overlay.id = 'incomingCall';
            overlay.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:#0a0e27;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;`;
            
            overlay.innerHTML = `
                <style>
                    @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-15px); } }
                    @keyframes ring { 0% { transform: rotate(0deg); } 25% { transform: rotate(6deg); } 50% { transform: rotate(0deg); } 75% { transform: rotate(-6deg); } 100% { transform: rotate(0deg); } }
                    .avatar-float { animation: float 2.5s ease-in-out infinite; }
                    .ring-animation { animation: ring 1.2s ease-in-out infinite; transform-origin: center; }
                    .swipe-container { width: 360px; margin: 30px auto; position: relative; }
                    .swipe-button { width: 100%; height: 80px; border-radius: 50px; position: relative; overflow: hidden; cursor: grab; user-select: none; touch-action: none; background: linear-gradient(90deg, #1a5a2a 0%, #1a5a2a 50%, #8b1a1a 50%, #8b1a1a 100%); border: 2px solid ${appColor}; box-shadow: 0 8px 30px rgba(0,0,0,0.4); }
                    .swipe-button:active { cursor: grabbing; }
                    .divider-line { position: absolute; top: 10px; bottom: 10px; left: 50%; width: 2px; background: ${appColor}; transform: translateX(-50%); pointer-events: none; z-index: 5; border-radius: 2px; box-shadow: 0 0 8px ${appColor}; }
                    .swipe-thumb { position: absolute; top: 8px; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; box-shadow: 0 8px 25px rgba(0,0,0,0.5); transition: left 0.1s linear, right 0.1s linear; cursor: grab; z-index: 30; backdrop-filter: blur(5px); border: 2px solid ${appColor}; }
                    .swipe-thumb:active { cursor: grabbing; transform: scale(0.96); }
                    .thumb-left { left: 8px; background: linear-gradient(145deg, #4CAF50, #1b5e2a); color: white; }
                    .thumb-right { right: 8px; left: auto; background: linear-gradient(145deg, #f44336, #8b0000); color: white; }
                    .center-dot { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 14px; height: 14px; background: ${appColor}; border-radius: 50%; pointer-events: none; z-index: 20; box-shadow: 0 0 12px ${appColor}; }
                </style>
                <div style="text-align: center; margin-bottom: 50px;">
                    <div class="avatar-float ring-animation" style="font-size: 5.5rem; margin-bottom: 15px; filter: drop-shadow(0 10px 25px rgba(0,0,0,0.4));">${contactAvatar}</div>
                    <div style="font-size: 1.8rem; font-weight: bold; margin-bottom: 8px; letter-spacing: -0.5px;">${contactName}</div>
                </div>
                <div class="swipe-container">
                    <div id="swipeButton" class="swipe-button">
                        <div class="divider-line"></div>
                        <div class="center-dot"></div>
                        <div id="leftThumb" class="swipe-thumb thumb-left"><i class="fas ${acceptIcon}"></i></div>
                        <div id="rightThumb" class="swipe-thumb thumb-right"><i class="fas fa-phone-slash"></i></div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            
            const button = document.getElementById('swipeButton');
            const leftThumb = document.getElementById('leftThumb');
            const rightThumb = document.getElementById('rightThumb');
            
            let isDraggingLeft = false, isDraggingRight = false;
            let leftStartX = 0, rightStartX = 0;
            let leftCurrentPos = 8, rightCurrentPos = 8;
            const buttonWidth = button.clientWidth;
            const centerPos = buttonWidth / 2;
            const maxLeftMove = centerPos - 40;
            const maxRightMove = centerPos - 40;
            
            const onLeftStart = (e) => {
                e.preventDefault();
                isDraggingLeft = true;
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                const rect = leftThumb.getBoundingClientRect();
                leftStartX = clientX - (rect.left - button.getBoundingClientRect().left);
                leftThumb.style.transition = 'none';
            };
            
            const onLeftMove = (e) => {
                if (!isDraggingLeft) return;
                e.preventDefault();
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                let newLeft = clientX - leftStartX - button.getBoundingClientRect().left;
                newLeft = Math.max(8, Math.min(newLeft, maxLeftMove));
                leftCurrentPos = newLeft;
                leftThumb.style.left = newLeft + 'px';
            };
            
            const onLeftEnd = () => {
                if (!isDraggingLeft) return;
                isDraggingLeft = false;
                leftThumb.style.transition = 'left 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
                if (leftCurrentPos >= maxLeftMove - 10) {
                    leftThumb.style.left = maxLeftMove + 'px';
                    setTimeout(() => {
                        overlay.remove();
                        this.handleIncomingOffer(callerId, offerData);
                    }, 200);
                } else {
                    leftThumb.style.left = '8px';
                }
            };
            
            const onRightStart = (e) => {
                e.preventDefault();
                isDraggingRight = true;
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                const rect = rightThumb.getBoundingClientRect();
                rightStartX = (rect.right - clientX);
                rightThumb.style.transition = 'none';
            };
            
            const onRightMove = (e) => {
                if (!isDraggingRight) return;
                e.preventDefault();
                const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
                const containerRect = button.getBoundingClientRect();
                let newRight = (containerRect.right - clientX) - rightStartX;
                newRight = Math.max(8, Math.min(newRight, maxRightMove));
                rightCurrentPos = newRight;
                rightThumb.style.right = newRight + 'px';
            };
            
            const onRightEnd = () => {
                if (!isDraggingRight) return;
                isDraggingRight = false;
                rightThumb.style.transition = 'right 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
                if (rightCurrentPos >= maxRightMove - 10) {
                    rightThumb.style.right = maxRightMove + 'px';
                    setTimeout(() => {
                        overlay.remove();
                        this.sendSignalingMessage(callerId, { type: 'reject', mediaCall: true });
                    }, 200);
                } else {
                    rightThumb.style.right = '8px';
                }
            };
            
            leftThumb.addEventListener('mousedown', onLeftStart);
            leftThumb.addEventListener('touchstart', onLeftStart, { passive: false });
            rightThumb.addEventListener('mousedown', onRightStart);
            rightThumb.addEventListener('touchstart', onRightStart, { passive: false });
            
            document.addEventListener('mousemove', (e) => { onLeftMove(e); onRightMove(e); });
            document.addEventListener('mouseup', () => { onLeftEnd(); onRightEnd(); });
            document.addEventListener('touchmove', (e) => { onLeftMove(e); onRightMove(e); }, { passive: false });
            document.addEventListener('touchend', () => { onLeftEnd(); onRightEnd(); });
            
            overlay._cleanup = () => {
                document.removeEventListener('mousemove', onLeftMove);
                document.removeEventListener('mouseup', onLeftEnd);
                document.removeEventListener('mousemove', onRightMove);
                document.removeEventListener('mouseup', onRightEnd);
            };
            
            setTimeout(() => {
                const stillThere = document.getElementById('incomingCall');
                if (stillThere) {
                    if (stillThere._cleanup) stillThere._cleanup();
                    stillThere.remove();
                    this.sendSignalingMessage(callerId, { type: 'reject', mediaCall: true });
                }
            }, 30000);
        });
    },
    
    startCallTimer() {
        if (this.callTimerInterval) clearInterval(this.callTimerInterval);
        let seconds = 0;
        this.callTimerInterval = setInterval(() => {
            if (!this.isInCall) {
                clearInterval(this.callTimerInterval);
                return;
            }
            seconds++;
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            const timerEl = document.getElementById('callTimer');
            if (timerEl) timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
    },
    
    endCall() {
        console.log('📞 إنهاء المكالمة من MediaCallSystem - الميزات والملفات ستبقى نشطة');
        
        if (this.currentCallId && ChatSystem.currentChat) {
            this.sendSignalingMessage(this.currentCallId, { type: 'call_ended', mediaCall: true });
        }
        this.currentCallId = null;
        
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
        
        if (this.remoteAudioElementForCall) {
            this.remoteAudioElementForCall.pause();
            this.remoteAudioElementForCall.srcObject = null;
            this.remoteAudioElementForCall = null;
        }
        
        if (this.localStream) {
            try {
                this.localStream.getTracks().forEach(t => t.stop());
            } catch(e) {}
            this.localStream = null;
        }
        
        if (this.pc) {
            try { 
                this.pc.close(); 
                console.log('🔌 تم إغلاق PeerConnection الخاص بالمكالمة فقط');
            } catch(e) {}
            this.pc = null;
        }
        
        const ui = document.getElementById('callUI');
        if (ui) ui.remove();
        
        this.isInCall = false;
        this.callType = null;
        this.isAudioMuted = false;
        this.isVideoMuted = false;
        this.isSpeakerEnabled = false;
        
        if (window.auth?.currentUser) {
            window.db.collection('users').doc(window.auth.currentUser.uid).update({
                inCall: false,
                callType: null,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        }
        
        console.log('✅ تم إنهاء المكالمة - مازالت الميزات والملفات تعمل');
    }
};

// ==================== تحديث أزرار الاتصال ====================
window.startAudioCall = async () => {
    if (!ChatSystem.currentChat) {
        alert('الرجاء اختيار محادثة أولاً');
        return;
    }
    if (MediaCallSystem.isInCall) {
        alert('يوجد مكالمة نشطة بالفعل');
        return;
    }
    await MediaCallSystem.startCall(ChatSystem.currentChat, 'audio');
};

window.startVideoCall = async () => {
    if (!ChatSystem.currentChat) {
        alert('الرجاء اختيار محادثة أولاً');
        return;
    }
    if (MediaCallSystem.isInCall) {
        alert('يوجد مكالمة نشطة بالفعل');
        return;
    }
    await MediaCallSystem.startCall(ChatSystem.currentChat, 'video');
};

window.cleanupCallState = async () => {
    await CallSystem.autoCleanupOnLoad();
    if (MediaCallSystem.isInCall) {
        MediaCallSystem.endCall();
    }
    console.log('✅ تم تنظيف حالة المكالمات يدوياً');
};

// تعريف الكائنات كمتغيرات عامة
window.CallSystem = CallSystem;
window.MediaCallSystem = MediaCallSystem;

// ==================== التنظيف التلقائي عند تحميل الصفحة ====================
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (typeof CallSystem !== 'undefined') {
                CallSystem.autoCleanupOnLoad();
            }
        }, 1500);
    });
}

// ==================== التنظيف قبل إغلاق الصفحة ====================
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        if (MediaCallSystem.isInCall) {
            MediaCallSystem.endCall();
        }
        if (CallSystem.isInCall) {
            CallSystem.endCall();
        }
    });
}

console.log('✅ WebRTC Call System جاهز - مع فصل كامل بين الميزات والمكالمات');
console.log('   - CallSystem: للميزات والملفات فقط (DataChannel)');
console.log('   - MediaCallSystem: للمكالمات الصوتية والمرئية فقط');
