# 🌐 Hướng dẫn truy cập qua LAN (WiFi)

## Cho người dùng khác (đồng nghiệp)

### 1. Truy cập ứng dụng

Mở trình duyệt và truy cập:
```
http://10.10.36.36:5173
```

### 2. Đăng nhập tự động

Khi bạn nhấn nút **"Sign in with Google"**, hệ thống sẽ **TỰ ĐỘNG đăng nhập** cho bạn mà không cần kết nối Google.

**Lưu ý:** Chế độ dev đang bật, nên mọi người sẽ dùng chung 1 tài khoản admin.

### 3. Sử dụng ứng dụng

Sau khi đăng nhập, bạn có thể:
- ✅ Xem danh sách projects
- ✅ Upload ảnh
- ✅ Vẽ annotations
- ✅ Sử dụng AI để label tự động
- ✅ Export COCO format

---

## Cho chủ máy (host)

### Khởi động servers:

**Cách 1: Dùng script tự động**
```powershell
cd E:\VietDynamic\AutoLabel
.\dev_start_lan.ps1
```

**Cách 2: Khởi động thủ công**

Terminal 1 - Backend:
```powershell
cd E:\VietDynamic\AutoLabel
conda activate auto_label
python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
```

Terminal 2 - Frontend:
```powershell
cd E:\VietDynamic\AutoLabel\client
npm run dev -- --host 0.0.0.0
```

### Kiểm tra:

- Backend: `http://10.10.36.36:8000/docs`
- Frontend: `http://10.10.36.36:5173`

### Chia sẻ URL:

Gửi cho đồng nghiệp:
```
Frontend: http://10.10.36.36:5173
```

---

## ⚠️ Lưu ý quan trọng

1. **Chế độ Dev**: `DEV_OAUTH_PERMISSIVE=1` đang bật → Tự động đăng nhập, không cần Google OAuth
2. **Tài khoản chung**: Mọi người dùng chung 1 tài khoản admin
3. **Cùng WiFi**: Máy tính phải cùng mạng WiFi/LAN
4. **Firewall**: Đã cấu hình cho phép port 8000 và 5173

## 🔥 Xử lý lỗi thường gặp

### Lỗi: "Cannot connect" hoặc "ERR_CONNECTION_REFUSED"

**Nguyên nhân:** Backend/Frontend chưa chạy hoặc firewall chặn

**Giải pháp:**
1. Kiểm tra servers đang chạy:
   ```powershell
   Get-Process | Where-Object {$_.ProcessName -like '*python*' -or $_.ProcessName -like '*node*'}
   ```

2. Restart firewall:
   ```powershell
   .\setup_firewall.ps1
   ```

### Lỗi: "OPTIONS /me HTTP/1.1 400 Bad Request"

**Nguyên nhân:** Chưa đăng nhập

**Giải pháp:** Nhấn nút "Sign in with Google" → Sẽ tự động đăng nhập

### Lỗi: "404 Not Found"

**Nguyên nhân:** Frontend gọi sai URL backend

**Giải pháp:** Đã fix trong code, restart lại cả 2 servers

---

## 📊 Kiểm tra trạng thái

### Test từ máy host:

```powershell
# Test backend
curl http://localhost:8000/docs

# Test từ LAN IP
curl http://10.10.36.36:8000/docs
```

### Test từ máy đồng nghiệp:

Mở trình duyệt:
- Frontend: `http://10.10.36.36:5173`
- Backend API: `http://10.10.36.36:8000/docs`

---

## 🎯 Tóm tắt nhanh

1. **Host**: Chạy `.\dev_start_lan.ps1`
2. **Người dùng**: Truy cập `http://10.10.36.36:5173`
3. **Đăng nhập**: Nhấn "Sign in with Google" → Tự động đăng nhập
4. **Sử dụng**: Thoải mái dùng tất cả chức năng!

✅ Không cần setup gì thêm!
