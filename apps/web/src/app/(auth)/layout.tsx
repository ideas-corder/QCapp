import { redirect } from 'next/navigation';
import { getCallerFromCookie } from '@/lib/auth';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (getCallerFromCookie()) redirect('/dashboard');
  return children;
}
