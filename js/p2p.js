// js/p2p.js - نظام اتصال P2P
class P2PCallSystem {
    constructor() {
        console.log('✅ P2P System Ready');
        this.callActive = false;
    }

    async startVideoCall(friendId) {
        console.log('📹 Video call started with:', friendId);
        alert('📹 بدء مكالمة فيديو (اختبار)');
        document.getElementById('videoContainer').style.display = 'flex';
        this.callActive = true;
    }

    async startVoiceCall(friendId) {
        console.log('🎤 Voice call started with:', friendId);
        alert('🎤 بدء مكالمة صوتية (اختبار)');
        document.getElementById('videoContainer').style.display = 'flex';
        this.callActive = true;
    }

    endCall() {
        console.log('📞 Call ended');
        document.getElementById('videoContainer').style.display = 'none';
        this.callActive = false;
    }

    toggleMute() {
        console.log('🔇 Toggle mute');
    }

    toggleCamera() {
        console.log('📷 Toggle camera');
    }
}
