# MBTI 즉흥 여행 · 배포용 앱

계획대로 안 되는 여행을 위한 MBTI·설문 기반 여행 코스 앱이에요.
Supabase 서버를 연결하면 **AI 재계획, 계정 저장, 출석·크레딧, 커뮤니티**가 설치한 앱에서도 동작해요.

## 자동 배포
이 저장소의 `main` 브랜치에 바뀐 내용이 올라오면 Netlify가 `www` 폴더를 자동으로 배포해요.
- 앱 주소: https://mbti-jeukheung-trip.netlify.app
- 휴대폰에 설치한 앱은 다음에 열 때 새 버전으로 바뀌어요.
- 서버(Supabase) 설정은 이미 끝나 있어요. `www/config.js`에 주소와 공개 키가 들어 있어요.

## 처음부터 새로 설치할 때의 순서
1. **SETUP.md**를 따라 서버를 준비하고(카드 등록 없이 무료) `www/config.js`에 주소와 키를 넣으세요. (처음 한 번, 20분)
2. 아래 방법 중 하나로 앱을 만들어 휴대폰에 설치하세요.

> 지금 운영 중인 서버는 설정이 끝나 있으니 아래 내용은 새 서버를 만들 때만 참고하세요.

`config.js`를 비워 두면 서버 없이 **휴대폰 저장 모드**로 동작해요. 이때 AI는 앱에 내장된 자동 추천이고, 커뮤니티는 꺼져요.

## 폴더 구성
| 경로 | 내용 |
|---|---|
| `www/index.html` | 앱 본체 (모든 화면과 장소 데이터) |
| `www/config.js` | 서버 주소와 공개 키 ← **직접 채우는 파일** |
| `www/backend.js` | 서버 연결 코드 (로그인, 저장, 크레딧, 커뮤니티, AI) |
| `www/manifest.webmanifest`, `www/sw.js`, `www/icons/` | 홈 화면 설치와 오프라인 실행 |
| `supabase/schema.sql` | 데이터베이스 표, 접근 규칙, 크레딧 함수 |
| `supabase/functions/ai-replan/index.ts` | AI 재계획 서버 함수 (Gemini 무료 또는 Claude, API 키 보관) |
| `package.json`, `capacitor.config.json`, `assets/` | 안드로이드 앱(APK) 설정 |
| `.github/workflows/build-apk.yml` | GitHub에서 APK 자동 빌드 |

## 방법 1. 설치형 웹앱(PWA) · 아이폰·안드로이드 모두
1. https://app.netlify.com/drop 에 `www` 폴더를 통째로 끌어다 놓으세요(무료).
2. 생성된 주소를 휴대폰에서 열고, 안드로이드 크롬은 메뉴(⋮) → **앱 설치**, 아이폰 사파리는 공유 → **홈 화면에 추가**를 누르세요.
3. 이 주소를 테스터에게 보내면 같은 방법으로 설치할 수 있어요.

## 방법 2. 안드로이드 APK · GitHub로 자동 빌드
1. GitHub에서 새 저장소를 만들고 이 폴더의 파일을 모두 올리세요(`.github` 폴더 포함).
2. **Actions** 탭에서 "안드로이드 APK 만들기"가 자동으로 실행돼요(5~10분).
3. 실행 기록 아래 **Artifacts**의 `mbti-trip-apk`를 받아 압축을 풀면 `app-debug.apk`가 있어요.
4. 휴대폰에 옮겨 설치하세요("출처를 알 수 없는 앱 설치"를 한 번 허용).
- `config.js`를 바꾼 뒤에는 다시 올려야 새 APK에 반영돼요.
- 저장소를 공개(Public)로 만들어도 `config.js`의 공개 키는 괜찮아요. API 키는 Supabase 서버에만 있어요.

## 방법 3. 안드로이드 스튜디오로 직접 빌드
```
npm install
npx cap add android
npx capacitor-assets generate --android
npx cap sync android
npx cap open android      # ▶ 실행 또는 Build > Build APK
```

## 보안 구조
- 앱 안에는 **공개 키**만 있어요. AI 키(Gemini/Claude)와 관리자 키는 Supabase 서버에만 있어요.
- 크레딧(출석, 열람 차감, 충전)은 서버 함수만 바꿀 수 있어서 앱을 조작해도 늘릴 수 없어요.
- 다른 사람의 코스는 미리보기(앞 2곳)만 내려가고, 크레딧을 쓴 뒤에 전체가 내려와요.
- AI 요청은 1인당 하루 30회(설정 가능)로 제한돼요.
