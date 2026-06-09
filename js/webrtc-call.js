// ========== webrtc-call.js ==========
console.log('✅ webrtc-call.js بدأ التحميل');

const CallSystem = {
    pc: null, dc: null, localStream: null, isInCall: false, callType: null, currentCallId: null,
    incomingChunks: {}, incomingFileInfo: {},
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
    
    // ========== دالة setupDataChannel الأساسية ==========
    setupDataChannel(channel) {
        if (!channel) return;
        console.log('📡 إعداد Data Channel');
        
        channel.onmessage = e => {
            try {
                const msg = JSON.parse(e.data);
                console.log('📨 رسالة مستلمة:', msg.type);
            } catch(e) {}
        };
        
        channel.onopen = () => {
            console.log('✅ Data Channel مفتوح');
        };
        
        channel.onclose = () => {
            console.log('❌ Data Channel مغلق');
        };
    },
    
    // ========== دالة endCall ==========
    endCall() {
        console.log('📞 إنهاء المكالمة...');
        
        this.isInCall = false;
        this.callType = null;
        
        if (this.pc) {
            try { this.pc.close(); } catch(e) {}
            this.pc = null;
        }
        
        const ui = document.getElementById('callUI');
        if (ui) ui.remove();
        const inc = document.getElementById('incomingCall');
        if (inc) inc.remove();
        document.body.classList.remove('in-call');
        
        console.log('✅ تم إنهاء المكالمة');
    },
    
    // ========== دوال وهمية للتجربة ==========
    startAudioCall: function(calleeId) {
        console.log('startAudioCall - تجربة');
        alert('تم استدعاء startAudioCall');
    },
    startVideoCall: function(calleeId) {
        console.log('startVideoCall - تجربة');
        alert('تم استدعاء startVideoCall');
    },
    sendSignal: function(calleeId, data) {
        console.log('sendSignal - تجربة');
    }
};

console.log('✅ webrtc-call.js انتهى التحميل بنجاح');

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

console.log('✅ WebRTC Call System جاهز');
