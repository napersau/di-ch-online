# Tịnh Tâm Viên · Đi chùa online

Một không gian chánh điện tương tác cho livestream TikTok, lấy cảm hứng từ bố cục ảnh tham khảo: tượng Phật, người xem ngồi lễ, bảng công đức, người tặng quà được gọi tên và những banner chúc bình an. Giao diện, tranh nền và tên gọi được làm riêng. Link TikTok tham khảo không đọc được bằng công cụ, vì vậy phiên bản này được xây dựng từ ảnh và các chức năng người dùng mô tả.

## Mở ngay

Mở riêng thư mục **di-chua-online** trong VS Code. Đây là dự án độc lập, không đọc file `.env` hoặc mã nguồn của dự án Đi tù. Chạy:

```powershell
npm.cmd ci
npm.cmd start
```

Nếu Terminal đang ở ngay trong thư mục `di-chua-online`, lệnh `npm.cmd run chua` cũng chạy được; hoặc dùng `npm.cmd start`. Chạy phiên thật bằng `npm.cmd run chua:live` hoặc `npm.cmd run live` trong thư mục này.

Sau đó mở:

- Trang chánh điện và điều khiển host: **http://127.0.0.1:3001**
- Màn hình livestream riêng: **http://127.0.0.1:3001/overlay**
- Trang admin riêng (TikTok, nhạc YouTube, giọng đọc): **http://127.0.0.1:3001/admin**

Dự án dùng **Node.js 22.x** và có `package-lock.json` riêng. Có thể chuyển riêng thư mục này sang máy khác rồi chạy `npm.cmd ci` và `npm.cmd start`. Xem [hướng dẫn deploy GitHub → Render](DEPLOY.md).

Có thể bấm F5 trong VS Code, chọn **Tịnh Tâm Viên · Trải nghiệm đi chùa online** hoặc **Tịnh Tâm Viên · TikTok LIVE thật**.

Lần đầu mặc định có 24 khách và quà mẫu, được ghi rõ là dữ liệu trải nghiệm. Nhập tên, chọn 1/10/99 xu rồi bấm **Gửi duyên lành** để thử hiệu ứng; không có giao dịch thanh toán. Nút **Gửi lời bình an miễn phí** tạo một lời nhắn và nhân vật của bạn.

## Chức năng đã có

- Chánh điện có tranh nền riêng, ánh sáng nhẹ, đom đóm và khói hương; tự co giãn theo tỷ lệ 9:16.
- Sự kiện TikTok vào phòng, bình luận, tặng quà, theo dõi và chia sẻ cập nhật qua SSE. Mất kết nối máy chủ thì các màn hình tự nối lại.
- Nhân vật hoạt hình mặc áo vàng, nâu hoặc xám, có tên và bong bóng bình luận tự ẩn sau 7 giây. Hiển thị tối đa 24 khách cùng 3 vị trí danh dự; ưu tiên người vừa tương tác và luân phiên những người còn lại. Lưu tối đa 400 khách trong phiên.
- Quà từ 1 xu cũng hiện tên, số xu và lời chúc. Quà combo chỉ được tính khi kết thúc; sự kiện có cùng mã thông báo được chống trùng. Các thông báo chạy tuần tự, quà cùng người đang chờ được gộp. Mở thêm overlay không phát lại thông báo cũ.
- Xếp hạng cộng dồn xu trong phiên; ba người gửi nhiều nhất xuất hiện ở vị trí danh dự. Sổ công đức trên web hiển thị 30 quà gần nhất; máy chủ giữ 100 bản ghi quà gần nhất và tổng xu cộng dồn của cả phiên.
- Lời niệm luân phiên: **nam mô**, **bình an**, **thắp hương**, **chuông**. Mỗi người được cộng một niệm lành mỗi vòng, không cộng liên tục khi lặp bình luận.
- Banner bình an tự động, mặc định mỗi 60 giây; có thể đổi từ 20 đến 600 giây, tắt, hoặc phát lời chúc tùy chỉnh ngay.
- Host đổi tên chánh điện, lời đề tựa, mục tiêu xu và thời gian hiện quà (5–20 giây). Cập nhật đồng thời mọi màn hình.
- Đọc tên và lời chúc bằng Web Speech API, chọn giọng và âm lượng; tiếng chuông tổng hợp bằng Web Audio. Chỉ tab điều khiển được bật âm thanh mới phát tiếng; bật ở tab khác sẽ tắt tab cũ trong cùng trình duyệt.
- Lưu phiên vào `data/temple.json`, ghi file tạm rồi đổi tên. Khởi động lại giữ sổ và tổng công đức của phiên thật; không phục hồi kết nối TikTok cho đến khi host kết nối hoặc cấu hình tự kết nối.
- Bảng điều khiển có đăng nhập, cookie HttpOnly, kiểm tra nguồn yêu cầu và giới hạn thử mật khẩu. Reset có xác nhận xóa phiên.

