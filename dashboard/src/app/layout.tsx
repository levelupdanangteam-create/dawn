import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Phomifood — Bảng điều hành',
  description: 'Dashboard nội bộ: đơn hàng, vận đơn, quảng cáo, tồn kho',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
