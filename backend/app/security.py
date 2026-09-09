"""Conservative pre-provider guard; heuristic coverage is not a DLP guarantee."""
import re
import unicodedata
from mnemonic import Mnemonic

WORDLIST = set(Mnemonic("english").wordlist)
SECRET_LABEL = re.compile(
    r"private[\s_-]*key|seed[\s_-]*phrase|mnemonic|recovery[\s_-]*phrase|"
    r"api[\s_-]*(?:key|secret)|password|passkey[\s_-]*credential|"
    r"master[\s_-]*key|개인\s*키|비밀\s*키|복구\s*문구|시드\s*구문|비밀번호", re.I
)


class SensitiveInput(ValueError):
    pass


def sanitize(text: str) -> tuple[str, list[str]]:
    text = unicodedata.normalize("NFKC", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Cf")
    if SECRET_LABEL.search(text) or re.search(r"(?<![0-9a-fA-F])(?:0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])|\bsk-[A-Za-z0-9_-]{16,}", text):
        raise SensitiveInput("비밀정보로 의심되는 입력을 차단했습니다. 해당 내용을 제거한 뒤 다시 입력하세요.")
    # Reject even invalid-checksum word sequences; never transmit candidate phrases.
    run = 0
    for word in re.findall(r"[a-zA-Z]+", text.lower()):
        run = run + 1 if word in WORDLIST else 0
        if run >= 12:
            raise SensitiveInput("복구 문구로 의심되는 입력을 차단했습니다.")
    notes = []
    for pattern, marker in [
        (r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[EMAIL_REMOVED]"),
        (r"(?<!\d)01[016789][- .]?\d{3,4}[- .]?\d{4}(?!\d)", "[PHONE_REMOVED]"),
        (r"(?<!\d)\d{6}[- ]?[1-4]\d{6}(?!\d)", "[ID_REMOVED]"),
    ]:
        text, count = re.subn(pattern, marker, text)
        if count:
            notes.append(marker)
    return text, notes