## Kết nối TikTok thật

1. Lên TikTok LIVE bằng kênh của bạn.
2. Mở **http://127.0.0.1:3001/admin** hoặc bấm **Quản trị live** trên trang chính.
3. Nhập `CHUA_ADMIN_TOKEN` trong file `.env` của chính dự án này. Khi chạy local chưa cấu hình mật khẩu, máy chủ tạo tại `data/host-key.txt`. Trên hosting, đặt mật khẩu bằng biến môi trường; production yêu cầu ít nhất 32 ký tự.
4. Nhập `@ten_kenh` hoặc link `https://www.tiktok.com/@ten_kenh/live`, bấm **Kết nối TikTok**.
5. Chờ trạng thái chuyển thành **TIKTOK LIVE ĐÃ KẾT NỐI**, rồi thử bình luận và tặng quà trong TikTok.

Kết nối thật tự dừng mô phỏng và xóa dữ liệu giả của phiên trải nghiệm. Ngắt hoặc nối lại TikTok giữ dữ liệu phiên thật. Muốn xóa, dùng **Phiên thật mới**. Muốn quay về mô phỏng, dùng **Mở lại trải nghiệm**; cả hai đều hỏi xác nhận vì xóa dữ liệu phiên hiện tại.

Để khởi động bằng chánh điện trống, dùng `npm.cmd run chua:live` ở thư mục gốc. Có thể tạo `di-chua-online/.env` từ `.env.example`, đặt `CHUA_TIKTOK_USERNAME=ten_kenh` để lệnh này tự kết nối. `npm.cmd run chua` không tự kết nối kênh thật.

Quà ở đây là **quà tặng TikTok**, tính theo xu/kim cương của sự kiện. Chưa có cổng thanh toán ngân hàng, chuyển khoản tự động hoặc đối soát tiền. Người xem tặng quà ngay trong TikTok LIVE, rồi website nhận sự kiện để hiện tên và lời chúc. Không cần tặng quà để bình luận hoặc xuất hiện trong chánh điện.

## Đưa lên OBS / TikTok LIVE Studio

1. Thêm nguồn **Browser / Trang web / Link** với URL `http://127.0.0.1:3001/overlay`.
2. Đặt kích thước **1080 × 1920**. Overlay tự căn đúng tỷ lệ khi cửa sổ có kích thước khác.
3. Trang quản lý mở ở tab riêng; khán giả chỉ thấy nguồn overlay.
4. Mở trang **/admin**, dán link YouTube vào mục **Nhạc nền** rồi bấm **Phát nhạc**. Chỉnh thanh **Âm lượng nhạc**; có nút tạm dừng, dừng và lặp lại video.
5. Trong mục **Giọng đọc & chuông**, chọn giọng Việt rồi bấm **Bật giọng đọc / Đọc thử**. Âm lượng giọng đọc, tốc độ và tiếng chuông có thanh chỉnh riêng.
6. Bật thu **Desktop / System audio** trong phần mềm live. Giữ tab admin mở và nghe bản ghi thử để kiểm tra cả nhạc và giọng.

Overlay không tự phát tiếng, nhằm tránh hai lần đọc khi có nhiều nguồn trình duyệt. Tiếng chuông và giọng đọc phát trên máy host. Giọng Việt phụ thuộc trình duyệt và hệ điều hành; nếu thiếu, cần cài hoặc chọn giọng Việt trong Edge/Chrome. Website không yêu cầu khóa API đọc giọng nói.

## Trang quản trị riêng

