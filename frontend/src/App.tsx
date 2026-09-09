import { FormEvent, useMemo, useState } from "react";

const API_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001").replace(/\/$/, "");

type Evidence = { source_id: string; evidence: string; network: string | null; wallet: string | null };
type Asset = {
  id: string;
  asset: string;
  category: "CRYPTO" | "EXCHANGE" | "DIGITAL_ACCOUNT" | "NFT" | "UNKNOWN";
  beneficiary_candidates: string[];
  conflict: boolean;
  missing_information: string[];
  execution_type: "DEPOSIT_REQUIRED" | "EXTERNAL_OR_UNSUPPORTED";
  execution_note: string;
  evidence: Evidence[];
};
type Analysis = { provider: string; draft_only: boolean; assets: Asset[]; warnings: string[] };
type PolicyForm = {
  owner: string;
  beneficiary: string;
  guardians: [string, string, string];
  inactivity_days: string;
  recovery_delay_days: string;
};
type PolicyPayload = {
  owner: string;
  beneficiary: string;
  guardians: string[];
  guardian_threshold: 2;
  inactivity_days: number;
  recovery_delay_days: number;
};
type Validation = { risk: "HIGH" | "STANDARD"; allowed: boolean; warnings: string[]; policy_hash: string };
type Confirmation = Validation & { status: "AWAITING_WALLET_SIGNATURE"; note: string };

const initialPolicy: PolicyForm = {
  owner: "",
  beneficiary: "",
  guardians: ["", "", ""],
  inactivity_days: "90",
  recovery_delay_days: "7",
};

const categoryLabels: Record<Asset["category"], string> = {
  CRYPTO: "암호화폐",
  EXCHANGE: "거래소 자산",
  DIGITAL_ACCOUNT: "디지털 계정",
  NFT: "NFT",
  UNKNOWN: "분류 확인 필요",
};

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("분석 서버에 연결할 수 없습니다. API가 실행 중인지 확인해주세요.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { detail?: unknown } | null;
    throw new Error(typeof data?.detail === "string" ? data.detail : "요청을 처리하지 못했습니다. 입력값을 확인해주세요.");
  }
  return response.json() as Promise<T>;
}

