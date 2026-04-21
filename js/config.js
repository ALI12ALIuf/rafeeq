// ========== إعدادات Firebase ==========

// تكوين Firebase (استخدم بيانات مشروعك الجديدة)
const firebaseConfig = {
    apiKey: "AIzaSyAuyKDI0JhPn-v02c5l7XekiyymNWeFPIQ",
    authDomain: "rafeeq2-c0aef.firebaseapp.com",
    projectId: "rafeeq2-c0aef",
    storageBucket: "rafeeq2-c0aef.firebasestorage.app",
    messagingSenderId: "1030537082006",
    appId: "1:1030537082006:web:7eb0a052da85e1441bfeb7"
};

// تهيئة Firebase
firebase.initializeApp(firebaseConfig);

// المصادقة وقاعدة البيانات
window.auth = firebase.auth();
window.db = firebase.firestore();
window.googleProvider = new firebase.auth.GoogleAuthProvider();

// إعدادات Firestore (للتأكد من التوافق)
window.db.settings({
    timestampsInSnapshots: true
});

console.log('✅ Firebase initialized with project:', firebaseConfig.projectId);
