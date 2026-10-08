import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default function Home() {
  const cookieStore = cookies();
  if (cookieStore.get('qc_access')?.value) redirect('/dashboard');
  if (cookieStore.get('qc_refresh')?.value) {
    redirect('/api/auth/refresh?returnTo=%2Fdashboard');
  }
  redirect('/login');
}
