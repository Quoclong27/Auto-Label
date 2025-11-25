import React, { useState } from "react";
import { API } from "../lib/api";

export default function Landing() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    // Top-level navigation để Google OAuth giữ cookie/session chuẩn
    window.location.href = `${API}/auth/login`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-neutral-950 text-white">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 overflow-hidden rounded-2xl bg-white/10 shadow-inner backdrop-blur flex items-center justify-center">
              <p className="text-white font-bold text-lg">VD</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-300">Workspace</p>
              <h1 className="text-xl font-bold tracking-tight">VietDynamic Auto-Label</h1>
            </div>
          </div>
          <div className="flex items-center">
            <img
              src="/logo2.png"
              alt="Company Logo"
              className="h-24 w-auto object-contain"
              draggable={false}
            />
          </div>
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="rounded-full border-2 border-white/30 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:border-white hover:bg-white/15 hover:shadow-lg disabled:opacity-50 flex items-center gap-3 min-w-[260px] justify-center whitespace-nowrap"
            aria-label="Login with Google"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <span>{isLoggingIn ? "Redirecting..." : "Login with Google"}</span>
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-12 pb-16">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight">
              Real-Time <span className="underline decoration-emerald-500">Seeing Anything</span>
              <span className="block md:inline"> — Tạo nhãn nhanh, xuất COCO, quản lý dự án như Roboflow</span>
            </h1>
            <p className="mt-5 text-lg md:text-xl text-slate-300 ">
              Công cụ hỗ trợ 3 chế độ: <b>Text Prompt</b>, <b>Box Prompt</b>, và <b>Prompt-Free</b>. Xử lý hàng loạt ảnh,
              lưu Cloudinary, xác nhận nhãn, và xuất COCO JSON hoặc YOLO FORMAT sẵn sàng huấn luyện.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:border-white hover:bg-white/20 disabled:opacity-50"
              >
                🚀 {isLoggingIn ? "Đang chuyển hướng..." : "Login with Google"}
              </button>
              <div className="text-sm text-slate-400">
                Chưa có tài khoản? Đăng nhập để tự tạo Project đầu tiên.
              </div>
            </div>

            {/* Stats */}
            <div className="mt-8 grid grid-cols-3 gap-4 max-w-lg">
              <div className="rounded-2xl border border-white/10 bg-white/90 backdrop-blur px-4 py-5 text-slate-900">
                <div className="text-2xl font-bold">3</div>
                <div className="text-sm text-black">Chế độ gợi ý</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/90 backdrop-blur px-4 py-5 text-slate-900">
                <div className="text-2xl font-bold">Batch</div>
                <div className="text-sm text-black">Xử lý hàng loạt</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/90 backdrop-blur px-4 py-5 text-slate-900">
                <div className="text-2xl font-bold">COCO</div>
                <div className="text-sm text-black">Xuất JSON huấn luyện</div>
              </div>
            </div>
          </div>

          {/* Right visual / steps card */}
          <div className="rounded-3xl border border-white/15 bg-white/95 p-6 text-slate-900 shadow-[0_30px_80px_-50px_rgba(15,23,42,0.6)]">
            <div className="text-sm font-semibold text-black mb-3">Pipeline Overview</div>
            <ol className="space-y-3 text-sm">
              {[
                "Tạo Project mới hoặc mở project sẵn có.",
                "Upload ảnh (lưu vào Cloudinary).",
                "Chạy Text / Box / Prompt-Free để tạo gợi ý nhãn.",
                "Xác nhận nhãn (Approve/Reject) theo ảnh hoặc theo box.",
                "Xuất COCO JSON để huấn luyện mô hình.",
              ].map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="h-6 w-6 shrink-0 grid place-items-center rounded-full bg-white/10 text-black text-xs">
                    {i + 1}
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>

            <div className="mt-6 grid grid-cols-3 gap-3 text-center text-xs">
              <div className="rounded-xl border border-white/10 bg-white/90 text-slate-900 p-3">
                🔤<div className="mt-1 font-medium text-black">Text Prompt</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/90 text-slate-900 p-3">
                🟩<div className="mt-1 font-medium text-black">Box Prompt</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/90 text-slate-900 p-3">
                ⚡<div className="mt-1 font-medium text-black">Prompt-Free</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 pb-12">
        <h2 className="text-2xl font-bold mb-6">Tính năng nổi bật</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            title="Quản lý Project như Roboflow"
            desc="Tạo/Xoá/Mở project nhanh. Mỗi project có thư viện ảnh riêng, trạng thái nhãn, và lịch sử export."        
          />
          <FeatureCard
            title="Cloudinary Storage"
            desc="Tự động đẩy ảnh lên Cloudinary bằng API Key bạn cấu hình; tối ưu lưu trữ & truy cập CDN."
          />
          <FeatureCard
            title="COCO Export"
            desc="Xác nhận nhãn và xuất COCO JSON chuẩn công nghiệp, sẵn sàng đưa vào pipeline huấn luyện."
          />
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="border-t border-white/10 bg-white/5 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-slate-300">
            Admin: <b>longtqse172269@fpt.edu.vn</b> • Môi trường: <code>localhost</code>
          </div>
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="rounded-full border border-white/20 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white hover:bg-white/10 disabled:opacity-50"
          >
            Bắt đầu ngay
          </button>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/95 p-6 text-slate-900 transition hover:-translate-y-1 hover:shadow-[0_20px_50px_-45px_rgba(15,23,42,0.7)]">
      <div className="text-lg font-semibold">{title}</div>
      <p className="mt-2 text-sm text-black">{desc}</p>
    </div>
  );
}
