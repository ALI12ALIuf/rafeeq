document.addEventListener('DOMContentLoaded', () => {
    console.log('App loaded, setting up navigation...');
    ensureSinglePage();
    setupNavigation();
    setupSideMenu();
    setupModals();
    loadStories();
    loadChats();
    
    // إعداد البحث الفوري
    setupInstantSearch();
});

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
        
        pages.forEach(page => {
            if (!page.classList.contains('active')) {
                page.style.display = 'none';
            }
        });
        
        document.querySelectorAll('.profile-subpage').forEach(sp => {
            sp.style.display = 'none';
        });
        
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
    
    window.openSearchModal = () => {
        document.getElementById('searchModal')?.classList.add('active');
        // تفريغ نتائج البحث السابقة عند الفتح
        const resultsDiv = document.getElementById('searchResults');
        if (resultsDiv) resultsDiv.innerHTML = '';
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
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
    
    const searchBtn = document.querySelector('.search-box button');
    if (searchBtn) searchBtn.addEventListener('click', openSearchModal);
    
    document.querySelectorAll('.settings-item').forEach(item => {
        if (item.querySelector('[data-i18n="language"]')) {
            item.addEventListener('click', openLanguageModal);
        }
    });
}

// إعداد البحث الفوري (بدون زر) - كود مستقل تماماً
function setupInstantSearch() {
    const searchInput = document.getElementById('searchInput');
    const resultsDiv = document.getElementById('searchResults');
    
    if (!searchInput) {
        console.error('❌ لم يتم العثور على حقل البحث');
        return;
    }
    
    console.log('✅ تم العثور على حقل البحث');
    
    searchInput.addEventListener('input', function(e) {
        // تنظيف الإدخال (أرقام فقط)
        let value = this.value.replace(/[^0-9]/g, '');
        this.value = value;
        
        console.log('🔍 جاري البحث عن:', value);
        
        if (!resultsDiv) return;
        
        // مسح النتائج إذا كان الحقل فارغاً
        if (value.length === 0) {
            resultsDiv.innerHTML = '';
            return;
        }
        
        // التحقق من الطول
        if (value.length !== 10) {
            resultsDiv.innerHTML = `<div class="empty-state" style="text-align: center; padding: 20px; color: #666;">
                ⏳ يجب إدخال 10 أرقام (${value.length}/10)
            </div>`;
            return;
        }
        
        // عرض رسالة جاري البحث
        resultsDiv.innerHTML = `<div class="loading" style="text-align: center; padding: 20px;">
            <i class="fas fa-spinner fa-spin"></i> جاري البحث...
        </div>`;
        
        // تنفيذ البحث مباشرة
        performSearch(value);
    });
    
    // السماح بالأرقام فقط عند الكتابة
    searchInput.addEventListener('keypress', function(e) {
        const char = String.fromCharCode(e.which);
        if (!/[0-9]/.test(char)) {
            e.preventDefault();
        }
    });
    
    // منع اللصق غير الرقمي
    searchInput.addEventListener('paste', function(e) {
        e.preventDefault();
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        const numbersOnly = pastedText.replace(/[^0-9]/g, '').slice(0, 10);
        if (numbersOnly) {
            this.value = numbersOnly;
            if (numbersOnly.length === 10) {
                performSearch(numbersOnly);
            } else {
                if (resultsDiv) {
                    resultsDiv.innerHTML = `<div class="empty-state" style="text-align: center; padding: 20px; color: #666;">
                        ⏳ يجب إدخال 10 أرقام (${numbersOnly.length}/10)
                    </div>`;
                }
            }
        }
    });
}

