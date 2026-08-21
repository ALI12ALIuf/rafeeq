// ========== ui-functions.js - النسخة المعدلة (بدون مكالمات وموقع) ==========
// وظائف الواجهة العامة

// ==================== القسم 1: مكدس تتبع الصفحات ====================
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
let chatsLoaded = false;
let isLoadingChats = false;

async function loadChats(force = false) { 
    if (!window.auth || !window.auth.currentUser) return; 
    const list = document.getElementById('chatsList'); 
    if (!list) return; 
    
    if (isLoadingChats) {
        console.log('⏳ جاري تحميل المحادثات بالفعل، تخطي...');
        return;
    }
    
    if (chatsLoaded && !force) {
        console.log('⏭️ قائمة المحادثات محملة مسبقاً، تخطي التحميل');
        return;
    }
    
    isLoadingChats = true;
    
    const chatTemplate = ChatSystem.chatItemTemplate || document.getElementById('chatItemTemplate');
    const requestTemplate = document.getElementById('friendRequestChatTemplate');
    
    if (!chatTemplate) {
        console.warn('⚠️ قالب chatItemTemplate غير موجود');
        isLoadingChats = false;
        return;
    }
    
    try { 
        const udoc = await window.db.collection('users').doc(window.auth.currentUser.uid).get(); 
        if (!udoc.exists) {
            isLoadingChats = false;
            return; 
        }
        const friends = udoc.data().friends || []; 
        
        list.innerHTML = '';
        
        // عرض طلبات الصداقة
        if (requestTemplate) {
            const pendingRequests = await window.loadFriendRequestsForChat ? await window.loadFriendRequestsForChat() : [];
            const addedRequestIds = new Set();
            
            for (const req of pendingRequests) {
                if (addedRequestIds.has(req.id)) continue;
                addedRequestIds.add(req.id);
                
                try {
                    const senderDoc = await window.db.collection('users').doc(req.from).get();
                    if (!senderDoc.exists) continue;
                    
                    const sender = senderDoc.data();
                    const clone = requestTemplate.content.cloneNode(true);
                    const requestItem = clone.querySelector('.friend-request-item');
                    
                    const avatar = requestItem.querySelector('.chat-avatar-emoji');
                    const nameSpan = requestItem.querySelector('.friend-request-name');
                    const idSpan = requestItem.querySelector('.friend-request-id');
                    const copyBtn = requestItem.querySelector('.copy-id-btn');
                    const acceptBtn = requestItem.querySelector('.accept-friend-btn');
                    const rejectBtn = requestItem.querySelector('.reject-friend-btn');
                    
                    if (avatar) avatar.textContent = window.getEmojiForUser ? window.getEmojiForUser(sender) : '🧔🏻‍♂️';
                    if (nameSpan) nameSpan.textContent = sender.name || 'مستخدم';
                    if (idSpan) idSpan.textContent = sender.shareableId || '0000000000';
                    
                    if (copyBtn) {
                        copyBtn.onclick = (e) => {
                            e.stopPropagation();
                            const id = sender.shareableId || '0000000000';
                            navigator.clipboard.writeText(id).then(() => {
                                const icon = copyBtn.querySelector('i');
                                if (icon) {
                                    icon.className = 'fas fa-check';
                                    setTimeout(() => {
                                        icon.className = 'fas fa-copy';
                                    }, 1500);
                                }
                            }).catch(() => {});
                        };
                    }
                    
                    if (acceptBtn) {
                        acceptBtn.onclick = (e) => {
                            e.stopPropagation();
                            window.acceptFriendRequest(req.id, req.from);
                        };
                    }
                    
                    if (rejectBtn) {
                        rejectBtn.onclick = (e) => {
                            e.stopPropagation();
                            window.rejectFriendRequest(req.id);
                        };
                    }
                    
                    list.appendChild(clone);
                    
                } catch (e) {
                    console.warn('خطأ في عرض طلب صداقة:', e);
                }
            }
        }
        
        if (!friends.length) { 
            if (list.children.length === 0) {
                list.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><h3>لا توجد محادثات</h3><p>أضف أصدقاء لبدء المحادثة</p></div>`; 
            }
            chatsLoaded = true;
            isLoadingChats = false;
            return; 
        } 
        
        const addedFriendIds = new Set();
        
        for (const fid of friends) { 
            if (addedFriendIds.has(fid)) continue;
            addedFriendIds.add(fid);
            
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
                            lt = new Date(l.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }); 
                        } 
                    } catch (e) {} 
                    
                    const clone = chatTemplate.content.cloneNode(true);
                    const chatItem = clone.querySelector('.chat-item');
                    
                    const avatar = chatItem.querySelector('.chat-avatar-emoji');
                    const name = chatItem.querySelector('.chat-info h4');
                    const lastMsg = chatItem.querySelector('.last-message');
                    const time = chatItem.querySelector('.chat-time');
                    
                    if (avatar) avatar.textContent = window.getEmojiForUser ? window.getEmojiForUser(f) : '🧔🏻‍♂️';
                    if (name) name.textContent = f.name || 'مستخدم';
                    if (lastMsg) lastMsg.textContent = lm;
                    if (time) time.textContent = lt || '';
                    
                    chatItem.onclick = () => openChat(fid);
                    
                    list.appendChild(clone);
                } 
            } catch (e) {
                console.warn('خطأ في تحميل صديق:', e);
            } 
        } 
        
        chatsLoaded = true;
        isLoadingChats = false;
        
        if (list.children.length === 0) {
            list.innerHTML = `<div class="empty-state"><i class="fas fa-user-friends"></i><h3>لا توجد محادثات نشطة</h3><p>ابدأ بإضافة أصدقاء جدد</p></div>`;
        }
        
    } catch (e) {
        console.error('خطأ في loadChats:', e);
        list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>حدث خطأ</h3><p>حاول تحديث الصفحة</p></div>`;
        chatsLoaded = true;
        isLoadingChats = false;
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
    
    window.db.collection('users').doc(friendId).get().then(doc => {
        if (doc.exists) {
            const f = doc.data();
            ChatSystem.openChat(friendId, f.name, window.getEmojiForUser ? window.getEmojiForUser(f) : '🧔🏻‍♂️');
        }
    }).catch(() => {});
};

// ==================== القسم 5: وظائف إرسال الرسائل ====================
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

window.handleMessageKeyPress = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
    }
};

// ==================== القسم 5.1: زر الإجراء (بصمة/إرسال) ====================
let _recordingTimer = null;
let _recordingSeconds = 0;
let _recordingChunks = [];
let _mediaRecorder = null;
let _recordingBlob = null;
let _isRecording = false;
let _audioUrl = null;
let _audioElement = null;

const MAX_RECORDING_SECONDS = 300;
const WARNING_THRESHOLD = 280;

window.toggleSendButton = function() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('actionBtn');
    const recordingUI = document.getElementById('voiceRecordingUI');
    if (!input || !btn) return;
    
    if (recordingUI && recordingUI.style.display === 'flex') {
        btn.style.display = 'none';
        return;
    }
    
    const hasText = input.value.trim().length > 0;
    
    if (hasText) {
        btn.className = 'send-mode';
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        btn.title = 'إرسال';
    } else {
        btn.className = 'voice-btn';
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        btn.title = 'بصمة صوتية';
    }
    btn.style.display = 'flex';
};

