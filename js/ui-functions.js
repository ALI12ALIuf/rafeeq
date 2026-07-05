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
        
        if (id === 'chat') loadChats(); 
        nav.forEach(n => n.classList.toggle('active', n.dataset.page === id)); 
    } 
    
    // ✅ جعل الدالة عامة للاستخدام من أي مكان
    window.switchPage = switchPage;
    
    nav.forEach(n => n.addEventListener('click', () => switchPage(n.dataset.page))); 
}
