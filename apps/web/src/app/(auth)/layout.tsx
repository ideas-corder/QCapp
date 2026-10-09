// The login page reads search parameters client-side (for `expired=1`). Keep
// this route group dynamic without reading or decoding authentication cookies.
export const dynamic = 'force-dynamic';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
