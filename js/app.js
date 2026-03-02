document.addEventListener('DOMContentLoaded', () => {
    console.log('App loaded, setting up navigation...');
    ensureSinglePage();
    setupNavigation();
    setupSideMenu();
    setupModals();
    loadStories();
    loadChats();
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

function loadStories() {
    const container = document.getElementById('storiesContainer');
    if (!container) return;
    
    const stories = [
        { name: 'قصتك', avatar: 'fas fa-user-circle' },
        { name: 'محمد', avatar: 'fas fa-user' },
        { name: 'أحمد', avatar: 'fas fa-user-tie' },
        { name: 'سارة', avatar: 'fas fa-user' },
    ];
    
    container.innerHTML = stories.map(story => `
        <div class="story-item">
            <div class="story-avatar-icon">
                <i class="${story.avatar}"></i>
            </div>
            <span class="story-name">${story.name}</span>
        </div>
    `).join('');
}

function loadChats() {
    // للاستخدام المستقبلي
}

// دوال الملف الشخصي
window.showUserTrips = function() {
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('tripsPage').style.display = 'block';
    
    // هنا تجيب بيانات الرحلات من Firebase
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
                <h3>${i18n.t('no_followers')}</h3>
                <p>${i18n.t('no_followers_desc')}</p>
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
                <h3>${i18n.t('no_following')}</h3>
                <p>${i18n.t('no_following_desc')}</p>
            </div>
        `;
    }
};

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

// دالة اختيار الأيقونة
window.selectAvatar = function(type, element) {
    const iconMap = {
        'male': 'fas fa-user',
        'female': 'fas fa-user',
        'boy': 'fas fa-child',
        'girl': 'fas fa-child',
        'father': 'fas fa-user-tie',
        'mother': 'fas fa-user',
        'grandfather': 'fas fa-user',
        'grandmother': 'fas fa-user'
    };
    
    const colorMap = {
        'male': '#2196F3',
        'female': '#E91E63',
        'boy': '#4CAF50',
        'girl': '#FF9800',
        'father': '#3F51B5',
        'mother': '#9C27B0',
        'grandfather': '#795548',
        'grandmother': '#FF5722'
    };
    
    const icon = document.getElementById('profileAvatarIcon');
    if (icon) {
        icon.innerHTML = `<i class="${iconMap[type]}" style="color: ${colorMap[type]}; font-size: 5rem;"></i>`;
    }
    
    // حفظ الاختيار في Firebase (اختياري)
    if (auth && auth.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).update({
            avatarType: type,
            avatarColor: colorMap[type]
        });
    }
    
    closeModal();
};

// فتح نافذة اختيار الأيقونة
window.openAvatarModal = function() {
    const modal = document.getElementById('avatarModal');
    if (modal) modal.classList.add('active');
};

document.addEventListener('languageChanged', function() {
    console.log('Language changed');
});
