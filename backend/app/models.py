from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
import re


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Document(StrictModel):
    id: str = Field(min_length=1, max_length=60)
    text: str = Field(min_length=1, max_length=12000)


class AnalyzeRequest(StrictModel):
    documents: list[Document] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def unique_documents(self):
        if len({d.id for d in self.documents}) != len(self.documents):
            raise ValueError("문서 ID는 중복될 수 없습니다.")
        if sum(len(d.text) for d in self.documents) > 24000:
            raise ValueError("전체 입력은 24,000자 이하로 입력하세요.")
        return self


class Mention(StrictModel):
    asset: str = Field(min_length=1, max_length=80)
    category: Literal["CRYPTO", "EXCHANGE", "DIGITAL_ACCOUNT", "NFT", "UNKNOWN"]
    network: str | None
    wallet: str | None
    beneficiary: str | None
    source_id: str
    evidence: str = Field(min_length=1, max_length=1500)


class Extraction(StrictModel):
    mentions: list[Mention] = Field(max_length=100)


class Policy(StrictModel):
    owner: str
    beneficiary: str
    guardians: list[str] = Field(min_length=3, max_length=3)
    guardian_threshold: Literal[2]
    inactivity_days: int = Field(ge=1, le=3650)
    recovery_delay_days: int = Field(ge=0, le=365)

    @field_validator("owner", "beneficiary")
    @classmethod
    def address(cls, value):
        if not re.fullmatch(r"0x[0-9a-fA-F]{40}", value) or int(value, 16) == 0:
            raise ValueError("0이 아닌 20바이트 EVM 주소가 필요합니다.")
        return value.lower()

    @field_validator("guardians")
    @classmethod
    def guardian_addresses(cls, values):
        return [cls.address(value) for value in values]

    @model_validator(mode="after")
    def separate_roles(self):
        roles = [self.owner, self.beneficiary, *self.guardians]
        if len(set(roles)) != len(roles):
            raise ValueError("소유자, 상속자, Guardian 3명은 서로 다른 주소여야 합니다.")
        return self


class Confirmation(StrictModel):
    policy: Policy
    confirmed: Literal[True]
