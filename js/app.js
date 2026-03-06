// ========== تهيئة نظام P2P ==========
let p2pCall = null;

// تهيئة نظام المكالمات
function initP2PCallSystem() {
    // التأكد من وجود الكلاس
    if (typeof P2PCallSystem !== 'undefined' && !p2pCall) {
        try {
            p2pCall = new P2PCallSystem();
            console.log('✅ نظام P2P جاهز');
        } catch (error) {
            console.error('❌ خطأ في تهيئة P2P:', error);
        }
    } else if (typeof P2PCallSystem === 'undefined') {
        console.log('⏳ P2PCallSystem غير موجود بعد، انتظر...');
        setTimeout(initP2PCallSystem, 1000);
    }
}

// محاولة التهيئة بعد تحميل الصفحة
setTimeout(initP2PCallSystem, 2000);

// وإذا المستخدم سجل دخول، حاول مرة أخرى
if (window.auth) {
    const originalOnAuthStateChanged = window.auth.onAuthStateChanged;
    window.auth.onAuthStateChanged = function(callback) {
        return originalOnAuthStateChanged.call(this, async (user) => {
            if (user) {
                setTimeout(initP2PCallSystem, 3000);
            }
            if (callback) callback(user);
        });
    };
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('App loaded, setting up navigation...');
    ensureSinglePage();
    setupNavigation();
    setupSideMenu();
    setupModals();
    loadStories();
    loadChats();
    setupChatListeners();
    
    // تحديث عدد الرحلات إذا كانت موجودة
    updateTripsCount();
});

// دالة تنسيق الأرقام
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toString();
}

// تحديث عدد الرحلات
async function updateTripsCount() {
    if (!window.auth || !window.auth.currentUser) return;
    
    try {
        const snapshot = await window.db.collection('trips')
            .where('userId', '==', window.auth.currentUser.uid)
            .where('status', '==', 'ended')
            .get();
        
        const tripsCount = document.getElementById('tripsCount');
        if (tripsCount) {
            tripsCount.textContent = formatNumber(snapshot.size);
        }
    } catch (error) {
        console.error('Error updating trips count:', error);
    }
}

// التأكد من ظهور صفحة واحدة فقط
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
        if (conversationPage) conversationPage.style.display = 'none';
        
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

// ========== نظام المكالمات المتقدم ==========

const CallSystem = {
    onlineFriends: new Set(),
    
    init() {
        if (!window.auth?.currentUser) return;
        
        this.updateMyStatus(true);
        this.watchFriendsStatus();
        
        window.addEventListener('beforeunload', () => {
            this.updateMyStatus(false);
        });
    },
    
    async updateMyStatus(online) {
        if (!window.auth?.currentUser) return;
        
        try {
            await window.db.collection('users').doc(window.auth.currentUser.uid).update({
                online: online,
                lastSeen: new Date()
            });
        } catch (error) {
            console.error('خطأ في تحديث الحالة:', error);
        }
    },
    
    watchFriendsStatus() {
        if (!window.auth?.currentUser) return;
        
        window.db.collection('users')
            .where('friends', 'array-contains', window.auth.currentUser.uid)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    const user = change.doc.data();
                    if (change.type === 'added' || change.type === 'modified') {
                        if (user.online) {
                            this.onlineFriends.add(change.doc.id);
                        } else {
                            this.onlineFriends.delete(change.doc.id);
                        }
                    }
                });
            });
    },
    
    isFriendOnline(friendId) {
        return this.onlineFriends.has(friendId);
    }
};

// ========== نظام الدردشة المتكامل (بدون PeerJS) ==========

