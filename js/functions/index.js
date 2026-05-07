const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();
const MAX_ATTEMPTS = 3;

// ========== إنشاء كابتشا ==========
exports.generateCaptcha = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول');
    
    const uid = context.auth.uid;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    await db.collection('captchas').doc(uid).set({
        code: code,
        attempts: 0,
        blocked: false,
        blockUntil: null,
        blockCount: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { code: code };
});

// ========== التحقق من الكابتشا ==========
exports.verifyCaptcha = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول');
    
    const uid = context.auth.uid;
    const enteredCode = data.code;
    
    if (!enteredCode || enteredCode.length !== 6) {
        return { success: false, error: 'الرجاء إدخال 6 أرقام' };
    }
    
    const doc = await db.collection('captchas').doc(uid).get();
    if (!doc.exists) return { success: false, error: 'انتهت صلاحية الرمز' };
    
    const captchaData = doc.data();
    
    // تحقق من الحظر
    if (captchaData.blocked) {
        const now = admin.firestore.Timestamp.now();
        if (captchaData.blockUntil && captchaData.blockUntil > now) {
            const remaining = Math.ceil((captchaData.blockUntil.toMillis() - now.toMillis()) / 1000);
            return { success: false, error: 'محظور', blocked: true, remaining: remaining };
        }
        // فك الحظر
        await db.collection('captchas').doc(uid).update({ blocked: false, attempts: 0 });
        captchaData.attempts = 0;
    }
    
    // تحقق من الرمز
    if (enteredCode === captchaData.code) {
        await db.collection('captchas').doc(uid).delete();
        return { success: true };
    }
    
    // رمز خاطئ
    const newAttempts = captchaData.attempts + 1;
    
    if (newAttempts >= MAX_ATTEMPTS) {
        const blockCount = (captchaData.blockCount || 0) + 1;
        const blockTimes = [60, 180, 300, 3600, 10800, 43200, 86400];
        const blockSeconds = blockTimes[Math.min(blockCount - 1, blockTimes.length - 1)];
        const blockUntil = new Date(Date.now() + blockSeconds * 1000);
        
        await db.collection('captchas').doc(uid).update({
            attempts: newAttempts,
            blocked: true,
            blockUntil: admin.firestore.Timestamp.fromDate(blockUntil),
            blockCount: blockCount
        });
        
        return { success: false, error: 'محظور', blocked: true, remaining: blockSeconds };
    }
    
    await db.collection('captchas').doc(uid).update({ attempts: newAttempts });
    return { success: false, error: `رمز غير صحيح. متبقي ${MAX_ATTEMPTS - newAttempts} محاولات` };
});

// ========== تجديد الكابتشا ==========
exports.refreshCaptcha = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول');
    
    const uid = context.auth.uid;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    await db.collection('captchas').doc(uid).update({
        code: code,
        attempts: 0
    });
    
    return { code: code };
});
