// ==================== Service Worker - نظام التنزيل ====================
const pendingFiles = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// استقبال الملفات من الصفحة وقت الاستلام (مش وقت الضغط)
self.addEventListener('message', e => {
    const msg = e.data || {};
    if (msg.type === 'STORE_FILE') {
        pendingFiles.set(msg.id, {
            fileName: msg.fileName,
            mimeType: msg.mimeType,
            data: msg.data
        });
        // رد فوري - الـ URL جاهز
        e.ports[0]?.postMessage({ type: 'READY', id: msg.id });
    }
    if (msg.type === 'CLEAR') pendingFiles.clear();
});

// تقديم الملف عند طلب الرابط
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    if (!url.pathname.includes('/_dl/')) return;

    const id = url.searchParams.get('id');
    if (!id || !pendingFiles.has(id)) return;

    const file = pendingFiles.get(id);
    // لا نحذفه - نخليه موجود لو أراد التنزيل مرة ثانية

    e.respondWith((async () => {
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
                'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName || 'file')}`,
                'Content-Length': String(blob.size)
            }
        });
    })());
});
