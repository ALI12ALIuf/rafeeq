// ========== presence-system.js ==========
// نظام الحضور (Online/Offline)

const PresenceSystem = {
    onlineStatus: false,
    intervalId: null,
    
    setOnline() {
        if (this.onlineStatus) return;
        this.onlineStatus = true;
        if (window.auth?.currentUser) {
            window.db.collection('users').doc(window.auth.currentUser.uid).update({
                online: true,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        }
    },
    
    setOffline() {
        if (!this.onlineStatus) return;
        this.onlineStatus = false;
        if (window.auth?.currentUser) {
            window.db.collection('users').doc(window.auth.currentUser.uid).update({
                online: false,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            }).catch(() => {});
        }
    },
    
    stopAll() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.setOffline();
    }
};

console.log('✅ PresenceSystem تم تحميله');
