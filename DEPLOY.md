# Deploy Đi chùa online: GitHub → Render

Thư mục chứa file này là dự án độc lập **Tịnh Tâm Viên**, dùng Node.js 22.x. Không cần mã nguồn hoặc `.env` của Đi tù. Mỗi dự án dùng một repository và một service riêng.

## 1. Chạy tại máy trước

Mở Terminal **trong thư mục có package.json này**:

```powershell
npm.cmd ci
npm.cmd start
```

- Admin: http://127.0.0.1:3001/admin
- Overlay: http://127.0.0.1:3001/overlay
- Kiểm tra server: http://127.0.0.1:3001/healthz
- Mở phiên thật trống thay vì mô phỏng: `npm.cmd run live`

`.env` và dữ liệu local đang có đã được giữ trong dự án này. Nếu lấy mã nguồn mới từ GitHub hoặc ZIP, tạo `.env` từ `.env.example` khi dùng local. Trên hosting, cấu hình bằng Environment Variables.

## 2. Tạo repository GitHub riêng

Tạo repo mới tên **di-chua-online**, để trống ở bước tạo, chưa thêm README hay .gitignore. Chạy trong thư mục dự án; thay `TAI_KHOAN` bằng tài khoản GitHub của bạn:

```powershell
git init
git branch -M main
git add .
git status --short
git commit -m "Initial di chua online project"
git remote add origin https://github.com/TAI_KHOAN/di-chua-online.git
git push -u origin main
```

Kiểm tra trước khi commit: `.env`, `node_modules`, `data`, `artifacts` phải không xuất hiện. `.gitignore` đã loại các mục này. Giữ mật khẩu và khóa API trên máy hoặc trong phần Environment của hosting. Nếu Git hỏi người commit, cấu hình `git config user.name "Tên của bạn"` và `git config user.email "Email GitHub của bạn"`.

## 3. Deploy bằng render.yaml

