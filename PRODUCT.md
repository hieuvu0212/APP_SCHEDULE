# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Cá nhân, người làm nghề tự do (freelancer), gia sư, giáo viên có lịch dạy/ca làm việc phức tạp cần quản lý lịch trình và tính toán thù lao.

## Product Purpose
Ứng dụng Personal Schedule là một PWA quản lý lịch trình cá nhân và tính lương offline-first. Mục tiêu là giúp người dùng dễ dàng theo dõi lịch lặp (recurring rules), xử lý các ngoại lệ (dời/hủy ca), tính toán thu nhập chính xác theo ca làm, và đảm bảo mọi dữ liệu thuộc quyền sở hữu riêng tư của họ trên trình duyệt.

## Positioning
Hoạt động hoàn toàn Offline-first trên trình duyệt qua IndexedDB, không bắt buộc đăng nhập tài khoản. Có khả năng xử lý đè (override) lịch và lương cực kỳ mạnh mẽ mà các app lịch thông thường không làm được.

## Operating Context
Sử dụng hàng ngày trên cả điện thoại (mobile web) và máy tính. Người dùng truy cập nhanh để xem ca sắp tới, gõ lệnh thêm nhanh (Quick Add) khi có lịch mới, và xem thống kê/lương vào cuối tháng.

## Capabilities and Constraints
- Giao diện web tĩnh (Vite + React + Tailwind v4).
- Offline-first với Dexie (IndexedDB).
- Có tính năng xuất PDF và PNG cục bộ.
- Có tính năng Cloud Sync tùy chọn qua Supabase (nhưng không ràng buộc Auth).
- Hỗ trợ i18n (vi, en, zh).

## Brand Commitments
- Nguyên tắc cốt lõi: Dữ liệu không rời khỏi trình duyệt.
- Thiết kế: Sạch sẽ, tối giản, ưu tiên thao tác nhanh.

## Evidence on Hand
- Cấu trúc thư mục hiện tại.
- README.md chứa toàn bộ nguyên tắc thiết kế, các quyết định kiến trúc và bài học rút ra.

## Product Principles
1. Không bắt buộc tài khoản (No mandatory login gates).
2. Dữ liệu là của người dùng, không phụ thuộc máy chủ.
3. Chính xác tuyệt đối về số liệu (thời gian, tiền lương).
4. Thao tác phải nhanh và tự nhiên.

## Accessibility & Inclusion
Không yêu cầu chuẩn đặc thù, nhưng cần đảm bảo tương phản tốt và dễ thao tác trên màn hình cảm ứng di động.
