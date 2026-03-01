// إدارة التنقل بين الصفحات
document.addEventListener('DOMContentLoaded', () => {
    console.log('App loaded, setting up navigation...');
    
    // إعداد أزرار التنقل
    setupNavigation();
    
    // إعداد القائمة الجانبية
    setupSideMenu();
    
    // إعداد النوافذ المنبثقة
    setupModals();
    
    // تحميل القصص والمحادثات
    loadStories();
    loadChats();
});

// إعداد التنقل
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const menuLinks = document.querySelectorAll('.menu-items a');
    const pages = document.querySelectorAll('.page');
    
    if (!navItems.length || !pages.length) {
        console.log('Navigation elements not found yet');
        return;
    }
    
    function switchPage(pageId) {
        console.log('Switching to page:', pageId);
        
        pages.forEach(page => page.classList.remove('active'));
        
        const targetPage = document.querySelector(`.page.${pageId}-page`);
        if (targetPage) {
            targetPage.classList.add('active');
        }
        
        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageId);
        });
        
        const sideMenu = document.getElementById('sideMenu');
        if (sideMenu) sideMenu.classList.remove('open');
    }
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            switchPage(item.dataset.page);
        });
    });
    
    menuLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            if (page) {
                switchPage(page);
            }
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

// إعداد القائمة الجانبية
function setupSideMenu() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof logout === 'function') {
                logout();
            }
        });
    }
}

// إعداد النوافذ المنبثقة
function setupModals() {
    window.openLanguageModal = function() {
        const modal = document.getElementById('languageModal');
        if (modal) modal.classList.add('active');
    };
    
    window.openSearchModal = function() {
        const modal = document.getElementById('searchModal');
        if (modal) modal.classList.add('active');
    };
    
    window.closeModal = function() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    };
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
    
    const searchBtn = document.querySelector('.search-box button');
    if (searchBtn) {
        searchBtn.addEventListener('click', openSearchModal);
    }
    
    const langItems = document.querySelectorAll('.settings-item');
    langItems.forEach(item => {
        if (item.querySelector('[data-i18n="language"]')) {
            item.addEventListener('click', openLanguageModal);
        }
    });
}

// التبديل بين تبويبات الملف الشخصي
window.switchProfileTab = function(tab) {
    console.log('Switching profile tab to:', tab);
    
    const tabs = document.querySelectorAll('.profile-tabs .tab-btn');
    const panes = document.querySelectorAll('.profile-tab-content .tab-pane');
    
    tabs.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(tab));
    });
    
    panes.forEach(pane => {
        pane.classList.toggle('active', pane.id === tab + 'Tab');
    });
};

// فتح الدردشة
window.openChat = function(userId) {
    alert('الدردشة المباشرة قيد التطوير');
};

// تحميل القصص
function loadStories() {
    const container = document.getElementById('storiesContainer');
    if (!container) return;
    
    const stories = [
        { name: 'قصتك', avatar: 'https://ui-avatars.com/api/?name=You&background=2196F3&color=fff' },
        { name: 'محمد', avatar: 'https://ui-avatars.com/api/?name=محمد&background=4CAF50&color=fff' },
        { name: 'أحمد', avatar: 'https://ui-avatars.com/api/?name=أحمد&background=FF9800&color=fff' },
        { name: 'سارة', avatar: 'https://ui-avatars.com/api/?name=سارة&background=E91E63&color=fff' },
    ];
    
    container.innerHTML = stories.map(story => `
        <div class="story-item">
            <img src="${story.avatar}" class="story-avatar">
            <span class="story-name">${story.name}</span>
        </div>
    `).join('');
}

// تحميل المحادثات
function loadChats() {
    const container = document.getElementById('chatsList');
    if (!container) return;
}

// عرض رحلات المستخدم
window.showUserTrips = function() {
    document.getElementById('tripsList').style.display = 'none';
    document.getElementById('followersList').style.display = 'none';
    document.getElementById('followingList').style.display = 'none';
    document.getElementById('tripsList').style.display = 'block';
};

// عرض قائمة المتابعين
window.showUserFollowers = function() {
    document.getElementById('tripsList').style.display = 'none';
    document.getElementById('followersList').style.display = 'none';
    document.getElementById('followingList').style.display = 'none';
    document.getElementById('followersList').style.display = 'block';
    
    const followersContainer = document.querySelector('#followersList .users-list');
    if (followersContainer && window.followersData) {
        followersContainer.innerHTML = window.followersData;
    }
};

// عرض قائمة من يتابعهم
window.showUserFollowing = function() {
    document.getElementById('tripsList').style.display = 'none';
    document.getElementById('followersList').style.display = 'none';
    document.getElementById('followingList').style.display = 'none';
    document.getElementById('followingList').style.display = 'block';
    
    const followingContainer = document.querySelector('#followingList .users-list');
    if (followingContainer && window.followingData) {
        followingContainer.innerHTML = window.followingData;
    }
};

// استقبال حدث تغيير اللغة
document.addEventListener('languageChanged', function() {
    console.log('Language changed, icons remain fixed');
});
