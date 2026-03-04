// ========== نظام WebRTC للدردشة المباشرة مع Firebase Signaling ==========
// اتصال P2P مشفر بالكامل - بدون حفظ أي بيانات في السيرفر
// يستخدم Firebase فقط للإشارات المؤقتة والرسائل الاحتياطية

class WebRTCManager {
    constructor() {
        this.peerConnections = new Map();
        this.dataChannels = new Map();
        this.localStream = null;
        this.currentCall = null;
        this.currentFriendId = null;
        this.pendingCandidates = new Map();
        this.pendingMessages = []; // رسائل مؤقتة
        this.retryInterval = null;
        this.isReady = true;
        
        console.log('✅ WebRTC Manager جاهز للاستخدام');
        
        // بدء الاستماع للإشارات والرسائل فوراً
        if (window.auth?.currentUser) {
            this.startListeningForSignals();
            this.startListeningForTempMessages();
        }
    }

    // ========== نظام الإشارات عبر Firebase ==========
    
    // بدء الاستماع للإشارات الواردة
    startListeningForSignals() {
        if (!window.auth?.currentUser) {
            setTimeout(() => this.startListeningForSignals(), 1000);
            return;
        }
        
        const userId = window.auth.currentUser.uid;
        
        window.db.collection('signaling')
            .where('to', '==', userId)
            .where('status', '==', 'pending')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const signal = change.doc.data();
                        const signalId = change.doc.id;
                        
                        switch(signal.type) {
                            case 'offer':
                                this.handleIncomingOffer(signal, signalId);
                                break;
                            case 'answer':
                                this.handleIncomingAnswer(signal, signalId);
                                break;
                            case 'candidate':
                                this.handleIncomingCandidate(signal, signalId);
                                break;
                            case 'end-call':
                                this.handleEndCall(signal.from);
                                break;
                        }
                        
                        // حذف الإشارة بعد معالجتها
                        setTimeout(() => {
                            window.db.collection('signaling').doc(signalId).delete()
                                .catch(() => {});
                        }, 5000);
                    }
                });
            });
    }

    // ========== نظام الرسائل المؤقتة ==========
    
    // بدء الاستماع للرسائل المؤقتة
    startListeningForTempMessages() {
        if (!window.auth?.currentUser) return;
        
        const myId = window.auth.currentUser.uid;
        
        window.db.collection('temp_messages')
            .where('to', '==', myId)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        
                        // عرض الرسالة في الواجهة
                        this.displayMessage(data.message, 'received');
                        
                        // حذفها بعد الاستلام
                        change.doc.ref.delete();
                    }
                });
            });
    }

    // ========== إدارة المحادثات ==========
    
    // بدء محادثة مع صديق - فورية
    async startChat(friendId, friendName, friendAvatar) {
        console.log('🚀 فتح محادثة فورية مع:', friendName);
        
        this.currentFriendId = friendId;
        
        // تحديث واجهة المستخدم فوراً
        document.getElementById('conversationName').textContent = friendName;
        document.getElementById('conversationAvatar').textContent = friendAvatar || '👤';
        
        // إظهار صفحة المحادثة فوراً
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'block';
        
        // مسح الرسائل السابقة
        document.getElementById('messagesContainer').innerHTML = '';
        
        // رسالة ترحيب فورية
        this.displaySystemMessage('✅ المحادثة مفتوحة');
        
        // بدء الاتصال في الخلفية (لا ننتظره)
        this.createPeerConnection(friendId).then(() => {
            this.createDataChannel(friendId);
            this.sendOffer(friendId);
            this.displaySystemMessage('🔄 جاري تأمين الاتصال...');
        }).catch(error => {
            console.error('خطأ في الاتصال:', error);
        });
    }

    // إنشاء اتصال WebRTC
    async createPeerConnection(friendId) {
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
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
            if (pc.iceConnectionState === 'connected') {
                this.displaySystemMessage('✅ تم تأمين الاتصال');
                // إرسال أي رسائل معلقة
                this.sendPendingMessages();
            }
        };

        this.peerConnections.set(friendId, pc);
        return pc;
    }

    // إنشاء قناة بيانات
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

    // إعداد قناة البيانات
    setupDataChannel(channel, friendId) {
        channel.onopen = () => {
            console.log('✅ قناة البيانات مفتوحة');
            this.displaySystemMessage('✅ جاهز للإرسال المباشر');
            this.sendPendingMessages();
        };

        channel.onclose = () => {
            console.log('❌ قناة البيانات مغلقة');
        };

        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleIncomingMessage(data);
            } catch (e) {
                console.error('خطأ في معالجة الرسالة:', e);
            }
        };

        this.dataChannels.set(friendId, channel);
    }

    // إرسال الرسائل المعلقة
    sendPendingMessages() {
        if (this.pendingMessages.length === 0) return;
        
        const channel = this.dataChannels.get(this.currentFriendId);
        if (!channel || channel.readyState !== 'open') return;
        
        while (this.pendingMessages.length > 0) {
            const message = this.pendingMessages.shift();
            channel.send(JSON.stringify(message));
        }
        
        this.displaySystemMessage('✅ تم إرسال الرسائل المعلقة');
    }

    // ========== إرسال الإشارات عبر Firebase ==========

    // إرسال عرض اتصال
    async sendOffer(friendId) {
        const pc = this.peerConnections.get(friendId);
        if (!pc) return;

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const signalId = `${window.auth.currentUser.uid}_${friendId}_${Date.now()}`;
            
            await window.db.collection('signaling').doc(signalId).set({
                from: window.auth.currentUser.uid,
                to: friendId,
                type: 'offer',
                offer: {
                    type: offer.type,
                    sdp: offer.sdp
                },
                status: 'pending',
                timestamp: new Date()
            });

        } catch (error) {
            console.error('خطأ في إنشاء العرض:', error);
        }
    }

    // معالجة عرض وارد
    async handleIncomingOffer(signal, signalId) {
        if (!window.auth?.currentUser) return;

        const pc = await this.createPeerConnection(signal.from);
        
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await window.db.collection('signaling').doc(signalId).set({
                from: window.auth.currentUser.uid,
                to: signal.from,
                type: 'answer',
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                },
                status: 'answered',
                timestamp: new Date()
            }, { merge: true });

        } catch (error) {
            console.error('خطأ في معالجة العرض:', error);
        }
    }

    // معالجة إجابة واردة
    async handleIncomingAnswer(signal) {
        const pc = this.peerConnections.get(signal.from);
        if (!pc) return;

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
            console.log('✅ تم تأكيد الاتصال');
            
        } catch (error) {
            console.error('خطأ في معالجة الإجابة:', error);
        }
    }

    // إرسال ICE candidate
    async sendCandidate(friendId, candidate) {
        try {
            const signalId = `${window.auth.currentUser.uid}_${friendId}_cand_${Date.now()}`;
            
            await window.db.collection('signaling').doc(signalId).set({
                from: window.auth.currentUser.uid,
                to: friendId,
                type: 'candidate',
                candidate: {
                    candidate: candidate.candidate,
                    sdpMid: candidate.sdpMid,
                    sdpMLineIndex: candidate.sdpMLineIndex
                },
                timestamp: new Date()
            });
            
        } catch (error) {
            console.error('خطأ في إرسال candidate:', error);
        }
    }

    // معالجة ICE candidate وارد
    async handleIncomingCandidate(signal) {
        const pc = this.peerConnections.get(signal.from);
        
        if (pc && pc.remoteDescription) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (error) {
                console.error('خطأ في إضافة candidate:', error);
            }
        } else {
            if (!this.pendingCandidates.has(signal.from)) {
                this.pendingCandidates.set(signal.from, []);
            }
            this.pendingCandidates.get(signal.from).push(signal.candidate);
        }
    }

    // ========== إدارة الرسائل - فورية ==========

    // إرسال رسالة نصية - فورية
    sendTextMessage(text) {
        if (!this.currentFriendId) {
            alert('لا يوجد محادثة مفتوحة');
            return false;
        }

        const message = {
            type: 'text',
            text: text,
            sender: window.auth.currentUser.uid,
            timestamp: Date.now(),
            id: `msg_${Date.now()}_${Math.random()}`
        };

        // 1️⃣ أولاً: عرض الرسالة فوراً في واجهتي
        this.displayMessage(message, 'sent');
        
        // 2️⃣ ثانياً: محاولة الإرسال عبر WebRTC
        const channel = this.dataChannels.get(this.currentFriendId);
        
        if (channel && channel.readyState === 'open') {
            // WebRTC جاهز → نرسل مباشرة
            channel.send(JSON.stringify(message));
            console.log('📤 رسالة مرسلة عبر WebRTC');
        } else {
            // WebRTC مو جاهز → نحفظها للبعث لاحقاً ونستخدم Firebase
            console.log('📤 استخدام Firebase مؤقتاً');
            
            // حفظ في قائمة الانتظار
            this.pendingMessages.push(message);
            
            // إرسال عبر Firebase
            const msgId = `temp_${Date.now()}_${Math.random()}`;
            window.db.collection('temp_messages').doc(msgId).set({
                from: window.auth.currentUser.uid,
                to: this.currentFriendId,
                message: message,
                timestamp: new Date()
            }).catch(err => {
                console.error('خطأ في حفظ الرسالة المؤقتة:', err);
            });
            
            this.displaySystemMessage('📱 جاري توصيل الرسالة...');
        }
        
        return true;
    }

    // معالجة رسالة واردة
    handleIncomingMessage(message) {
        if (message.type === 'text') {
            this.displayMessage(message, 'received');
        }
    }

    // عرض الرسالة في الواجهة
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

    // عرض رسالة نظام
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

    // الهروب من HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========== إدارة المكالمات ==========

    // بدء مكالمة فيديو
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
            
            this.displaySystemMessage('📹 بدأت مكالمة فيديو');

        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول إلى الكاميرا أو الميكروفون');
        }
    }

    // بدء مكالمة صوتية
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
            
            this.displaySystemMessage('🎤 بدأت مكالمة صوتية');

        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول إلى الميكروفون');
        }
    }

    // عرض الفيديو البعيد
    displayRemoteVideo(stream) {
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = stream;
    }

    // إنهاء المكالمة
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

    // معالجة إنهاء المكالمة
    handleEndCall(friendId) {
        if (this.currentCall) {
            this.endCall();
        }
    }

    // ========== إنهاء المحادثة ==========

    // إغلاق المحادثة
    closeConversation() {
        if (this.currentCall) {
            this.endCall();
        }

        if (this.currentFriendId) {
            const channel = this.dataChannels.get(this.currentFriendId);
            if (channel) channel.close();
            
            const pc = this.peerConnections.get(this.currentFriendId);
            if (pc) pc.close();
            
            this.dataChannels.delete(this.currentFriendId);
            this.peerConnections.delete(this.currentFriendId);
        }

        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        document.getElementById('messagesContainer').innerHTML = '';
        
        this.currentFriendId = null;
        this.pendingMessages = [];
    }
}