// دالة البحث المباشرة
async function performSearch(searchId) {
    const resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv) return;
    
    try {
        // التحقق من وجود db
        if (!window.db) {
            resultsDiv.innerHTML = `<div class="empty-state" style="text-align: center; padding: 20px; color: #f44336;">
                ❌ Firebase غير متصل
            </div>`;
            return;
        }
        
        // البحث في Firestore
        const snapshot = await window.db.collection('users')
            .where('shareableId', '==', searchId)
            .get();
        
        if (snapshot.empty) {
            resultsDiv.innerHTML = `<div class="empty-state" style="text-align: center; padding: 20px;">
                😕 لا يوجد مستخدم بهذا المعرف
            </div>`;
            return;
        }
        
        const user = snapshot.docs[0].data();
        const userId = snapshot.docs[0].id;
        const currentUser = window.auth ? window.auth.currentUser : null;
        
        // التحقق مما إذا كان المعرف خاص بالمستخدم الحالي
        if (currentUser && userId === currentUser.uid) {
            resultsDiv.innerHTML = `<div class="empty-state" style="text-align: center; padding: 20px;">
                👤 هذا معرفك أنت
            </div>`;
            return;
        }
        
        // تحديد الملصق المناسب
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
        const avatarEmoji = emojiMap[user.avatarType] || '👤';
        
        // عرض النتيجة
        resultsDiv.innerHTML = `
            <div class="search-result-item">
                <div class="search-result-avatar-emoji">${avatarEmoji}</div>
                <div class="search-result-info">
                    <h4>${user.name}</h4>
                    <p>${user.shareableId}</p>
                </div>
                ${currentUser ? '<button class="btn btn-primary" onclick="addFriend(\'' + userId + '\')">➕ إضافة</button>' : ''}
            </div>
        `;
        
    } catch (error) {
        console.error('Search error:', error);
        resultsDiv.innerHTML = `<div class="empty-state" style="text-align: center; padding: 20px; color: #f44336;">
            ⚠️ حدث خطأ في البحث: ${error.message}
        </div>`;
    }
}

// دالة إضافة صديق
window.addFriend = async function(userId) {
    if (!window.auth || !window.auth.currentUser) {
        alert('الرجاء تسجيل الدخول أولاً');
        return;
    }
    
    try {
        await window.db.collection('friendRequests').add({
            from: window.auth.currentUser.uid,
            to: userId,
            status: 'pending',
            timestamp: new Date()
        });
        
        closeModal();
        alert('✅ تم إرسال طلب الصداقة');
    } catch (error) {
        console.error('Error sending request:', error);
        alert('❌ حدث خطأ في إرسال الطلب');
    }
};

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

function loadChats() {
    // للاستخدام المستقبلي
}

// فتح نافذة تعديل الملف الشخصي
window.openEditProfileModal = function() {
    const currentName = document.getElementById('profileName').textContent;
    const currentNameInput = document.getElementById('editName');
    if (currentNameInput) {
        currentNameInput.value = currentName;
    }
    
    const currentEmoji = document.getElementById('profileAvatarEmoji').textContent;
    const currentAvatarEmoji = document.getElementById('currentAvatarEmoji');
    if (currentAvatarEmoji) {
        currentAvatarEmoji.textContent = currentEmoji;
    }
    
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

// دوال الملف الشخصي
window.showUserTrips = function() {
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('tripsPage').style.display = 'block';
};

window.showUserFollowers = function() {
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('followersPage').style.display = 'block';
    
    const list = document.getElementById('followersPageList');
    if (window.followersData && window.followersData.trim() !== '') {
        list.innerHTML = window.followersData;
    } else {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <h3>${i18n ? i18n.t('no_followers') : 'لا يوجد متابعين'}</h3>
                <p>${i18n ? i18n.t('no_followers_desc') : 'لم يتابعك أحد بعد'}</p>
            </div>
        `;
    }
};

window.showUserFollowing = function() {
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('followingPage').style.display = 'block';
    
    const list = document.getElementById('followingPageList');
    if (window.followingData && window.followingData.trim() !== '') {
        list.innerHTML = window.followingData;
    } else {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-friends"></i>
                <h3>${i18n ? i18n.t('no_following') : 'لا تتابع أحداً'}</h3>
                <p>${i18n ? i18n.t('no_following_desc') : 'لم تتابع أي شخص بعد'}</p>
            </div>
        `;
    }
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
    
    const profileAvatar = document.getElementById('profileAvatarEmoji');
    if (profileAvatar) {
        profileAvatar.textContent = selectedEmoji;
    }
    
    const currentAvatar = document.getElementById('currentAvatarEmoji');
    if (currentAvatar) {
        currentAvatar.textContent = selectedEmoji;
    }
    
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

document.addEventListener('languageChanged', function() {
    console.log('Language changed');
});
