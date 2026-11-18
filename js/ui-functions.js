// ========== ui-functions.js - النسخة النظيفة (بدون دردشة) ==========

// ==================== اختيار الأفاتار ====================
window.selectAvatar = function(type) {
    const emojiMap = {
        'man_light': '🧔🏻‍♂️', 'man_medium': '🧔🏼‍♂️', 'man_dark': '🧔🏽‍♂️',
        'woman_light': '👩🏻', 'woman_medium': '👩🏼', 'woman_dark': '👩🏽'
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
            .then(() => { setTimeout(() => window.closeModal('avatarModal'), 500); })
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
        'man_light': '🧔🏻‍♂️', 'man_medium': '🧔🏼‍♂️', 'man_dark': '🧔🏽‍♂️',
        'woman_light': '👩🏻', 'woman_medium': '👩🏼', 'woman_dark': '👩🏽'
    };
    if (!userData?.avatarType || ['male','female','boy','girl','father','mother','grandfather','grandmother'].includes(userData.avatarType)) {
        return '🧔🏻‍♂️';
    }
    return emojiMap[userData.avatarType] || '🧔🏻‍♂️';
};

function ensureSinglePage() { 
    document.querySelectorAll('.page').forEach(p => { 
        p.style.display = p.classList.contains('active') ? 'block' : 'none'; 
    }); 
}

// ==================== التنقل ====================
function setupNavigation() { 
    const nav = document.querySelectorAll('.nav-item'); 
    const pages = document.querySelectorAll('.page'); 
    if (!nav.length || !pages.length) return; 
    
    function switchPage(id) { 
        pages.forEach(p => p.classList.remove('active')); 
        const t = document.querySelector(`.page.${id}-page`); 
        if (t) { 
            t.classList.add('active'); 
            t.style.display = 'block'; 
        }
        pages.forEach(p => { 
            if (!p.classList.contains('active')) p.style.display = 'none'; 
        }); 
        
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            const titles = { 'home': 'الرئيسية', 'profile': 'الملف الشخصي', 'settings': 'الإعدادات' };
            pageTitle.textContent = titles[id] || id;
            pageTitle.setAttribute('data-i18n', id);
        }
        
        if (typeof PostsSystem !== 'undefined' && PostsSystem.updateCountrySelectorVisibility) {
            PostsSystem.updateCountrySelectorVisibility();
        }
        
        nav.forEach(n => n.classList.toggle('active', n.dataset.page === id)); 
    } 
    
    window.switchPage = switchPage;
    nav.forEach(n => n.addEventListener('click', () => switchPage(n.dataset.page))); 
}

function setupModals() { 
    window.openLanguageModal = () => document.getElementById('languageModal')?.classList.add('active'); 
    
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { 
        if (e.target === m) m.classList.remove('active'); 
    })); 
    document.querySelectorAll('.settings-item').forEach(i => { 
        if (i.querySelector('[data-i18n="language"]')) i.addEventListener('click', window.openLanguageModal); 
    }); 
}

// ==================== دالة closeModal ====================
window.closeModal = function(modalId) {
    if (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
    } else {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    }
};

// ==================== عداد الاسم ====================
window.updateCharCounter = function() {
    const nameInput = document.getElementById('editName');
    const counter = document.getElementById('charCounter');
    if (!nameInput || !counter) return;
    
    const length = nameInput.value.length;
    const maxLength = 15;
    
    counter.textContent = `${length}/${maxLength}`;
    counter.classList.remove('warning', 'full');
    
    if (length >= maxLength) {
        counter.classList.add('full');
    } else if (length >= maxLength - 3) {
        counter.classList.add('warning');
    }
};

// ==================== فتح نافذة تعديل الملف الشخصي ====================
window.openEditProfileModal = function() {
    const modal = document.getElementById('editProfileModal');
    if (!modal) return;
    
    const nameInput = document.getElementById('editName');
    const currentName = document.getElementById('profileName')?.textContent;
    const currentEmoji = document.getElementById('profileAvatarEmoji')?.textContent;
    
    if (nameInput) {
        nameInput.value = currentName || '';
        nameInput.style.textAlign = 'center';
        nameInput.style.direction = 'rtl';
    }
    
    const avatarPreview = document.getElementById('currentAvatarEmoji');
    if (avatarPreview) avatarPreview.textContent = currentEmoji || '🧔🏻‍♂️';
    
    window.updateCharCounter();
    modal.classList.add('active');
    
    setTimeout(() => {
        if (nameInput) {
            nameInput.style.textAlign = 'center';
            nameInput.style.direction = 'rtl';
        }
    }, 50);
};

window.saveProfile = function() {
    const n = document.getElementById('editName')?.value?.trim();
    if (!n || n.length > 15) {
        alert('الاسم مطلوب ولا يزيد عن 15 حرف');
        return;
    }
    if (auth?.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({ name: n })
            .then(() => {
                const nameEl = document.getElementById('profileName');
                if (nameEl) nameEl.textContent = n;
                window.closeModal('editProfileModal');
            })
            .catch(() => alert('فشل حفظ التغييرات'));
    }
};

// ==================== تهيئة الصفحة ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 تهيئة ui-functions...');
    ensureSinglePage();
    setupNavigation();
    setupModals();
    
    const nameInput = document.getElementById('editName');
    if (nameInput) {
        nameInput.addEventListener('input', window.updateCharCounter);
    }
});

window.addEventListener('error', function(event) {
    console.error('❌ خطأ عام:', event.error);
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('❌ خطأ غير معالج:', event.reason);
});
