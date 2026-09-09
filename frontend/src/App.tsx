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

function Planner({ onBack }: { onBack: () => void }) {
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
        <button className="brand brand-button" type="button" onClick={onBack} aria-label="사용자 홈으로 이동"><span className="brand-mark">BW</span>BlockWill</button>
        <button className="text-button" type="button" onClick={onBack}>사용자 홈</button>
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

type Screen = "landing" | "login" | "signup" | "dashboard" | "planner";

function Brand({ onClick }: { onClick: () => void }) {
  return <button className="brand brand-button" type="button" onClick={onClick}><span className="brand-mark">BW</span>BlockWill</button>;
}

function Landing({ move }: { move: (screen: Screen) => void }) {
  return <div className="app-shell public-page">
    <header className="topbar public-topbar">
      <Brand onClick={() => move("landing")} />
      <nav className="header-actions" aria-label="회원 메뉴">
        <button className="text-button" onClick={() => move("login")}>로그인</button>
        <button className="primary-button compact-button" onClick={() => move("signup")}>회원가입</button>
      </nav>
    </header>
    <main>
      <section className="landing-hero">
        <p className="eyebrow">DIGITAL ESTATE, SAFELY PLANNED</p>
        <h1>소중한 디지털 자산의<br />다음 주인을 준비하세요.</h1>
        <p className="intro-copy">BlockWill은 자산을 정리하고 상속에 필요한 정보를 빠짐없이 준비하도록 돕습니다.</p>
        <div className="hero-actions">
          <button className="primary-button large-button" onClick={() => move("signup")}>내 유산 계획 시작하기</button>
          <button className="outline-button large-button" onClick={() => move("login")}>로그인</button>
        </div>
      </section>
      <section className="value-grid" aria-label="BlockWill 주요 원칙">
        <article><span>01</span><h2>자산을 한곳에서 정리</h2><p>흩어진 지갑과 디지털 계정의 존재와 처리 계획을 기록합니다.</p></article>
        <article><span>02</span><h2>AI 작성 안내</h2><p>누락된 정보를 질문하고 검토 가능한 유언 계획 초안을 만듭니다.</p></article>
        <article><span>03</span><h2>검증 후 안전하게 실행</h2><p>미활동만으로 이전하지 않고 사망·관계·서류 확인 절차를 거칩니다.</p></article>
      </section>
    </main>
    <footer>BlockWill · 디지털 유산 설계 및 복구 지원</footer>
  </div>;
}

function AuthPage({ mode, move, complete }: { mode: "login" | "signup"; move: (screen: Screen) => void; complete: () => void }) {
  const signup = mode === "signup";
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); complete(); };
  return <div className="app-shell auth-page">
    <header className="topbar"><Brand onClick={() => move("landing")} /><button className="text-button" onClick={() => move("landing")}>처음으로</button></header>
    <main className="auth-main">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">{signup ? "CREATE ACCOUNT" : "WELCOME BACK"}</p>
        <h1 id="auth-title">{signup ? "BlockWill 시작하기" : "다시 만나 반가워요"}</h1>
        <p className="auth-copy">{signup ? "내 디지털 유산 계획을 안전하게 준비하세요." : "등록한 유산 계획과 수령 요청을 확인하세요."}</p>
        <div className="demo-notice">현재 스프린트는 화면 흐름 확인용입니다. 실제 계정 인증은 다음 단계에서 연결됩니다.</div>
        <form onSubmit={submit} className="auth-form">
          {signup && <div className="field"><label htmlFor="name">이름</label><input id="name" name="name" autoComplete="name" required placeholder="이름 입력" /></div>}
          <div className="field"><label htmlFor="email">이메일</label><input id="email" name="email" type="email" autoComplete="email" required placeholder="name@example.com" /></div>
          <div className="field"><label htmlFor="password">비밀번호</label><input id="password" name="password" type="password" minLength={8} autoComplete={signup ? "new-password" : "current-password"} required placeholder="8자 이상 입력" /></div>
          {signup && <label className="terms-check"><input type="checkbox" required /><span>서비스 이용약관과 개인정보 처리 안내를 확인했습니다.</span></label>}
          <button className="primary-button auth-submit">{signup ? "회원가입" : "로그인"}</button>
        </form>
        <p className="auth-switch">{signup ? "이미 계정이 있나요?" : "처음 방문하셨나요?"}<button className="inline-button" onClick={() => move(signup ? "login" : "signup")}>{signup ? "로그인" : "회원가입"}</button></p>
      </section>
    </main>
  </div>;
}

function Dashboard({ move, logout }: { move: (screen: Screen) => void; logout: () => void }) {
  return <div className="app-shell dashboard-page">
    <header className="topbar"><Brand onClick={() => move("dashboard")} /><button className="text-button" onClick={logout}>로그아웃</button></header>
    <main>
      <section className="dashboard-heading">
        <p className="eyebrow">MY BLOCKWILL</p><h1>어떤 일을 시작할까요?</h1>
        <p>자신의 디지털 유산을 준비하거나, 고인이 남긴 유산의 수령 절차를 시작할 수 있습니다.</p>
      </section>
      <section className="journey-grid" aria-label="사용자 업무 선택">
        <article className="journey-card primary-journey">
          <span className="journey-number">01</span><div><p className="section-kicker">나를 위한 준비</p><h2>나의 디지털 유산 설계하기</h2><p>보유 자산을 정리하고 AI의 안내를 받아 전달 계획과 복구 조건을 준비합니다.</p></div>
          <button className="primary-button large-button" onClick={() => move("planner")}>설계 시작하기</button>
        </article>
        <article className="journey-card">
          <span className="journey-number">02</span><div><p className="section-kicker">남겨진 유산 확인</p><h2>유산 수령 절차 시작하기</h2><p>본인확인 후 고인이 남긴 계획을 찾고 필요한 증빙 서류를 제출합니다.</p></div>
          <button className="outline-button large-button" disabled title="다음 스프린트에서 구현됩니다">다음 스프린트에서 연결</button>
        </article>
      </section>
      <aside className="security-strip"><strong>BlockWill 보안 원칙</strong><span>복구 문구·개인키·실제 비밀번호는 어떤 화면에서도 요청하지 않습니다.</span></aside>
    </main>
  </div>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => sessionStorage.getItem("blockwill-demo-session") ? "dashboard" : "landing");
  const completeAuth = () => { sessionStorage.setItem("blockwill-demo-session", "active"); setScreen("dashboard"); };
  const logout = () => { sessionStorage.removeItem("blockwill-demo-session"); setScreen("landing"); };

  if (screen === "login" || screen === "signup") return <AuthPage mode={screen} move={setScreen} complete={completeAuth} />;
  if (screen === "dashboard") return <Dashboard move={setScreen} logout={logout} />;
  if (screen === "planner") return <Planner onBack={() => setScreen("dashboard")} />;
  return <Landing move={setScreen} />;
}