// ========== المتغيرات العامة ==========

let webRTCManager = null;

// ========== دوال عامة للواجهة ==========

// فتح محادثة مع صديق - فورية
window.openChat = function(friendId) {
    // إنشاء المدير فوراً إذا ما كان موجود
    if (!webRTCManager) {
        webRTCManager = new WebRTCManager();
    }

    // جلب بيانات الصديق في الخلفية
    window.db.collection('users').doc(friendId).get().then((doc) => {
        if (doc.exists) {
            const friend = doc.data();
            const avatarEmoji = window.getEmojiForUser ? 
                window.getEmojiForUser(friend) : '👤';
            
            // فتح المحادثة فوراً
            webRTCManager.startChat(friendId, friend.name, avatarEmoji);
        } else {
            // حتى لو فشل جلب البيانات، نفتح المحادثة
            webRTCManager.startChat(friendId, 'صديق', '👤');
        }
    }).catch(error => {
        console.error('خطأ:', error);
        webRTCManager.startChat(friendId, 'صديق', '👤');
    });
};

// إرسال رسالة - فورية
window.sendMessage = function() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (text && webRTCManager) {
        webRTCManager.sendTextMessage(text);
        input.value = '';
    }
};

// معالجة ضغط Enter
window.handleMessageKeyPress = function(event) {
    if (event.key === 'Enter') {
        window.sendMessage();
    }
};