window.handleActionButton = function() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('actionBtn');
    if (!input || !btn) return;
    
    const recordingUI = document.getElementById('voiceRecordingUI');
    if (recordingUI && recordingUI.style.display === 'flex') return;
    
    const hasText = input.value.trim().length > 0;
    
    if (hasText) {
        window.sendMessage();
    } else {
        window.startVoiceRecording();
    }
};

window.startVoiceRecording = function() {
    if (!navigator.mediaDevices?.getUserMedia) {
        alert('المتصفح لا يدعم تسجيل الصوت');
        return;
    }
    
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('actionBtn');
    const recordingUI = document.getElementById('voiceRecordingUI');
    const progressFill = document.getElementById('voiceProgressFill');
    const currentTimeEl = document.getElementById('voiceCurrentTime');
    const maxTimeEl = document.getElementById('voiceMaxTime');
    const cancelBtn = document.getElementById('voiceCancelBtn');
    const sendBtn = document.getElementById('voiceSendBtn');
    const playBtn = document.getElementById('voicePlayBtn');
    
    if (!recordingUI || !progressFill || !currentTimeEl) return;
    
    if (_audioUrl) { URL.revokeObjectURL(_audioUrl); _audioUrl = null; }
    if (_audioElement) { _audioElement = null; }
    
    input.style.display = 'none';
    recordingUI.style.display = 'flex';
    recordingUI.classList.remove('warning');
    btn.style.display = 'none';
    playBtn.style.display = 'none';
    sendBtn.style.display = 'none';
    cancelBtn.style.display = 'flex';
    
    btn.style.display = 'flex';
    btn.classList.add('recording');
    btn.innerHTML = '<i class="fas fa-stop"></i>';
    btn.title = 'إيقاف التسجيل';
    
    _recordingSeconds = 0;
    _recordingChunks = [];
    _recordingBlob = null;
    _isRecording = true;
    currentTimeEl.textContent = '0:00';
    maxTimeEl.textContent = '5:00';
    progressFill.style.width = '0%';
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            _mediaRecorder = new MediaRecorder(stream);
            
            _mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) _recordingChunks.push(e.data);
            };
            
            _mediaRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                _isRecording = false;
                
                _recordingBlob = new Blob(_recordingChunks, { type: 'audio/webm' });
                
                if (_audioUrl) URL.revokeObjectURL(_audioUrl);
                _audioUrl = URL.createObjectURL(_recordingBlob);
                
                playBtn.style.display = 'flex';
                playBtn.innerHTML = '<i class="fas fa-play"></i>';
                sendBtn.style.display = 'flex';
                btn.style.display = 'none';
                btn.classList.remove('recording');
                
                if (_recordingTimer) {
                    clearInterval(_recordingTimer);
                    _recordingTimer = null;
                }
            };
            
            _mediaRecorder.start();
            
            btn.onclick = function() {
                if (_mediaRecorder && _mediaRecorder.state === 'recording') {
                    _mediaRecorder.stop();
                    btn.onclick = window.handleActionButton;
                    playBtn.style.display = 'flex';
                    playBtn.innerHTML = '<i class="fas fa-play"></i>';
                    sendBtn.style.display = 'flex';
                    btn.style.display = 'none';
                }
            };
            
            if (_recordingTimer) clearInterval(_recordingTimer);
            _recordingTimer = setInterval(() => {
                if (!_isRecording) return;
                
                _recordingSeconds++;
                const mins = Math.floor(_recordingSeconds / 60);
                const secs = _recordingSeconds % 60;
                currentTimeEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                
                const percent = (_recordingSeconds / MAX_RECORDING_SECONDS) * 100;
                progressFill.style.width = Math.min(percent, 100) + '%';
                
                if (_recordingSeconds >= WARNING_THRESHOLD) {
                    recordingUI.classList.add('warning');
                }
                
                if (_recordingSeconds >= MAX_RECORDING_SECONDS) {
                    if (_mediaRecorder && _mediaRecorder.state === 'recording') {
                        _mediaRecorder.stop();
                        btn.onclick = window.handleActionButton;
                        btn.style.display = 'none';
                        playBtn.style.display = 'flex';
                        playBtn.innerHTML = '<i class="fas fa-play"></i>';
                        sendBtn.style.display = 'flex';
                    }
                }
            }, 1000);
            
            cancelBtn.onclick = () => {
                if (_mediaRecorder && _mediaRecorder.state === 'recording') {
                    _mediaRecorder.stop();
                }
                if (_recordingTimer) {
                    clearInterval(_recordingTimer);
                    _recordingTimer = null;
                }
                resetVoiceUI();
            };
            
            let isPlaying = false;
            playBtn.onclick = () => {
                if (!_recordingBlob) return;
                
                if (isPlaying) {
                    if (_audioElement) {
                        _audioElement.pause();
                        _audioElement.currentTime = 0;
                    }
                    playBtn.innerHTML = '<i class="fas fa-play"></i>';
                    isPlaying = false;
                    return;
                }
                
                if (!_audioElement) {
                    _audioElement = new Audio(_audioUrl);
                    _audioElement.onended = () => {
                        playBtn.innerHTML = '<i class="fas fa-play"></i>';
                        isPlaying = false;
                    };
                }
                
                _audioElement.play();
                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
                isPlaying = true;
            };
            
            sendBtn.onclick = () => {
                if (_mediaRecorder && _mediaRecorder.state === 'recording') {
                    _mediaRecorder.stop();
                }
                if (_recordingTimer) {
                    clearInterval(_recordingTimer);
                    _recordingTimer = null;
                }
                
                if (_recordingBlob && _recordingBlob.size > 0) {
                    ChatSystem.sendVoiceNote(_recordingBlob);
                }
                resetVoiceUI();
            };
            
            const cleanup = () => {
                if (_mediaRecorder && _mediaRecorder.state === 'recording') {
                    _mediaRecorder.stop();
                }
                if (_recordingTimer) {
                    clearInterval(_recordingTimer);
                    _recordingTimer = null;
                }
                if (_audioElement) {
                    _audioElement.pause();
                    _audioElement = null;
                }
                if (_audioUrl) {
                    URL.revokeObjectURL(_audioUrl);
                    _audioUrl = null;
                }
                resetVoiceUI();
            };
            window._voiceCleanup = cleanup;
            window.addEventListener('beforeunload', cleanup);
        })
        .catch(() => {
            alert('يرجى السماح بالوصول إلى الميكروفون');
            resetVoiceUI();
        });
};

