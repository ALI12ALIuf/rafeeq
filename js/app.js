// نظام دردشة بسيط مثل واتساب
class ChatSystem {
    constructor() {
        this.currentChat = null;
        this.messages = {};
        this.loadAllChats();
    }

    // تحميل كل المحادثات من localStorage
    loadAllChats() {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('chat_')) {
                const friendId = key.replace('chat_', '');
                this.messages[friendId] = JSON.parse(localStorage.getItem(key)) || [];
            }
        }
    }

    // فتح محادثة
    openChat(friendId, friendName) {
        this.currentChat = friendId;
        
        // تحديث الواجهة
        document.getElementById('conversationName').textContent = friendName;
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'block';
        
        // عرض الرسائل المحفوظة
        this.displayMessages(friendId);
        
        // الاستماع للرسائل الجديدة
        this.listenForNewMessages(friendId);
    }

    // إرسال رسالة
    async sendMessage(text) {
        if (!this.currentChat) return;

        const message = {
            text: text,
            sender: 'me',
            time: new Date().toISOString(),
            id: Date.now()
        };

        // حفظ عندي
        this.saveMessage(this.currentChat, message);
        
        // عرض فوراً
        this.displayMessage(message);
        
        // إرسال عبر Firebase (مؤقت)
        await this.sendViaFirebase(message);
    }

    // حفظ في localStorage
    saveMessage(friendId, message) {
        const key = `chat_${friendId}`;
        const history = JSON.parse(localStorage.getItem(key) || '[]');
        history.push(message);
        
        // احتفظ بآخر 100 رسالة فقط
        if (history.length > 100) history.shift();
        
        localStorage.setItem(key, JSON.stringify(history));
        this.messages[friendId] = history;
    }

    // إرسال عبر Firebase
    async sendViaFirebase(message) {
        await db.collection('temp_messages').add({
            to: this.currentChat,
            from: auth.currentUser.uid,
            message: message,
            timestamp: new Date(),
            expires: new Date(Date.now() + 7*24*60*60*1000) // أسبوع
        });
    }

    // الاستماع للرسائل الجديدة
    listenForNewMessages(friendId) {
        db.collection('temp_messages')
            .where('from', '==', friendId)
            .where('to', '==', auth.currentUser.uid)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        
                        // حفظ عندي
                        this.saveMessage(friendId, {
                            ...data.message,
                            sender: 'friend'
                        });
                        
                        // عرض
                        this.displayMessage(data.message);
                        
                        // حذف من Firebase
                        change.doc.ref.delete();
                    }
                });
            });
    }

    // عرض الرسائل
    displayMessages(friendId) {
        const container = document.getElementById('messagesContainer');
        container.innerHTML = '';
        
        const messages = this.messages[friendId] || [];
        messages.forEach(msg => this.displayMessage(msg));
    }

    displayMessage(msg) {
        const container = document.getElementById('messagesContainer');
        const div = document.createElement('div');
        div.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`;
        div.innerHTML = `
            <div class="message-content">${msg.text}</div>
            <div class="message-time">${new Date(msg.time).toLocaleTimeString()}</div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    closeChat() {
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        this.currentChat = null;
    }
}

const chatSystem = new ChatSystem();
