// ========== ui-functions.js - النسخة المعدلة (دعم طلبات الصداقة في الدردشة) ==========
// وظائف الواجهة العامة

// ==================== القسم 1: مكدس تتبع الصفحات للرجوع المتسلسل ====================
window._pageStack = [];

function pushPage(pageType, pageId) {
    window._pageStack.push({ type: pageType, id: pageId });
}

function popPage() {
    if (window._pageStack.length > 0) {
        return window._pageStack.pop();
    }
    return null;
}

function clearStack() {
    window._pageStack = [];
}

// ==================== القسم 2: تحميل المحادثات (معدل - دعم غير الأصدقاء بطلبات معلقة) ====================
let chatsLoaded = false;

async function loadChats(force = false) { 
    if (!window.auth || !window.auth.currentUser) return; 
    const list = document.getElementById('chatsList'); 
    if (!list) return; 
    
    if (chatsLoaded && !force) {
        console.log('⏭️ قائمة المحادثات محملة مسبقاً، تخطي التحميل');
        return;
    }
    
    const template = ChatSystem.chatItemTemplate || document.getElementById('chatItemTemplate');
    if (!template) {
        console.warn('⚠️ قالب chatItemTemplate غير موجود');
        return;
    }
    
    try { 
        // جلب قائمة المحادثات من localStorage
        const chats = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('chat_')) {
                const friendId = key.replace('chat_', '');
                const messages = JSON.parse(localStorage.getItem(key)) || [];
                if (messages.length > 0) {
                    chats.push({ friendId, lastMessage: messages[messages.length - 1] });
                }
            }
        }
        
        // ترتيب المحادثات حسب الوقت (الأحدث أولاً)
        chats.sort((a, b) => new Date(b.lastMessage.time || b.lastMessage.timestamp) - new Date(a.lastMessage.time || a.lastMessage.timestamp));
        
        list.innerHTML = '';
        
        if (!chats.length) { 
            list.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>لا توجد محادثات</h3><p>أضف أصدقاء لبدء المحادثة</p></div>`; 
            chatsLoaded = true;
            return; 
        } 
        
        for (const chat of chats) { 
            const fid = chat.friendId;
            const l = chat.lastMessage;
            try { 
                const fdoc = await window.db.collection('users').doc(fid).get(); 
                if (fdoc.exists) { 
                    const f = fdoc.data(); 
                    let lm = 'اضغط لبدء المحادثة', lt = ''; 
                    
                    if (l.type === 'text') lm = l.text.length > 30 ? l.text.substring(0, 30) + '...' : l.text; 
                    else if (l.type === 'image') lm = '📷 صورة'; 
                    else if (l.type === 'voice') lm = '🎤 بصمة صوتية'; 
                    else if (l.type === 'video') lm = '🎥 فيديو'; 
                    else if (l.type === 'file') lm = '📎 ملف'; 
                    else if (l.type === 'location') lm = '📍 موقع';
                    else if (l.type === 'friend_request_card') lm = '👤 طلب صداقة';
                    else if (l.type === 'friend_request_status') lm = '🔔 حالة الطلب';
                    
                    const date = new Date(l.time || l.timestamp);
                    lt = date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); 
                    
                    const clone = template.content.cloneNode(true);
                    const chatItem = clone.querySelector('.chat-item');
                    
                    const avatar = chatItem.querySelector('.chat-avatar-emoji');
                    const name = chatItem.querySelector('.chat-info h4');
                    const lastMsg = chatItem.querySelector('.last-message');
                    const time = chatItem.querySelector('.chat-time');
                    
                    if (avatar) avatar.textContent = window.getEmojiForUser ? window.getEmojiForUser(f) : (f.avatarEmoji || '👤');
                    if (name) name.textContent = f.name || 'مستخدم';
                    if (lastMsg) lastMsg.textContent = lm;
                    if (time) time.textContent = lt || '';
                    
                    chatItem.onclick = () => openChat(fid);
                    
                    list.appendChild(clone);
                } 
            } catch (e) {
                console.warn('خطأ في تحميل محادثة:', e);
            } 
        } 
        
        chatsLoaded = true;
    } catch (e) {
        console.error('خطأ في loadChats:', e);
        list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>حدث خطأ</h3><p>حاول تحديث الصفحة</p></div>`;
        chatsLoaded = true;
    } 
}

function refreshChats() {
    chatsLoaded = false;
    loadChats(true);
}

// ==================== القسم 3: إعداد مستمعي الواجهة ====================
function setupChatListeners() { 
    document.addEventListener('click', e => { 
        const m = document.getElementById('attachmentMenu'); 
        const ab = document.querySelector('.attach-btn'); 
        if (m && ab && !m.contains(e.target) && !ab.contains(e.target)) {
            m.style.display = 'none'; 
        }
    }); 
}

// ==================== القسم 4: فتح محادثة ====================
window.openChat = friendId => {
    if (document.getElementById('friendsPage') && document.getElementById('friendsPage').style.display === 'block') {
        pushPage('subpage', 'friendsPage');
    } else if (document.getElementById('tripsPage') && document.getElementById('tripsPage').style.display === 'block') {
        pushPage('subpage', 'tripsPage');
    } else if (document.querySelector('.profile-page') && getComputedStyle(document.querySelector('.profile-page')).display === 'block') {
        pushPage('page', 'profile');
    } else {
        pushPage('page', 'chat');
    }
    
    ChatSystem.openChat(friendId);
};

// ==================== بقية الدوال (بدون تغيير كبير) ====================
window.sendMessage = () => { 
    const inp = document.getElementById('messageInput'); 
    if (inp && inp.value.trim()) {
        ChatSystem.sendMessage(inp.value.trim()).then(s => { 
            if (s) { 
                inp.value = ''; 
                inp.style.height = 'auto';
                if (typeof window.toggleSendButton === 'function') {
                    window.toggleSendButton();
                }
            } 
        }); 
    }
};

window.handleMessageKeyPress = e => { 
    if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        if (typeof window.handleActionButton === 'function') {
            window.handleActionButton();
        } else {
            window.sendMessage();
        }
    } 
};

// ... (بقية دوال التسجيل الصوتي تظل كما هي)
