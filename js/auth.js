// ========== نظام WebRTC للدردشة المباشرة ==========
// اتصال P2P مشفر بالكامل - بدون حفظ أي بيانات في السيرفر

class WebRTCManager {
    constructor() {
        this.peerConnections = new Map(); // تخزين الاتصالات النشطة
        this.dataChannels = new Map(); // قنوات البيانات
        localStream = null; // تيار الوسائط المحلي
        this.currentCall = null; // المكالمة الحالية
        this.currentFriendId = null; // معرف الصديق الحالي
        this.pendingCandidates = new Map(); // ICE candidates المعلقة
        
        // إعداد مستمع Firebase للإشارات
        this.setupSignalingListener();
    }

    // إعداد مستمع Firebase للإشارات
    setupSignalingListener() {
        if (!window.auth?.currentUser) return;
        
        const userId = window.auth.currentUser.uid;
        
        // الاستماع لعروض الاتصال الواردة
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
        console.log('📨 إشارة واردة:', signal.type);
        
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
        
        // تحديث واجهة المحادثة
        document.getElementById('conversationName').textContent = friendName;
        document.getElementById('conversationAvatar').textContent = friendAvatar || '👤';
        
        // إظهار صفحة المحادثة
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'block';
        
        // إنشاء اتصال WebRTC جديد
        await this.createPeerConnection(friendId);
        
        // إنشاء قناة بيانات للرسائل
        this.createDataChannel(friendId);
        
        // إرسال عرض الاتصال
        await this.sendOffer(friendId);
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
        
        // معالجة ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendCandidate(friendId, event.candidate);
            }
        };

        // معالجة قنوات البيانات الواردة
        pc.ondatachannel = (event) => {
            const channel = event.channel;
            this.setupDataChannel(channel, friendId);
        };

        // معالجة التيارات البعيدة (للمكالمات)
        pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                this.displayRemoteVideo(event.streams[0]);
            }
        };

        // معالجة حالة الاتصال
        pc.onconnectionstatechange = () => {
            console.log('🔄 حالة الاتصال:', pc.connectionState);
            if (pc.connectionState === 'connected') {
                this.showConnectionStatus('متصل');
            } else if (pc.connectionState === 'disconnected') {
                this.showConnectionStatus('غير متصل');
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
            reliable: true
        });

        this.setupDataChannel(channel, friendId);
        return channel;
    }

    // إعداد قناة البيانات
    setupDataChannel(channel, friendId) {
        channel.onopen = () => {
            console.log('📡 قناة البيانات مفتوحة');
            this.showConnectionStatus('متصل');
        };

        channel.onclose = () => {
            console.log('📡 قناة البيانات مغلقة');
            this.showConnectionStatus('غير متصل');
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

            // حفظ العرض في Firebase (مؤقت)
            const signalId = `${window.auth.currentUser.uid}_${friendId}_${Date.now()}`;
            await window.db.collection('signaling').doc(signalId).set({
                from: window.auth.currentUser.uid,
                to: friendId,
                type: 'offer',
                offer: offer,
                status: 'pending',
                timestamp: new Date(),
                expires: new Date(Date.now() + 60000) // تنتهي بعد دقيقة
            });

            // حذف الإشارة بعد دقيقة
            setTimeout(async () => {
                try {
                    await window.db.collection('signaling').doc(signalId).delete();
                } catch (e) {}
            }, 60000);

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
            
            // إنشاء إجابة
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // إرسال الإجابة
            await window.db.collection('signaling').doc(signalId).update({
                type: 'answer',
                answer: answer,
                status: 'answered'
            });

            // معالجة أي candidates معلقة
            if (this.pendingCandidates.has(signal.from)) {
                const candidates = this.pendingCandidates.get(signal.from);
                for (const candidate of candidates) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                this.pendingCandidates.delete(signal.from);
            }

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
            
            // معالجة أي candidates معلقة
            if (this.pendingCandidates.has(signal.from)) {
                const candidates = this.pendingCandidates.get(signal.from);
                for (const candidate of candidates) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                this.pendingCandidates.delete(signal.from);
            }

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
                timestamp: new Date(),
                expires: new Date(Date.now() + 60000)
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
            // حفظ candidate لحين جهوزية الاتصال
            if (!this.pendingCandidates.has(signal.from)) {
                this.pendingCandidates.set(signal.from, []);
            }
            this.pendingCandidates.get(signal.from).push(signal.candidate);
        }
    }

    // ========== دوال الرسائل ==========

    // إرسال رسالة نصية
    sendTextMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        
        if (!text || !this.currentFriendId) return;

        const message = {
            type: 'text',
            text: text,
            sender: window.auth.currentUser.uid,
            timestamp: Date.now(),
            messageId: `msg_${Date.now()}_${Math.random()}`
        };

        // إرسال عبر WebRTC
        const channel = this.dataChannels.get(this.currentFriendId);
        if (channel && channel.readyState === 'open') {
            channel.send(JSON.stringify(message));
            this.displayMessage(message, 'sent');
        } else {
            alert('الاتصال غير متاح');
        }

        input.value = '';
    }

    // معالجة رسالة واردة
    handleIncomingMessage(message) {
        switch (message.type) {
            case 'text':
                this.displayMessage(message, 'received');
                break;
            case 'file':
                this.handleIncomingFile(message);
                break;
            case 'voice':
                this.handleIncomingVoice(message);
                break;
            case 'location':
                this.handleIncomingLocation(message);
                break;
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

    // ========== دوال المكالمات ==========

    // بدء مكالمة فيديو
    async startVideoCall() {
        if (!this.currentFriendId) return;

        try {
            // الحصول على تيار الوسائط
            localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            // عرض الفيديو المحلي
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = localStream;

            // إضافة التيار إلى الاتصال
            const pc = this.peerConnections.get(this.currentFriendId);
            if (pc) {
                localStream.getTracks().forEach(track => {
                    pc.addTrack(track, localStream);
                });
            }

            // إظهار حاوية الفيديو
            document.getElementById('videoContainer').style.display = 'flex';
            this.currentCall = { type: 'video', stream: localStream };

        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول إلى الكاميرا أو الميكروفون');
        }
    }

    // بدء مكالمة صوتية
    async startVoiceCall() {
        if (!this.currentFriendId) return;

        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });

            const pc = this.peerConnections.get(this.currentFriendId);
            if (pc) {
                localStream.getTracks().forEach(track => {
                    pc.addTrack(track, localStream);
                });
            }

            // إظهار أيقونة المكالمة فقط
            document.getElementById('videoContainer').style.display = 'flex';
            document.getElementById('localVideo').style.display = 'none';
            
            this.currentCall = { type: 'voice', stream: localStream };

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
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        // إرسال إشارة إنهاء المكالمة
        if (this.currentFriendId) {
            window.db.collection('signaling').add({
                from: window.auth.currentUser.uid,
                to: this.currentFriendId,
                type: 'end-call',
                timestamp: new Date()
            });
        }

        // إخفاء حاوية الفيديو
        document.getElementById('videoContainer').style.display = 'none';
        document.getElementById('localVideo').style.display = 'block';
        
        this.currentCall = null;
    }

    // معالجة إنهاء المكالمة
    handleEndCall(friendId) {
        if (this.currentCall) {
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }
            document.getElementById('videoContainer').style.display = 'none';
            this.currentCall = null;
            alert('انتهت المكالمة');
        }
    }

    // ========== دوال الملفات ==========

    // إرسال ملف
    async sendFile(file) {
        if (!this.currentFriendId) return;

        const channel = this.dataChannels.get(this.currentFriendId);
        if (!channel || channel.readyState !== 'open') {
            alert('الاتصال غير متاح');
            return;
        }

        // قراءة الملف
        const reader = new FileReader();
        reader.onload = async (e) => {
            // تقسيم الملف إلى أجزاء
            const fileData = e.target.result;
            const chunkSize = 16384; // 16KB
            const totalChunks = Math.ceil(fileData.byteLength / chunkSize);

            // إرسال معلومات الملف
            channel.send(JSON.stringify({
                type: 'file-info',
                name: file.name,
                size: file.size,
                type: file.type,
                totalChunks: totalChunks,
                messageId: `file_${Date.now()}`
            }));

            // إرسال الأجزاء
            for (let i = 0; i < totalChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, fileData.byteLength);
                const chunk = fileData.slice(start, end);
                
                channel.send(JSON.stringify({
                    type: 'file-chunk',
                    index: i,
                    total: totalChunks,
                    data: Array.from(new Uint8Array(chunk)),
                    messageId: `file_${Date.now()}`
                }));
            }

            this.displayFileMessage(file.name, 'sent');
        };

        reader.readAsArrayBuffer(file);
    }

    // معالجة ملف وارد
    handleIncomingFile(message) {
        if (message.type === 'file-info') {
            // بدء استقبال ملف جديد
            this.receivingFile = {
                name: message.name,
                size: message.size,
                type: message.type,
                totalChunks: message.totalChunks,
                chunks: [],
                messageId: message.messageId
            };
        } else if (message.type === 'file-chunk' && this.receivingFile) {
            // استقبال جزء من الملف
            this.receivingFile.chunks[message.index] = new Uint8Array(message.data);
            
            // إذا اكتمل الملف
            if (this.receivingFile.chunks.length === this.receivingFile.totalChunks) {
                const completeFile = new Blob(this.receivingFile.chunks, {
                    type: this.receivingFile.type
                });
                
                // إنشاء رابط تحميل
                const url = URL.createObjectURL(completeFile);
                const a = document.createElement('a');
                a.href = url;
                a.download = this.receivingFile.name;
                a.click();
                
                this.displayFileMessage(this.receivingFile.name, 'received');
                this.receivingFile = null;
            }
        }
    }

    // ========== دوال الموقع ==========

    // مشاركة الموقع
    shareLocation() {
        if (!this.currentFriendId) return;

        if (!navigator.geolocation) {
            alert('الموقع غير مدعوم في متصفحك');
            return;
        }

        navigator.geolocation.watchPosition((position) => {
            const locationData = {
                type: 'location',
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: Date.now()
            };

            const channel = this.dataChannels.get(this.currentFriendId);
            if (channel && channel.readyState === 'open') {
                channel.send(JSON.stringify(locationData));
            }

            // عرض الموقع في الواجهة
            this.displayLocation(locationData, 'sent');

        }, (error) => {
            console.error('خطأ في الموقع:', error);
            alert('لا يمكن الحصول على الموقع');
        }, {
            enableHighAccuracy: true,
            maximumAge: 30000,
            timeout: 27000
        });
    }

    // معالجة موقع وارد
    handleIncomingLocation(location) {
        this.displayLocation(location, 'received');
        
        // فتح الموقع في خرائط جوجل عند النقر
        const mapUrl = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
        if (confirm('هل تريد فتح الموقع في الخرائط؟')) {
            window.open(mapUrl, '_blank');
        }
    }

    // عرض الموقع في الواجهة
    displayLocation(location, type) {
        const container = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type} location-message`;
        
        const time = new Date(location.timestamp).toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageElement.innerHTML = `
            <div class="location-content" onclick="window.open('https://www.google.com/maps?q=${location.lat},${location.lng}', '_blank')">
                <i class="fas fa-map-marker-alt"></i>
                <span>موقع ${type === 'sent' ? 'مرسل' : 'واصل'}</span>
                <small>الدقة: ${Math.round(location.accuracy)} متر</small>
            </div>
            <div class="message-time">${time}</div>
        `;

        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }

    // ========== دوال مساعدة ==========

    // إظهار حالة الاتصال
    showConnectionStatus(status) {
        const header = document.querySelector('.conversation-header');
        let statusElement = document.getElementById('connectionStatus');
        
        if (!statusElement) {
            statusElement = document.createElement('span');
            statusElement.id = 'connectionStatus';
            header.appendChild(statusElement);
        }
        
        statusElement.textContent = status === 'متصل' ? '🟢 متصل' : '🔴 غير متصل';
    }

    // الهروب من HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // عرض رسالة ملف
    displayFileMessage(fileName, type) {
        const container = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type} file-message`;
        
        const time = new Date().toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageElement.innerHTML = `
            <div class="file-content">
                <i class="fas fa-file"></i>
                <span>${fileName}</span>
            </div>
            <div class="message-time">${time}</div>
        `;

        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }

    // إغلاق المحادثة
    closeConversation() {
        // إنهاء أي مكالمة نشطة
        if (this.currentCall) {
            this.endCall();
        }

        // إغلاق قنوات البيانات
        if (this.currentFriendId) {
            const channel = this.dataChannels.get(this.currentFriendId);
            if (channel) channel.close();
            
            const pc = this.peerConnections.get(this.currentFriendId);
            if (pc) pc.close();
            
            this.dataChannels.delete(this.currentFriendId);
            this.peerConnections.delete(this.currentFriendId);
        }

        // العودة لصفحة الدردشة
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        
        this.currentFriendId = null;
    }
}

