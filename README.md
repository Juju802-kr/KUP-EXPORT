# KUP EXPORTER

KUP 내부 수출 업무를 관리하는 Next.js 기반 업무 에이전트입니다.

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

로컬에서도 `DATABASE_URL`은 PostgreSQL 연결 문자열이어야 합니다. 배포 환경과 동일하게 Supabase의 PostgreSQL 연결 문자열을 사용하는 것을 권장합니다.

## 필수 환경변수

```env
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&sslaccept=accept_invalid_certs"
DIRECT_URL="postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require&sslaccept=accept_invalid_certs"
NEXT_PUBLIC_APP_URL="https://your-vercel-app.vercel.app"

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

## GitHub 업로드 전 주의사항

다음 파일과 폴더는 절대 GitHub에 올리지 않습니다.

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
2. Project Settings에서 PostgreSQL `DATABASE_URL`을 확인합니다.
3. Storage에서 `kup-exporter-uploads` 버킷을 생성합니다.
4. Vercel 환경변수에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`을 등록합니다.

Storage 버킷은 공개 버킷으로 만들 필요가 없습니다. 앱이 서버에서 Service Role Key로 파일을 업로드하고 `/uploads/...` 라우트로 다운로드를 제공합니다.

## Vercel 설정

1. GitHub 저장소를 Vercel에 Import 합니다.
2. Environment Variables에 README의 필수 환경변수를 등록합니다.
3. Build Command를 아래처럼 설정합니다.

```bash
npm run deploy:migrate && npm run build
```

4. 첫 배포 후 `NEXT_PUBLIC_APP_URL`을 실제 Vercel 주소로 변경하고 다시 배포합니다.

## 주요 기능

- 회원가입, 로그인, 아이디 저장, 자동 로그인
- 선적의뢰 영업담당자별/수출담당자별 관리
- 선적의뢰 상태 칸반 보드
- 제품 추가, Invoice Value 자동 계산
- T/T 입금, L/C 통지 및 확인
- L/C 생산의뢰번호 기반 자동 연결
- 공지 등록, 공지 로그, 이메일 발송
- 월간 달력
- 데이터로거 관리
- 제품/바이어/공통 드롭다운/팀 이메일/사용자 관리
- Excel/PDF 데이터 추출
- 첨부파일 업로드 및 다운로드

## 배포 후 점검

1. `@kup.co.kr` 이메일로 회원가입합니다.
2. 선적의뢰를 등록합니다.
3. 제품을 추가합니다.
4. T/T 입금과 L/C 통지를 등록합니다.
5. 이메일 전송 버튼을 눌러 발송 성공 안내창과 실제 수신 여부를 확인합니다.
6. 첨부파일 업로드 후 다운로드가 되는지 확인합니다.
7. 데이터 추출 기능으로 Excel/PDF 파일을 내려받습니다.

## 추후 개선사항

- 운영용 권한 체계 분리
- 이메일 템플릿 관리 화면
- 첨부파일 용량 제한과 파일 형식 정책 강화
- 감사 로그 상세 조회
- Supabase Row Level Security 정책 세분화
