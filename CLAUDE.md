# Sapir Bot - הנחיות לקלוד

## סביבת עבודה
- **סוג פרויקט**: Cloudflare Worker עם D1 database
- **Frontend**: React 18 (CDN) + Tailwind CSS + Babel בדפדפן
- **קובץ ראשי**: `public/index.html` (single-file React app)
- **Worker**: `src/worker.js`
- **שפה**: עברית (RTL)

## Deploy
- הפרויקט משתמש ב-gradual rollouts
- `wrangler versions upload` - מעלה גרסה חדשה (preview בלבד)
- `wrangler deploy` - deploy ישירות ל-production
- Preview URL מתקבל בסוף הבילד

## Git workflow
- Main branch: `main`
- לשינויים משמעותיים - לעבוד על branch נפרד ולבדוק ב-preview לפני merge
- הרפו נמצא ב: github.com/twistShlomo/sapir-bot

## סגנון קוד
- גרסה מוצגת ב-sidebar ובתגית HTML (לעדכן בשניהם)
- אייקונים: Phosphor Icons (`ph ph-*`)
- עברית: כל הטקסטים בעברית, dir="rtl"

## תבניות שימושיות
- Toast notifications במקום alert()
- Skeleton loading בזמן טעינה
- Mobile-first עם breakpoints של Tailwind (sm/md/lg/xl)