// ========== تهيئة النظام ==========

let webRTCManager = null;

// تهيئة WebRTC بعد تسجيل الدخول
function initWebRTC() {
    if (window.auth?.currentUser && !webRTCManager) {
        webRTCManager = new WebRTCManager();
        console.log('✅ WebRTC manager initialized');
    }
}

// مراقبة تسجيل الدخول لتهيئة WebRTC
const originalOnAuthStateChanged = window.auth?.onAuthStateChanged;
if (originalOnAuthStateChanged) {
    const wrappedOnAuthStateChanged = function(callback) {
        return originalOnAuthStateChanged.call(this, async (user) => {
            if (user) {
                setTimeout(initWebRTC, 1000);
            }
            if (callback) callback(user);
        });
    };
    window.auth.onAuthStateChanged = wrappedOnAuthStateChanged;
}

// ========== دوال عامة للواجهة ==========

// فتح محادثة مع صديق
window.openChat = function(friendId) {
    if (!webRTCManager) {
        alert('جاري تهيئة النظام...');
        return;
    }

    // جلب بيانات الصديق
    window.db.collection('users').doc(friendId).get().then((doc) => {
        if (doc.exists) {
            const friend = doc.data();
            const avatarEmoji = getEmojiForUser(friend);
            webRTCManager.startChat(friendId, friend.name, avatarEmoji);
        }
    });
};

