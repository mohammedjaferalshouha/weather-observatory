# البنية والأمان | Architecture and Security

## تدفق البيانات | Data flow

1. يتولى المتصفح عرض الواجهة والبحث والخريطة والإعدادات المحلية.
2. يُطلب المصدر المفتوح مباشرة دون مفتاح خاص.
3. تمر المصادر التي تحتاج مفاتيح عبر دوال الاستضافة.
4. تقرأ الدوال المفاتيح من متغيرات البيئة الخادمية.
5. لا تصل المفاتيح إلى ملفات الواجهة أو حزمة الإنتاج.

1. The browser renders the interface, search, map, and local preferences.
2. The open provider is requested directly without a private key.
3. Providers that require credentials are accessed through hosting functions.
4. Functions read credentials from server-side environment variables.
5. Keys never enter the client source or production bundle.

## المكونات | Components

- الواجهة الرئيسية: الحالة الحالية والساعات والأيام والتفاصيل.
- البحث: المدن والإحداثيات والمفضلة والسجل.
- مقارنة النماذج: اختيار النماذج والفترة والرسم البياني.
- الخريطة: الإسقاط المسطح والكروي والحقول وطبقات الرصد.
- الدوال الخادمية: حماية المفاتيح والتحقق من المصادر المسموحة.

- Main interface: current conditions, hourly, daily, and detailed metrics.
- Search: cities, coordinates, favorites, and history.
- Model comparison: model selection, period selection, and charting.
- Map: flat and globe projections, weather fields, and observation layers.
- Serverless functions: credential protection and origin validation.

## الأداء | Performance

- تُحمّل مكتبة الخريطة عند طلبها فقط.
- تُخفف المؤثرات المكلفة على أجهزة اللمس.
- تُخزن ملفات البناء الثابتة بذاكرة تخزين طويلة.
- تعرض الخريطة قيمة واحدة عند الموقع المختار لتقليل الازدحام والطلبات.

- The map bundle loads only when requested.
- Expensive visual effects are reduced on touch devices.
- Hashed production assets use long-lived caching.
- The map renders a single selected-location value to reduce clutter and requests.

## فحص الإنتاج | Production checks

```bash
npm run build
```

افحص أن المصدرين الثانويين يظهران «متاح» بعد ضبط متغيرات الاستضافة، وأن البحث والخريطة يعملان على الهاتف والكمبيوتر.

Verify that both protected secondary providers show as available after hosting variables are configured, and test search and map behavior on both mobile and desktop.
