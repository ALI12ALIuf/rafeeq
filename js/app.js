document.addEventListener('DOMContentLoaded', () => {
    console.log('App loaded, setting up navigation...');
    ensureSinglePage();
    setupNavigation();
    setupSideMenu();
    setupModals();
    loadStories();
    loadChats();
    setupChatListeners();
    
    updateTripsCount();
});

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
}

async function updateTripsCount() {
    if (!window.auth || !window.auth.currentUser) return;
    try {
        const snapshot = await window.db.collection('trips')
            .where('userId', '==', window.auth.currentUser.uid)
            .where('status', '==', 'ended')
            .get();
        const tripsCount = document.getElementById('tripsCount');
        if (tripsCount) tripsCount.textContent = formatNumber(snapshot.size);
    } catch (error) {
        console.error('Error updating trips count:', error);
    }
}

function ensureSinglePage() {
    const pages = document.querySelectorAll('.page');
    const subpages = document.querySelectorAll('.profile-subpage');
    subpages.forEach(page => page.style.display = 'none');
    pages.forEach(page => {
        page.style.display = page.classList.contains('active') ? 'block' : 'none';
    });
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const menuLinks = document.querySelectorAll('.menu-items a');
    const pages = document.querySelectorAll('.page');
    
    if (!navItems.length || !pages.length) return;
    
    function switchPage(pageId) {
        pages.forEach(page => page.classList.remove('active'));
        const targetPage = document.querySelector(`.page.${pageId}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
            targetPage.style.display = 'block';
        }
        pages.forEach(page => {
            if (!page.classList.contains('active')) page.style.display = 'none';
        });
        document.querySelectorAll('.profile-subpage').forEach(sp => sp.style.display = 'none');
        if (pageId === 'chat') loadChats();
        
        const conversationPage = document.getElementById('conversationPage');
        if (conversationPage) {
            conversationPage.style.display = 'none';
            document.body.classList.remove('conversation-open');
        }
        
        navItems.forEach(item => item.classList.toggle('active', item.dataset.page === pageId));
        const sideMenu = document.getElementById('sideMenu');
        if (sideMenu) sideMenu.classList.remove('open');
    }
    
    navItems.forEach(item => item.addEventListener('click', () => switchPage(item.dataset.page)));
    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (link.dataset.page) switchPage(link.dataset.page);
        });
    });
    
    const menuBtn = document.getElementById('menuBtn');
    const sideMenu = document.getElementById('sideMenu');
    
    if (menuBtn && sideMenu) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sideMenu.classList.toggle('open');
        });
    }
    
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('sideMenu');
        const btn = document.getElementById('menuBtn');
        if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
            menu.classList.remove('open');
        }
    });
}

function setupSideMenu() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof logout === 'function') logout();
        });
    }
}

function setupModals() {
    window.openLanguageModal = () => {
        document.getElementById('languageModal')?.classList.add('active');
    };
    
    window.closeModal = () => {
        document.querySelectorAll('.modal').forEach(modal => modal.classList.remove('active'));
    };
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
    
    document.querySelectorAll('.settings-item').forEach(item => {
        if (item.querySelector('[data-i18n="language"]')) {
            item.addEventListener('click', openLanguageModal);
        }
    });
}

function loadStories() {
    const container = document.getElementById('storiesContainer');
    if (!container) return;
    const stories = [
        { name: 'قصتك', emoji: '👤' },
        { name: 'محمد', emoji: '👨' },
        { name: 'أحمد', emoji: '👨‍🦳' },
        { name: 'سارة', emoji: '👩' },
    ];
    container.innerHTML = stories.map(story => `
        <div class="story-item">
            <div class="story-avatar-emoji">${story.emoji}</div>
            <span class="story-name">${story.name}</span>
        </div>
    `).join('');
}

// ========== نظام الإشارات (Signaling System) ==========

class SignalingSystem {
    constructor() {
        this.peerConnections = new Map();
        this.dataChannels = new Map();
        this.localStream = null;
        this.currentCall = null;
        this.currentFriendId = null;
        this.pendingCandidates = new Map();
        this.isReady = true;
        
        console.log('🔧 نظام الإشارات جاهز');
        
        if (window.auth?.currentUser) {
            this.startListeningForSignals();
        }
    }

    startListeningForSignals() {
        if (!window.auth?.currentUser) {
            setTimeout(() => this.startListeningForSignals(), 1000);
            return;
        }
        
        const userId = window.auth.currentUser.uid;
        console.log('👂 بدء الاستماع للإشارات للمستخدم:', userId);
        
        window.db.collection('signaling')
            .where('to', '==', userId)
            .where('status', '==', 'pending')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const signal = change.doc.data();
                        const signalId = change.doc.id;
                        
                        console.log('📩 إشارة واردة:', signal.type);
                        
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
                        
                        setTimeout(() => {
                            window.db.collection('signaling').doc(signalId).delete()
                                .catch(() => {});
                        }, 5000);
                    }
                });
            }, (error) => {
                console.error('خطأ في الاستماع للإشارات:', error);
            });
    }

    async sendOffer(friendId, offer) {
        try {
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
                timestamp: new Date(),
                expiresAt: new Date(Date.now() + 60000)
            });

            console.log('📤 عرض اتصال مرسل');

        } catch (error) {
            console.error('خطأ في إرسال العرض:', error);
        }
    }

    async sendAnswer(friendId, answer, signalId) {
        try {
            await window.db.collection('signaling').doc(signalId).set({
                from: window.auth.currentUser.uid,
                to: friendId,
                type: 'answer',
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                },
                status: 'answered',
                timestamp: new Date()
            }, { merge: true });

            console.log('📤 إجابة اتصال مرسلة');

        } catch (error) {
            console.error('خطأ في إرسال الإجابة:', error);
        }
    }

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
                timestamp: new Date(),
                expiresAt: new Date(Date.now() + 60000)
            });
            
            console.log('📤 مرشح ICE مرسل');
            
        } catch (error) {
            console.error('خطأ في إرسال candidate:', error);
        }
    }

    async handleIncomingOffer(signal, signalId) {
        console.log('📥 استلام عرض من:', signal.from);
        if (window.ChatSystem && window.ChatSystem.handleIncomingOffer) {
            window.ChatSystem.handleIncomingOffer(signal, signalId);
        }
    }

    async handleIncomingAnswer(signal, signalId) {
        console.log('📥 استلام إجابة من:', signal.from);
        if (window.ChatSystem && window.ChatSystem.handleIncomingAnswer) {
            window.ChatSystem.handleIncomingAnswer(signal, signalId);
        }
    }

    async handleIncomingCandidate(signal, signalId) {
        console.log('📥 استلام مرشح من:', signal.from);
        if (window.ChatSystem && window.ChatSystem.handleIncomingCandidate) {
            window.ChatSystem.handleIncomingCandidate(signal, signalId);
        }
    }

    handleEndCall(friendId) {
        console.log('📞 إنهاء مكالمة من:', friendId);
        if (window.ChatSystem && window.ChatSystem.handleEndCall) {
            window.ChatSystem.handleEndCall(friendId);
        }
    }
}

// ========== نظام الدردشة المتكامل (مثل واتساب) ==========

const ChatSystem = {
    currentChat: null,
    messages: {},
    peer: null,
    currentCall: null,
    localStream: null,
    signaling: null,
    
    init() {
        this.loadAllChats();
        this.initPeer();
        this.initSignaling();
    },
    
    initSignaling() {
        this.signaling = new SignalingSystem();
        window.ChatSystem = this;
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
    
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId;
        
        document.body.classList.add('conversation-open');
        
        const nameElement = document.getElementById('conversationName');
        const avatarElement = document.getElementById('conversationAvatar');
        const statusElement = document.getElementById('conversationStatus');
        
        if (nameElement) nameElement.textContent = friendName;
        if (avatarElement) avatarElement.textContent = friendAvatar || '👤';
        if (statusElement) statusElement.textContent = 'متصل الآن';
        
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'flex';
        
        this.displayMessages(friendId);
        this.listenForNewMessages(friendId);
        
        setTimeout(() => {
            const input = document.getElementById('messageInput');
            if (input) input.focus();
        }, 300);
        
        setTimeout(() => {
            const container = document.getElementById('messagesContainer');
            if (container) container.scrollTop = container.scrollHeight;
        }, 100);
    },
    
    displayMessages(friendId) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        container.innerHTML = '';
        const messages = this.messages[friendId] || [];
        messages.forEach(msg => this.displayMessage(msg));
    },
    
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
                <img src="${msg.data}" class="message-image" onclick="window.open('${msg.data}')">
                <div class="message-info">
                    <span class="message-time">${time}</span>
                    ${statusHtml}
                </div>
            `;
        } else if (msg.type === 'voice') {
            messageDiv.innerHTML = `
                <audio controls src="${msg.data}" class="message-audio"></audio>
                <div class="message-info">
                    <span class="message-time">${time}</span>
                    ${statusHtml}
                </div>
            `;
        }
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    },
    
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
        
        this.displayMessage(message);
        this.saveMessage(this.currentChat, message);
        
        try {
            const docRef = await window.db.collection('temp_messages').add({
                to: this.currentChat,
                from: window.auth.currentUser.uid,
                message: message,
                timestamp: new Date(),
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            });
            
            this.updateMessageStatus(messageId, 'sent');
            this.waitForDelivery(messageId, docRef.id);
            
        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
            this.updateMessageStatus(messageId, 'error');
        }
        
        return true;
    },
    
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
    
    updateMessageStatus(messageId, status) {
        const messageElement = document.getElementById(`msg-${messageId}`);
        if (!messageElement) return;
        
        const statusElement = messageElement.querySelector('.message-status');
        if (!statusElement) return;
        
        statusElement.className = `message-status ${status}`;
        
        if (status === 'sending') {
            statusElement.innerHTML = '⏳';
        } else if (status === 'sent') {
            statusElement.innerHTML = '✓';
        } else if (status === 'delivered') {
            statusElement.innerHTML = '✓✓';
        } else if (status === 'read') {
            statusElement.innerHTML = '✓✓';
            statusElement.style.color = '#4fc3f7';
        } else if (status === 'error') {
            statusElement.innerHTML = '⚠️';
            statusElement.style.color = '#f44336';
        }
        
        this.updateMessageStatusInStorage(messageId, status);
    },
    
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
    
    waitForDelivery(messageId, firebaseDocId) {
        const unsubscribe = window.db.collection('temp_messages')
            .doc(firebaseDocId)
            .onSnapshot((doc) => {
                if (doc.exists) {
                    const data = doc.data();
                    if (data.delivered) {
                        this.updateMessageStatus(messageId, 'delivered');
                    }
                    if (data.read) {
                        this.updateMessageStatus(messageId, 'read');
                        unsubscribe();
                    }
                }
            });
        
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
                        
                        if (data.message && data.message.id) {
                            this.updateMessageStatusFromFriend(data.message.id, 'delivered');
                        }
                        
                        const message = { ...data.message, sender: 'friend' };
                        this.saveMessage(friendId, message);
                        
                        if (this.currentChat === friendId) {
                            this.displayMessage(message);
                            
                            setTimeout(() => {
                                this.markAsRead(data.message.id, change.doc.id);
                            }, 1000);
                            
                        } else {
                            this.updateLastMessage(friendId, message.text || '📷 صورة' || '🎤 بصمة');
                        }
                        
                        change.doc.ref.delete();
                    }
                });
            });
    },
    
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
                
                const msgElement = document.getElementById(`msg-${messageId}`);
                if (msgElement) {
                    const statusElement = msgElement.querySelector('.message-status');
                    if (statusElement) {
                        statusElement.className = `message-status ${status}`;
                        if (status === 'delivered') {
                            statusElement.innerHTML = '✓✓';
                        } else if (status === 'read') {
                            statusElement.innerHTML = '✓✓';
                            statusElement.style.color = '#4fc3f7';
                        }
                    }
                }
            }
        } catch (e) {
            console.error('خطأ في تحديث الحالة:', e);
        }
    },
    
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
    
    // ========== دوال المكالمات (مصححة) ==========
    
    async startVideoCall() {
        if (!this.currentChat || !this.peer) {
            alert('الرجاء فتح محادثة أولاً');
            return;
        }
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            const call = this.peer.call(this.currentChat, this.localStream);
            this.currentCall = call;
            this.showVideoCall(call, this.localStream);
            
            console.log('📹 بدء مكالمة فيديو');
            
        } catch (error) {
            console.error('خطأ في بدء المكالمة:', error);
            alert('لا يمكن الوصول إلى الكاميرا');
        }
    },
    
    async startVoiceCall() {
        if (!this.currentChat || !this.peer) {
            alert('الرجاء فتح محادثة أولاً');
            return;
        }
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
            });
            
            const call = this.peer.call(this.currentChat, this.localStream);
            this.currentCall = call;
            this.showVoiceCall(call, this.localStream);
            
            console.log('🎤 بدء مكالمة صوتية');
            
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
        if (this.currentCall) {
            this.currentCall.close();
            this.currentCall = null;
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        document.getElementById('videoContainer').style.display = 'none';
        document.getElementById('localVideo').style.display = 'block';
        
        console.log('📞 تم إنهاء المكالمة');
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
    },
    
    handleIncomingOffer(signal, signalId) {
        console.log('📞 معالجة عرض وارد:', signal);
    },
    
    handleIncomingAnswer(signal, signalId) {
        console.log('📞 معالجة إجابة واردة:', signal);
    },
    
    handleIncomingCandidate(signal, signalId) {
        console.log('📞 معالجة مرشح وارد:', signal);
    },
    
    handleEndCall(friendId) {
        console.log('📞 معالجة إنهاء مكالمة من:', friendId);
        if (this.currentCall) {
            this.endCall();
        }
    },
    
    closeChat() {
        if (this.currentCall) this.endCall();
        
        document.body.classList.remove('conversation-open');
        
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        this.currentChat = null;
    },
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

