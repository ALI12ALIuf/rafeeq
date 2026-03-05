// نظام دردشة بسيط مثل واتساب
class SimpleChat {
    constructor() {
        this.currentChat = null;
        this.messages = [];
    }

    // فتح محادثة
    async openChat(friendId, friendName) {
        this.currentChat = friendId;
        this.loadLocalMessages(friendId);
        this.listenForMessages(friendId);
    }

    // إرسال رسالة
    async sendMessage(text) {
        const msg = {
            text: text,
            sender: auth.currentUser.uid,
            time: new Date(),
            id: Date.now()
        };
        
        // حفظ عندي
        this.saveMessage(msg, 'sent');
        
        // إرسال عبر Firebase (مؤقت)
        await db.collection('temp_messages').add({
            to: this.currentChat,
            from: auth.currentUser.uid,
            msg: msg,
            expires: new Date(Date.now() + 7*86400000)
        });
    }

    // حفظ محلي
    saveMessage(msg, type) {
        const key = `chat_${this.currentChat}`;
        const history = JSON.parse(localStorage.getItem(key) || '[]');
        history.push({...msg, type});
        localStorage.setItem(key, JSON.stringify(history.slice(-100)));
    }
}