const ChatSystem = {
    currentChat: null,
    messages: {},
    currentCall: null,
    localStream: null,
    callActive: false,
    
    init() {
        this.loadAllChats();
        CallSystem.init();
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
        
        const nameElement = document.getElementById('conversationName');
        const avatarElement = document.getElementById('conversationAvatar');
        
        if (nameElement) nameElement.textContent = friendName;
        if (avatarElement) avatarElement.textContent = friendAvatar || '👤';
        
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'block';
        
        this.displayMessages(friendId);
        this.listenForNewMessages(friendId);
        
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
        
        if (msg.type === 'text') {
            if (msg.text.includes('maps.google.com') || msg.text.includes('📍 موقعي:')) {
                const match = msg.text.match(/q=([0-9.-]+),([0-9.-]+)/);
                if (match) {
                    const lat = match[1];
                    const lng = match[2];
                    messageDiv.innerHTML = `
                        <div class="location-message" onclick="window.open('https://www.google.com/maps?q=${lat},${lng}')">
                            <img src="https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=300x150&markers=color:red%7C${lat},${lng}&key=AIzaSyApCsnS6CjnzfMPjNsvidLiuX0ZlJ11szU" 
                                 style="width:100%; border-radius:10px; cursor:pointer;">
                            <div style="text-align:center; padding:5px; font-size:12px;">📍 موقع المستخدم</div>
                        </div>
                        <div class="message-time">${new Date(msg.time).toLocaleTimeString()}</div>
                    `;
                } else {
                    const time = new Date(msg.time).toLocaleTimeString('ar-EG', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    messageDiv.innerHTML = `
                        <div class="message-content">${this.escapeHtml(msg.text)}</div>
                        <div class="message-time">${time}</div>
                    `;
                }
            } else {
                const time = new Date(msg.time).toLocaleTimeString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                messageDiv.innerHTML = `
                    <div class="message-content">${this.escapeHtml(msg.text)}</div>
                    <div class="message-time">${time}</div>
                `;
            }
        } else if (msg.type === 'image') {
            messageDiv.innerHTML = `
                <img src="${msg.data}" class="message-image" onclick="window.open('${msg.data}')">
                <div class="message-time">${new Date(msg.time).toLocaleTimeString()}</div>
            `;
        } else if (msg.type === 'voice') {
            messageDiv.innerHTML = `
                <audio controls src="${msg.data}" class="message-audio"></audio>
                <div class="message-time">${new Date(msg.time).toLocaleTimeString()}</div>
            `;
        }
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    },
    
    async sendMessage(text) {
        if (!this.currentChat || !text.trim()) return false;
        
        const message = {
            type: 'text',
            text: text,
            sender: 'me',
            time: new Date().toISOString(),
            id: Date.now()
        };
        
        this.saveMessage(this.currentChat, message);
        this.displayMessage(message);
        
        try {
            await window.db.collection('temp_messages').add({
                to: this.currentChat,
                from: window.auth.currentUser.uid,
                message: message,
                timestamp: new Date(),
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            });
        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
        }
        
        return true;
    },
    
    async sendImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const message = {
                    type: 'image',
                    data: e.target.result,
                    sender: 'me',
                    time: new Date().toISOString(),
                    id: Date.now()
                };
                
                this.saveMessage(this.currentChat, message);
                this.displayMessage(message);
                
                try {
                    await window.db.collection('temp_messages').add({
                        to: this.currentChat,
                        from: window.auth.currentUser.uid,
                        message: message,
                        timestamp: new Date(),
                        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    });
                } catch (error) {
                    console.error('خطأ في إرسال الصورة:', error);
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
                const message = {
                    type: 'voice',
                    data: e.target.result,
                    sender: 'me',
                    time: new Date().toISOString(),
                    id: Date.now()
                };
                
                this.saveMessage(this.currentChat, message);
                this.displayMessage(message);
                
                try {
                    await window.db.collection('temp_messages').add({
                        to: this.currentChat,
                        from: window.auth.currentUser.uid,
                        message: message,
                        timestamp: new Date(),
                        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    });
                } catch (error) {
                    console.error('خطأ في إرسال البصمة:', error);
                }
                
                resolve();
            };
            reader.readAsDataURL(audioBlob);
        });
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
                        
                        const message = {
                            ...data.message,
                            sender: 'friend'
                        };
                        
                        this.saveMessage(friendId, message);
                        
                        if (this.currentChat === friendId) {
                            this.displayMessage(message);
                        } else {
                            let displayText = message.text || '';
                            if (message.type === 'image') displayText = '📷 صورة';
                            else if (message.type === 'voice') displayText = '🎤 بصمة';
                            else if (message.text?.includes('maps.google.com')) displayText = '📍 موقع';
                            this.updateLastMessage(friendId, displayText);
                        }
                        
                        change.doc.ref.delete();
                    }
                });
            });
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
        if (this.callActive && typeof p2pCall !== 'undefined') {
            p2pCall.endCall();
        }
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

// تهيئة نظام الدردشة
ChatSystem.init();

