// ==================== Service Worker - نظام التنزيل ====================
// يعمل محلياً على جهاز المستخدم - لا يخرج أي بيانات للخارج

const SW_VERSION = 'v1';
const DOWNLOAD_PATH = '/rafeeq/_dl/';

// تخزين مؤقت للملفات المنتظرة التنزيل
const pendingFiles = new Map();

self.addEventListener('install', e => {
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(self.clients.claim());
});

// استقبال رسائل من الصفحة الرئيسية
self.addEventListener('message', e => {
    const { type, id, fileName, mimeType, data } = e.data || {};

    if (type === 'STORE_FILE') {
        // تخزين بيانات الملف مؤقتاً
        pendingFiles.set(id, { fileName, mimeType, data });
        // إرسال تأكيد للصفحة
        e.source.postMessage({ type: 'FILE_READY', id, fileName });
    }

    if (type === 'CLEAR') {
        pendingFiles.clear();
    }
});

// اعتراض طلبات التنزيل
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // فقط طلبات _dl/
    if (!url.pathname.includes('/_dl/')) return;

    const id = url.searchParams.get('id');
    if (!id || !pendingFiles.has(id)) return;

    const file = pendingFiles.get(id);
    pendingFiles.delete(id); // مسح بعد الاستخدام

    e.respondWith((async () => {
        try {
            // تحويل base64 أو dataUrl إلى Blob
            let base64, mime = file.mimeType || 'application/octet-stream';
            const dataUrl = file.data;

            if (dataUrl.startsWith('data:')) {
                const comma = dataUrl.indexOf(',');
                base64 = dataUrl.substring(comma + 1);
                const m = dataUrl.match(/data:([^;]+)/);
                if (m) mime = m[1];
            } else {
                base64 = dataUrl;
            }

            base64 = base64.replace(/[\r\n\t ]/g, '');
            const pad = base64.length % 4;
            if (pad === 2) base64 += '==';
            else if (pad === 3) base64 += '=';

            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: mime });

            return new Response(blob, {
                status: 200,
                headers: {
                    'Content-Type': mime,
                    'Content-Disposition': `attachment; filename="${encodeURIComponent(file.fileName || 'file')}"`,
                    'Content-Length': blob.size,
                }
            });
        } catch(err) {
            return new Response('Error: ' + err.message, { status: 500 });
        }
    })());
});
