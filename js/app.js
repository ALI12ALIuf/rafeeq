document.addEventListener('DOMContentLoaded', () => {
    console.log('App loaded, setting up navigation...');
    setupNavigation();
    setupSideMenu();
    setupModals();
    loadStories();
    loadChats();
});

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const menuLinks = document.querySelectorAll('.menu-items a');
    const pages = document.querySelectorAll('.page');
    
    if (!navItems.length || !pages.length) return;
    
    function switchPage(pageId) {
        pages.forEach(page => page.classList.remove('active'));
        const targetPage = document.querySelector(`.page.${pageId}-page`);
        if (targetPage) targetPage.classList.add('active');
        
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

function loadChats() {
    // للاستخدام المستقبلي
}

// دوال الملف الشخصي
window.showUserTrips = function() {
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('tripsPage').style.display = 'block';
    document.getElementById('tripsGrid').innerHTML = '<div class="empty-state">لا توجد رحلات</div>';
};

window.showUserFollowers = function() {
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('followersPage').style.display = 'block';
    
    const list = document.getElementById('followersPageList');
    list.innerHTML = window.followersData || '<div class="empty-state">لا يوجد متابعين</div>';
};

window.showUserFollowing = function() {
    document.querySelector('.profile-page').style.display = 'none';
    document.getElementById('followingPage').style.display = 'block';
    
    const list = document.getElementById('followingPageList');
    list.innerHTML = window.followingData || '<div class="empty-state">لا تتابع أحداً</div>';
};

window.goBack = function() {
    document.querySelectorAll('.profile-subpage').forEach(page => {
        page.style.display = 'none';
    });
    document.querySelector('.profile-page').style.display = 'block';
};

document.addEventListener('languageChanged', function() {
    console.log('Language changed');
});
