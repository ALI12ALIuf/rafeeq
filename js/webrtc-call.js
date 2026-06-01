// ========== 1. webrtc-call.js - النسخة النهائية المتكاملة المحصنة ==========
// نظام القناة الموحدة المستقلة للميزات + مكالمات الصوت والفيديو + التنظيف التلقائي لمنع بقاء الميزات معلقة

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
        ] \n    },
    
    // ==================== 1.5 حذف إشارات WebRTC من Firestore ====================
    async deleteAllWebRTCSignals(chatId) {
        if (!chatId) return;
        try {
            const messagesRef = window.db.collection('secure_messages');
            const snapshot = await messagesRef
                .where('to', '==', chatId)
                .where('isWebRTCSignal', '==', true)
                .get();
            
            if (!snapshot.empty) {
                const batch = window.db.batch();
                snapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                console.log("🧹 تم مسح إشارات الـ WebRTC تماماً من السحاب");
            }
        } catch (e) {
            console.error("❌ فشل تنظيف إشارات Firestore:", e);
        }
    },

    // ==================== 2. دالة إرسال الإشارات عبر Firestore ====================
    async sendSignal(chatId, signalData) {
        if (!chatId) return;
        try {
            await window.db.collection('secure_messages').add({
                from: window.currentUserId || 'me',
                to: chatId,
                timestamp: Date.now(),
                isWebRTCSignal: true,
                signal: JSON.stringify(signalData)
            });
        } catch (e) {
            console.error("❌ فشل إرسال الإشارة عبر Firestore:", e);
        }
    },

    // ==================== 3. تهيئة اتصال الـ PeerConnection وقناة البيانات الموحدة ====================
    createPeerConnection(chatId, isOffer) {
        if (this.pc) this.cleanupCallState();

        console.log("🏗️ إنشاء PeerConnection جديد موحد...");
        this.pc = new RTCPeerConnection(this.servers);

        // إذا كان هذا الطرف هو الذي بدأ الاتصال، ننشئ قناة البيانات الموحدة للميزات
        if (isOffer) {
            this.setupDataChannel(this.pc.createDataChannel('unified-features-channel', { ordered: true }));
        } else {
            this.pc.ondatachannel = (event) => {
                console.log("📥 استلام قناة البيانات الموحدة من الطرف الآخر");
                this.setupDataChannel(event.channel);
            };
        }

        // التعامل مع مرشحات ICE
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal(chatId, { candidate: event.candidate });
            }
        };

        // التعامل مع تدفق الصوت والفيديو القادم
        this.pc.ontrack = (event) => {
            console.log("🎵/🎬 تم استلام تدفق الوسائط القادم من الطرف الآخر");
            if (event.streams && event.streams[0]) {
                this.handleRemoteStream(event.streams[0]);
            }
        };

        // مراقبة حالة الاتصال - حارس القطع الفوري لمنع تعليق الميزات
        this.pc.onconnectionstatechange = () => {
            console.log(`📡 حالة اتصال الـ PeerConnection الحالية: ${this.pc.connectionState}`);
            if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
                console.log("🚨 انقطع الاتصال المباشر فجأة! تفعيل التنظيف الذاتي القسري للميزات.");
                this.cleanupCallState();
            }
        };
    },

    // ==================== 4. تهيئة قناة البيانات وإدارة الأحداث حياً ====================
    setupDataChannel(channel) {
        this.dc = channel;
        this.dc.binaryType = 'arraybuffer';

        this.dc.onopen = () => {
            console.log("🚀 قناة البيانات الموحدة مفتوحة الآن وجاهزة للعمل الفوري بدون قيود!");
            if (typeof ChatSystem !== 'undefined') {
                ChatSystem.updateFeatureToggleUI();
            }
        };

        this.dc.onclose = () => {
            console.log("🔒 انغلقت قناة البيانات الموحدة. إطفاء واجهة الميزات فوراً وبشكل تلقائي.");
            this.cleanupCallState();
        };

        this.dc.onerror = (err) => {
            console.error("❌ خطأ في قناة البيانات:", err);
            this.cleanupCallState();
        };

        // استقبال البيانات والرسائل والملفات حياً من المتصفح مباشرة دون خادم
        this.dc.onmessage = (event) => {
            this.handleDataChannelMessage(event.data);
        };
    },

    // ==================== 5. معالجة الإشارات المستلمة عبر الأنبوب الموحد ====================
    handleDataChannelMessage(data) {
        // إذا كانت البيانات نصية (إشارات التحكم أو الموقع)
        if (typeof data === 'string') {
            try {
                const msg = JSON.parse(data);
                
                // 1. التحكم بوضع الميزات حياً عند الطرفين
                if (msg.type === 'feature-toggle') {
                    console.log(`📡 استلام إشارة تحديث وضع الميزات حياً: ${msg.enabled}`);
                    if (typeof ChatSystem !== 'undefined') {
                        ChatSystem.featuresEnabled = msg.enabled;
                        ChatSystem.updateFeatureToggleUI();
                    }
                }
                // 2. أمر التنظيف القسري الفوري
                else if (msg.type === 'remote-cleanup') {
                    console.log("🧹 تم استقبال أمر تنظيف قسري من الطرف الآخر.");
                    this.cleanupCallState();
                }
                // 3. استقبال إشارة بدء نقل ملف جديد
                else if (msg.type === 'file-header') {
                    this.incomingFileInfo = {
                        name: msg.name,
                        size: msg.size,
                        isImage: msg.isImage,
                        totalChunks: msg.totalChunks,
                        receivedChunks: 0
                    };
                    this.incomingChunks = [];
                    console.log(`📥 الاستعداد لاستقبال ملف: ${msg.name} | عدد الأجزاء: ${msg.totalChunks}`);
                }
            } catch (e) {
                console.error("❌ فشل تحليل الرسالة النصية في القناة:", e);
            }
        } 
        // إذا كانت البيانات باينري (أجزاء من صور، فيديوهات، بصمات، ملفات)
        else if (data instanceof ArrayBuffer) {
            if (!this.incomingFileInfo.name) return;

            this.incomingChunks.push(data);
            this.incomingFileInfo.receivedChunks++;

            if (this.incomingFileInfo.receivedChunks === this.incomingFileInfo.totalChunks) {
                console.log(`✅ اكتمل استلام جميع أجزاء الملف بنجاح: ${this.incomingFileInfo.name}`);
                
                const blob = new Blob(this.incomingChunks);
                
                // تمرير الملف المستلم حياً لنظام الشات ليعرضه فوراً دون كاش
                if (typeof ChatSystem !== 'undefined' && typeof ChatSystem.displayReceivedFile === 'function') {
                    ChatSystem.displayReceivedFile(blob, this.incomingFileInfo.name, this.incomingFileInfo.isImage);
                }
                
                // تفريغ الذاكرة فوراً حماية للخصوصية
                this.incomingChunks = [];
                this.incomingFileInfo = {};
            }
        }
    },

    // ==================== 6. دالة إرسال الملفات والصور الموحدة (Blob) فائقة السرعة ====================
    async sendFileUnified(file, isImage) {
        if (!this.dc || this.dc.readyState !== 'open') {
            throw new Error("🔒 قناة البيانات الموحدة مغلقة أو لم يتم تفعيلها بعد!");
        }

        const CHUNK_SIZE = 16384; // 16KB لضمان استقرار الإرسال بدون تجمد
        const arrayBuffer = await file.arrayBuffer();
        const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);

        // 1. إرسال الهيدر التعريفي للملف أولاً
        this.dc.send(JSON.stringify({
            type: 'file-header',
            name: file.name,
            size: file.size,
            isImage: isImage,
            totalChunks: totalChunks
        }));

        // 2. تقطيع الملف وإرساله كأجزاء حية حماية للذاكرة
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
            const chunk = arrayBuffer.slice(start, end);
            
            // انتظر قليلاً إذا كان مخرجات القناة ممتلئة لمنع انهيار التصفح (Backpressure)
            while (this.dc.bufferedAmount > 1048576) { // 1MB كاش كحد أقصى للأنبوب
                await new Promise(r => setTimeout(r, 20));
            }
            
            this.dc.send(chunk);
        }
        console.log(`✅ تم تقطيع وإرسال الملف بنجاح عبر الأنبوب الموحد: ${file.name}`);
    },

    // ==================== 7. بدء المكالمات الصوتية ====================
    async startAudioCall(chatId) {
        this.currentCallId = chatId;
        this.callType = 'audio';
        this.isInCall = true;

        this.createPeerConnection(chatId, true);

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            this.showCallUI('audio-outgoing');
        } catch (e) {
            console.error("❌ لم نتمكن من الوصول للميكروفون:", e);
            alert("يرجى السماح بالوصول للميكروفون لإجراء المكالمة!");
            this.cleanupCallState();
            return;
        }

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        await this.sendSignal(chatId, { offer: offer, callType: 'audio' });
    },

    // ==================== 8. بدء مكالمات الفيديو ====================
    async startVideoCall(chatId) {
        this.currentCallId = chatId;
        this.callType = 'video';
        this.isInCall = true;

        this.createPeerConnection(chatId, true);

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            this.showCallUI('video-outgoing');
            this.attachLocalVideo();
        } catch (e) {
            console.error("❌ لم نتمكن من الوصول للكاميرا/الميكروفون:", e);
            alert("يرجى السماح بالوصول للكاميرا والميكروفون لبدء مكالمة الفيديو!");
            this.cleanupCallState();
            return;
        }

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        await this.sendSignal(chatId, { offer: offer, callType: 'video' });
    },

    // ==================== 9. معالجة الإشارات القادمة من Firestore (الربط المباشر) ====================
    async handleIncomingSignal(chatId, signal) {
        if (signal.offer) {
            if (this.isInCall) return; // حماية: منع تداخل المكالمات
            
            this.currentCallId = chatId;
            this.callType = signal.callType || 'audio';
            this.isInCall = true;

            this.createPeerConnection(chatId, false);
            await this.pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            this.showCallUI(this.callType === 'video' ? 'video-incoming' : 'audio-incoming');
        } 
        else if (signal.answer) {
            if (this.pc && this.pc.signalingState !== 'stable') {
                await this.pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
                console.log("✅ تم قبول إشارة الإجابة بنجاح واستقرار الاتصال المباشر.");
                this.showCallUI(this.callType === 'video' ? 'video-active' : 'audio-active');
                this.startCallTimer();
            }
        } 
        else if (signal.candidate) {
            if (this.pc) {
                try {
                    await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                } catch (e) {
                    console.error("❌ خطأ في إضافة مرشح ICE:", e);
                }
            }
        } 
        else if (signal.type === 'call-end') {
            console.log("📡 الطرف الآخر قام بإنهاء المكالمة. تفعيل التنظيف الفوري.");
            this.cleanupCallState();
        }
    },

    // ==================== 10. الإجابة على المكالمات الواردة ====================
    async acceptCall() {
        if (!this.currentCallId || !this.pc) return;

        try {
            const constraints = { audio: true, video: this.callType === 'video' };
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream));
            
            if (this.callType === 'video') this.attachLocalVideo();
            
            this.showCallUI(this.callType === 'video' ? 'video-active' : 'audio-active');
            this.startCallTimer();
        } catch (e) {
            console.error("❌ فشل فتح الكاميرا/الميكروفون عند قبول المكالمة:", e);
            this.cleanupCallState();
            return;
        }

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await this.sendSignal(this.currentCallId, { answer: answer });
    },

    // ==================== 11. رفض أو إنهاء المكالمة الحالية وأمان الإغلاق ====================
    async endCall() {
        if (this.currentCallId) {
            // 1. إرسال إشارة الإغلاق الفوري للطرف الآخر عبر Firestore لمنع بقائه معلقاً
            await this.sendSignal(this.currentCallId, { type: 'call-end' });
            
            // 2. 🛡️ أمان إضافي وحصين: إرسال تنظيف قسري للميزات عبر القناة المفتوحة قبل قتلها تماماً بأجزاء من الثانية
            if (this.dc && this.dc.readyState === 'open') {
                try { 
                    this.dc.send(JSON.stringify({ type: 'feature-toggle', enabled: false }));
                    this.dc.send(JSON.stringify({ type: 'remote-cleanup' })); 
                } catch(e) {}
            }
            
            // 3. تنظيف السجلات الفورية من Firestore حماية للخصوصية العالية وتجنب عودتها عند التحديث
            await this.deleteAllWebRTCSignals(this.currentCallId);
        }
        this.cleanupCallState();
    },

    // ==================== 12. التنظيف الشامل والمؤتمت لكافة الواجهات والميزات لمنع التعليق ====================
    cleanupCallState() {
        console.log("🧹 تنظيف شامل لذاكرة نظام الاتصالات والميزات الموحدة ومسح الكاش النصي...");
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
        
        // 🔒 الحصن الجديد: إغلاق وضع الميزات فوراً وبشكل تلقائي عند الطرفين لمنع بقائها مفعلة بالخطأ
        if (typeof ChatSystem !== 'undefined') {
            ChatSystem.featuresEnabled = false;
            ChatSystem.updateFeatureToggleUI();
            document.body.classList.remove('conversation-open');
        }
    },

    // ==================== 13. إدارة الصوت والفيديو المشترك والتايمر الرسومي ====================
    handleRemoteStream(stream) {
        if (this.callType === 'video') {
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) {
                remoteVideo.srcObject = stream;
                remoteVideo.play().catch(e => console.error("❌ فشل تشغيل فيديو الطرف الآخر:", e));
            }
        } else {
            if (!this.remoteAudioElement) {
                this.remoteAudioElement = document.createElement('audio');
                this.remoteAudioElement.autoplay = true;
                document.body.appendChild(this.remoteAudioElement);
            }
            this.remoteAudioElement.srcObject = stream;
        }
    },

    attachLocalVideo() {
        const localVideo = document.getElementById('localVideo');
        if (localVideo && this.localStream) {
            localVideo.srcObject = this.localStream;
            localVideo.muted = true;
            localVideo.play().catch(e => console.error("❌ فشل تشغيل الكاميرا المحلية:", e));
        }
    },

    startCallTimer() {
        if (this.callTimerInterval) clearInterval(this.callTimerInterval);
        let seconds = 0;
        const timerLabel = document.getElementById('callTimerLabel');
        this.callTimerInterval = setInterval(() => {
            seconds++;
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            if (timerLabel) {
                timerLabel.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
        }, 1000);
    },

    // التحكم بالمايك والكاميرا والسبيكر أثناء المكالمة النشطة
    toggleAudioMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                this.isAudioMuted = !this.isAudioMuted;
                audioTrack.enabled = !this.isAudioMuted;
                const btn = document.getElementById('callMuteAudioBtn');
                if (btn) btn.classList.toggle('active', this.isAudioMuted);
            }
        }
    },

    toggleVideoMute() {
        if (this.localStream && this.callType === 'video') {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                this.isVideoMuted = !this.isVideoMuted;
                videoTrack.enabled = !this.isVideoMuted;
                const btn = document.getElementById('callMuteVideoBtn');
                if (btn) btn.classList.toggle('active', this.isVideoMuted);
            }
        }
    },

    toggleSpeaker() {
        this.isSpeakerEnabled = !this.isSpeakerEnabled;
        const btn = document.getElementById('callSpeakerBtn');
        if (btn) btn.classList.toggle('active', this.isSpeakerEnabled);
        console.log(`🔊 وضع مكبر الصوت مفعّل: ${this.isSpeakerEnabled}`);
    },

    // ==================== 14. التحكم في ظهور واجهات الاتصال الرسومية (UI) ====================
    showCallUI(state) {
        const overlay = document.getElementById('callOverlay');
        if (!overlay) return;

        if (state === 'none') {
            overlay.style.display = 'none';
            return;
        }

        overlay.style.display = 'flex';
        
        // إخفاء كل أزرار وأقسام المكالمة أولاً لإظهار المناسب للحالة الحالية فقط
        document.getElementById('incomingCallSection').style.display = 'none';
        document.getElementById('outgoingCallSection').style.display = 'none';
        document.getElementById('activeCallSection').style.display = 'none';
        document.getElementById('videoCallContainer').style.display = 'none';
        
        const statusLabel = document.getElementById('callStatusLabel');

        if (state === 'audio-outgoing' || state === 'video-outgoing') {
            document.getElementById('outgoingCallSection').style.display = 'flex';
            if (statusLabel) statusLabel.textContent = 'جاري الاتصال المشفر المباشر...';
        } 
        else if (state === 'audio-incoming' || state === 'video-incoming') {
            document.getElementById('incomingCallSection').style.display = 'flex';
            if (statusLabel) statusLabel.textContent = state === 'video-incoming' ? 'مكالمة فيديو واردة مشفرة...' : 'مكالمة صوتية واردة مشفرة...';
        } 
        else if (state === 'audio-active') {
            document.getElementById('activeCallSection').style.display = 'flex';
            if (statusLabel) statusLabel.textContent = 'مكالمة صوتية آمنة نشطة';
        } 
        else if (state === 'video-active') {
            document.getElementById('activeCallSection').style.display = 'flex';
            document.getElementById('videoCallContainer').style.display = 'block';
            if (statusLabel) statusLabel.textContent = 'مكالمة فيديو آمنة نشطة';
        }
    },

    autoCleanupOnLoad() {
        console.log("🛡️ فحص حماية التشغيل والتحميل التلقائي الأولي.");
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

// ==================== 16. التنظيف الصارم قبل إغلاق الصفحة أو تبويب المتصفح فجأة ====================
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        if (CallSystem.isInCall || (CallSystem.dc && CallSystem.dc.readyState === 'open')) {
            CallSystem.endCall();
        }
    });
}

// ==================== 17. الدوال العامة المربوطة بالواجهات ====================
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
    CallSystem.cleanupCallState();
};