`/admin` có đăng nhập bằng `CHUA_ADMIN_TOKEN` trong `.env` của `di-chua-online`. Trang này quản lý ID/link TikTok, nhạc YouTube, giọng Việt, tiếng chuông, banner và giao diện chánh điện; có khung xem trước đúng overlay đang dùng cho live.

- **Nhạc YouTube:** nhận link một video dạng `watch`, `youtu.be`, `shorts`, `live` hoặc ID video. Trình phát chỉ tải khi bấm **Phát nhạc**. Nhạc mặc định 12%, có lặp và tự giảm còn một phần tư khi đọc lời chúc. Lỗi chặn nhúng hoặc chặn tự phát được báo ngay bên dưới trình phát.
- **Giọng đọc:** chọn giọng Việt có sẵn trong trình duyệt, âm lượng 0–100%, tốc độ 0,7–1,3×. Quà mới được đọc tuần tự kèm lời chúc; xóa phiên, tắt giọng hoặc lỗi đọc đều khôi phục mức nhạc trước đó. Quà đã có trong sổ không được phát lại khi mở trang.
- **Tiếng chuông:** có âm lượng và nút bật/tắt riêng, nghe thử không tạo quà giả trong sổ.
- **Lưu cấu hình:** ID TikTok, link nhạc, âm lượng, tốc độ, giọng và tùy chọn được lưu vào `data/host-config.json`, qua API có đăng nhập. Nút **Lưu ID** ghi nhớ kênh mà không kết nối ngay. Khi kết nối TikTok cũng tự lưu ID.
- **Mở lại trang:** các giá trị cài đặt được khôi phục. Bạn cần bấm **Phát nhạc / Bật giọng đọc** để cho phép trình duyệt phát tiếng. Nếu một tab quản lý khác bật âm thanh trong cùng trình duyệt, tab trước sẽ dừng để tránh đọc trùng.

Video YouTube có trình phát hiển thị tại trang admin, dùng [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference). Chỉ các video cho phép nhúng mới phát được; website không tách hoặc tải file âm thanh từ YouTube. Overlay vẫn giữ nguyên địa chỉ và bố cục 9:16.

## Khách phụ, đệm ngồi và dâng hương

Trong **/admin → Khách phụ dâng hương**, bấm **Thêm 2–3 khách phụ**. Mỗi lượt thêm ngẫu nhiên 2 hoặc 3 nhân vật mô phỏng, cùng đi lên dâng hương rồi về đệm còn trống. Tối đa 12 khách phụ; bấm **Dọn khách phụ** để bỏ riêng nhóm này. Khách phụ có nhãn **phụ** trên tên, không cộng vào số người xem, xu, niệm lành hay bảng công đức; không tạo sự kiện quà và không kích hoạt lời cảm ơn donate. Khách phụ chỉ thuộc phiên hiện tại, được dọn khi mở phiên mới hoặc khởi động lại máy chủ; khi chuyển từ trải nghiệm sang kết nối TikTok, nhóm khách phụ đã thêm được giữ lại.

Chánh điện có **24 đệm thường và 3 đệm phía trước**, hiển thị cả khi chưa có người ngồi. Khi connector nhận sự kiện TikTok **member** (vào phòng), nhân vật được xếp đệm ngay, không cần bình luận hoặc tặng quà. Vị trí của những người đang hiện được giữ khi người khác tương tác; nếu phòng đông hơn số đệm, ưu tiên người vừa vào/tương tác và luân phiên người còn lại. Người xem thật được ưu tiên trước khách phụ.

Với quà từ **1 xu**, nhân vật của người tặng rời đệm, cầm ba nén hương có khói, tiến lên bàn lễ, cúi lễ và trở lại chỗ ngồi. Tên người tặng và lời chúc xuất hiện ở phần đầu màn hình để giữ khoảng trống cho cảnh dâng hương. Quà được trình diễn lần lượt; quà mới được ưu tiên trước hiệu ứng khách phụ. Trong chế độ trải nghiệm, bấm **Thử 10 xu** ở admin để xem thử mà không phát sinh thanh toán.

