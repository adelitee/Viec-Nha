# Việc nhà — PWA

App quản lý việc nhà, thực đơn và giờ công. Dữ liệu nằm trong Google Sheets.

## 1. Cấu hình

Mở `config.js`, điền 2 dòng:

```js
window.VIECNHA_CONFIG = {
  url: "https://script.google.com/macros/s/AKfyc.../exec",
  token: "chuoi-token-trong-Code.gs",
};
```

`url` phải kết thúc bằng `/exec` và **không** chứa `/a/macros/<tên miền>/`.
Nếu có, tức là bạn đã deploy bằng tài khoản Workspace — deploy lại bằng Gmail cá nhân.

## 2. Đưa lên GitHub

```bash
git init
git add .
git commit -m "Việc nhà"
git branch -M main
git remote add origin https://github.com/<tên-bạn>/viec-nha.git
git push -u origin main
```

Hoặc kéo thả cả thư mục vào github.com → New repository → uploading an existing file.

## 3. Deploy

**GitHub Pages** — Settings → Pages → Source: `main`, thư mục `/ (root)` → Save.
Địa chỉ: `https://<tên-bạn>.github.io/viec-nha/`

**Netlify** — kéo thả thư mục này vào https://app.netlify.com/drop

Cả hai đều có HTTPS, bắt buộc để PWA chạy được.

## 4. Cài lên điện thoại

- **iPhone**: mở link bằng Safari → Chia sẻ → Thêm vào MH chính
- **Android**: Chrome → menu → Cài đặt ứng dụng

## Cấu trúc

| File | Việc |
|---|---|
| `index.html` | vỏ trang, nạp React từ CDN |
| `app.js` | app đã biên dịch — **đừng sửa tay** |
| `app.jsx` | mã nguồn; sửa file này rồi biên dịch lại |
| `config.js` | URL + token |
| `sw.js` | service worker, chạy offline phần vỏ |
| `manifest.webmanifest` | tên, icon, màu |

Biên dịch lại sau khi sửa `app.jsx`:

```bash
npx @babel/cli --presets @babel/preset-react app.jsx -o app.js
```

## Lưu ý

- **Token không phải bảo mật thật.** Ai có URL + token đều đọc/ghi được. Đừng để repo ở chế độ public kèm `config.js` đã điền.
  Muốn an toàn hơn: để repo private, hoặc điền `config.js` sau khi deploy.
- **Đổi việc, món ăn, giờ ca** thì sửa trong Google Sheets, không cần sửa code.
  6 sheet nền tím là của bạn; 6 sheet nền xám do app ghi.
- App đọc dữ liệu lúc mở. Bấm nút ⟳ trên đầu để tải lại sau khi sửa sheet.
- Offline: mở được app nhưng không đọc/ghi được dữ liệu.