function resetVoiceUI() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('actionBtn');
    const recordingUI = document.getElementById('voiceRecordingUI');
    const playBtn = document.getElementById('voicePlayBtn');
    
    if (input) input.style.display = 'block';
    if (recordingUI) {
        recordingUI.style.display = 'none';
        recordingUI.classList.remove('warning');
    }
    if (btn) {
        btn.style.display = 'flex';
        btn.classList.remove('recording');
        btn.onclick = window.handleActionButton;
    }
    if (playBtn) {
        playBtn.style.display = 'none';
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
    
    if (_recordingTimer) {
        clearInterval(_recordingTimer);
        _recordingTimer = null;
    }
    
    if (_audioElement) {
        _audioElement.pause();
        _audioElement = null;
    }
    if (_audioUrl) {
        URL.revokeObjectURL(_audioUrl);
        _audioUrl = null;
    }
    
    _recordingBlob = null;
    _mediaRecorder = null;
    _recordingChunks = [];
    _isRecording = false;
    
    if (window._voiceCleanup) {
        window.removeEventListener('beforeunload', window._voiceCleanup);
        window._voiceCleanup = null;
    }
    
    window.toggleSendButton();
}

// ==================== القسم 6: قائمة المرفقات ====================
window.showAttachmentMenu = () => { 
    const m = document.getElementById('attachmentMenu'); 
    if (m) {
        m.style.display = m.style.display === 'none' ? 'flex' : 'none'; 
    }
};