// بدء مكالمة فيديو
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

// بدء مكالمة صوتية
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

// إنهاء المكالمة
window.endCall = function() {
    if (webRTCManager) {
        webRTCManager.endCall();
        document.getElementById('voiceCallBtn').innerHTML = '<i class="fas fa-phone"></i>';
        document.getElementById('videoCallBtn').innerHTML = '<i class="fas fa-video"></i>';
    }
};

// كتم/تشغيل الميكروفون
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

// تشغيل/إيقاف الكاميرا
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

// إظهار قائمة المرفقات
window.showAttachmentMenu = function() {
    const menu = document.getElementById('attachmentMenu');
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
};

// إرسال صورة
window.sendImage = function() {
    alert('سيتم إضافة إرسال الصور قريباً');
    document.getElementById('attachmentMenu').style.display = 'none';
};

// إرسال ملف
window.sendFile = function() {
    alert('سيتم إضافة إرسال الملفات قريباً');
    document.getElementById('attachmentMenu').style.display = 'none';
};

// إرسال بصمة صوتية
window.sendVoiceNote = function() {
    alert('سيتم إضافة التسجيل الصوتي قريباً');
    document.getElementById('attachmentMenu').style.display = 'none';
};

// مشاركة الموقع
window.shareLocation = function() {
    alert('سيتم إضافة مشاركة الموقع قريباً');
    document.getElementById('attachmentMenu').style.display = 'none';
};

// إغلاق المحادثة
window.closeConversation = function() {
    if (webRTCManager) {
        webRTCManager.closeConversation();
    }
};

// تهيئة WebRTC
window.initWebRTC = function() {
    if (window.auth?.currentUser && !webRTCManager) {
        webRTCManager = new WebRTCManager();
        console.log('✅ WebRTC manager initialized');
    }
};

// إنشاء المجموعات في Firebase
async function setupFirebaseCollections() {
    if (!window.db) return;
    
    try {
        // مجموعة signaling
        await window.db.collection('signaling').doc('_config').set({
            name: 'WebRTC Signaling',
            created: new Date(),
            permanent: true
        }, { merge: true });
        
        // مجموعة temp_messages
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

// تهيئة كل شيء
setupFirebaseCollections();

// تهيئة WebRTC تلقائياً
if (window.auth?.currentUser) {
    setTimeout(() => {
        window.initWebRTC();
    }, 1000);
}

console.log('✅ WebRTC module loaded - جاهز للاستخدام الفوري');
