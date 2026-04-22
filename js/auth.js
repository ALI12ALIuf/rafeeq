function updateUserUI() {
    const splash = document.getElementById('splash');
    const app = document.getElementById('app');
    const loginScreen = document.querySelector('.login-screen');
    
    if (splash) splash.style.display = 'none';
    if (loginScreen) loginScreen.style.display = 'none';
    if (app) app.style.display = 'flex';
    
    // إعادة تحميل جميع البيانات
    setTimeout(() => {
        if (typeof loadChats === 'function') loadChats();
        if (typeof updateTripsCount === 'function') updateTripsCount();
        if (typeof loadUserTrips === 'function') loadUserTrips();
        if (typeof loadFriendsList === 'function') loadFriendsList();
        if (typeof loadFriendRequests === 'function') loadFriendRequests();
    }, 300);
}
