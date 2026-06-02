"use client";

import { useEffect, useState } from "react";
import { PasswordField } from "@/components/AuthFields";
import { loginAction } from "@/server/actions";

const savedEmailKey = "shipping_agent_saved_email_prefix";
const saveIdKey = "shipping_agent_save_id";
const autoLoginKey = "shipping_agent_auto_login";

export function LoginForm({ children }: { children?: React.ReactNode }) {
  const [emailPrefix, setEmailPrefix] = useState("");
  const [saveId, setSaveId] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);

  useEffect(() => {
    const storedSaveId = localStorage.getItem(saveIdKey) === "1";
    const storedAutoLogin = localStorage.getItem(autoLoginKey) === "1";
    setSaveId(storedSaveId);
    setAutoLogin(storedAutoLogin);
    if (storedSaveId) setEmailPrefix(localStorage.getItem(savedEmailKey) ?? "");
  }, []);

  function handleSubmit() {
    if (saveId) {
      localStorage.setItem(savedEmailKey, emailPrefix);
      localStorage.setItem(saveIdKey, "1");
    } else {
      localStorage.removeItem(savedEmailKey);
      localStorage.removeItem(saveIdKey);
    }
    if (autoLogin) localStorage.setItem(autoLoginKey, "1");
    else localStorage.removeItem(autoLoginKey);
  }

  return (
    <form action={loginAction} onSubmit={handleSubmit}>
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="KUP EXPORTER" className="h-11 w-11 object-contain" />
        <div>
          <h1 className="text-2xl font-semibold">KUP EXPORTER</h1>
          <p className="mt-1 text-sm text-slate-500">KUP 수출 관리 에이전트에 접속합니다.</p>
        </div>
      </div>
      <div className="mt-8 space-y-4">
        <div className="field">
          <label>이메일</label>
          <div className="flex rounded-md border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
            <input
              className="min-w-0 basis-2/3 border-0 bg-transparent focus:border-0 focus:ring-0"
              name="emailPrefix"
              required
              placeholder="e-mail"
              autoComplete="username"
              value={emailPrefix}
              onChange={(event) => setEmailPrefix(event.target.value.replace(/@.*/, ""))}
            />
            <span className="flex basis-1/3 items-center justify-center border-l border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">
              @kup.co.kr
            </span>
          </div>
        </div>
        <PasswordField name="password" label="비밀번호" autoComplete="current-password" />
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <label className="flex items-center gap-2">
            <input name="saveId" type="checkbox" checked={saveId} onChange={(event) => setSaveId(event.target.checked)} className="h-4 w-4" />
            아이디 저장
          </label>
          <label className="flex items-center gap-2">
            <input name="autoLogin" type="checkbox" checked={autoLogin} onChange={(event) => setAutoLogin(event.target.checked)} className="h-4 w-4" />
            자동로그인
          </label>
        </div>
      </div>
      {children}
      <button className="btn-primary mt-6 w-full" type="submit">
        로그인
      </button>
    </form>
  );
}
