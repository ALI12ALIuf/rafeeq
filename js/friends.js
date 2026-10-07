// ========== friends.js - Rafeeq Friends via Cloudflare API ==========

// ==================== إضافة صديق ====================
window.addNewFriend = async function(targetUserId) {
    if (!RafeeqAPI.getToken()) return;
    
    try {
        const result = await RafeeqAPI.friends.sendRequest(targetUserId);
        
        if (result.success) {
            // إخفاء نتائج البحث
            const rc = document.getElementById('searchResultsContainer'); 
            if (rc) { 
                rc.style.display = 'none'; 
                rc.innerHTML = ''; 
            }
            const si = document.getElementById('searchInput'); 
            if (si) si.value = '';
            
            alert('✅ تم إرسال طلب الصداقة');
        }
        
    } catch (e) { 
        alert('❌ ' + e.message); 
    }
};

// ==================== قبول طلب الصداقة ====================
window.acceptFriendRequest = async function(requestId, senderId) {
    if (!RafeeqAPI.getToken()) return;
    
    try {
        const result = await RafeeqAPI.friends.accept(requestId);
        
        if (result.success) {
            console.log('✅ تم قبول طلب الصداقة');
            
            // إزالة الطلب من القائمة
            const requestEl = _currentChatsElements.requests.get(requestId);
            if (requestEl) {
                requestEl.remove();
                _currentChatsElements.requests.delete(requestId);
            }
            
            // تحديث القائمة
            if (typeof loadChats === 'function') {
                chatsLoaded = false;
                loadChats(true);
            }
        }
        
    } catch (e) { 
        console.error('خطأ في قبول الطلب:', e);
        alert('❌ ' + e.message); 
    }
};

// ==================== رفض طلب الصداقة ====================
window.rejectFriendRequest = async function(requestId) {
    if (!RafeeqAPI.getToken()) return;
    
    try { 
        await RafeeqAPI.friends.reject(requestId);
        console.log('✅ تم رفض طلب الصداقة');
        
        // إزالة الطلب من القائمة
        const requestEl = _currentChatsElements.requests.get(requestId);
        if (requestEl) {
            requestEl.remove();
            _currentChatsElements.requests.delete(requestId);
            const list = document.getElementById('chatsList');
            if (list && typeof updateEmptyState === 'function') updateEmptyState(list);
        }
        
    } catch (e) {
        console.error('خطأ في رفض الطلب:', e);
    }
};

// ==================== تحميل طلبات الصداقة ====================
async function loadFriendRequestsForChat() {
    if (!RafeeqAPI.getToken()) return [];
    
    try {
        const result = await RafeeqAPI.friends.getRequests();
        
        if (result.success && result.requests) {
            return result.requests.map(r => ({
                id: r.id,
                from: r.fromUser,
                name: r.name,
                shareableId: r.shareableId,
                avatarType: r.avatarType,
                timestamp: r.createdAt
            }));
        }
        return [];
        
    } catch (e) {
        console.warn('خطأ في تحميل طلبات الصداقة:', e);
        return [];
    }
}

