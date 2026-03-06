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

// دالة تنسيق الأرقام (يجب أن تكون متطابقة مع الموجودة في auth.js)
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
        // حساب عدد الرحلات المنتهية للمستخدم الحالي
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
    
    subpages.forEach(page => {
        page.style.display = 'none';
    });
    
    pages.forEach(page => {
        if (page.classList.contains('active')) {
            page.style.display = 'block';
        } else {
            page.style.display = 'none';
        }
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
        
        // إخفاء الصفحات الأخرى
        pages.forEach(page => {
            if (!page.classList.contains('active')) {
                page.style.display = 'none';
            }
        });
        
        // إخفاء الصفحات الفرعية
        document.querySelectorAll('.profile-subpage').forEach(sp => {
            sp.style.display = 'none';
        });
        
        // إذا كانت الصفحة المحددة هي الدردشة، قم بتحميل المحادثات
        if (pageId === 'chat') {
            loadChats();
        }
        
        // إخفاء صفحة المحادثة الفردية عند التبديل
        const conversationPage = document.getElementById('conversationPage');
        if (conversationPage) {
            conversationPage.style.display = 'none';
        }
        
        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageId);
        });
        
        const sideMenu = document.getElementById('sideMenu');
        if (sideMenu) sideMenu.classList.remove('open');
    }
    
    navItems.forEach(item => {
        item.addEventListener('click', () => switchPage(item.dataset.page));
    });
    
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
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
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

// ========== نظام الدردشة الجديد (بسيط مثل واتساب) ==========

