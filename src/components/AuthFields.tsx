"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function PasswordField({
  name,
  label,
  autoComplete,
  minLength
}: {
  name: string;
  label: string;
  autoComplete?: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label>{label}</label>
      <div className="flex rounded-md border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
        <input
          className="min-w-0 flex-1 border-0 bg-transparent focus:border-0 focus:ring-0"
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
          title={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
          className="flex w-10 items-center justify-center text-slate-500 hover:text-slate-900"
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

export function KupEmailField({ name = "emailPrefix", className = "col-span-2" }: { name?: string; className?: string }) {
  return (
    <div className={`field ${className}`}>
      <label>이메일</label>
      <div className="flex rounded-md border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
        <input
          className="min-w-0 basis-2/3 border-0 bg-transparent focus:border-0 focus:ring-0"
          name={name}
          required
          placeholder="e-mail"
          autoComplete="username"
        />
        <span className="flex basis-1/3 items-center justify-center border-l border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">
          @kup.co.kr
        </span>
      </div>
    </div>
  );
}
