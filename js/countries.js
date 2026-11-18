// ========== countries.js - قائمة الدول والأعلام ==========

window.Countries = {
    list: [
        { code: 'IQ', name: 'العراق', flag: '🇮🇶' },
        { code: 'SA', name: 'السعودية', flag: '🇸🇦' },
        { code: 'EG', name: 'مصر', flag: '🇪🇬' },
        { code: 'AE', name: 'الإمارات', flag: '🇦🇪' },
        { code: 'KW', name: 'الكويت', flag: '🇰🇼' },
        { code: 'JO', name: 'الأردن', flag: '🇯🇴' },
        { code: 'LB', name: 'لبنان', flag: '🇱🇧' },
        { code: 'SY', name: 'سوريا', flag: '🇸🇾' },
        { code: 'YE', name: 'اليمن', flag: '🇾🇪' },
        { code: 'OM', name: 'عمان', flag: '🇴🇲' },
        { code: 'BH', name: 'البحرين', flag: '🇧🇭' },
        { code: 'QA', name: 'قطر', flag: '🇶🇦' },
        { code: 'LY', name: 'ليبيا', flag: '🇱🇾' },
        { code: 'TN', name: 'تونس', flag: '🇹🇳' },
        { code: 'DZ', name: 'الجزائر', flag: '🇩🇿' },
        { code: 'MA', name: 'المغرب', flag: '🇲🇦' },
        { code: 'SD', name: 'السودان', flag: '🇸🇩' },
        { code: 'PS', name: 'فلسطين', flag: '🇵🇸' },
        { code: 'MR', name: 'موريتانيا', flag: '🇲🇷' },
        { code: 'SO', name: 'الصومال', flag: '🇸🇴' },
        { code: 'TR', name: 'تركيا', flag: '🇹🇷' },
        { code: 'IR', name: 'إيران', flag: '🇮🇷' },
        { code: 'US', name: 'أمريكا', flag: '🇺🇸' },
        { code: 'GB', name: 'بريطانيا', flag: '🇬🇧' },
        { code: 'DE', name: 'ألمانيا', flag: '🇩🇪' },
        { code: 'FR', name: 'فرنسا', flag: '🇫🇷' },
        { code: 'CA', name: 'كندا', flag: '🇨🇦' },
        { code: 'AU', name: 'أستراليا', flag: '🇦🇺' }
    ],
    
    getFlag(code) {
        const country = this.list.find(c => c.code === code);
        return country ? country.flag : '🌍';
    },
    
    getName(code) {
        const country = this.list.find(c => c.code === code);
        return country ? country.name : 'غير محدد';
    },
    
    getCountry(code) {
        return this.list.find(c => c.code === code);
    },
    
    findByName(name) {
        return this.list.find(c => c.name === name);
    }
};

console.log('✅ countries.js تم تحميله - ' + window.Countries.list.length + ' دولة');