// ==================== القسم 7: إغلاق المحادثة ====================
window.closeConversation = () => { 
    ChatSystem.closeChat();
    
    if (typeof window.hideSearchResults === 'function') {
        window.hideSearchResults();
    }
    
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

// ==================== القسم 8: تعديل الملف الشخصي ====================
window.openEditProfileModal = () => { 
    const nameInput = document.getElementById('editName'); 
    const currentName = document.getElementById('profileName')?.textContent; 
    const currentEmoji = document.getElementById('profileAvatarEmoji')?.textContent; 
    if (nameInput) nameInput.value = currentName || ''; 
    const avatarPreview = document.getElementById('currentAvatarEmoji'); 
    if (avatarPreview) avatarPreview.textContent = currentEmoji || '🧔🏻‍♂️'; 
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

// ==================== القسم 9: الصفحات الفرعية ====================
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

// ==================== القسم 10: الرجوع من صفحة فرعية ====================
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

// ==================== القسم 11: الصورة الرمزية ====================
window.selectAvatar = function(type) {
    const emojiMap = {
        'man_light': '🧔🏻‍♂️',
        'man_medium': '🧔🏼‍♂️',
        'man_dark': '🧔🏽‍♂️',
        'woman_light': '👩🏻',
        'woman_medium': '👩🏼',
        'woman_dark': '👩🏽'
    };
    const emoji = emojiMap[type] || '🧔🏻‍♂️';
    const profileAvatar = document.getElementById('profileAvatarEmoji');
    const currentAvatar = document.getElementById('currentAvatarEmoji');
    if (profileAvatar) profileAvatar.textContent = emoji;
    if (currentAvatar) currentAvatar.textContent = emoji;
    
    document.querySelectorAll('.avatar-option-btn').forEach(btn => {
        btn.style.borderColor = 'transparent';
        btn.style.background = 'var(--light)';
        btn.style.boxShadow = 'none';
    });
    
    const selectedBtn = document.querySelector(`.avatar-option-btn[data-type="${type}"]`);
    if (selectedBtn) {
        selectedBtn.style.borderColor = '#2196F3';
        selectedBtn.style.background = 'rgba(33, 150, 243, 0.15)';
        selectedBtn.style.boxShadow = '0 0 20px rgba(33, 150, 243, 0.3)';
    }
    
    if (auth?.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({ avatarType: type })
            .then(() => {
                setTimeout(() => closeModal(), 500);
            })
            .catch(() => {});
    }
};

window.openAvatarModal = function() {
    const modal = document.getElementById('avatarModal');
    if (modal) modal.classList.add('active');
    
    const currentAvatar = document.getElementById('profileAvatarEmoji')?.textContent;
    
    document.querySelectorAll('.avatar-option-btn').forEach(btn => {
        const emojiSpan = btn.querySelector('span');
        if (emojiSpan && emojiSpan.textContent === currentAvatar) {
            btn.style.borderColor = '#2196F3';
            btn.style.background = 'rgba(33, 150, 243, 0.15)';
            btn.style.boxShadow = '0 0 20px rgba(33, 150, 243, 0.3)';
        } else {
            btn.style.borderColor = 'transparent';
            btn.style.background = 'var(--light)';
            btn.style.boxShadow = 'none';
        }
    });
};

window.getEmojiForUser = function(userData) {
    const emojiMap = {
        'man_light': '🧔🏻‍♂️',
        'man_medium': '🧔🏼‍♂️',
        'man_dark': '🧔🏽‍♂️',
        'woman_light': '👩🏻',
        'woman_medium': '👩🏼',
        'woman_dark': '👩🏽'
    };
    if (!userData?.avatarType || ['male','female','boy','girl','father','mother','grandfather','grandmother'].includes(userData.avatarType)) {
        return '🧔🏻‍♂️';
    }
    return emojiMap[userData.avatarType] || '🧔🏻‍♂️';
};

// ==================== القسم 12: دوال إغلاق المعاينات ====================
window.closeImagePreview = function() {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImage');
    if (modal) modal.style.display = 'none';
    if (img) { img.src = ''; img.style.transform = 'none'; }
};

window.downloadPreviewImage = function() {
    const img = document.getElementById('previewImage');
    if (!img || !img.src) return;
    const link = document.createElement('a');
    link.href = img.src;
    link.download = 'image.jpg';
    link.click();
};

// ==================== القسم 13: دوال مساعدة ====================
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
        
        if (typeof window.hideSearchResults === 'function') {
            window.hideSearchResults();
        }
        
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            const titles = {
                'home': 'الرئيسية',
                'chat': 'الدردشة',
                'profile': 'الملف الشخصي',
                'settings': 'الإعدادات'
            };
            pageTitle.textContent = titles[id] || id;
            pageTitle.setAttribute('data-i18n', id);
        }
        
        if (id === 'chat') loadChats(); 
        nav.forEach(n => n.classList.toggle('active', n.dataset.page === id)); 
    } 
    
    window.switchPage = switchPage;
    
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

// ==================== القسم 14: أحداث الصفحة ====================
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

if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();

window.addEventListener('error', (event) => { 
    console.error('❌ خطأ عام:', event.error); 
});

window.addEventListener('unhandledrejection', (event) => { 
    console.error('❌ خطأ غير معالج:', event.reason); 
});