// إرسال رسالة
window.sendMessage = function() {
    if (webRTCManager) {
        webRTCManager.sendTextMessage();
    }
};

// معالجة ضغط Enter
window.handleMessageKeyPress = function(event) {
    if (event.key === 'Enter') {
        sendMessage();
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
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const btn = document.querySelector('.call-controls button:nth-child(2) i');
            btn.className = audioTrack.enabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
        }
    }
};

// تشغيل/إيقاف الكاميرا
window.toggleCamera = function() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
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
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file && webRTCManager) {
            webRTCManager.sendFile(file);
        }
    };
    input.click();
    document.getElementById('attachmentMenu').style.display = 'none';
};

// إرسال ملف
window.sendFile = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file && webRTCManager) {
            webRTCManager.sendFile(file);
        }
    };
    input.click();
    document.getElementById('attachmentMenu').style.display = 'none';
};

// إرسال بصمة صوتية
window.sendVoiceNote = function() {
    alert('سيتم إضافة التسجيل الصوتي قريباً');
    document.getElementById('attachmentMenu').style.display = 'none';
};

// مشاركة الموقع
window.shareLocation = function() {
    if (webRTCManager) {
        webRTCManager.shareLocation();
    }
    document.getElementById('attachmentMenu').style.display = 'none';
};

// إغلاق المحادثة
window.closeConversation = function() {
    if (webRTCManager) {
        webRTCManager.closeConversation();
    }
};

// ========== إنشاء مجموعة signaling في Firebase ==========

// التحقق من وجود مجموعة signaling وإنشائها إذا لزم الأمر
async function ensureSignalingCollection() {
    try {
        // محاولة إنشاء مستند تجريبي (سيتم رفضه إذا كانت المجموعة غير موجودة)
        await window.db.collection('signaling').doc('_init').set({
            _init: true,
            timestamp: new Date()
        });
        await window.db.collection('signaling').doc('_init').delete();
    } catch (error) {
        console.log('مجموعة signaling جاهزة');
    }
}

// تهيئة المجموعة عند بدء التشغيل
if (window.db) {
    ensureSignalingCollection();
}

console.log('✅ WebRTC module loaded');
