# 서버 연결 설정 (Supabase + Gemini AI · 무료)

처음 한 번만 하면 돼요. 20분 정도 걸려요. 필요한 건 이메일 계정과 구글 계정이에요. **카드 등록 없이 무료**로 만들 수 있어요.

## 1. Supabase 프로젝트 만들기
1. https://supabase.com 에 가입하고 **New project**를 누르세요.
2. 이름은 `mbti-trip`, 지역(Region)은 **Northeast Asia (Seoul)**로 고르세요.
3. 데이터베이스 비밀번호를 정하고 **Create new project**를 누르세요. 1~2분 기다리면 준비돼요.

## 2. 데이터베이스 만들기
1. 왼쪽 메뉴 **SQL Editor** → **New query**를 누르세요.
2. `supabase/schema.sql` 파일 내용을 전부 복사해 붙여 넣고 **Run**을 누르세요.
3. "Success" 메시지가 나오면 끝이에요. 여러 번 실행해도 괜찮아요.

## 3. 자동 로그인(익명 계정) 켜기
1. 왼쪽 메뉴 **Authentication** → **Sign In / Providers**(화면에 따라 **Providers** 또는 **Settings**)로 가세요.
2. **Allow anonymous sign-ins**를 켜고 저장하세요.
   - 테스터가 회원가입하지 않아도 앱을 처음 열면 자동으로 계정이 생겨요.

## 4. 무료 AI 키 받기 (Google Gemini)
카드 등록 없이 무료로 받을 수 있어요.
1. https://aistudio.google.com 에 구글 계정으로 로그인하세요.
2. 왼쪽 아래 **Get API key**(또는 **API keys**) → **Create API key**를 누르세요.
3. 만들어진 키(`AIza...`로 시작)를 복사해 메모장에 붙여 두세요.

알아 둘 점
- 무료 사용량은 하루 단위로 정해져 있어요. 다 쓰면 앱이 자동으로 내장 추천으로 바꿔서 보여 줘요. 남은 양은 AI Studio에서 확인할 수 있어요.
- 무료로 쓰면 Google이 요청 내용을 서비스 개선에 쓸 수 있어요. 앱이 보내는 건 도시, 시각, 남은 일정, 후보 장소 같은 여행 정보뿐이에요.
- 나중에 유료 Claude로 바꾸고 싶으면 6단계에서 `ANTHROPIC_API_KEY`를 넣고 `AI_PROVIDER`를 `anthropic`으로 정하면 돼요. 앱은 다시 만들 필요가 없어요.

## 5. AI 서버 함수 올리기
1. Supabase 왼쪽 메뉴 **Edge Functions** → **Deploy a new function** → **Via Editor**를 누르세요.
2. 함수 이름을 정확히 `ai-replan`으로 적으세요.
3. 편집기 내용을 모두 지우고 `supabase/functions/ai-replan/index.ts` 내용을 붙여 넣은 뒤 **Deploy**를 누르세요.

## 6. AI 키를 서버에 저장
1. **Edge Functions** → **Secrets**(또는 **Manage secrets**)로 가세요.
2. 아래 값을 추가하고 저장하세요.

| 이름 | 값 | 필수 |
|---|---|---|
| `GEMINI_API_KEY` | 4단계에서 복사한 키 | 필수 |
| `GEMINI_MODEL` | 기본 `gemini-3.5-flash-lite` (무료 횟수가 많음). 더 똑똑한 답이 필요하면 `gemini-3.8-flash` (무료 횟수가 적음) | 선택 |
| `AI_DAILY_LIMIT` | 1인당 하루 AI 요청 수 (기본 30) | 선택 |

## 7. 앱에 서버 주소 넣기
1. Supabase **Project Settings** → **API**(또는 **API Keys**)로 가세요.
2. **Project URL**과 **anon public** 키(새 화면에서는 **Publishable key**)를 복사하세요.
3. `www/config.js`를 메모장으로 열어 두 값을 바꿔 넣으세요.
   ```js
   window.TRIP_CONFIG = {
     url: "https://abcdefgh.supabase.co",
     anonKey: "eyJhbGciOi..."   // 또는 sb_publishable_...
   };
   ```
   - ⚠️ **service_role** 키(또는 Secret key)는 절대 넣지 마세요. 그 키가 있으면 모든 데이터를 마음대로 바꿀 수 있어요.

## 8. 앱 만들기
README.md의 **방법 1(설치형 웹앱)** 또는 **방법 2(APK)**를 그대로 하면 돼요.

## 잘 연결됐는지 확인하기
- 앱의 **내 플랜** 화면에 "서버 계정에 저장돼요"가 보이면 연결된 거예요.
- 출석 체크 후 Supabase **Table Editor** → `wallets`에 한 줄이 생겨 있어야 해요.
- 여행 중 모드에서 상황 버튼을 누르면 카드에 **AI 추천**이 표시돼요. "자동 추천"이 나오면 5~6단계를 다시 확인하거나, 오늘 무료 한도를 다 썼는지 AI Studio에서 확인하세요. **Edge Functions** → `ai-replan` → **Logs**에서 오류 내용을 볼 수 있어요.

## 비용
- Supabase 무료 플랜: DB 500MB, 월 사용자 5만 명, 서버 함수 호출 월 50만 회까지 무료예요. 7일 동안 아무도 쓰지 않으면 프로젝트가 잠시 멈추는데, 대시보드에서 **Restore**를 누르면 데이터 그대로 다시 켜져요.
- Gemini 무료 사용량 안에서는 비용이 없어요. 사용자가 많아지면 유료로 바꾸거나 `AI_DAILY_LIMIT`을 낮추세요.

## 정식 출시 전에 꼭 할 일
1. **테스트 충전 끄기**: SQL Editor에서 `drop function public.charge_test(int);`를 실행하고, 토스페이먼츠 같은 결제사를 서버에서 검증하는 방식으로 연결하세요.
2. **계정 보호**: 익명 계정은 앱을 지우면 다시 찾을 수 없어요. 이메일이나 카카오 로그인 연결을 추가하세요.
3. **가입 남용 방지**: Authentication 설정에서 CAPTCHA나 가입 속도 제한을 켜세요.
4. **스토어 등록**: 구글 플레이에 올리려면 개인정보처리방침 페이지와 릴리스용 서명(키스토어)이 필요해요.
