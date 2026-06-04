# KUP EXPORTER

KUP 수출 업무를 관리하는 Next.js 기반 내부 업무 에이전트입니다.

## 기술 스택

- Next.js App Router, React, TypeScript
- Tailwind CSS
- Prisma ORM
- Supabase PostgreSQL
- Supabase Storage 또는 로컬 `/uploads`
- SMTP 기반 이메일 발송

## 로컬 실행

```bash
npm install
copy .env.example .env
npx prisma migrate dev
npm run seed
npm run dev
```

로컬에서도 배포 환경과 동일하게 Supabase PostgreSQL 연결 문자열을 사용하는 것을 권장합니다.

## 필수 환경변수

```env
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&sslaccept=accept_invalid_certs"
DIRECT_URL="postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=accept_invalid_certs"
NEXT_PUBLIC_APP_URL="https://kup-exporter-eight.vercel.app"

SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-google-account@gmail.com"
SMTP_PASS="your-16-character-google-app-password"
SMTP_FROM="KUP EXPORTER <your-google-account@gmail.com>"

SUPABASE_URL="https://[PROJECT-REF].supabase.co"
SUPABASE_SERVICE_ROLE_KEY="[SUPABASE-SERVICE-ROLE-KEY]"
SUPABASE_STORAGE_BUCKET="kup-exporter-uploads"
```

`SMTP_PASS`에는 Google 계정 일반 비밀번호가 아니라 Google 앱 비밀번호 16자리를 사용합니다.

## GitHub 업로드 주의사항

다음 파일과 폴더는 GitHub에 올리지 않습니다.

- `.env`, `.env.*`
- `email/env`
- `.next`
- `node_modules`
- `.tools`
- `uploads` 내부 파일
- `*.db`, `*.log`
- `.vercel`

위 항목은 `.gitignore`에 포함되어 있습니다.

## Supabase 설정

1. Supabase 프로젝트를 생성합니다.
2. PostgreSQL 연결 문자열을 Vercel 환경변수에 등록합니다.
3. Storage에서 `kup-exporter-uploads` 버킷을 생성합니다.
4. Vercel 환경변수에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`을 등록합니다.

Storage 버킷은 공개 버킷일 필요가 없습니다. 앱이 서버에서 Service Role Key로 파일을 업로드하고 `/uploads/...` 라우트로 다운로드를 제공합니다.

## Vercel 설정

1. GitHub 저장소를 Vercel에 Import합니다.
2. Environment Variables에 README의 필수 환경변수를 등록합니다.
3. Build Command를 아래처럼 설정합니다.

```bash
npm run deploy:migrate && npm run build
```

스키마가 바뀌면 새 커밋을 푸시할 때 Vercel 빌드 과정에서 migration이 적용됩니다.
