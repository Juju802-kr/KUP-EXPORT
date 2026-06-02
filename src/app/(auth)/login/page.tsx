import { LoginForm } from "@/components/LoginForm";

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="panel w-full max-w-md p-8">
        <LoginForm>
          <LoginMessage searchParams={searchParams} />
        </LoginForm>
        <a href="/register" className="mt-4 block text-center text-sm text-blue-700">
          계정 만들기
        </a>
      </div>
    </main>
  );
}

async function LoginMessage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const params = await searchParams;
  if (params.error) return <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p>;
  if (params.success) return <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{params.success}</p>;
  return null;
}
