# Devlog 07. Gemini 기반 디지털 유산 분석 연동

## 작업 목적

기존 BlockWill의 디지털 유산 분석 기능은 정규식과 미리 정한 규칙을 사용했다. 따라서 ETH, BTC, USDC처럼 코드에 등록된 자산과 정해진 문장 형태만 분석할 수 있었다.

사용자가 다양한 표현으로 작성한 디지털 자산과 상속 의도를 분석하기 위해 실제 LLM API를 연결했다. 분석 결과는 바로 실행하지 않고 기존 보안 검증을 통과한 사용자 검토용 초안으로만 제공한다.

## 사용 기술

- FastAPI
- Python
- Gemini API
- OpenAI Python SDK 호환 API
- Pydantic Structured Outputs
- React
- TypeScript

## 분석 처리 과정

사용자가 작성한 문장은 다음 순서로 처리된다.

1. 입력 크기와 문서 형식 검사
2. 개인키, 복구 문구, 비밀번호 등 민감정보 검사
3. 이메일과 전화번호 등 개인정보 제거
4. Gemini API에 자연어 분석 요청
5. Pydantic 구조에 맞는 JSON 응답 수신
6. 자산, 상속자, 네트워크와 원문 근거 검증
7. 자산별 충돌과 누락 정보 분류
8. React 화면에 검토용 카드로 표시

Gemini는 자연어 분석만 수행한다. 지갑 서명, 스마트 컨트랙트 호출과 자산 전송 권한은 갖지 않는다.

## 환경변수 설정

분석 제공자를 선택할 수 있도록 다음 환경변수를 사용했다.

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
```

실제 API 키는 Git에서 제외되는 `.env` 파일에만 저장한다. GitHub에 올라가는 `.env.example`에는 키 이름과 빈 값만 기록한다.

```env
LLM_PROVIDER=demo
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
```

## Gemini API 연결

기존 프로젝트에는 OpenAI Python SDK가 설치되어 있었다. Gemini가 제공하는 OpenAI 호환 API를 사용해 별도의 SDK를 추가하지 않고 연결했다.

```python
client = OpenAI(
    api_key=os.environ["GEMINI_API_KEY"],
    base_url=(
        "https://generativelanguage.googleapis.com/"
        "v1beta/openai/"
    ),
)
```

API 연결 여부를 확인하기 위해 짧은 요청을 전송했다.

```text
Reply exactly OK
```

최종적으로 다음 응답을 받아 Gemini API 키와 모델 연결이 정상인 것을 확인했다.

```text
Gemini 응답: OK
```

## 구조화 출력 구현

Gemini가 자유로운 문장으로 답하면 백엔드에서 안정적으로 처리하기 어렵다. 따라서 Gemini가 정해진 JSON 구조로 응답하도록 Structured Outputs를 적용했다.

분석 결과에는 다음 정보가 포함된다.

- 자산 이름
- 자산 종류
- 블록체인 네트워크
- 지갑 주소
- 상속 대상
- 원본 문서 ID
- 판단 근거가 된 원문

Gemini 응답을 받은 뒤 기존의 엄격한 `Extraction` 모델로 다시 검증한다.

## 분석 제공자 분리

환경변수에 따라 분석 방식을 선택할 수 있도록 구성했다.

| 설정값 | 분석 방식 |
|---|---|
| `demo` | API 키 없이 규칙 기반 분석 |
| `gemini` | Gemini 기반 자연어 분석 |
| `openai` | OpenAI 기반 자연어 분석 |

외부 API에 문제가 발생하더라도 `demo` 모드로 전환해 기본 기능을 계속 테스트할 수 있다.

## 트러블슈팅

### 1. OpenAI API 크레딧 부족

처음에는 기존 OpenAI 분석 코드를 사용해 실제 API 호출을 시도했다. 다음 오류가 발생했다.

```text
429 insufficient_quota
credit_balance_exhausted
```

ChatGPT 유료 구독과 OpenAI API 사용료는 별도로 운영된다. ChatGPT를 유료로 이용하고 있어도 API 크레딧이 자동으로 제공되지는 않았다.

무료 범위에서 LLM 기능을 실험하기 위해 분석 제공자를 Gemini API로 변경했다.

### 2. `.env.example`과 `.env` 혼동

처음에는 실제 실행 설정을 `.env.example`에 작성했다. 하지만 `.env.example`은 GitHub에 올리는 공개 설정 예시이며 실행용 비밀정보 파일이 아니다.

실행 스크립트는 프로젝트 최상위의 `.env` 파일을 읽도록 작성되어 있었다. 따라서 `.env.example`을 실행용 `.env`로 복사하고 실제 API 키는 `.env`에만 저장했다.

```text
.env.example → 공개 설정 양식
.env         → 로컬 실행 설정과 실제 API 키
```

`.gitignore`에 `.env`가 포함되어 있는지도 확인했다.

```bash
git check-ignore .env
```

### 3. Gemini API 키 환경변수 미등록

Gemini 직접 호출 과정에서 다음 오류가 발생했다.

```text
KeyError: 'GEMINI_API_KEY'
```

`.env` 파일이 존재해도 일반 Python 명령이 해당 파일을 자동으로 읽지는 않는다. 현재 터미널에 `GEMINI_API_KEY`가 등록되지 않아 발생한 오류였다.

다음 명령으로 `.env` 값을 현재 터미널 환경변수로 불러왔다.

```bash
set -a
source .env
set +a
```

환경변수가 존재하는지는 실제 키를 출력하지 않고 확인했다.

```bash
if [ -n "$GEMINI_API_KEY" ]; then
  echo "Gemini 키 등록 완료"
