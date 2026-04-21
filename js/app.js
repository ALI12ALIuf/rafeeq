// ========== التطبيق الرئيسي ==========

// تحميل قائمة المحادثات
async function loadChats() {
    if (!window.auth.currentUser) return;
    
    const chatsList = document.getElementById('chatsList');
    if (!chatsList) return;
    
    try {
        // الحصول على قائمة الأصدقاء
        const userDoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
        const friends = userDoc.data().friends || [];
        
        if (friends.length === 0) {
            chatsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-plus"></i>
                    <p>لا يوجد أصدقاء بعد</p>
                    <p class="small">ابحث عن مستخدم باستخدام المعرف الخاص به</p>
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
                    
                    // الحصول على آخر رسالة
                    const key = `chat_${friendId}`;
                    let lastMessage = 'اضغط لبدء المحادثة';
                    let lastTime = '';
                    
                    try {
                        const history = JSON.parse(localStorage.getItem(key)) || [];
                        if (history.length > 0) {
                            const last = history[history.length - 1];
                            if (last.type === 'text') {
                                lastMessage = 'رسالة مشفرة';
                            } else if (last.type === 'image') {
                                lastMessage = '📷 صورة';
                            } else if (last.type === 'voice') {
                                lastMessage = '🎤 بصمة';
                            } else if (last.type === 'file') {
                                lastMessage = '📎 ملف';
                            }
                            lastTime = new Date(last.timestamp).toLocaleTimeString('ar-EG', {
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                        }
                    } catch (e) {}
                    
                    // حالة الاتصال
                    const isOnline = friend.online;
                    const connectionType = window.p2pManager.isConnected(friendId) ? '🔒' : (isOnline ? '🟢' : '⚫');
                    
                    html += `
                        <div class="chat-item" onclick="openChat('${friendId}', '${friend.name}', '${friend.avatar}')">
                            <div class="chat-avatar">${friend.avatar}</div>
                            <div class="chat-info">
                                <h4>${friend.name}</h4>
                                <p class="last-message">${lastMessage}</p>
                            </div>
                            <div class="chat-meta">
                                <span class="chat-time">${lastTime}</span>
                                <span class="connection-status">${connectionType}</span>
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
                <p>خطأ في تحميل المحادثات</p>
            </div>
        `;
    }
}

// فتح محادثة
async function openChat(userId, userName, userAvatar) {
    await window.chatManager.openChat(userId, userName, userAvatar);
}

// إرسال رسالة
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (message) {
        await window.chatManager.sendTextMessage(message);
        input.value = '';
    }
}

// البحث عن مستخدم
async function searchUser() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.trim();
    const resultsDiv = document.getElementById('searchResults');
    
    if (!query) {
        resultsDiv.style.display = 'none';
        return;
    }
    
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<div class="search-loading">جاري البحث...</div>';
    
    try {
        const snapshot = await window.db.collection('users')
            .where('shareableId', '==', query)
            .get();
        
        if (snapshot.empty) {
            resultsDiv.innerHTML = '<div class="search-no-results">لا يوجد مستخدم بهذا المعرف</div>';
            return;
        }
        
        const user = snapshot.docs[0].data();
        const userId = snapshot.docs[0].id;
        const currentUser = window.auth.currentUser;
        
        if (userId === currentUser.uid) {
            resultsDiv.innerHTML = '<div class="search-no-results">هذا حسابك الشخصي</div>';
            return;
        }
        
        // التحقق من الصداقة
        const currentUserDoc = await window.db.collection('users').doc(currentUser.uid).get();
        const friends = currentUserDoc.data().friends || [];
        const isFriend = friends.includes(userId);
        
        resultsDiv.innerHTML = `
            <div class="search-result">
                <div class="search-result-avatar">${user.avatar}</div>
                <div class="search-result-info">
                    <h4>${user.name}</h4>
                    <p>${user.shareableId}</p>
                </div>
                ${!isFriend ? 
                    `<button class="add-friend-btn" onclick="addFriend('${userId}')">إضافة صديق</button>` :
                    `<button class="chat-btn" onclick="openChat('${userId}', '${user.name}', '${user.avatar}')">محادثة</button>`
                }
            </div>
        `;
        
    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = '<div class="search-error">حدث خطأ في البحث</div>';
    }
}

// إضافة صديق
async function addFriend(userId) {
    if (!window.auth.currentUser) return;
    
    try {
        const currentUserId = window.auth.currentUser.uid;
        
        // إضافة الصديق لكلا الطرفين
        await window.db.collection('users').doc(currentUserId).update({
            friends: firebase.firestore.FieldValue.arrayUnion(userId)
        });
        
        await window.db.collection('users').doc(userId).update({
            friends: firebase.firestore.FieldValue.arrayUnion(currentUserId)
        });
        
        alert('تم إضافة الصديق بنجاح');
        document.getElementById('searchResults').style.display = 'none';
        document.getElementById('searchInput').value = '';
        loadChats();
        
    } catch (error) {
        console.error('Error adding friend:', error);
        alert('حدث خطأ في إضافة الصديق');
    }
}

// إغلاق المحادثة
function closeChat() {
    window.chatManager.closeChat();
}

// إظهار حالة التشفير
function showEncryptionStatus() {
    const modal = document.getElementById('encryptionModal');
    const connectionType = document.getElementById('connectionBadge').querySelector('span:last-child').textContent;
    
    document.getElementById('encConnectionType').textContent = connectionType;
    document.getElementById('keyFingerprint').textContent = '🔒 مشفر بـ AES-256-GCM';
    
    modal.style.display = 'flex';
}

// إرسال صورة
async function sendImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await window.chatManager.sendFile(file, 'image');
        }
    };
    input.click();
    document.getElementById('attachmentMenu').style.display = 'none';
}

