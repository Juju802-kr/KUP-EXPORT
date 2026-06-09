import { Team } from "@prisma/client";
import { KupEmailField, PasswordField } from "@/components/AuthFields";
import { AppSelect } from "@/components/AppSelect";
import { teamLabels } from "@/lib/constants";
import { registerAction } from "@/server/actions";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="panel w-full max-w-lg p-8">
        <form action={registerAction}>
          <h1 className="text-2xl font-semibold">회원가입</h1>
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="field">
              <label>팀명</label>
              <AppSelect name="team" required defaultValue={Object.values(Team)[0]} options={Object.values(Team).map((team) => ({ value: team, label: teamLabels[team] }))} />
            </div>
            <div className="field">
              <label>이름</label>
              <input name="name" required />
            </div>
            <KupEmailField />
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <PasswordField name="password" label="비밀번호" autoComplete="new-password" minLength={8} />
              <PasswordField name="passwordConfirm" label="비밀번호 확인" autoComplete="new-password" minLength={8} />
            </div>
          </div>
          {params.error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{params.error}</p> : null}
          <button className="btn-primary mt-6 w-full" type="submit">
            가입하고 시작
          </button>
        </form>
        <a href="/login" className="mt-4 block text-center text-sm text-blue-700">
          로그인으로 돌아가기
        </a>
      </div>
    </main>
  );
}
