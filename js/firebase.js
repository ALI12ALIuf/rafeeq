// إعدادات Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAgzcrAAC5Yn-uIopUUYvcjTOn0-mR2D94",
    authDomain: "rafeeq-f656c.firebaseapp.com",
    projectId: "rafeeq-f656c",
    storageBucket: "rafeeq-f656c.firebasestorage.app",
    messagingSenderId: "102848779844",
    appId: "1:102848779844:web:211c7ef6d7acfccf014e11"
};

// تهيئة Firebase
try {
    firebase.initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Firebase initialization error:', error);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// إعدادات Firestore
try {
    db.settings({
        cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
    });
    
    // تمكين persistence
    firebase.firestore().enablePersistence()
        .catch((err) => {
            if (err.code == 'failed-precondition') {
                console.log('Persistence failed: multiple tabs open');
            } else if (err.code == 'unimplemented') {
                console.log('Persistence not available in this browser');
            }
        });
} catch (error) {
    console.error('Firestore settings error:', error);
}
