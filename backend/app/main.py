'''
main.py 기존 기능
- FastAPI 애플리케이션 생성
- 프론트엔드 CORS 허용
- 요청 본문 크기 제한
- Pydantic 검증 오류에서 민감한 입력값 제거
- /health 서버 상태 확인
- /api/estate/analyze 디지털 유산 분석
- /api/policy/validate 복구 정책 검증
- /api/policy/confirm 정책 최종 확인


새로 추가한 기능
- 서버 시작 시 init_database() 실행
- SQLite users 테이블 자동 생성
- POST /api/auth/signup 회원가입 API
- 이름·이메일·비밀번호 입력 검증
- Argon2로 비밀번호 해시 생성
- 비밀번호 원문 대신 해시만 SQLite에 저장
- 이메일 대소문자 정규화 및 중복 방지
- 중복 이메일 요청에 409 Conflict 반환
- 응답에서 비밀번호와 해시 제외
- 서버 종료 시 lifespan 정상 종료

'''


from contextlib import asynccontextmanager
import hashlib
import json
import os
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from openai import OpenAIError
from .models import (
    AnalyzeRequest,
    AuthResponse,
    Confirmation,
    LoginRequest,
    MessageResponse,
    Policy,
    SignupRequest,
)
from .auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    decode_access_token,
    get_jwt_secret,
    hash_password,
    verify_password,
)
from .database import (
    create_user,
    find_user_by_email,
    find_user_by_id,
    init_database,
)
from .estate import analyze
from .security import SensitiveInput

@asynccontextmanager
async def lifespan(_: FastAPI):
    get_jwt_secret()
    init_database()
    yield

app = FastAPI(
    title="BlockWill AI · 로컬 개발 API",
    version="0.1.0",
    description=(
        "디지털 유산 초안 분석과 복구 정책 검증. "
        "서명·송금 권한이 없는 로컬 개발용 API입니다."
    ),
    lifespan=lifespan,
)

frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

AUTH_COOKIE_NAME = "blockwill_session"

AUTH_COOKIE_SECURE = (
    os.getenv("AUTH_COOKIE_SECURE", "false").lower()
    == "true"
)


def public_user(user):
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "created_at": user["created_at"],
    }


def require_authenticated_user(request: Request):
    token = request.cookies.get(AUTH_COOKIE_NAME)

    if not token:
        raise HTTPException(
            status_code=401,
            detail="로그인이 필요합니다.",
        )

    try:
        user_id = decode_access_token(token)
    except ValueError:
        raise HTTPException(
            status_code=401,
            detail="로그인 정보가 유효하지 않거나 만료됐습니다.",
        ) from None

    user = find_user_by_id(user_id)

    if user is None or user["disabled"]:
        raise HTTPException(
            status_code=401,
            detail="로그인 정보를 확인할 수 없습니다.",
        )

    return user



@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # FastAPI's default validation response echoes invalid input, possibly secrets.
    return JSONResponse(status_code=422, content={"detail": [
        {"loc": list(e["loc"]), "type": e["type"], "msg": "입력 형식 또는 값이 올바르지 않습니다."}
        for e in exc.errors()
    ]})


@app.middleware("http")
async def body_limit(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH"):
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 131072:
                return JSONResponse(status_code=413, content={"detail": "입력 크기 제한을 초과했습니다."})
        request._body = bytes(body)
    return await call_next(request)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/docs")


@app.get("/health")
def health():
    return {"status": "ok", "mode": "local-development", "chain_write_access": False}

@app.post(
    "/api/auth/signup",
    response_model=AuthResponse,
    status_code=201,
)
def signup(payload: SignupRequest):
    try:
        user = create_user(
            name=payload.name,
            email=str(payload.email),
            password_hash=hash_password(payload.password),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from None

    return {
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "created_at": user["created_at"],
        }
    }

@app.post("/api/estate/analyze")
def estate_analysis(payload: AnalyzeRequest):
    try:
        return analyze(payload.documents)
    except SensitiveInput as exc:
        raise HTTPException(422, str(exc)) from None
    except RuntimeError:
        raise HTTPException(503, "LLM 설정을 확인해주세요. 원본 입력은 저장되지 않았습니다.") from None
    except (ValueError, OpenAIError):
        raise HTTPException(502, "AI 응답을 검증할 수 없습니다. 잠시 후 다시 시도해주세요.") from None


def policy_result(policy: Policy):
    warnings = []
    if policy.inactivity_days < 90:
        warnings.append("비활동 기간을 90일 이상으로 설정해주세요.")
    if policy.recovery_delay_days < 7:
        warnings.append("복구 유예기간을 7일 이상으로 설정해주세요.")
    canonical = json.dumps(policy.model_dump(), sort_keys=True, separators=(",", ":"))
    return {"risk": "HIGH" if warnings else "STANDARD", "allowed": not warnings,
            "warnings": warnings, "policy": policy.model_dump(),
            "policy_hash": hashlib.sha256(canonical.encode()).hexdigest(),
            "contract_args": {"beneficiary": policy.beneficiary, "guardians": policy.guardians,
                "inactivitySeconds": policy.inactivity_days * 86400,
                "delaySeconds": policy.recovery_delay_days * 86400}}


@app.post("/api/policy/validate")
def validate_policy(policy: Policy):
    return policy_result(policy)


@app.post("/api/policy/confirm")
def confirm_policy(payload: Confirmation):
    result = policy_result(payload.policy)
    if not result["allowed"]:
        raise HTTPException(422, "위험한 복구 정책은 확인할 수 없습니다.")
    return {**result, "status": "AWAITING_WALLET_SIGNATURE",
            "note": "이 응답은 온체인 정책을 생성하지 않습니다. 지갑에서 최종 인자와 예치 금액을 확인하고 서명해야 합니다."}

@app.get(
    "/api/auth/me",
    response_model=AuthResponse,
)
def current_user(request: Request):
    user = require_authenticated_user(request)

    return {
        "user": public_user(user),
    }

@app.post(
    "/api/auth/login",
    response_model=AuthResponse,
)
def login(
    payload: LoginRequest,
    response: Response,
):
    user = find_user_by_email(str(payload.email))

    if user is None or not verify_password(
        payload.password,
        user["password_hash"],
    ):
        raise HTTPException(
            status_code=401,
            detail="이메일 또는 비밀번호가 올바르지 않습니다.",
        )

    if user["disabled"]:
        raise HTTPException(
            status_code=401,
            detail="비활성화된 계정입니다.",
        )

    token = create_access_token(user["id"])

    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=AUTH_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )

    return {
        "user": public_user(user),
    }

@app.post(
    "/api/auth/logout",
    response_model=MessageResponse,
)
def logout(response: Response):
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=AUTH_COOKIE_SECURE,
        samesite="lax",
    )

    return {
        "message": "로그아웃되었습니다.",
    }

