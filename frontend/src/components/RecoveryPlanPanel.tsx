import { useState } from "react";
import type { FormEvent } from "react";

import {
  createRecoveryPlan,
  recoveryErrorMessage,
} from "../api/recoveryVault";
import type {
  CreateRecoveryPlanResult,
} from "../api/recoveryVault";

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
  const [errorMessage, setErrorMessage] =
    useState("");
  const [result, setResult] =
    useState<CreateRecoveryPlanResult | null>(null);

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
      const created = await createRecoveryPlan({
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
    } catch (error) {
      setErrorMessage(
        recoveryErrorMessage(error),
      );
    } finally {
      setSubmitting(false);
    }
  };

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
            테스트 ETH 복구 계획 등록
          </h2>
        </div>
      </div>

      <div className="message warning">
        이 기능은 Hardhat 로컬 네트워크의 테스트
        ETH만 사용합니다. 실제 이더리움을 보내지
        마세요.
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
            등록 버튼을 누르면 MetaMask에서 예치금과
            실행 조건을 확인한 뒤 서명합니다.
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

      {errorMessage && (
        <div className="message error" role="alert">
          {errorMessage}
        </div>
      )}

      {result && (
        <div
          className="signature-state"
          role="status"
        >
          <span className="status-dot" />

          <div>
            <strong>
              복구 계획 등록 완료
              {result.planId
                ? ` · Plan #${result.planId}`
                : ""}
            </strong>

            <p>
              트랜잭션:{" "}
              {result.transactionHash.slice(0, 12)}
              ...
              {result.transactionHash.slice(-8)}
            </p>

            <small>
              상태: ACTIVE · 아직 복구나 상속은
              실행되지 않았습니다.
            </small>
          </div>
        </div>
      )}
    </section>
  );
}