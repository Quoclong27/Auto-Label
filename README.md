# 🏷️ AutoLabel - AI-Powered Image Annotation Platform

Nền tảng annotation ảnh tự động sử dụng AI (SAM2, YOLO, GroundingDINO) để hỗ trợ gán nhãn dataset cho machine learning.

## ✨ Features

- 🤖 **Auto Segmentation**: SAM2 (Segment Anything Model 2)
- 🎯 **Object Detection**: YOLO-E với visual & text prompts
- 🖱️ **Manual Annotation**: Box, polygon, point annotations
- 📦 **Export COCO Format**: Xuất dataset chuẩn COCO JSON
- 👥 **Multi-user**: Google OAuth authentication
- 🌐 **Public/Private Projects**: Chia sẻ hoặc giữ riêng tư
- ☁️ **Cloud Storage**: Cloudinary integration
- 📊 **Admin Dashboard**: Quản lý users và projects

## 🚀 Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- Conda (recommended)

### Installation

1. **Clone repository:**
   ```bash
   git clone https://github.com/yourusername/autolabel.git
   cd autolabel
   ```

2. **Setup Backend:**
   ```bash
   # Create conda environment
   conda create -n auto_label python=3.10
   conda activate auto_label
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Copy and configure environment
   cp server/.env.example server/.env
   # Edit server/.env with your settings
   
   # Run backend
   python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
   ```

3. **Setup Frontend:**
   ```bash
   cd client
   npm install
   
   # Copy and configure environment
   cp .env.example .env
   # Edit .env with your settings
   
   # Run frontend
   npm run dev
   ```

4. **Access application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000

## 🔧 Configuration

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URIs:
   - `http://localhost:8000/auth/callback`
4. Copy Client ID and Secret to `server/.env`

### Cloudinary Setup (Optional)

1. Sign up at [Cloudinary](https://cloudinary.com)
2. Get your credentials from Dashboard
3. Update `server/.env`:
   ```env
   USE_CLOUDINARY=true
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

## 📁 Project Structure

```
autolabel/
├── server/              # FastAPI backend
│   ├── main.py         # API endpoints
│   ├── auth.py         # OAuth authentication
│   ├── models.py       # Database models
│   ├── sam2_service.py # SAM2 integration
│   └── yoloe_service.py# YOLO-E integration
├── client/             # React frontend
│   ├── src/
│   │   ├── pages/     # Page components
│   │   ├── lib/       # Utilities & API
│   │   └── components/# Reusable components
│   └── public/
├── sam2/              # SAM2 model
├── yoloe/             # YOLO-E model
└── uploads/           # Local image storage
```

## 🌐 LAN Access (Development)

Share with team on same WiFi:

1. Get your LAN IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. Update `server/.env`: `LAN_IP=10.10.x.x`
3. Enable dev mode: `DEV_OAUTH_PERMISSIVE=1`
4. Access from other devices: `http://10.10.x.x:5173`

See `QUICK_LAN_GUIDE.md` for details.

## 🚀 Production Deployment

See `DEPLOYMENT_GUIDE.md` (coming soon) for production deployment to:
- Railway.app (Backend)
- Vercel (Frontend)
- PostgreSQL (Database)
- Cloudinary (Storage)

## 📚 Documentation

- [Manual Annotation Guide](MANUAL_ANNOTATION_USER_GUIDE.md)
- [Developer Guide](MANUAL_ANNOTATION_DEVELOPER_GUIDE.md)
- [LAN Setup](QUICK_LAN_GUIDE.md)
- [OAuth Setup](GOOGLE_OAUTH_SETUP.md)

## 🛠️ Tech Stack

**Backend:**
- FastAPI
- SQLAlchemy (async)
- SQLite / PostgreSQL
- SAM2, YOLO-E, GroundingDINO
- Cloudinary SDK

**Frontend:**
- React 18
- TypeScript
- Vite
- Tailwind CSS
- Konva (canvas)

## 📄 License

[Add your license here]

## 👥 Contributors

- [@yourusername](https://github.com/yourusername)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Contact

For questions or support, reach out to: your.email@example.com
