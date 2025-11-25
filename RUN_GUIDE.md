# Hướng dẫn Chạy Auto Label

## 📋 Chuẩn bị

### 1. Frontend Environment (client/.env)
```env
VITE_BACKEND_HOST=10.10.36.36
VITE_BACKEND_PORT=8000
VITE_API_URL=http://10.10.36.36:8000

VITE_FRONTEND_HOST=10.10.36.36
VITE_FRONTEND_PORT=5173
```

### 2. Backend Environment (server/.env)
```env
BACKEND_HOST=10.10.36.36
BACKEND_PORT=8000
BACKEND_URL=http://10.10.36.36:8000
FRONTEND_URL=http://10.10.36.36:5173

GOOGLE_CLIENT_ID=367556225135-3oks7p52e2t3ruf1afgmu5kij3glieqo.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
DEV_OAUTH_PERMISSIVE=1

ADMIN_EMAIL=longtqse172269@fpt.edu.vn
DATABASE_URL=sqlite+aiosqlite:///./app.db
SECRET_KEY=your-secret-key
```

## 🚀 Cách Chạy

### Terminal 1: Backend
```powershell
cd e:\VietDynamic\AutoLabel
$env:BACKEND_URL="http://10.10.36.36:8000"
$env:FRONTEND_URL="http://10.10.36.36:5173"
$env:GOOGLE_CLIENT_ID="367556225135-3oks7p52e2t3ruf1afgmu5kij3glieqo.apps.googleusercontent.com"
$env:GOOGLE_CLIENT_SECRET="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"
$env:DEV_OAUTH_PERMISSIVE="1"

conda activate auto_label
python -m uvicorn server.main:app --host 10.10.36.36 --port 8000 --reload
```

### Terminal 2: Frontend
```powershell
cd e:\VietDynamic\AutoLabel\client
npm run dev
```

## 🌐 Truy Cập

- **Frontend**: http://10.10.36.36:5173
- **Backend API**: http://10.10.36.36:8000
- **API Docs**: http://10.10.36.36:8000/docs

## 🔧 Cấu hình IP

Khi IP thay đổi, sửa ở **3 file**:

1. `client/.env` → `VITE_API_URL`
2. `server/.env` → `BACKEND_URL`, `FRONTEND_URL`  
3. Terminal → Set `$env:BACKEND_URL` trước chạy backend

## ⚠️ Lỗi OAuth

Nếu thấy lỗi `device_id and device_name are required`:

1. **Kiểm tra URL callback:**
   - Đúng: `http://10.10.36.36:8000/auth/callback`
   - Sai: `http://10.10.36.36/:8000/auth/callback` (có dấu `/:`thừa)

2. **Cách fix:**
   - Đảm bảo `BACKEND_URL` không có dấu `/` thừa
   - Restart backend

3. **Hoặc - bypass OAuth (dev mode):**
   - Set `DEV_OAUTH_PERMISSIVE=1` (đã có sẵn)

## 📝 Troubleshooting

### Backend không connect tới Frontend
→ Kiểm tra `BACKEND_URL` không có dấu `:` thừa

### Frontend không gọi được API
→ Kiểm tra `VITE_API_URL` đúng IP:PORT

### OAuth lỗi 400
→ Xem mục "⚠️ Lỗi OAuth" ở trên
