// ========== ui-functions.js ==========
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

// ==================== القسم 2: تحميل المحادثات ====================
async function loadChats() { 
    if (!window.auth || !window.auth.currentUser) return; 
    const list = document.getElementById('chatsList'); 
    if (!list) return; 
    try { 
        const udoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); 
        if (!udoc.exists) return; 
        const friends = udoc.data().friends || []; 
        if (!friends.length) { 
            list.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>لا توجد محادثات</h3><p>أضف أصدقاء لبدء المحادثة</p></div>`; 
            return; 
        } 
        let html = ''; 
        for (const fid of friends) { 
            try { 
                const fdoc = await window.db.collection('users').doc(fid).get(); 
                if (fdoc.exists) { 
                    const f = fdoc.data(); 
                    const key = `chat_${fid}`; 
                    let lm = 'اضغط لبدء المحادثة', lt = ''; 
                    try { 
                        const h = JSON.parse(localStorage.getItem(key)) || []; 
                        if (h.length > 0) { 
                            const l = h[h.length - 1]; 
                            if (l.type === 'text') lm = l.text.length > 30 ? l.text.substring(0, 30) + '...' : l.text; 
                            else if (l.type === 'image') lm = '📷 صورة'; 
                            else if (l.type === 'voice') lm = '🎤 بصمة صوتية'; 
                            else if (l.type === 'video') lm = '🎥 فيديو'; 
                            else if (l.type === 'file') lm = '📎 ملف'; 
                            lt = new Date(l.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); 
                        } 
                    } catch (e) {} 
                    html += `<div class="chat-item" onclick="openChat('${fid}')"><div class="chat-avatar-emoji">${window.getEmojiForUser(f)}</div><div class="chat-info"><h4>${f.name || 'مستخدم'}</h4><p class="last-message">${lm}</p></div><div class="chat-meta"><span class="chat-time">${lt || ''}</span></div></div>`; 
                } 
            } catch (e) {} 
        } 
        list.innerHTML = html || `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد محادثات نشطة</h3><p>ابدأ بإضافة أصدقاء جدد</p></div>`; 
    } catch (e) {} 
}

// ==================== القسم 3: إعداد مستمعي الواجهة ====================
function setupChatListeners() { 
    document.addEventListener('click', e => { 
        const m = document.getElementById('attachmentMenu'), ab = document.querySelector('.attach-btn'); 
        if (m && ab && !m.contains(e.target) && !ab.contains(e.target)) m.style.display = 'none'; 
        const ep = document.getElementById('emojiPicker'), eb = document.querySelector('.emoji-btn'); 
        if (ep && eb && !ep.contains(e.target) && !eb.contains(e.target)) ep.style.display = 'none'; 
    }); 
}

// ==================== القسم 4: فتح محادثة ====================
window.openChat = friendId => {
    if (document.getElementById('friendsPage') && document.getElementById('friendsPage').style.display === 'block') {
        pushPage('subpage', 'friendsPage');
    } else if (document.getElementById('friendRequestsPage') && document.getElementById('friendRequestsPage').style.display === 'block') {
        pushPage('subpage', 'friendRequestsPage');
    } else if (document.getElementById('tripsPage') && document.getElementById('tripsPage').style.display === 'block') {
        pushPage('subpage', 'tripsPage');
    } else if (document.querySelector('.profile-page') && getComputedStyle(document.querySelector('.profile-page')).display === 'block') {
        pushPage('page', 'profile');
    } else {
        pushPage('page', 'chat');
    }
    
    window.db.collection('users').doc(friendId).get().then(doc => {
        if (doc.exists) {
            const f = doc.data();
            ChatSystem.openChat(friendId, f.name, window.getEmojiForUser ? window.getEmojiForUser(f) : '👤');
        }
    }).catch(() => {});
};

// ==================== القسم 5: وظائف إرسال الرسائل ====================
window.sendMessage = () => { 
    const inp = document.getElementById('messageInput'); 
    if (inp && inp.value.trim()) ChatSystem.sendMessage(inp.value.trim()).then(s => { 
        if (s) { 
            inp.value = ''; 
            inp.style.height = 'auto'; 
        } 
    }); 
};

window.handleMessageKeyPress = e => { 
    if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        window.sendMessage(); 
    } 
};

// ==================== القسم 6: قائمة المرفقات والإيموجي ====================
window.showAttachmentMenu = () => { 
    const m = document.getElementById('attachmentMenu'); 
    if (m) m.style.display = m.style.display === 'none' ? 'flex' : 'none'; 
    const ep = document.getElementById('emojiPicker'); 
    if (ep) ep.style.display = 'none'; 
};

window.showEmojiPicker = () => { 
    const p = document.getElementById('emojiPicker'); 
    if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none'; 
    const m = document.getElementById('attachmentMenu'); 
    if (m) m.style.display = 'none'; 
};

// ==================== القسم 7: إرسال الملفات ====================
window.sendImage = () => { 
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = 'image/*'; 
    i.onchange = e => { 
        const f = e.target.files[0]; 
        if (f && ChatSystem.currentChat) ChatSystem.sendImage(f); 
    }; 
    i.click(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

window.sendVideo = () => { 
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = 'video/*'; 
    i.onchange = e => { 
        const f = e.target.files[0]; 
        if (f && ChatSystem.currentChat) ChatSystem.sendVideoFile(f); 
    }; 
    i.click(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

window.sendFile = () => { 
    const i = document.createElement('input'); 
    i.type = 'file'; 
    i.accept = '*/*'; 
    i.onchange = e => { 
        const f = e.target.files[0]; 
        if (f && ChatSystem.currentChat) ChatSystem.sendFile(f); 
    }; 
    i.click(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

window.sendVoiceNote = () => { 
    if (!navigator.mediaDevices?.getUserMedia) { 
        alert('المتصفح لا يدعم تسجيل الصوت'); 
        return; 
    } 
    navigator.mediaDevices.getUserMedia({ audio: true }).then(s => { 
        const mr = new MediaRecorder(s); 
        const ch = []; 
        mr.ondataavailable = e => { 
            if (e.data.size > 0) ch.push(e.data); 
        }; 
        mr.onstop = () => { 
            s.getTracks().forEach(t => t.stop()); 
            const blob = new Blob(ch, { type: 'audio/webm' }); 
            if (blob.size > 0) ChatSystem.sendVoiceNote(blob); 
            const sb = document.querySelector('.send-btn'), vb = document.querySelector('.voice-btn'); 
            if (sb) sb.style.display = 'flex'; 
            if (vb) vb.style.display = 'none'; 
        }; 
        mr.start(); 
        const sb = document.querySelector('.send-btn'), vb = document.querySelector('.voice-btn'); 
        if (sb) sb.style.display = 'none'; 
        if (vb) { 
            vb.style.display = 'flex'; 
            vb.onclick = () => { 
                if (mr.state === 'recording') mr.stop(); 
            }; 
        } 
        setTimeout(() => { 
            if (mr.state === 'recording') mr.stop(); 
        }, 900000); 
    }).catch(() => alert('يرجى السماح بالوصول إلى الميكروفون')); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

// ==================== القسم 8: مشاركة الموقع ====================
window.shareLocation = () => { 
    ChatSystem.shareLocationDirect(); 
    document.getElementById('attachmentMenu').style.display = 'none'; 
};

// ==================== القسم 9: إغلاق المحادثة ====================
window.closeConversation = () => { 
    CallSystem.endCall(); 
    ChatSystem.closeChat();
    
    setTimeout(() => {
        const lastPage = popPage();
        
        document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
        document.querySelectorAll('.profile-subpage').forEach(s => s.style.display = 'none');
        document.body.classList.remove('profile-subpage-open');
        
        if (lastPage && lastPage.type === 'subpage') {
            document.body.classList.add('profile-subpage-open');
            document.querySelector('.profile-page').style.display = 'none';
            if (lastPage.id && document.getElementById(lastPage.id)) {
                document.getElementById(lastPage.id).style.display = 'block';
            }
            document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); if (n.dataset.page === 'profile') n.classList.add('active'); });
        } else if (lastPage && lastPage.type === 'page' && lastPage.id === 'profile') {
            document.querySelector('.profile-page').classList.add('active');
            document.querySelector('.profile-page').style.display = 'block';
            document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); if (n.dataset.page === 'profile') n.classList.add('active'); });
        } else {
            document.querySelector('.chat-page').classList.add('active');
            document.querySelector('.chat-page').style.display = 'block';
            loadChats();
            document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); if (n.dataset.page === 'chat') n.classList.add('active'); });
        }
    }, 200);
};

// ==================== القسم 10: تعديل الملف الشخصي ====================
window.openEditProfileModal = () => { 
    const nameInput = document.getElementById('editName'); 
    const currentName = document.getElementById('profileName')?.textContent; 
    const currentEmoji = document.getElementById('profileAvatarEmoji')?.textContent; 
    if (nameInput) nameInput.value = currentName || ''; 
    const avatarPreview = document.getElementById('currentAvatarEmoji'); 
    if (avatarPreview) avatarPreview.textContent = currentEmoji || '👤'; 
    document.getElementById('editProfileModal')?.classList.add('active'); 
};

window.saveProfile = () => { 
    const n = document.getElementById('editName')?.value?.trim(); 
    if (!n || n.length > 25) { 
        alert('الاسم مطلوب ولا يزيد عن 25 حرف'); 
        return; 
    } 
    if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ name: n }).then(() => { 
        const nameEl = document.getElementById('profileName'); 
        if (nameEl) nameEl.textContent = n; 
        closeModal(); 
    }).catch(() => alert('فشل حفظ التغييرات')); 
};

// ==================== القسم 11: الصفحات الفرعية ====================
window.showUserTrips = () => {
    pushPage('page', 'profile');
    document.body.classList.add('profile-subpage-open');
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('tripsPage').style.display = 'block';
};

window.showFriendsList = () => {
    pushPage('page', 'profile');
    document.body.classList.add('profile-subpage-open');
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('friendsPage').style.display = 'block';
};

window.showFriendRequests = () => {
    pushPage('page', 'profile');
    document.body.classList.add('profile-subpage-open');
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('friendRequestsPage').style.display = 'block';
};

// ==================== القسم 12: الرجوع من صفحة فرعية ====================
window.goBack = () => {
    const lastPage = popPage();
    
    document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none');
    document.body.classList.remove('profile-subpage-open');
    
    if (lastPage && lastPage.type === 'page' && lastPage.id === 'profile') {
        document.querySelector('.profile-page').style.display = 'block';
        document.querySelector('.profile-page').classList.add('active');
    } else {
        document.querySelector('.profile-page').style.display = 'block';
        document.querySelector('.profile-page').classList.add('active');
    }
};

// ==================== القسم 13: الصورة الرمزية ====================
window.selectAvatar = t => { 
    const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; 
    const e = m[t] || '👤'; 
    const profileAvatar = document.getElementById('profileAvatarEmoji'), currentAvatar = document.getElementById('currentAvatarEmoji'); 
    if (profileAvatar) profileAvatar.textContent = e; 
    if (currentAvatar) currentAvatar.textContent = e; 
    if (auth?.currentUser) db.collection('users').doc(auth.currentUser.uid).update({ avatarType: t }).then(() => closeModal()).catch(() => {}); 
};

window.openAvatarModal = () => document.getElementById('avatarModal')?.classList.add('active');

window.getEmojiForUser = u => { 
    const m = { male:'👨', female:'👩', boy:'🧒', girl:'👧', father:'👨‍🦳', mother:'👩‍🦳', grandfather:'👴', grandmother:'👵' }; 
    return m[u?.avatarType] || '👤'; 
};

// ==================== القسم 14: دوال مساعدة ====================
function formatNumber(num) { 
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'; 
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'; 
    return num.toString(); 
}

async function updateTripsCount() { 
    if (!window.auth || !window.auth.currentUser) return; 
    try { 
        const s = await window.db.collection('trips').where('userId', '==', window.auth.currentUser.uid).where('status', '==', 'ended').get(); 
        const c = document.getElementById('tripsCount'); 
        if (c) c.textContent = formatNumber(s.size); 
    } catch (error) {} 
}

function ensureSinglePage() { 
    document.querySelectorAll('.profile-subpage').forEach(p => p.style.display = 'none'); 
    document.querySelectorAll('.page').forEach(p => { 
        p.style.display = p.classList.contains('active') ? 'block' : 'none'; 
    }); 
}

function setupNavigation() { 
    const nav = document.querySelectorAll('.nav-item'); 
    const pages = document.querySelectorAll('.page'); 
    if (!nav.length || !pages.length) return; 
    function switchPage(id) { 
        clearStack(); 
        pages.forEach(p => p.classList.remove('active')); 
        const t = document.querySelector(`.page.${id}-page`); 
        if (t) { 
            t.classList.add('active'); 
            t.style.display = 'block'; 
        } 
        pages.forEach(p => { 
            if (!p.classList.contains('active')) p.style.display = 'none'; 
        }); 
        document.querySelectorAll('.profile-subpage').forEach(s => s.style.display = 'none'); 
        document.body.classList.remove('profile-subpage-open'); 
        document.body.classList.remove('conversation-open'); 
        if (id === 'chat') loadChats(); 
        nav.forEach(n => n.classList.toggle('active', n.dataset.page === id)); 
    } 
    nav.forEach(n => n.addEventListener('click', () => switchPage(n.dataset.page))); 
}

function setupModals() { 
    window.openLanguageModal = () => document.getElementById('languageModal')?.classList.add('active'); 
    window.closeModal = () => document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); 
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { 
        if (e.target === m) m.classList.remove('active'); 
    })); 
    document.querySelectorAll('.settings-item').forEach(i => { 
        if (i.querySelector('[data-i18n="language"]')) i.addEventListener('click', window.openLanguageModal); 
    }); 
}

// ==================== القسم 15: أحداث الصفحة ====================
document.addEventListener('DOMContentLoaded', () => { 
    ensureSinglePage(); 
    setupNavigation(); 
    setupModals(); 
    loadChats(); 
    setupChatListeners(); 
    updateTripsCount(); 
});

window.addEventListener('authReady', async () => { 
    if (window.auth?.currentUser) await SecureChatSystem.init(); 
});

window.addEventListener('beforeunload', () => { 
    PresenceSystem.setOffline(); 
});

document.addEventListener('visibilitychange', () => { 
    if (document.hidden) {
        PresenceSystem.setOffline(); 
    } else { 
        PresenceSystem.setOnline(); 
        if (ChatSystem.currentChat && ChatSystem.friendOnline) {
            setTimeout(() => CallSystem.ensureDataChannelOnly(ChatSystem.currentChat).catch(() => {}), 1000);
        }
    } 
});

if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();

window.addEventListener('error', (event) => { 
    console.error('❌ خطأ عام:', event.error); 
});

window.addEventListener('unhandledrejection', (event) => { 
    console.error('❌ خطأ غير معالج:', event.reason); 
});