export default function App() {
  const [estateText, setEstateText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [policy, setPolicy] = useState<PolicyForm>(initialPolicy);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [policyError, setPolicyError] = useState("");
  const [validating, setValidating] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const issueCount = useMemo(() => analysis?.assets.reduce(
    (sum, asset) => sum + Number(asset.conflict) + asset.missing_information.length, 0,
  ) ?? 0, [analysis]);

  const runAnalysis = async (event: FormEvent) => {
    event.preventDefault();
    if (!estateText.trim()) return;
    setAnalyzing(true);
    setAnalysis(null);
    setAnalysisError("");
    try {
      setAnalysis(await post<Analysis>("/api/estate/analyze", {
        documents: [{ id: "user-input", text: estateText.trim() }],
      }));
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "분석 중 오류가 발생했습니다.");
    } finally {
      setAnalyzing(false);
    }
  };

  const payload = (): PolicyPayload => ({
    owner: policy.owner.trim(),
    beneficiary: policy.beneficiary.trim(),
    guardians: policy.guardians.map((value) => value.trim()),
    guardian_threshold: 2,
    inactivity_days: Number(policy.inactivity_days),
    recovery_delay_days: Number(policy.recovery_delay_days),
  });

  const resetPolicyResult = () => {
    setValidation(null);
    setAccepted(false);
    setConfirmation(null);
    setPolicyError("");
  };

  const updatePolicy = (field: keyof Omit<PolicyForm, "guardians">, value: string) => {
    setPolicy((current) => ({ ...current, [field]: value }));
    resetPolicyResult();
  };

  const updateGuardian = (index: number, value: string) => {
    setPolicy((current) => {
      const guardians = [...current.guardians] as PolicyForm["guardians"];
      guardians[index] = value;
      return { ...current, guardians };
    });
    resetPolicyResult();
  };

  const validatePolicy = async (event: FormEvent) => {
    event.preventDefault();
    setValidating(true);
    resetPolicyResult();
    try {
      setValidation(await post<Validation>("/api/policy/validate", payload()));
    } catch (error) {
      setPolicyError(error instanceof Error ? error.message : "정책 검증 중 오류가 발생했습니다.");
    } finally {
      setValidating(false);
    }
  };

  const confirmPolicy = async () => {
    if (!validation?.allowed || !accepted) return;
    setValidating(true);
    setPolicyError("");
    try {
      setConfirmation(await post<Confirmation>("/api/policy/confirm", {
        policy: payload(),
        confirmed: true,
      }));
    } catch (error) {
      setPolicyError(error instanceof Error ? error.message : "정책 확인 중 오류가 발생했습니다.");
    } finally {
      setValidating(false);
    }
  };

  const fillTestAddresses = () => {
    setPolicy((current) => ({
      ...current,
      owner: "0x0000000000000000000000000000000000000001",
      beneficiary: "0x0000000000000000000000000000000000000002",
      guardians: [
        "0x0000000000000000000000000000000000000003",
        "0x0000000000000000000000000000000000000004",
        "0x0000000000000000000000000000000000000005",
      ],
    }));
    resetPolicyResult();
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="BlockWill 홈"><span className="brand-mark">BW</span>BlockWill</a>
        <span className="environment-badge">LOCAL MVP</span>
      </header>

      <main id="top">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">DIGITAL ESTATE PLANNER</p>
            <h1 id="page-title">흩어진 디지털 자산을<br />하나의 계획으로 정리하세요.</h1>
            <p className="intro-copy">자산과 상속 의도를 입력하면 누락과 충돌을 찾아 검토 가능한 초안으로 정리합니다.</p>
          </div>
          <aside className="trust-note">
            <strong>입력 전 확인</strong>
            <p>복구 문구, 개인키, 실제 비밀번호를 입력하지 마세요.</p>
            <span>현재 분석은 규칙 기반 데모이며 실제 LLM이 아닙니다.</span>
          </aside>
        </section>

        <section className="workspace" aria-labelledby="estate-heading">
          <div className="section-heading"><span className="step-number">01</span><div><p className="section-kicker">유산 정보 입력</p><h2 id="estate-heading">내 디지털 자산 정리하기</h2></div></div>
          <form onSubmit={runAnalysis}>
            <label htmlFor="estate-text">자산과 전달하고 싶은 내용을 자유롭게 적어주세요.</label>
            <textarea id="estate-text" value={estateText} onChange={(event) => setEstateText(event.target.value)}
              placeholder={"예: Sepolia ETH는 동생에게 주고 싶다.\nUSDC가 있다.\nGoogle Drive 가족사진은 부모님께 전달하고 싶다."}
              maxLength={12000} rows={8} />
            <div className="form-footer">
              <span className="character-count">{estateText.length.toLocaleString()} / 12,000자</span>
              <button className="primary-button" disabled={!estateText.trim() || analyzing}>{analyzing ? "안전하게 분석 중…" : "AI로 유산 정리하기"}</button>
            </div>
          </form>
          {analysisError && <div className="message error" role="alert">{analysisError}</div>}

          {analysis && <div className="analysis-results" aria-live="polite">
            <div className="result-summary"><div><p className="section-kicker">분석 완료</p><h3>{analysis.assets.length}개의 자산을 확인했습니다.</h3></div>
              <span className={`issue-count ${issueCount ? "warning" : "clear"}`}>{issueCount ? `확인할 내용 ${issueCount}개` : "추가 확인 없음"}</span></div>
            {analysis.assets.length === 0 ? <div className="empty-state">확인할 수 있는 자산이 없습니다. 자산명과 전달 대상을 조금 더 구체적으로 적어주세요.</div> :
              <div className="asset-grid">{analysis.assets.map((asset) => <article className="asset-card" key={asset.id}>
                <div className="asset-title-row"><div><span className="category-label">{categoryLabels[asset.category]}</span><h4>{asset.asset}</h4></div>
                  <span className={`execution-badge ${asset.execution_type === "DEPOSIT_REQUIRED" ? "onchain" : "external"}`}>
                    {asset.execution_type === "DEPOSIT_REQUIRED" ? "예치 후 실행 가능" : "외부 절차 필요"}</span></div>
                <dl className="asset-details"><div><dt>상속 대상</dt><dd>{asset.beneficiary_candidates.length ? asset.beneficiary_candidates.join(", ") : "미지정"}</dd></div></dl>
                {asset.conflict && <div className="message error compact">서로 다른 상속 대상이 확인되었습니다.</div>}
                {asset.missing_information.map((item) => <div className="message warning compact" key={item}>{item}</div>)}
                <p className="execution-note">{asset.execution_note}</p>
                <details><summary>분석 근거 확인</summary>{asset.evidence.map((item, index) => <blockquote key={`${item.source_id}-${index}`}>{item.evidence}</blockquote>)}</details>
              </article>)}</div>}
          </div>}
        </section>

        <section className="workspace policy-workspace" aria-labelledby="policy-heading">
          <div className="section-heading with-action"><span className="step-number">02</span><div><p className="section-kicker">복구 조건 설정</p><h2 id="policy-heading">복구 정책 점검하기</h2></div>
            <button type="button" className="text-button" onClick={fillTestAddresses}>테스트 주소 채우기</button></div>
          <form onSubmit={validatePolicy}>
            <div className="field-grid">
              <div className="field full"><label htmlFor="owner">소유자 주소</label><input id="owner" value={policy.owner} onChange={(e) => updatePolicy("owner", e.target.value)} placeholder="0x로 시작하는 지갑 주소" required /></div>
              <div className="field full"><label htmlFor="beneficiary">상속자 주소</label><input id="beneficiary" value={policy.beneficiary} onChange={(e) => updatePolicy("beneficiary", e.target.value)} placeholder="소유자와 다른 지갑 주소" required /></div>
              {policy.guardians.map((guardian, index) => <div className="field" key={index}><label htmlFor={`guardian-${index}`}>Guardian {index + 1}</label><input id={`guardian-${index}`} value={guardian} onChange={(e) => updateGuardian(index, e.target.value)} placeholder="서로 다른 주소" required /></div>)}
              <div className="field"><label htmlFor="inactivity">비활동 기간</label><div className="input-with-unit"><input id="inactivity" type="number" min="1" max="3650" value={policy.inactivity_days} onChange={(e) => updatePolicy("inactivity_days", e.target.value)} required /><span>일</span></div></div>
              <div className="field"><label htmlFor="delay">복구 유예기간</label><div className="input-with-unit"><input id="delay" type="number" min="0" max="365" value={policy.recovery_delay_days} onChange={(e) => updatePolicy("recovery_delay_days", e.target.value)} required /><span>일</span></div></div>
              <div className="field threshold-field"><span className="field-label">Guardian 승인 기준</span><strong>2 / 3명</strong></div>
            </div>
            <div className="form-footer policy-submit"><p>권장 기준: 비활동 90일 이상 · 유예기간 7일 이상</p><button className="secondary-button" disabled={validating}>{validating ? "검증 중…" : "정책 안전성 확인"}</button></div>
          </form>
          {policyError && <div className="message error" role="alert">{policyError}</div>}
          {validation && <div className={`validation-panel ${validation.allowed ? "safe" : "unsafe"}`} aria-live="polite">
            <div><span className="validation-label">정책 위험도</span><strong>{validation.allowed ? "STANDARD" : "HIGH"}</strong>
              <p>{validation.allowed ? "현재 정책은 권장 보안 기준을 충족합니다." : "안전 기준에 맞게 수정해주세요."}</p></div>
            {validation.warnings.length > 0 && <ul>{validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
            <label className={`confirmation-check ${validation.allowed ? "" : "disabled"}`}><input type="checkbox" checked={accepted} disabled={!validation.allowed} onChange={(e) => setAccepted(e.target.checked)} /><span>입력한 주소와 복구 조건을 직접 확인했습니다.</span></label>
            <button className="primary-button" type="button" onClick={confirmPolicy} disabled={!validation.allowed || !accepted || validating}>복구 정책 확인</button>
          </div>}
          {confirmation && <div className="signature-state" role="status"><span className="status-dot" /><div><strong>지갑 서명 대기 중</strong><p>{confirmation.note}</p><small>이 화면에서는 실제 지갑 연결이나 트랜잭션이 실행되지 않습니다.</small></div></div>}
        </section>
      </main>
      <footer>BlockWill Local MVP · 분석 결과는 반드시 사용자가 검토해야 합니다.</footer>
    </div>
  );
}
