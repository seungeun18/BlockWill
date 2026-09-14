import {
  useCallback,
  useEffect,
  useState,
} from "react";
import type { FormEvent } from "react";

import {
  cancelRecoveryPlan,
  checkInRecoveryPlan,
  createRecoveryPlan,
  executeRecoveryPlan,
  getRecoveryPlan,
  recoveryErrorMessage,
  requestRecoveryPlan,
} from "../api/recoveryVault";

import type {
  CreateRecoveryPlanResult,
  RecoveryPlan,
} from "../api/recoveryVault";
import {
  getExistingWallet,
  watchWalletChanges,
} from "../api/wallet";

const PLAN_STORAGE_KEY =
  "blockwill-last-recovery-plan-id";

const statusLabels = {
  ACTIVE: "활성",
  RECOVERY_PENDING: "복구 요청 대기",
  EXECUTED: "집행 완료",
};

function shortenAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) {
    return "복구 요청 가능";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(
    (seconds % 3600) / 60,
  );
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}시간 ${minutes}분 ${remainingSeconds}초`;
  }

  return `${minutes}분 ${remainingSeconds}초`;
}

function formatDate(timestamp: number): string {
  return new Date(
    timestamp * 1000,
  ).toLocaleString("ko-KR");
}

export default function RecoveryPlanPanel() {
  const [beneficiary, setBeneficiary] =
    useState("");
  const [depositEth, setDepositEth] =
    useState("0.01");
  const [inactivityMinutes, setInactivityMinutes] =
    useState("5");
  const [recoveryDelayMinutes, setRecoveryDelayMinutes] =
    useState("1");

  const [submitting, setSubmitting] =
    useState(false);
  const [checkingIn, setCheckingIn] =
    useState(false);
    const [
    requestingRecovery,
    setRequestingRecovery,
  ] = useState(false);

  const [
    cancellingRecovery,
    setCancellingRecovery,
  ] = useState(false);
  
  const [
    executingRecovery,
    setExecutingRecovery,
  ] = useState(false);

  const [actionMessage, setActionMessage] =
    useState("");
  const [loadingPlan, setLoadingPlan] =
    useState(false);
  const [errorMessage, setErrorMessage] =
    useState("");

  const [result, setResult] =
    useState<CreateRecoveryPlanResult | null>(null);
  const [plan, setPlan] =
    useState<RecoveryPlan | null>(null);

  const [planId, setPlanId] = useState(
    () => localStorage.getItem(PLAN_STORAGE_KEY) || "",
  );
  const [lookupId, setLookupId] =
    useState(planId);
  const [connectedAddress, setConnectedAddress] =
    useState("");
  const [secondsRemaining, setSecondsRemaining] =
    useState(0);

  const refreshWallet = useCallback(async () => {
    try {
      const wallet = await getExistingWallet();
      setConnectedAddress(wallet?.address || "");
    } catch {
      setConnectedAddress("");
    }
  }, []);

  const loadPlan = useCallback(
    async (targetPlanId: string) => {
      if (!targetPlanId) {
        return;
      }

      setLoadingPlan(true);
      setErrorMessage("");

      try {
        const loaded =
          await getRecoveryPlan(targetPlanId);

        setPlan(loaded);
        setSecondsRemaining(
          loaded.secondsUntilInactive,
        );
      } catch (error) {
        setPlan(null);
        setErrorMessage(
          recoveryErrorMessage(error),
        );
      } finally {
        setLoadingPlan(false);
      }
    },
    [],
  );

  useEffect(() => {
    void refreshWallet();

    return watchWalletChanges(() => {
      void refreshWallet();

      if (planId) {
        void loadPlan(planId);
      }
    });
  }, [
    loadPlan,
    planId,
    refreshWallet,
  ]);

  useEffect(() => {
    if (planId) {
      setLookupId(planId);
      void loadPlan(planId);
    }
  }, [loadPlan, planId]);

    useEffect(() => {
    if (!plan) {
      setSecondsRemaining(0);
      return;
    }

    if (plan.status === "EXECUTED") {
      setSecondsRemaining(0);
      return;
    }

    const initialSeconds =
      plan.status === "ACTIVE"
        ? plan.secondsUntilInactive
        : plan.secondsUntilExecution;

    setSecondsRemaining(initialSeconds);

    const timer = window.setInterval(() => {
      setSecondsRemaining((current) =>
        Math.max(0, current - 1),
      );
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [plan]);

  const submit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    setResult(null);

    const inactivity =
      Number(inactivityMinutes);
    const delay =
      Number(recoveryDelayMinutes);

    if (
      !Number.isFinite(inactivity) ||
      inactivity < 1
    ) {
      setErrorMessage(
        "비활동 기간을 1분 이상 입력해주세요.",
      );
      setSubmitting(false);
      return;
    }

    if (
      !Number.isFinite(delay) ||
      delay < 1
    ) {
      setErrorMessage(
        "복구 유예기간을 1분 이상 입력해주세요.",
      );
      setSubmitting(false);
      return;
    }

    try {
      const created =
        await createRecoveryPlan({
          beneficiary: beneficiary.trim(),
          depositEth,
          inactivitySeconds: Math.floor(
            inactivity * 60,
          ),
          recoveryDelaySeconds: Math.floor(
            delay * 60,
          ),
        });

      setResult(created);
      localStorage.setItem(
        PLAN_STORAGE_KEY,
        created.planId,
      );
      setPlanId(created.planId);
    } catch (error) {
      setErrorMessage(
        recoveryErrorMessage(error),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const lookupPlan = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const target = lookupId.trim();

    if (!target) {
      setErrorMessage(
        "조회할 Plan 번호를 입력해주세요.",
      );
      return;
    }

    localStorage.setItem(
      PLAN_STORAGE_KEY,
      target,
    );
    setPlanId(target);
    await loadPlan(target);
  };

    const handleCheckIn = async () => {
    if (!plan) {
      return;
    }
    
    setCheckingIn(true);
    setErrorMessage("");
    setActionMessage("");

    try {
      const hash =
        await checkInRecoveryPlan(plan.id);

      setActionMessage(
        `활동 확인 완료 · ${hash.slice(0, 12)}...`,
      );

      await loadPlan(plan.id);
    } catch (error) {
      setErrorMessage(
        recoveryErrorMessage(error),
      );
    } finally {
      setCheckingIn(false);
    }
  };
    const handleRequestRecovery = async () => {
    if (!plan) {
      return;
    }

    setRequestingRecovery(true);
    setErrorMessage("");
    setActionMessage("");

    try {
      const hash =
        await requestRecoveryPlan(plan.id);

      setActionMessage(
        `복구 요청 완료 · ${hash.slice(0, 12)}...`,
      );

      await loadPlan(plan.id);
    } catch (error) {
      setErrorMessage(
        recoveryErrorMessage(error),
      );
    } finally {
      setRequestingRecovery(false);
    }
  };

  const handleCancelRecovery = async () => {
    if (!plan) {
      return;
    }

    setCancellingRecovery(true);
    setErrorMessage("");
    setActionMessage("");

    try {
      const hash =
        await cancelRecoveryPlan(plan.id);

      setActionMessage(
        `복구 요청 취소 완료 · ${hash.slice(0, 12)}...`,
      );

      await loadPlan(plan.id);
    } catch (error) {
      setErrorMessage(
        recoveryErrorMessage(error),
      );
    } finally {
      setCancellingRecovery(false);
    }
  };


    const handleExecuteRecovery = async () => {
    if (!plan) {
      return;
    }

    setExecutingRecovery(true);
    setErrorMessage("");
    setActionMessage("");

    try {
      const hash =
        await executeRecoveryPlan(plan.id);

      setActionMessage(
        `최종 상속 실행 완료 · ${hash.slice(0, 12)}...`,
      );

      await loadPlan(plan.id);
    } catch (error) {
      setErrorMessage(
        recoveryErrorMessage(error),
      );
    } finally {
      setExecutingRecovery(false);
    }
  };


  const clearSavedPlan = () => {
    localStorage.removeItem(PLAN_STORAGE_KEY);
    setPlanId("");
    setLookupId("");
    setPlan(null);
    setResult(null);
    setErrorMessage("");
  };

    const isOwner =
    Boolean(plan && connectedAddress) &&
    plan!.owner.toLowerCase() ===
      connectedAddress.toLowerCase();

    const isBeneficiary =
    Boolean(plan && connectedAddress) &&
    plan!.beneficiary.toLowerCase() ===
      connectedAddress.toLowerCase();

  return (
    <section
      className="workspace policy-workspace"
      aria-labelledby="recovery-plan-heading"
    >
      <div className="section-heading">
        <span className="step-number">03</span>

        <div>
          <p className="section-kicker">
            로컬 블록체인 실험
          </p>
          <h2 id="recovery-plan-heading">
            테스트 ETH 복구 계획
          </h2>
        </div>
      </div>

      <div className="message warning">
        Hardhat 로컬 네트워크의 테스트 ETH만
        사용합니다. 실제 이더리움을 보내지 마세요.
      </div>

      <form onSubmit={submit}>
        <div className="field-grid">
          <div className="field full">
            <label htmlFor="recovery-beneficiary">
              상속자 MetaMask 주소
            </label>

            <input
              id="recovery-beneficiary"
              value={beneficiary}
              onChange={(event) =>
                setBeneficiary(event.target.value)
              }
              placeholder="소유자와 다른 0x 지갑 주소"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="deposit-eth">
              예치할 테스트 ETH
            </label>

            <div className="input-with-unit">
              <input
                id="deposit-eth"
                type="number"
                min="0.001"
                step="0.001"
                value={depositEth}
                onChange={(event) =>
                  setDepositEth(event.target.value)
                }
                required
              />
              <span>ETH</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="inactivity-minutes">
              비활동 기준
            </label>

            <div className="input-with-unit">
              <input
                id="inactivity-minutes"
                type="number"
                min="1"
                step="1"
                value={inactivityMinutes}
                onChange={(event) =>
                  setInactivityMinutes(
                    event.target.value,
                  )
                }
                required
              />
              <span>분</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="recovery-delay-minutes">
              복구 유예기간
            </label>

            <div className="input-with-unit">
              <input
                id="recovery-delay-minutes"
                type="number"
                min="1"
                step="1"
                value={recoveryDelayMinutes}
                onChange={(event) =>
                  setRecoveryDelayMinutes(
                    event.target.value,
                  )
                }
                required
              />
              <span>분</span>
            </div>
          </div>
        </div>

        <div className="form-footer policy-submit">
          <p>
            MetaMask에서 조건과 예치금을 확인한 뒤
            서명합니다.
          </p>

          <button
            className="primary-button"
            disabled={submitting}
          >
            {submitting
              ? "블록체인 등록 중…"
              : "MetaMask로 복구 계획 등록"}
          </button>
        </div>
      </form>

      {result && (
        <div
          className="signature-state"
          role="status"
        >
          <span className="status-dot" />
          <div>
            <strong>
              복구 계획 등록 완료 · Plan #
              {result.planId}
            </strong>
            <p>
              트랜잭션:{" "}
              {result.transactionHash.slice(0, 12)}
              ...
              {result.transactionHash.slice(-8)}
            </p>
          </div>
        </div>
      )}

      <div className="analysis-results">
        <div className="result-summary">
          <div>
            <p className="section-kicker">
              온체인 계획 조회
            </p>
            <h3>
              등록된 복구 계획 상태 확인
            </h3>
          </div>

          {plan && (
            <span
              className={`issue-count ${
                plan.status === "RECOVERY_PENDING"
                  ? "warning"
                  : "clear"
              }`}
            >
              {statusLabels[plan.status]}
            </span>
          )}
        </div>

        <form onSubmit={lookupPlan}>
          <div className="field-grid">
            <div className="field full">
              <label htmlFor="lookup-plan-id">
                Plan 번호
              </label>

              <input
                id="lookup-plan-id"
                type="number"
                min="1"
                step="1"
                value={lookupId}
                onChange={(event) =>
                  setLookupId(event.target.value)
                }
                placeholder="예: 1"
                required
              />
            </div>
          </div>

          <div className="form-footer">
            <button
              className="secondary-button"
              disabled={loadingPlan}
            >
              {loadingPlan
                ? "Plan 조회 중…"
                : "Plan 조회"}
            </button>

            {planId && (
              <button
                className="text-button"
                type="button"
                onClick={clearSavedPlan}
              >
                저장된 Plan 지우기
              </button>
            )}
          </div>
        </form>

        {plan && (
          <article className="asset-card">
            <div className="asset-title-row">
              <div>
                <span className="category-label">
                  RECOVERY PLAN
                </span>
                <h4>Plan #{plan.id}</h4>
              </div>

              <span
                className={`execution-badge ${
                  plan.status === "ACTIVE"
                    ? "onchain"
                    : "external"
                }`}
              >
                {statusLabels[plan.status]}
              </span>
            </div>

            <dl className="asset-details">
              <div>
                <dt>소유자</dt>
                <dd title={plan.owner}>
                  {shortenAddress(plan.owner)}
                </dd>
              </div>

              <div>
                <dt>상속자</dt>
                <dd title={plan.beneficiary}>
                  {shortenAddress(
                    plan.beneficiary,
                  )}
                </dd>
              </div>

              <div>
                <dt>예치금</dt>
                <dd>{plan.depositEth} ETH</dd>
              </div>

              <div>
                <dt>마지막 활동 확인</dt>
                <dd>
                  {formatDate(plan.lastCheckIn)}
                </dd>
              </div>

              <div>
                <dt>
                  {plan.status === "ACTIVE"
                    ? "비활동까지 남은 시간"
                    : plan.status ===
                        "RECOVERY_PENDING"
                      ? "최종 수령까지 남은 시간"
                      : "복구 상태"}
                </dt>

                <dd>
                  {plan.status === "EXECUTED"
                    ? "집행 완료"
                    : secondsRemaining <= 0
                      ? plan.status === "ACTIVE"
                        ? "복구 요청 가능"
                        : "최종 수령 가능"
                      : formatDuration(
                          secondsRemaining,
                        )}
                </dd>
              </div>

              <div>
                <dt>복구 유예기간</dt>
                <dd>
                  {Math.floor(
                    plan.recoveryDelay / 60,
                  )}
                  분
                </dd>
              </div>
            </dl>

            {plan.status === "ACTIVE" &&
              secondsRemaining === 0 && (
                <div className="message warning compact">
                  비활동 기준이 지났습니다. 상속자
                  계정에서 복구를 요청할 수 있습니다.
                </div>
              )}

                        {plan.status ===
              "RECOVERY_PENDING" &&
              secondsRemaining === 0 && (
                <div className="message warning compact">
                  복구 유예기간이 끝났습니다. 상속자
                  계정에서 테스트 ETH를 수령할 수
                  있습니다.
                </div>
              )}

            {!connectedAddress && (
              <div className="message warning compact">
                체크인하려면 MetaMask 지갑을 먼저
                연결해주세요.
              </div>
            )}

            {connectedAddress &&
              !isOwner &&
              !isBeneficiary && (
                <div className="message warning compact">
                  현재 MetaMask 계정은 이 Plan의
                  소유자나 상속자가 아닙니다.
                </div>
              )}
                        <div className="form-footer">
              <p className="execution-note">
                {plan.status === "ACTIVE"
                  ? "소유자는 체크인할 수 있고, 비활동 시간이 지나면 상속자가 복구를 요청할 수 있습니다."
                  : plan.status ===
                      "RECOVERY_PENDING"
                    ? "복구 요청이 접수됐습니다. 소유자는 유예기간 중 요청을 취소할 수 있습니다."
                    : "이 복구 계획은 집행 완료됐습니다."}
              </p>

              {plan.status === "ACTIVE" &&
                isOwner && (
                  <button
                    className="primary-button"
                    type="button"
                    onClick={handleCheckIn}
                    disabled={checkingIn}
                  >
                    {checkingIn
                      ? "활동 확인 중…"
                      : "지금 활동 확인"}
                  </button>
                )}

              {plan.status === "ACTIVE" &&
                isBeneficiary && (
                  <button
                    className="primary-button"
                    type="button"
                    onClick={handleRequestRecovery}
                    disabled={
                      requestingRecovery ||
                      secondsRemaining > 0
                    }
                  >
                    {requestingRecovery
                      ? "복구 요청 중…"
                      : secondsRemaining > 0
                        ? "비활동 기간 대기 중"
                        : "복구 요청"}
                  </button>
                )}

              {plan.status ===
                "RECOVERY_PENDING" &&
                isOwner && (
                  <button
                    className="primary-button"
                    type="button"
                    onClick={handleCancelRecovery}
                    disabled={cancellingRecovery}
                  >
                    {cancellingRecovery
                      ? "복구 취소 중…"
                      : "복구 요청 취소"}
                  </button>
                )}

                          {plan.status ===
                "RECOVERY_PENDING" &&
                isBeneficiary && (
                  <button
                    className="primary-button"
                    type="button"
                    onClick={handleExecuteRecovery}
                    disabled={
                      executingRecovery ||
                      secondsRemaining > 0
                    }
                  >
                    {executingRecovery
                      ? "상속 실행 중…"
                      : secondsRemaining > 0
                        ? "복구 유예기간 대기 중"
                        : "테스트 ETH 수령"}
                  </button>
                )}

            </div>

            {actionMessage && (
              <div
                className="message warning compact"
                role="status"
              >
                {actionMessage}
              </div>
            )}
          </article>
        )}
      </div>

      {errorMessage && (
        <div className="message error" role="alert">
          {errorMessage}
        </div>
      )}
    </section>
  );
}