# Google OAuth Setup Guide

## Lỗi: `redirect_uri_mismatch`

Lỗi này xảy ra khi URL callback không được cấu hình trong Google Cloud Console.

### Cách fix:

1. **Truy cập Google Cloud Console:**
   - https://console.cloud.google.com/

2. **Tìm OAuth 2.0 Client ID:**
   - Navigation → APIs & Services → Credentials
   - Tìm OAuth 2.0 Client ID: `367556225135-3oks7p52e2t3ruf1afgmu5kij3glieqo.apps.googleusercontent.com`

3. **Thêm Authorized redirect URIs:**
   Nhấp vào client ID và thêm các URI sau vào **"Authorized redirect URIs"**:
   ```
   http://127.0.0.1:8000/auth/callback
   http://localhost:8000/auth/callback
   http://10.10.36.36:8000/auth/callback
   ```

4. **Lưu thay đổi (Save)**

5. **Reload backend:**
   ```powershell
   # Stop backend (Ctrl+C)
   # Then restart:
   conda activate auto_label
   cd e:\VietDynamic\AutoLabel
   python -m uvicorn server.main:app --host 127.0.0.1 --port 8000 --reload
   ```

6. **Thử login lại**

### Nếu bạn không có quyền truy cập Google Cloud Console:

Hãy liên hệ với Admin của project Google Cloud để thêm redirect URIs.

### Thay thế tạm thời:

Nếu cần, bạn có thể sử dụng Dev Login endpoint:
```bash
curl -X POST "http://127.0.0.1:8000/auth/dev-login?email=lophoccntt20@gmail.com"
```

Sau đó truy cập: `http://127.0.0.1:5174`