1. Đăng nhập [Render Dashboard](https://dashboard.render.com), chọn **New → Blueprint**.
2. Kết nối GitHub, chọn repository **di-chua-online** và nhánh `main`.
3. Render đọc `render.yaml`; kiểm tra **Web Service / Node / Free**.
4. Tạo Blueprint, chờ deploy báo **Live**.
5. Trong **Environment** của service, xem `CHUA_ADMIN_TOKEN` do Render tự sinh. Dùng nó để đăng nhập `/admin`.
6. Copy URL HTTPS mà Render hiển thị cho service.

Không có repository hoặc service nào được tạo tự động thay bạn; các bước kết nối tài khoản làm trong GitHub/Render Dashboard.

### Nếu dùng New → Web Service thủ công

| Mục | Giá trị |
|---|---|
| Repository | di-chua-online |
| Root Directory | Để trống nếu repo chứa riêng dự án |
| Runtime | Node |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm run live` |
| Health Check Path | `/healthz` |
| Plan | Free để thử |

Đặt các biến môi trường:

| Biến | Giá trị |
|---|---|
| `NODE_ENV` | `production` |
| `CHUA_HOST` | `0.0.0.0` |
| `CHUA_ADMIN_TOKEN` | Mật khẩu riêng ít nhất 32 ký tự |
| `TRUST_PROXY` | `1` khi chạy sau proxy Render |
| `CHUA_TIKTOK_USERNAME` | Tùy chọn: kênh muốn tự kết nối khi khởi động |
| `TIKTOK_SIGN_API_KEY` | Tùy chọn: khóa Euler Stream nếu có |

Render tự cấp `PORT` và `RENDER_EXTERNAL_URL`. Khi production, app ưu tiên `PORT` của hosting trước `CHUA_PORT`. Không đặt `CHUA_HOST=127.0.0.1` trên hosting. Nếu gắn tên miền riêng, thêm `PUBLIC_ORIGIN=https://ten-mien-cua-ban` rồi truy cập admin bằng tên miền đó.

Production mở chánh điện trống, không tự tạo khách và quà mô phỏng. Host vẫn có thể bật chế độ trải nghiệm hoặc thêm 2–3 khách phụ trong admin để kiểm tra.

## 4. Dùng trên máy chạy TikTok LIVE Studio

Giả sử URL service là `https://TEN-SERVICE.onrender.com`:

- Quản trị: `https://TEN-SERVICE.onrender.com/admin`
- Màn hình live: `https://TEN-SERVICE.onrender.com/overlay`
- Kiểm tra server: `https://TEN-SERVICE.onrender.com/healthz`

1. Trên máy tính sẽ phát LIVE, mở `/admin` và đăng nhập bằng `CHUA_ADMIN_TOKEN` của service.
2. Khi kênh đã lên LIVE, nhập ID/link TikTok, bấm **Kết nối TikTok**, chờ **Đang trực tiếp**.
3. Thêm URL `/overlay` làm nguồn trang web/Link trong OBS hoặc TikTok LIVE Studio, kích thước **1080 × 1920**. Nếu Studio không hỗ trợ nguồn Link, mở overlay trên trình duyệt và dùng chụp cửa sổ.
4. Dán link YouTube, bấm **Phát nhạc**; chọn giọng Việt, bấm **Bật giọng đọc / Đọc thử**.
5. Bật **Desktop/System audio** trong phần mềm live và giữ tab admin mở. Nghe bản ghi thử trước khi phát.

Nhạc và giọng đọc phát từ trình duyệt của máy đang mở admin, không phát từ máy chủ cloud. Điều khiển nhạc trên điện thoại sẽ phát tiếng trên điện thoại; tiếng đó không tự truyền sang máy chạy LIVE Studio. Chỉ bật tiếng trên một tab của máy phát live.

Các thiết bị có thể dùng chung URL qua Internet. Mỗi service hiện quản lý **một kênh/phiên TikTok**; nếu đổi kênh ở một máy thì các máy khác của service đó cũng chuyển theo. Đi tù và Đi chùa là hai service riêng, có thể dùng hai kênh khác nhau.

## 5. Dữ liệu và giới hạn gói Free

[Render Free](https://render.com/docs/free) ngủ sau 15 phút không có lưu lượng vào. Khi ngủ, restart hoặc redeploy, file local bị mất. Dự án đang lưu sổ công đức trong `data/temple.json` và cấu hình host trong `data/host-config.json`, nên gói Free phù hợp để thử URL và chức năng, chưa giữ được dữ liệu lâu dài.

**Hai service chung workspace chia sẻ 750 giờ miễn phí/tháng**, không phải mỗi service có 750 giờ. Gói này không đủ cho cả hai luôn chạy 24/7 trong cả tháng.

Để giữ dữ liệu trên Render: chuyển service sang gói trả phí, gắn [Persistent Disk](https://render.com/docs/disks) ở `/var/data`, thêm `DATA_DIR=/var/data`. Cả sổ công đức và cấu hình host sẽ ghi vào ổ đó. Bỏ `CHUA_DATA_DIR` nếu đã đặt nó sang vị trí khác, hoặc đặt cùng `/var/data`.

Giữ **1 instance** cho service này vì dữ liệu realtime đang nằm trong một tiến trình. Cookie đăng nhập nằm trong bộ nhớ, nên sau khi deploy lại cần đăng nhập lại. Chọn giọng đọc/bật tiếng sau khi mở lại tab.

TikTok connector là thư viện không chính thức; phải kiểm tra nhận người xem và quà trên mạng hosting thực tế. Nếu bị lỗi ký kết nối hoặc giới hạn, đọc trạng thái trong admin và cấu hình `TIKTOK_SIGN_API_KEY` khi cần.

## 6. Cập nhật code

```powershell
git add .
git commit -m "Update di chua online"
git push
```

Render có thể tự build/deploy commit mới nếu bật Auto Deploy. Chờ **Live**, rồi tải lại admin và overlay.

## 7. Docker / VPS (tùy chọn)

Đã có `Dockerfile` và `.dockerignore`. Cung cấp `CHUA_ADMIN_TOKEN` ít nhất 32 ký tự, `PUBLIC_ORIGIN` là URL HTTPS thực tế và gắn volume vào `/app/data`. Đặt reverse proxy HTTPS phía trước; tắt buffering và giữ kết nối dài cho `/api/stream`. Chỉ bật `TRUST_PROXY=1` khi request đi qua proxy tin cậy. Không đưa `.env` vào image.

Dockerfile chưa build trên máy này vì Docker daemon chưa chạy. Luồng Render Node dùng `npm ci` không cần Docker.

Tài liệu chính thức: [Web Services](https://render.com/docs/web-services), [Blueprint](https://render.com/docs/blueprint-spec), [Free](https://render.com/docs/free), [Persistent Disks](https://render.com/docs/disks).