else
  echo "Gemini 키가 비어 있음"
fi
```

### 4. Gemini 기존 모델 지원 종료

처음에는 다음 모델을 사용했다.

```text
gemini-2.5-flash-lite
```

API 호출 결과 다음 404 오류가 발생했다.

```text
This model models/gemini-2.5-flash-lite is no longer
available to new users.
```

오류 메시지에서 안내한 신규 모델로 변경했다.

```env
GEMINI_MODEL=gemini-3.5-flash-lite
```

모델을 변경한 뒤 기본 텍스트 호출에서 정상적으로 `OK` 응답을 받았다.

### 5. Gemini 구조화 출력 요청 실패

기본 텍스트 호출은 성공했지만 Pydantic Structured Outputs 적용 후 다음 오류가 발생했다.

```text
400 INVALID_ARGUMENT
Request contains an invalid argument.
```

기존 `Extraction` 모델에는 다음과 같은 엄격한 JSON Schema 제한이 포함되어 있었다.

```text
minLength
maxLength
maxItems
additionalProperties
```

Gemini의 구조화 출력은 JSON Schema의 일부 기능만 지원한다. 기존 Pydantic 모델을 그대로 전달하면서 지원하지 않는 문자열 길이 제한이 요청에 포함된 것이 원인이었다.

Gemini 요청에만 사용하는 단순한 모델을 별도로 만들었다.

```python
class GeminiMention(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset: str
    category: Literal[
        "CRYPTO",
        "EXCHANGE",
        "DIGITAL_ACCOUNT",
        "NFT",
        "UNKNOWN",
    ]
    network: str | None
    wallet: str | None
    beneficiary: str | None
    source_id: str
    evidence: str


class GeminiExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mentions: list[GeminiMention]
```

Gemini에는 단순한 스키마를 전달하고, 응답을 받은 뒤 기존 `Extraction` 모델로 다시 검증했다.

이를 통해 Gemini 호환성을 확보하면서 기존 백엔드의 길이 제한과 엄격한 데이터 검증도 유지할 수 있었다.

### 6. AI 원문 근거 검증 실패

구조화 출력 요청은 성공했지만 다음 오류가 발생했다.

```text
AI 출력의 문서 근거를 확인할 수 없습니다.
```

BlockWill 백엔드는 Gemini가 반환한 `evidence`가 실제 입력 문서에 그대로 포함되어 있는지 검사한다. 이는 LLM이 존재하지 않는 상속자나 지갑 주소를 만들어내는 것을 막기 위한 검증이다.

Gemini가 같은 입력에서도 근거 문장의 표현을 일부 바꾸거나 자산과 네트워크를 하나의 값으로 반환할 수 있었다.

예를 들어 다음 입력에서:

```text
Sepolia ETH는 동생에게 주고 싶다.
```

Gemini가 자산 이름을 다음과 같이 반환했다.

```text
Sepolia ETH
```

원하는 결과는 다음과 같다.

```text
asset: ETH
network: SEPOLIA
```

시스템 지시문에 다음 조건을 추가했다.

- 네트워크 이름과 자산 이름을 분리
- `Sepolia ETH`에서 자산은 `ETH`로 반환
- 네트워크는 `SEPOLIA`로 반환
- 근거 문장을 원문에서 그대로 복사
- 문장을 요약하거나 바꾸지 않음
- 원문에 없는 주소나 상속자를 추측하지 않음

또한 다음 설정을 추가해 같은 입력에 대한 결과 변동을 줄였다.

```python
temperature=0
```

수정 후 Gemini가 반환한 모든 근거 문장이 실제 원문에 포함되는 것을 확인했다.

### 7. 모든 Gemini 오류가 같은 502로 표시됨

프론트엔드 실험에서 다음 오류가 표시됐다.

```text
AI 응답을 검증할 수 없습니다.
잠시 후 다시 시도해주세요.
```

백엔드가 다음 오류를 모두 `OpenAIError` 또는 `ValueError`로 묶어서 동일한 502 응답으로 변환하고 있었다.

- Gemini 무료 호출 횟수 제한
- Gemini API 통신 실패
- 구조화 결과 검증 실패
- 원문 근거 검증 실패

사용자가 실제 원인을 확인할 수 있도록 예외 처리를 분리했다.

| 오류 종류 | HTTP 상태 | 사용자 안내 |
|---|---:|---|
| 환경변수 설정 오류 | 503 | LLM 설정 확인 |
| Gemini 무료 사용량 제한 | 429 | 잠시 후 다시 시도 |
| 원문 및 결과 검증 실패 | 502 | AI 결과가 검증을 통과하지 못함 |
| Gemini API 통신 오류 | 502 | API 상태와 설정 확인 |

`RateLimitError`는 일반 `OpenAIError`보다 먼저 처리해야 정확한 안내가 표시된다.

```python
except RateLimitError:
    raise HTTPException(
        429,
        "Gemini 무료 호출 한도에 도달했습니다. "
        "잠시 후 다시 시도해주세요.",
    ) from None
except ValueError:
    raise HTTPException(
        502,
        "Gemini가 반환한 자산 또는 근거가 "
        "원문 검증을 통과하지 못했습니다.",
    ) from None
except OpenAIError:
    raise HTTPException(
        502,
        "Gemini API 호출에 실패했습니다.",
    ) from None
```

### 8. 연속 요청으로 인한 무료 호출 제한 가능성

개발 과정에서 다음 요청을 짧은 시간 동안 연속으로 실행했다.

- Gemini 연결 확인
- 구조화 출력 검사
- 원문 근거 출력
- 백엔드 직접 분석
- 프론트엔드 분석

Gemini 무료 사용량에는 일정 시간 동안 호출할 수 있는 횟수 제한이 있다. 연속 호출 시 일시적으로 실패할 수 있으므로 오류가 발생하면 잠시 기다린 후 한 번만 다시 요청하도록 했다.

프론트엔드 버튼은 요청이 진행되는 동안 비활성화해 중복 요청을 방지한다.

## 최종 실험

다음 테스트 문장을 프론트엔드에 입력했다.

```text
Solana SOL은 동생에게 전달하고 싶다.
Solana SOL은 부모님에게 전달한다.
Notion 계정은 배우자에게 전달한다.
USDC도 보유하고 있다.
```

규칙 기반 데모는 `SOL`과 `Notion`을 처리하도록 작성되어 있지 않다. 따라서 두 자산이 분석 결과에 나타나는지를 통해 실제 Gemini 호출 여부를 확인했다.

### 확인 결과

- 화면에 `Gemini AI 분석 완료` 표시
- SOL 자산 인식
- SOL의 상속 대상이 동생과 부모님으로 충돌하는 것을 감지
- 충돌 정보를 빨간 경고로 표시
- Notion 계정과 배우자 정보 추출
- USDC의 상속 대상 누락 감지
- 누락 정보를 노란 경고로 표시
- 각 분석 결과에서 원문 근거 확인 가능
- 백엔드에서 분석 요청 성공 확인

```text
POST /api/estate/analyze HTTP/1.1 200 OK
```

## 보안 처리

### 입력 보안

다음 정보가 포함된 입력은 Gemini에 전달하기 전에 차단한다.

- 개인키
- Seed Phrase
- Recovery Phrase
- 비밀번호
- API Secret
- 비정상 숨김 문자

전화번호와 이메일 등 개인정보는 제거한 후 분석한다.

### 출력 보안

Gemini가 반환한 결과에 대해 다음 사항을 검사한다.

- `source_id`가 실제 입력 문서에 존재하는지
- 근거 문장이 실제 원문에 포함되는지
- 자산 이름이 근거 문장에 존재하는지
- 상속 대상이 근거 문장에 존재하는지
- 지갑 주소가 원문에 존재하는지
- 지갑 주소가 올바른 EVM 주소 형식인지
- 네트워크가 실제 원문에 명시되어 있는지

검증에 실패한 결과는 사용자 화면에 표시하지 않는다.

### 권한 분리

LLM 분석과 블록체인 실행 기능을 분리했다.

Gemini는 다음 작업을 할 수 없다.

- MetaMask 서명 요청
- 개인키 조회
- 스마트 컨트랙트 실행
- ETH 전송
- 상속 대상 자동 확정

AI 분석 결과는 반드시 사용자가 검토해야 하며, 블록체인 작업은 MetaMask에서 사용자가 직접 승인해야 한다.

## 최종 결과

규칙 기반 데모 분석을 실제 Gemini 자연어 분석으로 확장했다.

사용자가 자유로운 문장으로 디지털 자산과 상속 의도를 입력하면 Gemini가 구조화된 결과를 반환한다. 백엔드는 결과가 실제 원문에 근거하는지 다시 검증하고 자산별 충돌, 누락 정보와 실행 가능 여부를 분류한다.

프론트엔드에서는 검증된 결과만 카드로 표시하며, AI 분석이 실제 지갑 서명이나 자산 전송으로 바로 이어지지 않도록 권한을 분리했다.

## 다음 작업

- Gemini 분석 결과에서 누락된 상속자 직접 수정
- 사용자가 분석 결과를 최종 확정하는 단계
- 확정한 ETH 계획을 복구 스마트 컨트랙트 입력값과 연결
- Gemini API 실패 시 규칙 기반 데모 전환 기능
- 실제 배포 환경에서 API 키와 호출 제한 관리