// ========== نظام الدردشة المتكامل (مثل واتساب) ==========

const ChatSystem = {
    currentChat: null,
    messages: {},
    peer: null,
    currentCall: null,
    localStream: null,
    lastReadTimestamp: {},
    
    init() {
        this.loadAllChats();
        this.initPeer();
        this.loadLastReadTimestamps();
    },
    
    initPeer() {
        if (!window.auth?.currentUser) return;
        this.peer = new Peer(window.auth.currentUser.uid);
        this.peer.on('call', (call) => {
            if (confirm('مكالمة واردة. هل تريد الرد؟')) {
                navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                    .then(stream => {
                        this.localStream = stream;
                        call.answer(stream);
                        this.currentCall = call;
                        this.showVideoCall(call, stream);
                    });
            } else {
                call.close();
            }
        });
    },
    
    loadAllChats() {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('chat_')) {
                const friendId = key.replace('chat_', '');
                try {
                    this.messages[friendId] = JSON.parse(localStorage.getItem(key)) || [];
                } catch (e) {
                    this.messages[friendId] = [];
                }
            }
        }
    },
    
    // تحميل آخر وقت قراءة
    loadLastReadTimestamps() {
        const saved = localStorage.getItem('lastReadTimestamps');
        if (saved) {
            try {
                this.lastReadTimestamp = JSON.parse(saved);
            } catch (e) {
                this.lastReadTimestamp = {};
            }
        }
    },
    
    // حفظ آخر وقت قراءة
    saveLastReadTimestamps() {
        localStorage.setItem('lastReadTimestamps', JSON.stringify(this.lastReadTimestamp));
    },
    
    // فتح المحادثة
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId;
        
        // تحديث آخر وقت قراءة لهذه المحادثة
        this.lastReadTimestamp[friendId] = Date.now();
        this.saveLastReadTimestamps();
        
        // تحديث حالة الرسائل إلى مقروءة
        this.markAllAsRead(friendId);
        
        // إضافة كلاس للـ body لإخفاء القوائم
        document.body.classList.add('conversation-open');
        
        // تحديث واجهة المحادثة
        const nameElement = document.getElementById('conversationName');
        const avatarElement = document.getElementById('conversationAvatar');
        const statusElement = document.getElementById('conversationStatus');
        
        if (nameElement) nameElement.textContent = friendName;
        if (avatarElement) avatarElement.textContent = friendAvatar || '👤';
        if (statusElement) statusElement.textContent = 'متصل الآن';
        
        // إظهار صفحة المحادثة
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'flex';
        
        this.displayMessages(friendId);
        this.listenForNewMessages(friendId);
        
        // التركيز على حقل الإدخال
        setTimeout(() => {
            const input = document.getElementById('messageInput');
            if (input) input.focus();
        }, 300);
        
        // التمرير لآخر رسالة
        setTimeout(() => {
            const container = document.getElementById('messagesContainer');
            if (container) container.scrollTop = container.scrollHeight;
        }, 100);
    },
    
    // تحديث جميع الرسائل إلى مقروءة
    markAllAsRead(friendId) {
        const key = `chat_${friendId}`;
        try {
            let history = JSON.parse(localStorage.getItem(key)) || [];
            let updated = false;
            
            history = history.map(msg => {
                if (msg.sender === 'friend' && msg.status !== 'read') {
                    updated = true;
                    return { ...msg, status: 'read' };
                }
                return msg;
            });
            
            if (updated) {
                localStorage.setItem(key, JSON.stringify(history));
                this.messages[friendId] = history;
                
                // تحديث الواجهة إذا كنا في هذه المحادثة
                if (this.currentChat === friendId) {
                    this.displayMessages(friendId);
                }
                
                // تحديث قائمة المحادثات
                loadChats();
            }
        } catch (e) {
            console.error('خطأ في تحديث القراءة:', e);
        }
    },
    
    displayMessages(friendId) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        container.innerHTML = '';
        const messages = this.messages[friendId] || [];
        messages.forEach(msg => this.displayMessage(msg));
    },
    
    // عرض الرسالة مع الحالة (معدل)
    displayMessage(msg) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`;
        messageDiv.id = `msg-${msg.id}`;
        
        const time = new Date(msg.time).toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // إضافة حالة الرسالة داخل الفقاعة
        let statusHtml = '';
        if (msg.sender === 'me') {
            let statusIcon = '';
            let statusClass = '';
            
            if (msg.status === 'sending') {
                statusIcon = '⏳';
                statusClass = 'sending';
            } else if (msg.status === 'sent') {
                statusIcon = '✓';
                statusClass = 'sent';
            } else if (msg.status === 'delivered') {
                statusIcon = '✓✓';
                statusClass = 'delivered';
            } else if (msg.status === 'read') {
                statusIcon = '✓✓';
                statusClass = 'read';
            } else {
                statusIcon = '✓';
                statusClass = 'sent';
            }
            
            statusHtml = `<span class="message-status ${statusClass}">${statusIcon}</span>`;
        }
        
        if (msg.type === 'text') {
            messageDiv.innerHTML = `
                <div class="message-content">${this.escapeHtml(msg.text)}</div>
                <div class="message-info">
                    <span class="message-time">${time}</span>
                    ${statusHtml}
                </div>
            `;
        } else if (msg.type === 'image') {
            messageDiv.innerHTML = `
                <div class="message-content">
                    <img src="${msg.data}" class="message-image" onclick="openImageViewer('${msg.data}')">
                </div>
                <div class="message-info">
                    <span class="message-time">${time}</span>
                    ${statusHtml}
                </div>
            `;
        } else if (msg.type === 'voice') {
            messageDiv.innerHTML = `
                <div class="message-content">
                    <audio controls src="${msg.data}" class="message-audio" onplay="pauseOtherAudio(this)"></audio>
                </div>
                <div class="message-info">
                    <span class="message-time">${time}</span>
                    ${statusHtml}
                </div>
            `;
        }
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    },
    
    // إرسال رسالة مع حالة
    async sendMessage(text) {
        if (!this.currentChat || !text.trim()) return false;
        
        const messageId = Date.now().toString();
        const message = {
            id: messageId,
            type: 'text',
            text: text,
            sender: 'me',
            time: new Date().toISOString(),
            status: 'sending'
        };
        
        // عرض الرسالة فوراً
        this.displayMessage(message);
        
        // حفظ في localStorage
        this.saveMessage(this.currentChat, message);
        
        // محاولة الإرسال عبر Firebase
        try {
            const docRef = await window.db.collection('temp_messages').add({
                to: this.currentChat,
                from: window.auth.currentUser.uid,
                message: message,
                timestamp: new Date(),
                delivered: false,
                read: false,
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            });
            
            // تحديث حالة الرسالة إلى "مرسلة"
            this.updateMessageStatus(messageId, 'sent');
            
            // مراقبة وصول الرسالة
            this.waitForDelivery(messageId, docRef.id);
            
        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
            this.updateMessageStatus(messageId, 'error');
        }
        
        return true;
    },
    
    // إرسال صورة مع حالة
    async sendImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const messageId = Date.now().toString();
                const message = {
                    id: messageId,
                    type: 'image',
                    data: e.target.result,
                    sender: 'me',
                    time: new Date().toISOString(),
                    status: 'sending'
                };
                
                this.displayMessage(message);
                this.saveMessage(this.currentChat, message);
                
                try {
                    const docRef = await window.db.collection('temp_messages').add({
                        to: this.currentChat,
                        from: window.auth.currentUser.uid,
                        message: message,
                        timestamp: new Date(),
                        delivered: false,
                        read: false,
                        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    });
                    
                    this.updateMessageStatus(messageId, 'sent');
                    this.waitForDelivery(messageId, docRef.id);
                    
                } catch (error) {
                    console.error('خطأ في إرسال الصورة:', error);
                    this.updateMessageStatus(messageId, 'error');
                }
                resolve();
            };
            reader.readAsDataURL(file);
        });
    },
    
    // إرسال بصمة صوتية مع حالة
    async sendVoiceNote(audioBlob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const messageId = Date.now().toString();
                const message = {
                    id: messageId,
                    type: 'voice',
                    data: e.target.result,
                    sender: 'me',
                    time: new Date().toISOString(),
                    status: 'sending'
                };
                
                this.displayMessage(message);
                this.saveMessage(this.currentChat, message);
                
                try {
                    const docRef = await window.db.collection('temp_messages').add({
                        to: this.currentChat,
                        from: window.auth.currentUser.uid,
                        message: message,
                        timestamp: new Date(),
                        delivered: false,
                        read: false,
                        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    });
                    
                    this.updateMessageStatus(messageId, 'sent');
                    this.waitForDelivery(messageId, docRef.id);
                    
                } catch (error) {
                    console.error('خطأ في إرسال البصمة:', error);
                    this.updateMessageStatus(messageId, 'error');
                }
                resolve();
            };
            reader.readAsDataURL(audioBlob);
        });
    },
    
    // تحديث حالة الرسالة
    updateMessageStatus(messageId, status) {
        const messageElement = document.getElementById(`msg-${messageId}`);
        if (!messageElement) return;
        
        const statusElement = messageElement.querySelector('.message-status');
        if (!statusElement) return;
        
        // إزالة الكلاسات القديمة
        statusElement.className = 'message-status';
        statusElement.classList.add(status);
        
        if (status === 'sending') {
            statusElement.innerHTML = '⏳';
            statusElement.style.color = '#999';
        } else if (status === 'sent') {
            statusElement.innerHTML = '✓';
            statusElement.style.color = '#999';
        } else if (status === 'delivered') {
            statusElement.innerHTML = '✓✓';
            statusElement.style.color = '#999';
        } else if (status === 'read') {
            statusElement.innerHTML = '✓✓';
            statusElement.style.color = '#34B7F1'; // أزرق واتساب
        } else if (status === 'error') {
            statusElement.innerHTML = '⚠️';
            statusElement.style.color = '#f44336';
        }
        
        // تحديث في localStorage
        this.updateMessageStatusInStorage(messageId, status);
    },
    
    // تحديث حالة الرسالة في localStorage
    updateMessageStatusInStorage(messageId, status) {
        const key = `chat_${this.currentChat}`;
        try {
            let history = JSON.parse(localStorage.getItem(key)) || [];
            history = history.map(msg => {
                if (msg.id === messageId) {
                    return { ...msg, status: status };
                }
                return msg;
            });
            localStorage.setItem(key, JSON.stringify(history));
            this.messages[this.currentChat] = history;
        } catch (e) {
            console.error('خطأ في تحديث الحالة:', e);
        }
    },
    
    // انتظار وصول الرسالة
    waitForDelivery(messageId, firebaseDocId) {
        // مراقبة تغييرات حالة الرسالة
        const unsubscribe = window.db.collection('temp_messages')
            .doc(firebaseDocId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    
                    // تم التوصيل
                    if (data.delivered && !data.read) {
                        this.updateMessageStatus(messageId, 'delivered');
                    }
                    
                    // تمت القراءة
                    if (data.read) {
                        this.updateMessageStatus(messageId, 'read');
                        unsubscribe();
                    }
                }
            });
        
        // إذا لم تصل بعد 5 ثواني، اعتبر أنها وصلت
        setTimeout(() => {
            this.updateMessageStatus(messageId, 'delivered');
        }, 5000);
    },
    
    saveMessage(friendId, message) {
        const key = `chat_${friendId}`;
        let history = [];
        try {
            history = JSON.parse(localStorage.getItem(key)) || [];
        } catch (e) {
            history = [];
        }
        history.push(message);
        if (history.length > 100) history = history.slice(-100);
        localStorage.setItem(key, JSON.stringify(history));
        this.messages[friendId] = history;
    },
    
    listenForNewMessages(friendId) {
        if (!window.auth?.currentUser) return;
        
        window.db.collection('temp_messages')
            .where('from', '==', friendId)
            .where('to', '==', window.auth.currentUser.uid)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        
                        // تحديث حالة الرسالة إلى "تم التوصيل" للمرسل
                        if (data.message && data.message.id) {
                            this.updateMessageStatusFromFriend(data.message.id, 'delivered');
                        }
                        
                        // تحديد إذا كانت الرسالة مقروءة
                        const lastRead = this.lastReadTimestamp[friendId] || 0;
                        const messageTime = new Date(data.message.time).getTime();
                        const isRead = messageTime <= lastRead;
                        
                        const message = { 
                            ...data.message, 
                            sender: 'friend',
                            status: isRead ? 'read' : 'delivered'
                        };
                        
                        this.saveMessage(friendId, message);
                        
                        if (this.currentChat === friendId) {
                            this.displayMessage(message);
                            
                            // إذا كنت في المحادثة، أرسل إشعار بالقراءة
                            setTimeout(() => {
                                this.markAsRead(data.message.id, change.doc.id);
                            }, 500);
                            
                        } else {
                            this.updateLastMessage(friendId, message.text || '📷 صورة' || '🎤 بصمة');
                            this.showNotification('رسالة جديدة', message.text || 'صورة' || 'بصمة صوتية');
                        }
                        
                        // لا نحذف الرسالة فوراً، نتركها للقراءة
                        // change.doc.ref.delete();
                    }
                });
            });
    },
    
    // تحديث حالة الرسالة من الصديق
    updateMessageStatusFromFriend(messageId, status) {
        const key = `chat_${this.currentChat}`;
        try {
            let history = JSON.parse(localStorage.getItem(key)) || [];
            let updated = false;
            
            history = history.map(msg => {
                if (msg.id === messageId && msg.sender === 'me') {
                    updated = true;
                    return { ...msg, status: status };
                }
                return msg;
            });
            
            if (updated) {
                localStorage.setItem(key, JSON.stringify(history));
                this.messages[this.currentChat] = history;
                
                // تحديث الواجهة
                const msgElement = document.getElementById(`msg-${messageId}`);
                if (msgElement) {
                    const statusElement = msgElement.querySelector('.message-status');
                    if (statusElement) {
                        statusElement.className = `message-status ${status}`;
                        if (status === 'delivered') {
                            statusElement.innerHTML = '✓✓';
                            statusElement.style.color = '#999';
                        } else if (status === 'read') {
                            statusElement.innerHTML = '✓✓';
                            statusElement.style.color = '#34B7F1';
                        }
                    }
                }
            }
        } catch (e) {
            console.error('خطأ في تحديث الحالة:', e);
        }
    },
    
    // تحديد الرسالة كمقروءة
    async markAsRead(messageId, firebaseDocId) {
        try {
            await window.db.collection('temp_messages').doc(firebaseDocId).update({
                read: true,
                readAt: new Date()
            });
            this.updateMessageStatus(messageId, 'read');
        } catch (error) {
            console.error('خطأ في تحديث حالة القراءة:', error);
        }
    },
    
    updateLastMessage(friendId, lastMessage) {
        const chatItems = document.querySelectorAll('.chat-item');
        for (const item of chatItems) {
            if (item.getAttribute('onclick')?.includes(friendId)) {
                const lastMsgEl = item.querySelector('.last-message');
                const timeEl = item.querySelector('.chat-time');
                if (lastMsgEl) lastMsgEl.textContent = lastMessage;
                if (timeEl) timeEl.textContent = 'الآن';
                break;
            }
        }
    },
    
    // إغلاق المحادثة
    closeChat() {
        if (this.currentCall) this.endCall();
        
        // تحديث آخر وقت قراءة
        if (this.currentChat) {
            this.lastReadTimestamp[this.currentChat] = Date.now();
            this.saveLastReadTimestamps();
        }
        
        // إزالة كلاس الـ body
        document.body.classList.remove('conversation-open');
        
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        this.currentChat = null;
    },
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // دوال المكالمات (موجودة مسبقاً)
    async startVideoCall() {
        if (!this.currentChat || !this.peer) return;
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            const call = this.peer.call(this.currentChat, this.localStream);
            this.currentCall = call;
            this.showVideoCall(call, this.localStream);
        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول إلى الكاميرا');
        }
    },
    
    async startVoiceCall() {
        if (!this.currentChat || !this.peer) return;
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });
            const call = this.peer.call(this.currentChat, this.localStream);
            this.currentCall = call;
            this.showVoiceCall(call, this.localStream);
        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول إلى الميكروفون');
        }
    },
    
    showVideoCall(call, stream) {
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
            this.currentCall = null;
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
        });
    },
    
    showVoiceCall(call, stream) {
        const videoContainer = document.getElementById('videoContainer');
        const localVideo = document.getElementById('localVideo');
        localVideo.style.display = 'none';
        videoContainer.style.display = 'flex';
        
        call.on('close', () => {
            videoContainer.style.display = 'none';
            localVideo.style.display = 'block';
            this.currentCall = null;
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }
        });
    },
    
    endCall() {
        if (this.currentCall) this.currentCall.close();
        document.getElementById('videoContainer').style.display = 'none';
        document.getElementById('localVideo').style.display = 'block';
    },
    
    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                const btn = document.querySelector('.call-controls button:nth-child(2) i');
                if (btn) btn.className = audioTrack.enabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
            }
        }
    },
    
    toggleCamera() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                const btn = document.querySelector('.call-controls button:nth-child(3) i');
                if (btn) btn.className = videoTrack.enabled ? 'fas fa-video' : 'fas fa-video-slash';
            }
        }
    }
};

ChatSystem.init();