// ==================== البحث عن مستخدم ====================
window.findUserById = async function() {
    const inp = document.getElementById('searchInput');
    const rc = document.getElementById('searchResultsContainer');
    if (!inp || !rc) return;
    
    const q = inp.value.trim();
    if (!q) { 
        rc.style.display = 'none'; 
        return; 
    }
    
    rc.style.display = 'block';
    rc.innerHTML = `<div style="text-align:center;padding:10px;color:var(--text-light);">جاري البحث...</div>`;
    
    const template = document.getElementById('searchResultTemplate');
    if (!template) {
        rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">حدث خطأ في البحث</div>`;
        return;
    }
    
    try {
        const result = await RafeeqAPI.users.search(q);
        
        if (!result.success || !result.user) {
            rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">لا يوجد مستخدم بهذا ID</div>`;
            return;
        }
        
        const u = result.user;
        const rel = result.relationship;
        const cu = RafeeqAPI.getUser();
        
        // ========== حالة: حسابك ==========
        if (rel.isSelf) {
            const clone = template.content.cloneNode(true);
            const resultItem = clone.querySelector('.search-result-item');
            const avatar = resultItem.querySelector('.search-result-avatar');
            const name = resultItem.querySelector('.search-result-info h4');
            const idText = resultItem.querySelector('.search-result-info p');
            const actionBtn = resultItem.querySelector('.search-action-btn');
            
            if (avatar) avatar.textContent = getEmojiForUser(u);
            if (name) { name.textContent = u.name || 'مستخدم'; name.style.color = 'var(--primary)'; }
            if (idText) {
                idText.innerHTML = `
                    <button class="copy-id-btn-search" style="background:transparent;border:none;color:var(--primary);cursor:pointer;font-size:0.7rem;display:inline-flex;align-items:center;justify-content:center;padding:2px;flex-shrink:0;" title="نسخ ID">
                        <i class="fas fa-copy" style="font-size:0.7rem;"></i>
                    </button>
                    <span style="font-size:0.75rem;font-family:monospace;direction:ltr;">${u.shareableId}</span>
                    <span style="color:var(--primary);font-weight:700;font-size:0.85rem;font-family:sans-serif;">ID</span>
                `;
                const copyBtn = idText.querySelector('.copy-id-btn-search');
                if (copyBtn) {
                    copyBtn.onclick = (e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(u.shareableId).then(() => {
                            const icon = copyBtn.querySelector('i');
                            if (icon) {
                                icon.className = 'fas fa-check';
                                setTimeout(() => { icon.className = 'fas fa-copy'; }, 1500);
                            }
                        }).catch(() => {});
                    };
                }
            }
            if (actionBtn) actionBtn.style.display = 'none';
            
            rc.innerHTML = '';
            rc.appendChild(clone);
            return;
        }
        
        // ========== تحديد حالة العلاقة ==========
        let btnIcon = '', btnDisabled = false, btnStyle = '', btnAction = null;
        
        if (rel.isFriend) {
            btnIcon = 'fa-comment';
            btnDisabled = false;
            btnStyle = 'background:var(--primary);color:white;';
            btnAction = () => openChat(u.id);
        } else if (rel.requestStatus === 'sent') {
            btnIcon = 'fa-clock';
            btnDisabled = true;
            btnStyle = 'background:transparent;color:white;border:2px solid var(--primary);border-radius:50%;width:36px;height:36px;padding:0;cursor:default;display:flex;align-items:center;justify-content:center;';
        } else if (rel.requestStatus === 'received') {
            btnIcon = 'fa-check';
            btnDisabled = false;
            btnStyle = 'background:#4CAF50;color:white;border-radius:50%;width:36px;height:36px;padding:0;display:flex;align-items:center;justify-content:center;';
            btnAction = async () => {
                // جلب الطلب
                const reqs = await RafeeqAPI.friends.getRequests();
                if (reqs.success) {
                    const req = reqs.requests.find(r => r.fromUser === u.id);
                    if (req) {
                        await window.acceptFriendRequest(req.id, u.id);
                        hideSearchResults();
                    }
                }
            };
        } else {
            btnIcon = 'fa-plus';
            btnDisabled = false;
            btnStyle = 'background:var(--primary);color:white;';
            btnAction = () => {
                window.addNewFriend(u.id);
            };
        }
        
        // ========== بناء الواجهة ==========
        const clone = template.content.cloneNode(true);
        const resultItem = clone.querySelector('.search-result-item');
        const avatar = resultItem.querySelector('.search-result-avatar');
        const name = resultItem.querySelector('.search-result-info h4');
        const idText = resultItem.querySelector('.search-result-info p');
        const actionBtn = resultItem.querySelector('.search-action-btn');
        
        if (avatar) avatar.textContent = getEmojiForUser(u);
        if (name) name.textContent = u.name || 'مستخدم';
        if (idText) {
            idText.innerHTML = `
                <button class="copy-id-btn-search" style="background:transparent;border:none;color:var(--primary);cursor:pointer;font-size:0.7rem;display:inline-flex;align-items:center;justify-content:center;padding:2px;flex-shrink:0;" title="نسخ ID">
                    <i class="fas fa-copy" style="font-size:0.7rem;"></i>
                </button>
                <span style="font-size:0.75rem;font-family:monospace;direction:ltr;">${u.shareableId}</span>
                <span style="color:var(--primary);font-weight:700;font-size:0.85rem;font-family:sans-serif;">ID</span>
            `;
            const copyBtn = idText.querySelector('.copy-id-btn-search');
            if (copyBtn) {
                copyBtn.onclick = (e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(u.shareableId).then(() => {
                        const icon = copyBtn.querySelector('i');
                        if (icon) {
                            icon.className = 'fas fa-check';
                            setTimeout(() => { icon.className = 'fas fa-copy'; }, 1500);
                        }
                    }).catch(() => {});
                };
            }
        }
        
        if (actionBtn) {
            actionBtn.innerHTML = `<i class="fas ${btnIcon}"></i>`;
            actionBtn.style.cssText = `padding:6px 14px;border:none;border-radius:20px;${btnStyle}font-size:0.85rem;cursor:${btnDisabled ? 'not-allowed' : 'pointer'};display:flex;align-items:center;justify-content:center;gap:6px;min-width:40px;`;
            if (btnDisabled) { actionBtn.disabled = true; }
            if (btnAction) { actionBtn.onclick = btnAction; }
        }
        
        rc.innerHTML = '';
        rc.appendChild(clone);
        
    } catch (e) { 
        console.error('خطأ في البحث:', e);
        rc.innerHTML = `<div style="text-align:center;padding:15px;color:var(--text-light);">❌ ${e.message || 'حدث خطأ في البحث'}</div>`; 
    }
};