TikTok không luôn gửi đủ sự kiện cho toàn bộ người đang xem, đặc biệt với người đã vào trước lúc host kết nối. Chỉ có thể tự xếp người mà connector đã nhận được; người chưa xuất hiện có thể bình luận một lần để được thêm vào. Đã kiểm tra luồng `member` bằng sự kiện mô phỏng và trên trình duyệt; vẫn cần thử với kênh đang LIVE thật của bạn.

Nếu overlay chỉ có khách phụ, vào `/admin` kiểm tra trạng thái **Kênh TikTok LIVE**: cần bấm **Kết nối TikTok** và chờ **Đang trực tiếp**, rồi mới nhận người vào. Chỉ lưu ID không tự kết nối. Tên hiển thị lấy từ nickname TikTok (dự phòng là ID tài khoản), được cập nhật khi có thông tin mới; nhiều người vào cùng mili giây vẫn ưu tiên người vừa vào xuất hiện trên đệm.

## Cấu hình

Xem [`.env.example`](.env.example). Cổng mặc định 3001, tách với game cũ ở 3000. Máy chủ mặc định chỉ nghe trên máy bạn. `CHUA_HOST=0.0.0.0` dùng khi chủ động muốn cho thiết bị trong mạng LAN truy cập; đặt mật khẩu host đủ dài trước khi dùng trên mạng.

Cấu hình trình bày được nhớ qua các lần khởi động. Dữ liệu giả không được nhập vào phiên thật. `data/` và `.env` được bỏ qua khi quản lý mã nguồn.

Máy chủ Node giữ kết nối dài đến TikTok và đẩy SSE cho overlay. Bản này chạy trực tiếp trên máy host; chưa triển khai lên dịch vụ hosting. Khi cần đưa lên VPS, cần môi trường Node hỗ trợ kết nối dài, HTTPS và lưu file bền vững.

## Tích hợp sự kiện ngoài

Host có thể gửi sự kiện từ phần mềm khác, dùng header `x-admin-token` bằng mật khẩu host:

```http
POST /api/events
Content-Type: application/json
x-admin-token: <mật khẩu host>

{
  "type": "gift",
  "user": { "id": "external-123", "name": "An Nhiên" },
  "coins": 30,
  "blessing": "Nguyện bạn và gia đình luôn bình an."
}
```

Các loại sự kiện: `join`, `chat` (kèm `text`), `gift` (kèm `coins`), `follow`, `share`. Tích hợp bên ngoài cần tự chống gửi lặp; connector TikTok đã chống trùng theo `msgId`. Không gửi mật khẩu trong URL overlay hoặc đưa mật khẩu lên livestream.

## Kiểm tra

Từ thư mục gốc:

```powershell
npm.cmd test
npm.cmd run chua:test
node scripts/browser-check.mjs
```

Kiểm thử backend bao gồm cộng dồn và tính hợp lệ quà, kết thúc combo, giới hạn niệm lành, thời gian banner, khôi phục, giới hạn người xem, đăng nhập và SSE. Script trình duyệt dùng Microsoft Edge đã cài, không cần Playwright; có thể đặt `EDGE_PATH` sang đường dẫn Chrome/Edge khác. Nó mở một trình duyệt ẩn, chạy máy chủ riêng với dữ liệu dùng thử trong bộ nhớ và lưu ảnh vào `artifacts/`.

Đã kiểm tra giao diện desktop, mobile 390px, overlay 1080 × 1920, tặng quà, sổ công đức, đăng nhập, thay đổi cài đặt và phát banner. Chưa xác minh nhận quà trên một phiên TikTok thật của chủ dự án hoặc âm thanh thực tế trong OBS/LIVE Studio. Kết nối sử dụng [TikTok-Live-Connector](https://github.com/zerodytrash/TikTok-Live-Connector), một thư viện không chính thức, nên phụ thuộc thay đổi của TikTok. Khóa Euler Stream `TIKTOK_SIGN_API_KEY` là tùy chọn của connector khi cần.

## Tài nguyên hình ảnh

Tranh chánh điện: [`public/assets/temple.png`](public/assets/temple.png), được tạo riêng bằng công cụ imagegen tích hợp. Xem [prompt và mô tả tài nguyên](public/assets/ARTWORK.md). Các biểu tượng và nhân vật là SVG được viết cho dự án, không lấy từ ảnh tham khảo.
