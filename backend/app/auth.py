'''
비밀번호 해시 생성: 평문 비밀번호를 Argon2 해시로 변환
비밀번호 검증: 로그인 비밀번호와 저장된 해시 비교
JWT 발급: 사용자 ID와 만료시간을 포함한 토큰 생성
JWT 검증: 서명·발급자·만료시간 확인
사용자 ID 추출: 정상 토큰의 sub에서 사용자 ID 반환
비밀키 검사: JWT_SECRET이 없거나 너무 짧으면 실행 차단
토큰 만료: 발급 후 60분으로 제한
'''


import os
from datetime import datetime, timedelta, timezone

import jwt
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash


JWT_ALGORITHM = "HS256"
JWT_ISSUER = "blockwill"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

password_hash = PasswordHash.recommended()


def get_jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET")

    if not secret or len(secret) < 32:
        raise RuntimeError(
            "JWT_SECRET은 32자 이상의 값으로 설정해야 합니다."
        )

    return secret


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(
    password: str,
    stored_password_hash: str,
) -> bool:
    return password_hash.verify(
        password,
        stored_password_hash,
    )


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "iss": JWT_ISSUER,
        "iat": now,
        "exp": now + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        ),
    }

    return jwt.encode(
        payload,
        get_jwt_secret(),
        algorithm=JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> int:
    try:
        payload = jwt.decode(
            token,
            get_jwt_secret(),
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
        )
    except InvalidTokenError as exc:
        raise ValueError(
            "유효하지 않거나 만료된 인증 토큰입니다."
        ) from exc

    subject = payload.get("sub")

    if not isinstance(subject, str) or not subject.isdigit():
        raise ValueError(
            "인증 토큰의 사용자 정보가 올바르지 않습니다."
        )

    return int(subject)