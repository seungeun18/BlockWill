# Devlog 01 — 디지털 유산 분석 API

## 이번 작업의 목표

기존 BlockWill에 사용자의 자연어를 분석하여 디지털 자산과 상속 대상을 정리하는 API를 추가했다.

기존 유언 저장 기능은 유지하고, AI 분석 기능은 FastAPI 서버로 분리했다.

## 구현한 기능

- 디지털 자산과 상속 대상 추출
- 누락된 상속 정보 확인
- 문서 사이의 상속 지시 충돌 탐지
- On-chain 자산과 외부 자산 구분
- 복구 정책 위험도 검사
- 민감정보 입력 차단
- 분석 결과의 원문 근거 검증

## API

| API | 기능 |
|---|---|
| `GET /health` | 서버 상태 확인 |
| `POST /api/estate/analyze` | 디지털 유산 정보 분석 |
| `POST /api/policy/validate` | 복구 정책 검증 |
| `POST /api/policy/confirm` | 사용자 최종 확인 검사 |

## 실행 예시

```bash
bash scripts/run-api.sh
```

실행 후 아래 주소에서 테스트할 수 있다.

```text
http://127.0.0.1:8001/docs
```

## 분석 예시

입력:

```text
Sepolia ETH는 동생에게 주고 싶다.
USDC가 있다.
Google Drive는 부모님에게 전달하고 싶다.
```

결과:

- ETH → 동생
- USDC → 상속 대상 누락
- Google Drive → 외부 절차 필요
- 분석 결과는 초안으로만 사용
- 사용자 확인 전에는 블록체인 작업이 발생하지 않음

## 보안 처리

다음 정보가 포함된 입력은 분석 전에 차단한다.

- Private Key
- Seed Phrase
- Recovery Phrase
- API Secret
- Password

LLM이 반환한 지갑 주소, 상속 대상, 네트워크가 실제 원문에 있는지도 다시 확인한다.

## 트러블슈팅

가상환경 생성을 중간에 중단해 `.venv`에 `pip`와 `activate` 파일이 생성되지 않는 문제가 발생했다.

다음 명령으로 가상환경 구성을 완료했다.

```bash
/opt/homebrew/bin/python3.11 -m venv --without-pip .venv
.venv/bin/python -m ensurepip --upgrade
.venv/bin/python -m pip install -r backend/requirements-lock.txt
```

## 테스트 결과

```text
37 passed
```

민감정보 차단, 잘못된 주소, 중복 Guardian, 위험한 복구 기간, 조작된 분석 결과 등을 검사했다.

## 현재 제한 사항

- 기본 분석은 규칙 기반 데모
- 실제 OpenAI API 호출은 아직 검증하지 않음
- 사용자 화면과 파일 업로드 미구현
- Passkey 및 Smart Account 미구현
- Sepolia 배포 미진행

## 다음 작업

Guardian 승인과 복구 유예기간을 포함한 새로운 Recovery Contract를 구현한다.