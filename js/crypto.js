// ========== نظام التشفير المتقدم ==========

class CryptoSystem {
    constructor() {
        this.currentUserId = null;
        this.keyPairs = new Map(); // userId -> keyPair
        this.sharedSecrets = new Map(); // peerId -> sharedSecret
    }

    // توليد مفتاح خاص وعام (ECDH)
    async generateKeyPair() {
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: "ECDH",
                namedCurve: "P-384"  // منحنى آمن
            },
            true,
            ["deriveKey", "deriveBits"]
        );
        
        return keyPair;
    }

    // تصدير المفتاح العام كـ Base64
    async exportPublicKey(publicKey) {
        const raw = await window.crypto.subtle.exportKey("raw", publicKey);
        return this.arrayBufferToBase64(raw);
    }

    // استيراد المفتاح العام من Base64
    async importPublicKey(base64Key) {
        const raw = this.base64ToArrayBuffer(base64Key);
        return await window.crypto.subtle.importKey(
            "raw",
            raw,
            {
                name: "ECDH",
                namedCurve: "P-384"
            },
            true,
            []
        );
    }

    // توليد سر مشترك (Shared Secret) بين مفتاحي المستخدمين
    async deriveSharedSecret(myPrivateKey, peerPublicKey) {
        const sharedSecret = await window.crypto.subtle.deriveBits(
            {
                name: "ECDH",
                public: peerPublicKey
            },
            myPrivateKey,
            256
        );
        
        return sharedSecret;
    }

    // توليد مفتاح تشفير من السر المشترك
    async deriveEncryptionKey(sharedSecret, salt) {
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            sharedSecret,
            "HKDF",
            false,
            ["deriveKey"]
        );
        
        return await window.crypto.subtle.deriveKey(
            {
                name: "HKDF",
                salt: salt,
                info: new TextEncoder().encode("rafeeq-p2p-chat"),
                hash: "SHA-256"
            },
            keyMaterial,
            {
                name: "AES-GCM",
                length: 256
            },
            true,
            ["encrypt", "decrypt"]
        );
    }

    // تشفير رسالة نصية
    async encryptMessage(message, sharedSecret) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const salt = window.crypto.getRandomValues(new Uint8Array(32));
        
        const encryptionKey = await this.deriveEncryptionKey(sharedSecret, salt);
        
        const encodedMessage = new TextEncoder().encode(message);
        const encrypted = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            encryptionKey,
            encodedMessage
        );
        
        return {
            ciphertext: this.arrayBufferToBase64(encrypted),
            iv: this.arrayBufferToBase64(iv),
            salt: this.arrayBufferToBase64(salt)
        };
    }

    // فك تشفير رسالة نصية
    async decryptMessage(encryptedData, sharedSecret) {
        const iv = this.base64ToArrayBuffer(encryptedData.iv);
        const salt = this.base64ToArrayBuffer(encryptedData.salt);
        const ciphertext = this.base64ToArrayBuffer(encryptedData.ciphertext);
        
        const encryptionKey = await this.deriveEncryptionKey(sharedSecret, salt);
        
        const decrypted = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            encryptionKey,
            ciphertext
        );
        
        return new TextDecoder().decode(decrypted);
    }

    // تشفير ملف (صورة، بصمة، أي ملف)
    async encryptFile(file, sharedSecret) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const salt = window.crypto.getRandomValues(new Uint8Array(32));
        
        const encryptionKey = await this.deriveEncryptionKey(sharedSecret, salt);
        
        const fileBuffer = await file.arrayBuffer();
        const encrypted = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            encryptionKey,
            fileBuffer
        );
        
        return {
            ciphertext: this.arrayBufferToBase64(encrypted),
            iv: this.arrayBufferToBase64(iv),
            salt: this.arrayBufferToBase64(salt),
            type: file.type,
            name: file.name,
            size: file.size
        };
    }

    // فك تشفير ملف
    async decryptFile(encryptedData, sharedSecret) {
        const iv = this.base64ToArrayBuffer(encryptedData.iv);
        const salt = this.base64ToArrayBuffer(encryptedData.salt);
        const ciphertext = this.base64ToArrayBuffer(encryptedData.ciphertext);
        
        const encryptionKey = await this.deriveEncryptionKey(sharedSecret, salt);
        
        const decrypted = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            encryptionKey,
            ciphertext
        );
        
        return decrypted;
    }

    // توليد بصمة للمفتاح (للتأكد من هوية الطرف الآخر)
    async generateKeyFingerprint(publicKey) {
        const raw = await window.crypto.subtle.exportKey("raw", publicKey);
        const hash = await window.crypto.subtle.digest("SHA-256", raw);
        return this.arrayBufferToBase64(hash).substring(0, 16);
    }

    // مساعدة: تحويل ArrayBuffer إلى Base64
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // مساعدة: تحويل Base64 إلى ArrayBuffer
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

// إنشاء نسخة عامة
window.cryptoSystem = new CryptoSystem();
console.log('✅ Crypto system initialized');
