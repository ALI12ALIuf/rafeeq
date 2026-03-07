// ========== نظام المكالمات (WebRTC مع PeerJS) ==========

// تهيئة PeerJS
let peer = null;

// تهيئة الاتصال
function initPeer(userId) {
    if (!userId) return;
    
    peer = new Peer(userId);
    
    peer.on('open', (id) => {
        console.log('✅ PeerJS جاهز:', id);
    });
    
    // استقبال المكالمات
    peer.on('call', (call) => {
        if (confirm('📞 مكالمة واردة. هل تريد الرد؟')) {
            navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                .then(stream => {
                    call.answer(stream);
                    showCallScreen(call, stream);
                });
        } else {
            call.close();
        }
    });
    
    peer.on('error', (err) => {
        console.error('❌ خطأ في PeerJS:', err);
    });
    
    return peer;
}

// بدء مكالمة
function startCall(friendId, withVideo = true) {
    if (!peer) {
        alert('❌ نظام المكالمات لم يكتمل بعد');
        return;
    }
    
    navigator.mediaDevices.getUserMedia({ 
        video: withVideo, 
        audio: true 
    })
    .then(stream => {
        const call = peer.call(friendId, stream);
        showCallScreen(call, stream);
    })
    .catch(err => {
        console.error('❌ خطأ في الكاميرا:', err);
        alert('❌ لا يمكن الوصول إلى الكاميرا أو الميكروفون');
    });
}

// عرض شاشة المكالمة
function showCallScreen(call, stream) {
    const videoContainer = document.getElementById('videoContainer');
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    
    localVideo.srcObject = stream;
    
    call.on('stream', (remoteStream) => {
        remoteVideo.srcObject = remoteStream;
    });
    
    videoContainer.style.display = 'flex';
    
    call.on('close', () => {
        videoContainer.style.display = 'none';
        stream.getTracks().forEach(track => track.stop());
    });
}

// إنهاء المكالمة
function endCall() {
    if (peer) {
        peer.destroy();
        peer = null;
    }
    document.getElementById('videoContainer').style.display = 'none';
}

// كتم الميكروفون
function toggleMute(stream) {
    if (stream) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
        }
    }
}

// إيقاف الكاميرا
function toggleCamera(stream) {
    if (stream) {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
        }
    }
}

// ========== دوال عامة ==========

// بدء مكالمة فيديو
window.startVideoCall = function(friendId) {
    startCall(friendId, true);
};

// بدء مكالمة صوتية
window.startVoiceCall = function(friendId) {
    startCall(friendId, false);
};

// إنهاء المكالمة
window.endCall = function() {
    endCall();
};

// كتم/تشغيل الميكروفون
window.toggleMute = function() {
    if (window.currentCallStream) {
        toggleMute(window.currentCallStream);
    }
};

// تشغيل/إيقاف الكاميرا
window.toggleCamera = function() {
    if (window.currentCallStream) {
        toggleCamera(window.currentCallStream);
    }
};

console.log('✅ نظام المكالمات جاهز');