// تحميل قائمة المحادثات
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
                    const avatarEmoji = getEmojiForUser(friend);
                    
                    const key = `chat_${friendId}`;
                    let lastMessage = 'اضغط لبدء المحادثة';
                    let lastTime = '';
                    
                    try {
                        const history = JSON.parse(localStorage.getItem(key)) || [];
                        if (history.length > 0) {
                            const last = history[history.length - 1];
                            if (last.type === 'text') {
                                if (last.text?.includes('maps.google.com')) {
                                    lastMessage = '📍 موقع';
                                } else {
                                    lastMessage = last.text;
                                }
                            } else if (last.type === 'image') lastMessage = '📷 صورة';
                            else if (last.type === 'voice') lastMessage = '🎤 بصمة';
                            lastTime = new Date(last.time).toLocaleTimeString('ar-EG', {
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                        }
                    } catch (e) {}
                    
                    html += `
                        <div class="chat-item" onclick="openChat('${friendId}')">
                            <div class="chat-avatar-emoji">${avatarEmoji}</div>
                            <div class="chat-info">
                                <h4>${friend.name || 'مستخدم'}</h4>
                                <p class="last-message">${lastMessage}</p>
                            </div>
                            <span class="chat-time">${lastTime || ''}</span>
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

// إعداد مستمعي الدردشة
function setupChatListeners() {
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('attachmentMenu');
        const attachBtn = document.querySelector('.attach-btn');
        if (menu && attachBtn && !menu.contains(e.target) && !attachBtn.contains(e.target)) {
            menu.style.display = 'none';
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
    if (event.key === 'Enter') {
        window.sendMessage();
    }
};

// دوال المرفقات
window.showAttachmentMenu = function() {
    const menu = document.getElementById('attachmentMenu');
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
};

window.sendImage = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file && ChatSystem.currentChat) {
            ChatSystem.sendImage(file);
        }
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
            
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                }
            }, 10000);
            
            alert('🎤 جاري التسجيل... اضغط OK للإيقاف');
        }).catch(err => {
            alert('لا يمكن الوصول للميكروفون');
        });
    
    document.getElementById('attachmentMenu').style.display = 'none';
};

window.shareLocation = function() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords;
            const locationUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
            ChatSystem.sendMessage(`📍 موقعي: ${locationUrl}`);
            
            ChatSystem.displayMessage({
                type: 'text',
                text: `📍 موقعي: ${locationUrl}`,
                time: new Date().toISOString()
            });
        }, (error) => {
            alert('خطأ في الحصول على الموقع: ' + error.message);
        });
    } else {
        alert('الموقع غير مدعوم في متصفحك');
    }
    document.getElementById('attachmentMenu').style.display = 'none';
};

// ========== دوال المكالمات (مربوطة مع p2p.js) ==========

window.startVideoCall = function() {
    console.log('🚀 محاولة بدء مكالمة فيديو');
    
    if (!ChatSystem.currentChat) {
        alert('❌ لا توجد محادثة مفتوحة');
        return;
    }
    
    if (!p2pCall) {
        console.log('⏳ نظام P2P ليس جاهزاً، محاولة التهيئة...');
        initP2PCallSystem();
        
        setTimeout(() => {
            if (p2pCall) {
                p2pCall.startVideoCall(ChatSystem.currentChat);
            } else {
                alert('❌ نظام المكالمات لم يكتمل بعد، حاول مرة أخرى');
            }
        }, 1500);
        return;
    }
    
    p2pCall.startVideoCall(ChatSystem.currentChat);
};

window.startVoiceCall = function() {
    console.log('🚀 محاولة بدء مكالمة صوتية');
    
    if (!ChatSystem.currentChat) {
        alert('❌ لا توجد محادثة مفتوحة');
        return;
    }
    
    if (!p2pCall) {
        console.log('⏳ نظام P2P ليس جاهزاً، محاولة التهيئة...');
        initP2PCallSystem();
        
        setTimeout(() => {
            if (p2pCall) {
                p2pCall.startVoiceCall(ChatSystem.currentChat);
            } else {
                alert('❌ نظام المكالمات لم يكتمل بعد، حاول مرة أخرى');
            }
        }, 1500);
        return;
    }
    
    p2pCall.startVoiceCall(ChatSystem.currentChat);
};

window.endCall = function() {
    if (p2pCall) {
        p2pCall.endCall();
    }
};

window.toggleMute = function() {
    if (p2pCall) {
        p2pCall.toggleMute();
    }
};

window.toggleCamera = function() {
    if (p2pCall) {
        p2pCall.toggleCamera();
    }
};

window.closeConversation = function() {
    ChatSystem.closeChat();
};

// ========== باقي الدوال ==========

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
    
    if (!newName) {
        alert('الرجاء إدخال الاسم');
        return;
    }
    
    if (newName.length > 25) {
        alert('الاسم يجب أن لا يتجاوز 25 حرف');
        return;
    }
    
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
    document.querySelectorAll('.profile-subpage').forEach(page => {
        page.style.display = 'none';
    });
    
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
        db.collection('users').doc(auth.currentUser.uid).update({
            avatarType: type
        }).catch(error => console.error('Error updating avatar:', error));
    }
    
    closeModal();
};

window.openAvatarModal = function() {
    const modal = document.getElementById('avatarModal');
    if (modal) modal.classList.add('active');
};

document.addEventListener('languageChanged', function() {
    console.log('Language changed');
    if (document.querySelector('.chat-page').style.display === 'block') {
        loadChats();
    }
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
            if (permission === 'granted') {
                new Notification(title, { body: message });
            }
        });
    }
};

if ('Notification' in window) {
    Notification.requestPermission();
}

console.log('✅ app.js محدث - نظام متكامل مع P2P مبسط');

سؤال هل هذا الملف به اخطاء جاوبني على هذا السؤال فقط