ChatSystem.init();

// ========== دوال تحميل المحادثات ==========

async function loadChats() {
    if (!window.auth || !window.auth.currentUser) return;
    
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) return;
    
    try {
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        if (!userDoc.exists) return;
        
        const friends = userDoc.data().friends || [];
        
        if (friends.length === 0) {
            chatsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <h3>لا توجد محادثات</h3>
                    <p>أضف أصدقاء لبدء المحادثة</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        for (const friendId of friends) {
            try {
                const friendDoc = await window.db.collection('users').doc(friendId).get();
                if (friendDoc.exists) {
                    const friend = friendDoc.data();
                    const avatarEmoji = window.getEmojiForUser(friend);
                    
                    const key = `chat_${friendId}`;
                    let lastMessage = 'اضغط لبدء المحادثة';
                    let lastTime = '';
                    let unreadCount = 0;
                    
                    try {
                        const history = JSON.parse(localStorage.getItem(key)) || [];
                        if (history.length > 0) {
                            const last = history[history.length - 1];
                            if (last.type === 'text') lastMessage = last.text;
                            else if (last.type === 'image') lastMessage = '📷 صورة';
                            else if (last.type === 'voice') lastMessage = '🎤 بصمة';
                            lastTime = new Date(last.time).toLocaleTimeString('ar-EG', {
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                            
                            unreadCount = history.filter(msg => 
                                msg.sender === 'friend' && msg.status !== 'read'
                            ).length;
                        }
                    } catch (e) {}
                    
                    const unreadBadge = unreadCount > 0 ? 
                        `<span class="unread-badge">${unreadCount}</span>` : '';
                    
                    html += `
                        <div class="chat-item" onclick="openChat('${friendId}')">
                            <div class="chat-avatar-emoji">${avatarEmoji}</div>
                            <div class="chat-info">
                                <h4>${friend.name || 'مستخدم'}</h4>
                                <p class="last-message">${lastMessage}</p>
                            </div>
                            <div class="chat-meta">
                                <span class="chat-time">${lastTime || ''}</span>
                                ${unreadBadge}
                            </div>
                        </div>
                    `;
                }
            } catch (e) {
                console.error('Error loading friend:', e);
            }
        }
        
        chatsList.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading chats:', error);
        chatsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ في تحميل المحادثات</h3>
                <p>حاول مرة أخرى</p>
            </div>
        `;
    }
}

function setupChatListeners() {
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('attachmentMenu');
        const attachBtn = document.querySelector('.attach-btn');
        if (menu && attachBtn && !menu.contains(e.target) && !attachBtn.contains(e.target)) {
            menu.style.display = 'none';
        }
        
        const emojiPicker = document.getElementById('emojiPicker');
        const emojiBtn = document.querySelector('.emoji-btn');
        if (emojiPicker && emojiBtn && !emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
            emojiPicker.style.display = 'none';
        }
    });
    
    if (window.auth?.currentUser) {
        window.db.collection('temp_messages')
            .where('to', '==', window.auth.currentUser.uid)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        loadChats();
                    }
                });
            });
    }
}

// ========== دوال عامة للواجهة ==========

window.openChat = function(friendId) {
    window.db.collection('users').doc(friendId).get().then((doc) => {
        if (doc.exists) {
            const friend = doc.data();
            const avatarEmoji = window.getEmojiForUser ? 
                window.getEmojiForUser(friend) : '👤';
            ChatSystem.openChat(friendId, friend.name, avatarEmoji);
        }
    }).catch(error => {
        console.error('خطأ في فتح المحادثة:', error);
    });
};

window.sendMessage = function() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (text) {
        ChatSystem.sendMessage(text).then(sent => {
            if (sent) input.value = '';
        });
    }
};

window.handleMessageKeyPress = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        window.sendMessage();
    }
};

window.showAttachmentMenu = function() {
    const menu = document.getElementById('attachmentMenu');
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    
    const emojiPicker = document.getElementById('emojiPicker');
    if (emojiPicker) emojiPicker.style.display = 'none';
};

window.showEmojiPicker = function() {
    const picker = document.getElementById('emojiPicker');
    picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    
    const menu = document.getElementById('attachmentMenu');
    if (menu) menu.style.display = 'none';
    
    if (picker.querySelector('.emoji-grid').children.length === 0) {
        loadEmojis();
    }
};

function loadEmojis() {
    const emojis = ['😊', '😂', '❤️', '👍', '🎉', '😢', '😡', '😍', '🤔', '👌', '🙏', '🔥', '✨', '⭐', '🌙', '☀️'];
    const grid = document.querySelector('.emoji-grid');
    if (!grid) return;
    
    emojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.onclick = () => {
            const input = document.getElementById('messageInput');
            input.value += emoji;
            input.focus();
            document.getElementById('emojiPicker').style.display = 'none';
        };
        grid.appendChild(btn);
    });
}

window.sendImage = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file && ChatSystem.currentChat) ChatSystem.sendImage(file);
    };
    input.click();
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.sendVoiceNote = function() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            const mediaRecorder = new MediaRecorder(stream);
            const chunks = [];
            
            mediaRecorder.ondataavailable = e => chunks.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                ChatSystem.sendVoiceNote(blob);
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            
            const sendBtn = document.querySelector('.send-btn');
            const voiceBtn = document.querySelector('.voice-btn');
            if (sendBtn) sendBtn.style.display = 'none';
            if (voiceBtn) {
                voiceBtn.style.display = 'flex';
                voiceBtn.onclick = () => {
                    if (mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                        sendBtn.style.display = 'flex';
                        voiceBtn.style.display = 'none';
                    }
                };
            }
            
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    if (sendBtn) sendBtn.style.display = 'flex';
                    if (voiceBtn) voiceBtn.style.display = 'none';
                }
            }, 60000);
        });
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.shareLocation = function() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const locationUrl = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
            ChatSystem.sendMessage(`📍 موقعي: ${locationUrl}`);
        });
    }
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.sendDocument = function() {
    alert('ميزة إرسال المستندات قيد التطوير');
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.toggleVoiceCall = function() {
    if (ChatSystem.currentCall) ChatSystem.endCall();
    else ChatSystem.startVoiceCall();
};

window.toggleVideoCall = function() {
    if (ChatSystem.currentCall) ChatSystem.endCall();
    else ChatSystem.startVideoCall();
};

window.endCall = function() { ChatSystem.endCall(); };
window.toggleMute = function() { ChatSystem.toggleMute(); };
window.toggleCamera = function() { ChatSystem.toggleCamera(); };
window.closeConversation = function() { ChatSystem.closeChat(); };
window.viewContactInfo = function() {
    alert('معلومات الاتصال - قيد التطوير');
};
window.showMoreOptions = function() {
    alert('خيارات إضافية - قيد التطوير');
};

// ========== باقي الدوال (بدون تغيير) ==========

window.openEditProfileModal = function() {
    const currentName = document.getElementById('profileName').textContent;
    const currentNameInput = document.getElementById('editName');
    if (currentNameInput) currentNameInput.value = currentName;
    
    const currentEmoji = document.getElementById('profileAvatarEmoji').textContent;
    const currentAvatarEmoji = document.getElementById('currentAvatarEmoji');
    if (currentAvatarEmoji) currentAvatarEmoji.textContent = currentEmoji;
    
    document.getElementById('editProfileModal').classList.add('active');
};

window.saveProfile = function() {
    const newName = document.getElementById('editName').value.trim();
    if (!newName) { alert('الرجاء إدخال الاسم'); return; }
    if (newName.length > 25) { alert('الاسم يجب أن لا يتجاوز 25 حرف'); return; }
    
    if (auth && auth.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({
            name: newName
        }).then(() => {
            document.getElementById('profileName').textContent = newName;
            document.getElementById('menuName').textContent = newName;
            closeModal();
            alert('تم حفظ التغييرات');
        }).catch(error => {
            console.error('Error saving profile:', error);
            alert('حدث خطأ في الحفظ');
        });
    }
};

window.showUserTrips = function() {
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('tripsPage').style.display = 'block';
    loadUserTrips();
};

async function loadUserTrips() {
    if (!window.auth || !window.auth.currentUser) return;
    
    const tripsGrid = document.getElementById('tripsGrid');
    if (!tripsGrid) return;
    
    try {
        const snapshot = await window.db.collection('trips')
            .where('userId', '==', window.auth.currentUser.uid)
            .orderBy('startTime', 'desc')
            .get();
        
        if (snapshot.empty) {
            tripsGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-map-marked-alt"></i>
                    <h3>${i18n ? i18n.t('no_trips') : 'لا توجد رحلات'}</h3>
                    <p>${i18n ? i18n.t('no_trips_desc') : 'لم تقم بأي رحلة بعد'}</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const trip = doc.data();
            const startTime = trip.startTime ? new Date(trip.startTime.seconds * 1000) : new Date();
            html += `
                <div class="trip-item" onclick="viewTripDetails('${doc.id}')">
                    <div class="trip-date">${startTime.toLocaleDateString('ar-EG')}</div>
                    <div class="trip-route">${trip.destination || 'رحلة'}</div>
                    <div class="trip-stats">
                        <span>⏱️ ${trip.duration || '--'}</span>
                    </div>
                </div>
            `;
        });
        tripsGrid.innerHTML = html;
        updateTripsCount();
        
    } catch (error) {
        console.error('Error loading trips:', error);
        tripsGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>خطأ في تحميل الرحلات</h3>
            </div>
        `;
    }
}

window.viewTripDetails = function(tripId) {
    alert('تفاصيل الرحلة - معرف: ' + tripId);
};

window.goBack = function() {
    document.querySelectorAll('.profile-subpage').forEach(page => page.style.display = 'none');
    document.querySelector('.profile-page').style.display = 'block';
    document.querySelector('.profile-page').classList.add('active');
    document.querySelectorAll('.page').forEach(page => {
        if (!page.classList.contains('profile-page')) {
            page.style.display = 'none';
            page.classList.remove('active');
        }
    });
};

window.selectAvatar = function(type) {
    const emojiMap = {
        'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧',
        'father': '👨‍🦳', 'mother': '👩‍🦳', 'grandfather': '👴', 'grandmother': '👵'
    };
    const selectedEmoji = emojiMap[type] || '👤';
    
    const profileAvatar = document.getElementById('profileAvatarEmoji');
    if (profileAvatar) profileAvatar.textContent = selectedEmoji;
    const currentAvatar = document.getElementById('currentAvatarEmoji');
    if (currentAvatar) currentAvatar.textContent = selectedEmoji;
    const menuAvatar = document.getElementById('menuAvatarEmoji');
    if (menuAvatar) menuAvatar.textContent = selectedEmoji;
    
    if (auth && auth.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({ avatarType: type })
            .catch(error => console.error('Error updating avatar:', error));
    }
    closeModal();
};

window.openAvatarModal = function() {
    const modal = document.getElementById('avatarModal');
    if (modal) modal.classList.add('active');
};

document.addEventListener('languageChanged', function() {
    console.log('Language changed');
    if (document.querySelector('.chat-page').style.display === 'block') loadChats();
});

window.getEmojiForUser = function(userData) {
    const emojiMap = {
        'male': '👨', 'female': '👩', 'boy': '🧒', 'girl': '👧',
        'father': '👨‍🦳', 'mother': '👩‍🦳', 'grandfather': '👴', 'grandmother': '👵'
    };
    return emojiMap[userData?.avatarType] || '👤';
};

window.clearMessages = function() {
    const container = document.getElementById('messagesContainer');
    if (container) container.innerHTML = '';
};

window.showNotification = function(title, message) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body: message });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') new Notification(title, { body: message });
        });
    }
};