// ==================== إخفاء نتائج البحث ====================
window.hideSearchResults = function() { 
    const rc = document.getElementById('searchResultsContainer'); 
    const inp = document.getElementById('searchInput');
    if (rc) { 
        rc.style.display = 'none'; 
        rc.innerHTML = ''; 
    }
    if (inp) { inp.value = ''; }
};

// ==================== حذف صديق ====================
window.confirmRemoveFriend = function(friendId, friendName) {
    const confirmed = confirm(`هل أنت متأكد من حذف "${friendName}" من قائمة الأصدقاء؟`);
    if (confirmed) {
        removeFriend(friendId);
    }
};

window.removeFriend = async function(friendId) {
    if (!RafeeqAPI.getToken()) return;
    
    try {
        const result = await RafeeqAPI.friends.remove(friendId);
        
        if (result.success) {
            // حذف الرسائل المحلية
            const uid = RafeeqAPI.getUser()?.id;
            const userKey = `chat_${uid}_${friendId}`;
            localStorage.removeItem(userKey);
            
            if (typeof ChatSystem !== 'undefined' && ChatSystem.messages) {
                delete ChatSystem.messages[friendId];
            }
            
            // حذف من الواجهة
            const element = _currentChatsElements.friends.get(friendId);
            if (element) {
                element.remove();
                _currentChatsElements.friends.delete(friendId);
                const list = document.getElementById('chatsList');
                if (list) updateEmptyState(list);
            }
            
            console.log(`✅ تم حذف الصديق ${friendId}`);
        }
        
    } catch (e) { 
        console.error('❌ خطأ في حذف الصديق:', e);
        alert('❌ ' + e.message); 
    }
};

// ==================== تصدير الدوال ====================
window.loadFriendRequestsForChat = loadFriendRequestsForChat;

console.log('✅ friends.js loaded - Cloudflare API mode');
