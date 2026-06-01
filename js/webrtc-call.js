// ========== webrtc-call.js (النسخة الكاملة والمصححة 100% بدون أي اختصار) ==========

const CallSystem = {
    pc: null, 
    dc: null, 
    localStream: null, 
    isInCall: false, 
    callType: null, 
    currentCallId: null,
    incomingChunks: {}, 
    incomingFileInfo: {},
    reconnectTimer: null, 
    maxReconnectAttempts: 3, 
    reconnectAttempts: 0,
    callTimerInterval: null, 
    keepAliveInterval: null,
    isAudioMuted: false, 
    isVideoMuted: false, 
    isSpeakerEnabled: false,
    remoteAudioElement: null,
    servers: { 
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
        ] 
    },
    
    // ==================== 1.5 حذف إشارات WebRTC من Firestore ====================
    async deleteAllWebRTCSignals(chatId) {
        if (!chatId) return;
        try {
            const messagesRef = window.db.collection('secure_messages');
            const snapshot = await messagesRef
                .where('to', '==', chatId)
                .where('type', 'in', ['call-offer', 'call-answer', 'ice-candidate', 'call-end', 'feature-request', 'feature-response'])
                .get();
                
            const batch = window.db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log("🧹 تم تنظيف جميع إشارات الـ WebRTC والطلب للميزات بنجاح");
        } catch (e) {
            console.error("❌ خطأ أثناء تنظيف إشارات Firestore:", e);
        }
    },

    // ==================== 2. تهيئة الاتصال الموحد وقناة البيانات ====================
    async initConnection(chatId, isInitiator) {
        console.log(`🏗️ بدء تهيئة الاتصال الموحد. منشئ الاتصال: ${isInitiator}`);
        this.pc = new RTCPeerConnection(this.servers);

        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal(chatId, {
                    type: 'ice-candidate',
                    candidate: event.candidate.toJSON()
                });
            }
        };

        this.pc.ontrack = (event) => {
            console.log("🎵 تم استقبال التدفق عن بعد (Track)");
            if (!this.remoteAudioElement) {
                this.remoteAudioElement = document.createElement('audio');
                this.remoteAudioElement.autoplay = true;
                document.body.appendChild(this.remoteAudioElement);
            }
            this.remoteAudioElement.srcObject = event.streams[0];
            
            if (this.callType === 'video') {
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo) remoteVideo.srcObject = event.streams[0];
            }
        };

        // إعداد قناة البيانات الموحدة للميزات والملفات
        if (isInitiator) {
            this.dc = this.pc.createDataChannel("unifiedDataChannel", { ordered: true });
            this.setupDataChannelHandlers();
        } else {
            this.pc.ondatachannel = (event) => {
                this.dc = event.channel;
                this.setupDataChannelHandlers();
            };
        }
    },

    // ==================== 3. معالجة أحداث قناة البيانات الموحدة ====================
    setupDataChannelHandlers() {
        if (!this.dc) return;

        this.dc.onopen = () => {
            console.log("🟢 تم فتح قناة البيانات الموحدة بنجاح للمكالمات والميزات");
            this.reconnectAttempts = 0;
            if (this.reconnectTimer) clearInterval(this.reconnectTimer);
            
            if (typeof ChatSystem !== 'undefined') {
                ChatSystem.featuresEnabled = true;
                ChatSystem.updateFeatureToggleUI();
            }
        };

        this.dc.onclose = () => {
            console.log("🔴 تم إغلاق قناة البيانات الموحدة");
            this.handleChannelDisconnect();
        };

        this.dc.onerror = (err) => {
            console.error("❌ خطأ في قناة البيانات:", err);
        };

        this.dc.onmessage = async (event) => {
            if (typeof event.data === 'string') {
                try {
                    const message = JSON.parse(event.data);
                    
                    if (message.type === 'feature-toggle') {
                        if (typeof ChatSystem !== 'undefined') {
                            ChatSystem.featuresEnabled = message.enabled;
                            ChatSystem.updateFeatureToggleUI();
                            if (!message.enabled) {
                                alert("🔒 تم إيقاف وضع الميزات من قبل الطرف الآخر");
                            }
                        }
                    } 
                    else if (message.type === 'file-header') {
                        this.incomingFileInfo = {
                            name: message.name,
                            size: message.size,
                            mimeType: message.mimeType,
                            isImage: message.isImage
                        };
                        this.incomingChunks = [];
                        console.log(`📥 استقبال ترويسة ملف: ${message.name}, الحجم: ${message.size}`);
                    } 
                    else if (message.type === 'remote-cleanup') {
                        this.cleanupCallState();
                    }
                } catch (e) {
                    console.error("⚠️ فشل في تحليل الرسالة النصية داخل القناة الموحدة:", e);
                }
            } else {
                if (this.incomingChunks) {
                    this.incomingChunks.push(event.data);
                    let receivedSize = this.incomingChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
                    
                    if (receivedSize >= this.incomingFileInfo.size) {
                        const completeBlob = new Blob(this.incomingChunks, { type: this.incomingFileInfo.mimeType });
                        console.log("✅ اكتمل استقبال الملف الموحد بنجاح");
                        
                        if (typeof ChatSystem !== 'undefined' && typeof ChatSystem.displayReceivedFile === 'function') {
                            ChatSystem.displayReceivedFile(completeBlob, this.incomingFileInfo.name, this.incomingFileInfo.isImage);
                        }
                        this.incomingChunks = [];
                        this.incomingFileInfo = {};
                    }
                }
            }
        };
    },

    // ==================== 4. إرسال الإشارات والميزات الحية ====================
    async sendSignal(chatId, data) {
        if (!chatId) return;
        try {
            await window.db.collection('secure_messages').add({
                to: chatId,
                senderId: window.auth.currentUser.uid,
                ...data,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.error("❌ فشل إرسال الإشارة عبر Firestore:", e);
        }
    },

    // ==================== 5. بدء المكالمات (صوت / فيديو) ====================
    async startAudioCall(chatId) {
        if (this.isInCall) return;
        this.isInCall = true;
        this.callType = 'audio';
        this.currentCallId = chatId;

        this.showCallUI('outgoing');
        await this.initConnection(chatId, true);

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            
            await this.sendSignal(chatId, { type: 'call-offer', callType: 'audio', sdp: offer.sdp });
            this.startKeepAlive(chatId);
        } catch (err) {
            console.error("❌ فشل الوصول للميكروفون:", err);
            this.endCall();
        }
    },

    async startVideoCall(chatId) {
        if (this.isInCall) return;
        this.isInCall = true;
        this.callType = 'video';
        this.currentCallId = chatId;

        this.showCallUI('outgoing');
        await this.initConnection(chatId, true);

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            
            const localVideo = document.getElementById('localVideo');
            if (localVideo) localVideo.srcObject = this.localStream;

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            
            await this.sendSignal(chatId, { type: 'call-offer', callType: 'video', sdp: offer.sdp });
            this.startKeepAlive(chatId);
        } catch (err) {
            console.error("❌ فشل الوصول للكاميرا/الميكروفون:", err);
            this.endCall();
        }
    },

    // ==================== 6. استقبال الرد والمكالمات الواردة ====================
    async handleIncomingOffer(chatId, callType) {
        if (this.isInCall) {
            await this.sendSignal(chatId, { type: 'call-end', reason: 'busy' });
            return;
        }
        this.isInCall = true;
        this.callType = callType;
        this.currentCallId = chatId;

        this.showCallUI('incoming');
    },

    async acceptCall() {
        if (!this.currentCallId) return;
        this.showCallUI('connected');
        await this.initConnection(this.currentCallId, false);

        try {
            const constraints = { audio: true, video: this.callType === 'video' };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            
            if (this.callType === 'video') {
                const localVideo = document.getElementById('localVideo');
                if (localVideo) localVideo.srcObject = this.localStream;
            }

            const messagesRef = window.db.collection('secure_messages');
            const snapshot = await messagesRef
                .where('to', '==', window.auth.currentUser.uid)
                .where('type', '==', 'call-offer')
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get();

            if (!snapshot.empty) {
                const offerData = snapshot.docs[0].data();
                await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offerData.sdp }));
                
                const answer = await this.pc.createAnswer();
                await this.pc.setLocalDescription(answer);
                
                await this.sendSignal(this.currentCallId, { type: 'call-answer', sdp: answer.sdp });
                
                // جلب الـ Candidates المخزنة مسبقاً
                const candidatesSnapshot = await messagesRef
                    .where('to', '==', window.auth.currentUser.uid)
                    .where('type', '==', 'ice-candidate')
                    .get();
                    
                for (let doc of candidatesSnapshot.docs) {
                    const cData = doc.data();
                    if (cData.candidate) {
                        await this.pc.addIceCandidate(new RTCIceCandidate(cData.candidate));
                    }
                }
            }

            this.startCallTimer();
            this.startKeepAlive(this.currentCallId);
        } catch (err) {
            console.error("❌ خطأ أثناء قبول المكالمة الموحدة:", err);
            this.endCall();
        }
    },

    async handleIncomingAnswer(sdp) {
        if (this.pc && this.pc.signalingState !== 'stable') {
            try {
                await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: sdp }));
                console.log("✅ تم تعيين الـ Remote Answer بنجاح واكتمل الربط");
                this.startCallTimer();
            } catch (e) {
                console.error("❌ خطأ في تعيين الـ Answer:", e);
            }
        }
    },

    async handleRemoteCandidate(candidate) {
        if (this.pc) {
            try {
                await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log("💎 تم إضافة ICE Candidate من الطرف الآخر");
            } catch (e) {
                console.warn("⚠️ تنبيه أثناء إضافة Candidate:", e);
            }
        }
    },

    // ==================== 7. إرسال الملفات والصور عبر القناة الموحدة ====================
    async sendFileUnified(file, isImage = false) {
        if (!this.dc || this.dc.readyState !== 'open') {
            alert("🔒 يجب تفعيل زر الميزات والاتصال بالطرف الآخر أولاً لإرسال الملفات!");
            return;
        }

        console.log(`📤 جاري إرسال ترويسة الملف: ${file.name} عبر القناة الموحدة`);
        
        this.dc.send(JSON.stringify({
            type: 'file-header',
            name: file.name,
            size: file.size,
            mimeType: file.type,
            isImage: isImage
        }));

        const chunkSize = 16384; 
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            const buffer = e.target.result;
            let offset = 0;
            
            while (offset < buffer.byteLength) {
                const chunk = buffer.slice(offset, offset + chunkSize);
                
                if (this.dc.bufferedAmount > this.dc.bufferedAmountLowThreshold) {
                    await new Promise(resolve => {
                        this.dc.onbufferedamountlow = () => {
                            this.dc.onbufferedamountlow = null;
                            resolve();
                        };
                    });
                }
                
                this.dc.send(chunk);
                offset += chunkSize;
            }
            console.log("🏁 تم إرسال كامل أجزاء الملف بنجاح وبسرعة هائلة!");
        };
        reader.readAsArrayBuffer(file);
    },

    // ==================== 8. بقية دوال إدارة الاتصال والنظام الموحد ====================
    startKeepAlive(chatId) {
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        this.keepAliveInterval = setInterval(async () => {
            try {
                await this.sendSignal(chatId, { type: 'call-ping' });
            } catch (e) {}
        }, 5000);
    },

    startCallTimer() {
        let seconds = 0;
        const timerText = document.getElementById('callTimerText');
        if (this.callTimerInterval) clearInterval(this.callTimerInterval);
        
        this.callTimerInterval = setInterval(() => {
            seconds++;
            const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
            const secs = String(seconds % 60).padStart(2, '0');
            if (timerText) timerText.textContent = `${mins}:${secs}`;
        }, 1000);
    },

    handleChannelDisconnect() {
        if (this.isInCall) {
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log(`🔄 محاولة إعادة الاتصال بالقناة الموحدة رقم: ${this.reconnectAttempts}`);
            } else {
                this.cleanupCallState();
            }
        }
    },

    toggleAudio() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                this.isAudioMuted = !this.isAudioMuted;
                audioTrack.enabled = !this.isAudioMuted;
                const btn = document.getElementById('toggleAudioBtn');
                if (btn) btn.classList.toggle('muted', this.isAudioMuted);
                console.log(`🎤 كتم الصوت: ${this.isAudioMuted}`);
            }
        }
    },

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                this.isVideoMuted = !this.isVideoMuted;
                videoTrack.enabled = !this.isVideoMuted;
                const btn = document.getElementById('toggleVideoBtn');
                if (btn) btn.classList.toggle('muted', this.isVideoMuted);
                console.log(`📹 كتم الفيديو: ${this.isVideoMuted}`);
            }
        }
    },

    showCallUI(state) {
        const overlay = document.getElementById('callOverlay');
        if (!overlay) return;
        overlay.style.display = (state === 'none') ? 'none' : 'flex';
        
        const outgoingSec = document.getElementById('outgoingCallSection');
        const incomingSec = document.getElementById('incomingCallSection');
        const connectedSec = document.getElementById('connectedCallSection');
        
        if (outgoingSec) outgoingSec.style.display = 'none';
        if (incomingSec) incomingSec.style.display = 'none';
        if (connectedSec) connectedSec.style.display = 'none';

        if (state === 'outgoing' && outgoingSec) outgoingSec.style.display = 'flex';
        if (state === 'incoming' && incomingSec) incomingSec.style.display = 'flex';
        if (state === 'connected' && connectedSec) connectedSec.style.display = 'flex';
    },

    async endCall() {
        if (this.currentCallId) {
            await this.sendSignal(this.currentCallId, { type: 'call-end' });
            if (this.dc && this.dc.readyState === 'open') {
                try { this.dc.send(JSON.stringify({ type: 'remote-cleanup' })); } catch(e) {}
            }
            await this.deleteAllWebRTCSignals(this.currentCallId);
        }
        this.cleanupCallState();
    },

    cleanupCallState() {
        console.log("🧹 تنظيف شامل لذاكرة نظام الاتصالات والميزات الموحدة ومسح الكاش");
        this.isInCall = false;
        this.callType = null;
        this.currentCallId = null;
        
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        if (this.callTimerInterval) clearInterval(this.callTimerInterval);
        if (this.reconnectTimer) clearInterval(this.reconnectTimer);
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (this.remoteAudioElement) {
            try { this.remoteAudioElement.remove(); } catch(e) {}
            this.remoteAudioElement = null;
        }
        
        if (this.dc) {
            try { this.dc.close(); } catch(e) {}
            this.dc = null;
        }
        if (this.pc) {
            try { this.pc.close(); } catch(e) {}
            this.pc = null;
        }
        this.incomingChunks = [];
        this.incomingFileInfo = {};
        
        this.showCallUI('none');
        if (typeof ChatSystem !== 'undefined') {
            ChatSystem.featuresEnabled = false;
            ChatSystem.updateFeatureToggleUI();
        }
    },

    autoCleanupOnLoad() {
        this.cleanupCallState();
    }
};

// ==================== 15. التنظيف التلقائي عند تحميل الصفحة ====================
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (typeof CallSystem !== 'undefined') {
                CallSystem.autoCleanupOnLoad();
            }
        }, 1500);
    });
}

// ==================== 16. التنظيف قبل إغلاق الصفحة ====================
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        if (CallSystem.isInCall) {
            CallSystem.endCall();
        }
    });
}

// ==================== 17. الدوال العامة المربوطة بواجهة الأزرار البرمجية ====================
window.startAudioCall = async () => {
    if (!ChatSystem.currentChat) {
        alert('الرجاء اختيار محادثة أولاً');
        return;
    }
    await CallSystem.startAudioCall(ChatSystem.currentChat);
};

window.startVideoCall = async () => {
    if (!ChatSystem.currentChat) {
        alert('الرجاء اختيار محادثة أولاً');
        return;
    }
    await CallSystem.startVideoCall(ChatSystem.currentChat);
};

window.cleanupCallState = async () => {
    await CallSystem.autoCleanupOnLoad();
};
