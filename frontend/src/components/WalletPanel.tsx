import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  BLOCKWILL_CHAIN_ID,
  connectWallet,
  getExistingWallet,
  hasInjectedWallet,
  switchToBlockWillNetwork,
  walletErrorMessage,
  watchWalletChanges,
} from "../api/wallet";
import type { WalletSnapshot } from "../api/wallet";

function shortenAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export default function WalletPanel() {
  const [wallet, setWallet] =
    useState<WalletSnapshot | null>(null);
  const [checking, setChecking] = useState(true);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const refreshWallet = useCallback(async () => {
    try {
      const snapshot = await getExistingWallet();
      setWallet(snapshot);
      setErrorMessage("");
    } catch (error) {
      setWallet(null);
      setErrorMessage(walletErrorMessage(error));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshWallet();

    return watchWalletChanges(() => {
      void refreshWallet();
    });
  }, [refreshWallet]);

  const handleConnect = async () => {
    setWorking(true);
    setErrorMessage("");

    try {
      const snapshot = await connectWallet();
      setWallet(snapshot);
    } catch (error) {
      setErrorMessage(walletErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const handleNetworkSwitch = async () => {
    setWorking(true);
    setErrorMessage("");

    try {
      await switchToBlockWillNetwork();
      await refreshWallet();
    } catch (error) {
      setErrorMessage(walletErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };

  const correctNetwork =
    wallet?.chainId === BLOCKWILL_CHAIN_ID;

  return (
    <section
      className="workspace policy-workspace"
      aria-labelledby="wallet-heading"
    >
      <div className="section-heading">
        <span className="step-number">W</span>

        <div>
          <p className="section-kicker">
            테스트 지갑
          </p>
          <h2 id="wallet-heading">
            MetaMask 지갑 연결
          </h2>
        </div>
      </div>

      {checking ? (
        <div
          className="validation-panel safe"
          aria-live="polite"
        >
          <div>
            <span className="validation-label">
              지갑 확인
            </span>
            <strong>연결 상태를 확인하고 있습니다.</strong>
          </div>
        </div>
      ) : !hasInjectedWallet() ? (
        <div className="message error" role="alert">
          MetaMask를 찾을 수 없습니다. MetaMask가 설치된
          브라우저에서 접속해주세요.
        </div>
      ) : !wallet ? (
        <>
          <p className="execution-note">
            지갑을 연결하면 공개 주소와 로컬 테스트 ETH
            잔액만 확인합니다. 개인키와 복구 문구는
            요청하지 않습니다.
          </p>

          <button
            className="primary-button"
            type="button"
            onClick={handleConnect}
            disabled={working}
          >
            {working
              ? "MetaMask 확인 중…"
              : "MetaMask 지갑 연결"}
          </button>
        </>
      ) : (
        <>
          <div
            className={`validation-panel ${
              correctNetwork ? "safe" : "unsafe"
            }`}
            aria-live="polite"
          >
            <div>
              <span className="validation-label">
                지갑 연결 상태
              </span>

              <strong>
                {correctNetwork
                  ? "BlockWill Local 연결됨"
                  : "네트워크 변경 필요"}
              </strong>

              <p title={wallet.address}>
                {shortenAddress(wallet.address)}
                {" · "}
                {wallet.balanceEth} ETH
              </p>
            </div>

            <button
              className={
                correctNetwork
                  ? "outline-button"
                  : "primary-button"
              }
              type="button"
              onClick={
                correctNetwork
                  ? () => void refreshWallet()
                  : handleNetworkSwitch
              }
              disabled={working}
            >
              {working
                ? "처리 중…"
                : correctNetwork
                  ? "잔액 새로고침"
                  : "BlockWill Local로 전환"}
            </button>
          </div>

          {correctNetwork ? (
            <div className="message warning">
              현재 표시되는 ETH는 로컬 개발용 테스트
              자산입니다. 실제 가치가 없으며 실제
              이더리움을 보내면 안 됩니다.
            </div>
          ) : (
            <div className="message error">
              현재 네트워크의 Chain ID는{" "}
              {wallet.chainId}입니다. BlockWill Local의
              Chain ID 31337로 변경해주세요.
            </div>
          )}
        </>
      )}

      {errorMessage && (
        <div className="message error" role="alert">
          {errorMessage}
        </div>
      )}
    </section>
  );
}