// نظام المحادثات المحلي
const ChatSystem = {
    currentChat: null,
    messages: {},
    
    // تهيئة النظام
    init() {
        this.loadAllChats();
    },
    
    // تحميل كل المحادثات من localStorage
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
    
    // فتح محادثة مع صديق
    openChat(friendId, friendName, friendAvatar) {
        this.currentChat = friendId;
        
        // تحديث واجهة المحادثة
        const nameElement = document.getElementById('conversationName');
        const avatarElement = document.getElementById('conversationAvatar');
        
        if (nameElement) nameElement.textContent = friendName;
        if (avatarElement) avatarElement.textContent = friendAvatar || '👤';
        
        // إظهار صفحة المحادثة
        document.querySelector('.chat-page').style.display = 'none';
        document.getElementById('conversationPage').style.display = 'block';
        
        // مسح وعرض الرسائل
        this.displayMessages(friendId);
        
        // بدء الاستماع للرسائل الجديدة
        this.listenForNewMessages(friendId);
        
        // تمرير لآخر رسالة
        setTimeout(() => {
            const container = document.getElementById('messagesContainer');
            if (container) container.scrollTop = container.scrollHeight;
        }, 100);
    },
    
    // عرض رسائل محادثة
    displayMessages(friendId) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        const messages = this.messages[friendId] || [];
        messages.forEach(msg => this.displayMessage(msg));
    },
    
    // عرض رسالة واحدة
    displayMessage(msg) {
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.sender === 'me' ? 'sent' : 'received'}`;
        
        const time = new Date(msg.time).toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageDiv.innerHTML = `
            <div class="message-content">${this.escapeHtml(msg.text)}</div>
            <div class="message-time">${time}</div>
        `;
        
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    },
    
    // إرسال رسالة
    async sendMessage(text) {
        if (!this.currentChat || !text.trim()) return false;
        
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
        try {
            await window.db.collection('temp_messages').add({
                to: this.currentChat,
                from: window.auth.currentUser.uid,
                message: message,
                timestamp: new Date(),
                expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // أسبوع
            });
        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
        }
        
        return true;
    },
    
    // حفظ رسالة في localStorage
    saveMessage(friendId, message) {
        const key = `chat_${friendId}`;
        let history = [];
        
        try {
            history = JSON.parse(localStorage.getItem(key)) || [];
        } catch (e) {
            history = [];
        }
        
        history.push(message);
        
        // احتفظ بآخر 100 رسالة فقط
        if (history.length > 100) history = history.slice(-100);
        
        localStorage.setItem(key, JSON.stringify(history));
        this.messages[friendId] = history;
    },
    
    // الاستماع للرسائل الجديدة
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
                        
                        // حفظ عندي
                        this.saveMessage(friendId, message);
                        
                        // إذا كنت في هذه المحادثة، اعرضها
                        if (this.currentChat === friendId) {
                            this.displayMessage(message);
                        } else {
                            // تحديث آخر رسالة في قائمة المحادثات
                            this.updateLastMessage(friendId, message.text);
                        }
                        
                        // حذف من Firebase بعد الاستلام
                        change.doc.ref.delete();
                    }
                });
            });
    },
    
    // تحديث آخر رسالة في قائمة المحادثات
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
        document.getElementById('conversationPage').style.display = 'none';
        document.querySelector('.chat-page').style.display = 'block';
        this.currentChat = null;
    },
    
    // الهروب من HTML
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
        // جلب قائمة الأصدقاء
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
                    
                    // جلب آخر رسالة من localStorage
                    const key = `chat_${friendId}`;
                    let lastMessage = 'اضغط لبدء المحادثة';
                    let lastTime = '';
                    
                    try {
                        const history = JSON.parse(localStorage.getItem(key)) || [];
                        if (history.length > 0) {
                            const last = history[history.length - 1];
                            lastMessage = last.text;
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
    // إخفاء قائمة المرفقات عند النقر خارجها
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('attachmentMenu');
        const attachBtn = document.querySelector('.attach-btn');
        if (menu && attachBtn && !menu.contains(e.target) && !attachBtn.contains(e.target)) {
            menu.style.display = 'none';
        }
    });
    
    // مستمع للرسائل من Firebase (عام)
    if (window.auth?.currentUser) {
        window.db.collection('temp_messages')
            .where('to', '==', window.auth.currentUser.uid)
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        
                        // تحديث قائمة المحادثات إذا لزم الأمر
                        loadChats();
                    }
                });
            });
    }
}

// دوال عامة للواجهة
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

window.closeConversation = function() {
    ChatSystem.closeChat();
};

// ========== نهاية نظام الدردشة ==========

// فتح نافذة تعديل الملف الشخصي
window.openEditProfileModal = function() {
    // تعبئة البيانات الحالية
    const currentName = document.getElementById('profileName').textContent;
    const currentNameInput = document.getElementById('editName');
    if (currentNameInput) {
        currentNameInput.value = currentName;
    }
    
    // تحديث الملصق الحالي
    const currentEmoji = document.getElementById('profileAvatarEmoji').textContent;
    const currentAvatarEmoji = document.getElementById('currentAvatarEmoji');
    if (currentAvatarEmoji) {
        currentAvatarEmoji.textContent = currentEmoji;
    }
    
    // فتح النافذة
    document.getElementById('editProfileModal').classList.add('active');
};

// حفظ التغييرات
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
    
    // حفظ في Firebase
    if (auth && auth.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({
            name: newName
        }).then(() => {
            // تحديث واجهة المستخدم
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

// دوال الملف الشخصي
window.showUserTrips = function() {
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('tripsPage').style.display = 'block';
    
    // هنا تجيب بيانات الرحلات من Firebase
    loadUserTrips();
};

// تحميل بيانات الرحلات
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
        
        // تحديث عدد الرحلات في الملف الشخصي
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

// عرض تفاصيل رحلة
window.viewTripDetails = function(tripId) {
    alert('تفاصيل الرحلة - معرف: ' + tripId);
    // يمكن تطويرها لاحقاً
};

// دالة الرجوع للخلف
window.goBack = function() {
    // إخفاء جميع الصفحات الفرعية
    document.querySelectorAll('.profile-subpage').forEach(page => {
        page.style.display = 'none';
    });
    
    // إظهار صفحة الملف الشخصي الرئيسية
    document.querySelector('.profile-page').style.display = 'block';
    document.querySelector('.profile-page').classList.add('active');
    
    // التأكد من أن باقي الصفحات الرئيسية مخفية
    document.querySelectorAll('.page').forEach(page => {
        if (!page.classList.contains('profile-page')) {
            page.style.display = 'none';
            page.classList.remove('active');
        }
    });
};

// دالة اختيار الملصق
window.selectAvatar = function(type) {
    const emojiMap = {
        'male': '👨',
        'female': '👩',
        'boy': '🧒',
        'girl': '👧',
        'father': '👨‍🦳',
        'mother': '👩‍🦳',
        'grandfather': '👴',
        'grandmother': '👵'
    };
    
    const selectedEmoji = emojiMap[type] || '👤';
    
    // تحديث الملصق في الملف الشخصي
    const profileAvatar = document.getElementById('profileAvatarEmoji');
    if (profileAvatar) {
        profileAvatar.textContent = selectedEmoji;
    }
    
    // تحديث الملصق في نافذة التعديل
    const currentAvatar = document.getElementById('currentAvatarEmoji');
    if (currentAvatar) {
        currentAvatar.textContent = selectedEmoji;
    }
    
    // تحديث الملصق في القائمة الجانبية
    const menuAvatar = document.getElementById('menuAvatarEmoji');
    if (menuAvatar) {
        menuAvatar.textContent = selectedEmoji;
    }
    
    // حفظ الاختيار في Firebase
    if (auth && auth.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({
            avatarType: type
        }).then(() => {
            console.log('Avatar updated successfully');
        }).catch(error => {
            console.error('Error updating avatar:', error);
        });
    }
    
    closeModal();
};

// فتح نافذة اختيار الملصق
window.openAvatarModal = function() {
    const modal = document.getElementById('avatarModal');
    if (modal) modal.classList.add('active');
};

// تحديث القوائم عند تغيير اللغة
document.addEventListener('languageChanged', function() {
    console.log('Language changed');
    // إعادة تحميل المحادثات إذا كانت الصفحة الحالية هي الدردشة
    if (document.querySelector('.chat-page').style.display === 'block') {
        loadChats();
    }
});

// دالة للحصول على الملصق المناسب (مشتركة مع auth.js)
window.getEmojiForUser = function(userData) {
    const emojiMap = {
        'male': '👨',
        'female': '👩',
        'boy': '🧒',
        'girl': '👧',
        'father': '👨‍🦳',
        'mother': '👩‍🦳',
        'grandfather': '👴',
        'grandmother': '👵'
    };
    return emojiMap[userData?.avatarType] || '👤';
};

// دالة مساعدة لمسح رسائل المحادثة عند الإغلاق
window.clearMessages = function() {
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.innerHTML = '';
    }
};

// دالة لعرض إشعار
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

// طلب إذن الإشعارات عند تحميل التطبيق
if ('Notification' in window) {
    Notification.requestPermission();
}

// ========== إزالة جميع دوال WebRTC القديمة ==========
// تم إزالة: toggleVideoCall, toggleVoiceCall, endCall, toggleMute, toggleCamera,
// showAttachmentMenu, sendImage, sendFile, sendVoiceNote, shareLocation
// وكل ما يتعلق بـ WebRTC

console.log('✅ app.js محدث - نظام دردشة بسيط مثل واتساب');
