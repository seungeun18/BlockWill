from contextlib import asynccontextmanager
import hashlib
import json
import os
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from openai import OpenAIError
from .models import (
    AnalyzeRequest,
    AuthResponse,
    Confirmation,
    Policy,
    SignupRequest,
)
from .auth import hash_password
from .database import create_user, init_database
from .estate import analyze
from .security import SensitiveInput

@asynccontextmanager
async def lifespan(_: FastAPI):
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
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


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