// إرسال ملف
async function sendFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await window.chatManager.sendFile(file, 'file');
        }
    };
    input.click();
    document.getElementById('attachmentMenu').style.display = 'none';
}

// تسجيل بصمة صوتية
let mediaRecorder = null;
let audioChunks = [];

async function startVoiceRecording() {
    const modal = document.getElementById('voiceModal');
    modal.style.display = 'flex';
    
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (e) => {
        audioChunks.push(e.data);
    };
    
    mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
        await window.chatManager.sendFile(file, 'voice');
        
        stream.getTracks().forEach(track => track.stop());
        modal.style.display = 'none';
    };
    
    mediaRecorder.start();
    
    // تحديث الواجهة
    document.getElementById('startRecordBtn').style.display = 'none';
    document.getElementById('stopRecordBtn').style.display = 'inline-flex';
    
    // مؤقت التسجيل
    let seconds = 0;
    const timer = setInterval(() => {
        seconds++;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        document.getElementById('voiceTimer').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
    
    window.stopVoiceRecording = () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            clearInterval(timer);
        }
        document.getElementById('startRecordBtn').style.display = 'inline-flex';
        document.getElementById('stopRecordBtn').style.display = 'none';
    };
}

// إعداد مستمعي الأحداث
function setupEventListeners() {
    // تسجيل الدخول
    document.getElementById('googleLoginBtn')?.addEventListener('click', signInWithGoogle);
    
    // تسجيل الخروج
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    
    // إرسال رسالة
    document.getElementById('sendBtn')?.addEventListener('click', sendMessage);
    document.getElementById('messageInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // البحث
    document.getElementById('searchInput')?.addEventListener('input', searchUser);
    
    // إغلاق المحادثة
    document.getElementById('chatHeader')?.querySelector('.back-btn')?.addEventListener('click', closeChat);
    
    // أزرار المرفقات
    document.getElementById('attachBtn')?.addEventListener('click', () => {
        const menu = document.getElementById('attachmentMenu');
        menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    });
    
    document.getElementById('imageBtn')?.addEventListener('click', sendImage);
    document.getElementById('fileBtn')?.addEventListener('click', sendFile);
    document.getElementById('voiceBtn')?.addEventListener('click', startVoiceRecording);
    
    // حالة التشفير
    document.getElementById('encryptionStatusBtn')?.addEventListener('click', showEncryptionStatus);
    
    // إغلاق النوافذ المنبثقة
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
        });
    });
    
    // إغلاق النافذة عند النقر خارجها
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
}

// تهيئة التطبيق
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    
    // تهيئة مدير الدردشة عند تحميل المستخدم
    window.auth.onAuthStateChanged((user) => {
        if (user) {
            window.chatManager.init(user);
        }
    });
    
    console.log('✅ App initialized');
});

// دوال عامة للاستخدام من HTML
window.openChat = openChat;
window.addFriend = addFriend;
window.closeChat = closeChat;
window.stopVoiceRecording = stopVoiceRecording;