if ('Notification' in window) Notification.requestPermission();

// ========== إنشاء مجموعة signaling في Firebase ==========

async function ensureSignalingCollection() {
    if (!window.db) return;
    
    try {
        const testDoc = await window.db.collection('signaling').doc('_config').get();
        
        if (!testDoc.exists) {
            await window.db.collection('signaling').doc('_config').set({
                name: 'WebRTC Signaling',
                created: new Date(),
                version: '1.0',
                permanent: true
            });
            console.log('✅ مجموعة signaling جاهزة');
        }
    } catch (error) {
        console.error('خطأ في تهيئة signaling:', error);
    }
}

// ========== تنظيف الإشارات منتهية الصلاحية ==========

async function cleanupExpiredSignals() {
    if (!window.db) return;
    
    try {
        const now = new Date();
        const expired = await window.db.collection('signaling')
            .where('expiresAt', '<', now)
            .get();
        
        let count = 0;
        for (const doc of expired.docs) {
            await doc.ref.delete();
            count++;
        }
        
        if (count > 0) {
            console.log(`🧹 تم تنظيف ${count} إشارة منتهية الصلاحية`);
        }
    } catch (error) {
        console.error('خطأ في تنظيف الإشارات:', error);
    }
}

// تهيئة المجموعة
if (window.db) {
    ensureSignalingCollection();
}

// تشغيل التنظيف كل ساعة
setInterval(cleanupExpiredSignals, 60 * 60 * 1000);

console.log('✅ app.js محدث - نظام متكامل مع الإشارات');
