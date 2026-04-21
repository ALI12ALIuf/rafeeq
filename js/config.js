// تكوين Firebase (استخدم بيانات مشروعك)
const firebaseConfig = {
    apiKey: "AIzaSyApCsnS6CjnzfMPjNsvidLiuX0ZlJ11szU",
    authDomain: "rafeeq-9959a.firebaseapp.com",
    projectId: "rafeeq-9959a",
    storageBucket: "rafeeq-9959a.firebasestorage.app",
    messagingSenderId: "348154736690",
    appId: "1:348154736690:web:c2ebd6c4fb88e3594f8c2b"
};

// تهيئة Firebase
firebase.initializeApp(firebaseConfig);

window.auth = firebase.auth();
window.db = firebase.firestore();
window.googleProvider = new firebase.auth.GoogleAuthProvider();

// إعدادات Firestore
window.db.settings({
    timestampsInSnapshots: true
});

console.log('✅ Firebase initialized');
