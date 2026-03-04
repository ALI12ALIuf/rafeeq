// ========== نظام WebRTC للدردشة المباشرة ==========
// اتصال P2P مشفر بالكامل - بدون حفظ أي بيانات في السيرفر

class WebRTCManager {
    constructor() {
        this.peerConnections = new Map();
        this.dataChannels = new Map();
        this.localStream = null;
        this.currentCall = null;
        this.currentFriendId = null;
        this.pendingCandidates = new Map();
        
        // تهيئة بعد تسجيل الدخول
        if (window.auth?.currentUser) {
            this.setupSignalingListener();
        }
    }

    // إعداد مستمع Firebase للإشارات
    setupSignalingListener() {
        if (!window.auth?.currentUser) return;
        
        const userId = window.auth.currentUser.uid;
        
        window.db.collection('signaling')
            .where('to', '==', userId)
            .where('status', '==', 'pending')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        this.handleIncomingSignal(change.doc.data(), change.doc.id);
                    }
                });
            });
    }

    // معالجة الإشارات الواردة
    async handleIncomingSignal(signal, signalId) {
        switch (signal.type) {
            case 'offer':
                await this.handleIncomingOffer(signal, signalId);
                break;
            case 'answer':
                await this.handleIncomingAnswer(signal, signalId);
                break;
            case 'candidate':
                await this.handleIncomingCandidate(signal);
                break;
            case 'end-call':
                this.handleEndCall(signal.from);
                break;
        }
    }

    // بدء محادثة مع صديق
    async startChat(friendId, friendName, friendAvatar) {
        this.currentFriendId = friendId;
        
        document.getElementById('conversationName').textContent = friendName;
        document.getElementById('conversationAvatar').textContent = friendAvatar || '👤';
        
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'block';
        
        await this.createPeerConnection(friendId);
        this.createDataChannel(friendId);
        await this.sendOffer(friendId);
    }

    // إنشاء اتصال WebRTC
    async createPeerConnection(friendId) {
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
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

        this.peerConnections.set(friendId, pc);
        return pc;
    }

    // إنشاء قناة بيانات
    createDataChannel(friendId) {
        const pc = this.peerConnections.get(friendId);
        if (!pc) return;

        const channel = pc.createDataChannel('chat', { reliable: true });
        this.setupDataChannel(channel, friendId);
        return channel;
    }

    // إعداد قناة البيانات
    setupDataChannel(channel, friendId) {
        channel.onopen = () => {
            console.log('قناة البيانات مفتوحة');
        };

        channel.onclose = () => {
            console.log('قناة البيانات مغلقة');
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

    // إرسال عرض اتصال
    async sendOffer(friendId) {
        const pc = this.peerConnections.get(friendId);
        if (!pc) return;

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            await window.db.collection('signaling').add({
                from: window.auth.currentUser.uid,
                to: friendId,
                type: 'offer',
                offer: offer,
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

            await window.db.collection('signaling').doc(signalId).update({
                answer: answer,
                status: 'answered'
            });

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
        } catch (error) {
            console.error('خطأ في معالجة الإجابة:', error);
        }
    }

    // إرسال ICE candidate
    async sendCandidate(friendId, candidate) {
        try {
            await window.db.collection('signaling').add({
                from: window.auth.currentUser.uid,
                to: friendId,
                type: 'candidate',
                candidate: candidate,
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
        }
    }

    // إرسال رسالة نصية
    sendTextMessage(text) {
        if (!this.currentFriendId) return;

        const message = {
            type: 'text',
            text: text,
            sender: window.auth.currentUser.uid,
            timestamp: Date.now()
        };

        const channel = this.dataChannels.get(this.currentFriendId);
        if (channel && channel.readyState === 'open') {
            channel.send(JSON.stringify(message));
            this.displayMessage(message, 'sent');
            return true;
        }
        return false;
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

    // الهروب من HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

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
        
        this.currentCall = null;
    }

    // معالجة إنهاء المكالمة
    handleEndCall(friendId) {
        if (this.currentCall) {
            this.endCall();
            alert('انتهت المكالمة');
        }
    }

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
    }
}

// ========== المتغيرات العامة ==========

let webRTCManager = null;

// ========== دوال عامة للواجهة ==========

// فتح محادثة مع صديق
window.openChat = function(friendId) {
    if (!webRTCManager) {
        alert('جاري تهيئة النظام...');
        return;
    }

    window.db.collection('users').doc(friendId).get().then((doc) => {
        if (doc.exists) {
            const friend = doc.data();
            const avatarEmoji = window.getEmojiForUser ? 
                window.getEmojiForUser(friend) : '👤';
            webRTCManager.startChat(friendId, friend.name, avatarEmoji);
        }
    });
};

// إرسال رسالة
window.sendMessage = function() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (text && webRTCManager) {
        if (webRTCManager.sendTextMessage(text)) {
            input.value = '';
        }
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
    if (!webRTCManager) return;
    
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
    if (!webRTCManager) return;
    
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

// تهيئة WebRTC بعد تسجيل الدخول
window.initWebRTC = function() {
    if (window.auth?.currentUser && !webRTCManager) {
        webRTCManager = new WebRTCManager();
        console.log('✅ WebRTC manager initialized');
    }
};

// إنشاء مجموعة signaling في Firebase
async function ensureSignalingCollection() {
    try {
        await window.db.collection('signaling').doc('_init').set({
            _init: true,
            timestamp: new Date()
        });
        await window.db.collection('signaling').doc('_init').delete();
    } catch (error) {
        console.log('مجموعة signaling جاهزة');
    }
}

// تهيئة المجموعة
if (window.db) {
    ensureSignalingCollection();
}

console.log('✅ WebRTC module loaded');
