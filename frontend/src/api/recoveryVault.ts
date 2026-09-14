import {
  BrowserProvider,
  Contract,
  isAddress,
  parseEther,
} from "ethers";

const CONTRACT_ADDRESS = (
  import.meta.env.VITE_RECOVERY_VAULT_ADDRESS || ""
).trim();

const BLOCKWILL_CHAIN_ID = 31337;

const RECOVERY_VAULT_ABI = [
  "function createRecoveryPlan(address beneficiary, uint256 inactivityPeriod, uint256 recoveryDelay) payable returns (uint256 planId)",
  "event RecoveryPlanCreated(uint256 indexed planId, address indexed owner, address indexed beneficiary, uint256 deposit, uint256 inactivityPeriod, uint256 recoveryDelay)",
] as const;

export type CreateRecoveryPlanInput = {
  beneficiary: string;
  inactivitySeconds: number;
  recoveryDelaySeconds: number;
  depositEth: string;
};

export type CreateRecoveryPlanResult = {
  planId: string;
  transactionHash: string;
};

function getErrorCode(error: unknown): unknown {
  if (error && typeof error === "object" && "code" in error) {
    return (error as { code: unknown }).code;
  }

  return undefined;
}

export function recoveryErrorMessage(
  error: unknown,
): string {
  const code = getErrorCode(error);

  if (code === 4001 || code === "ACTION_REJECTED") {
    return "MetaMask 서명이 취소되었습니다.";
  }

  if (
    error &&
    typeof error === "object" &&
    "shortMessage" in error &&
    typeof (error as { shortMessage: unknown })
      .shortMessage === "string"
  ) {
    return (error as { shortMessage: string })
      .shortMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "복구 계획을 등록하지 못했습니다.";
}

export async function createRecoveryPlan(
  input: CreateRecoveryPlanInput,
): Promise<CreateRecoveryPlanResult> {
  if (!window.ethereum) {
    throw new Error(
      "MetaMask를 찾을 수 없습니다.",
    );
  }

  if (
    !CONTRACT_ADDRESS ||
    !isAddress(CONTRACT_ADDRESS)
  ) {
    throw new Error(
      "RecoveryVault 컨트랙트 주소를 확인해주세요.",
    );
  }

  if (!isAddress(input.beneficiary)) {
    throw new Error(
      "올바른 상속자 지갑 주소를 입력해주세요.",
    );
  }

  if (
    !Number.isInteger(input.inactivitySeconds) ||
    input.inactivitySeconds <= 0
  ) {
    throw new Error(
      "비활동 기간을 1분 이상 입력해주세요.",
    );
  }

  if (
    !Number.isInteger(input.recoveryDelaySeconds) ||
    input.recoveryDelaySeconds <= 0
  ) {
    throw new Error(
      "복구 유예기간을 1분 이상 입력해주세요.",
    );
  }

  const provider = new BrowserProvider(
    window.ethereum,
  );

  const network = await provider.getNetwork();

  if (Number(network.chainId) !== BLOCKWILL_CHAIN_ID) {
    throw new Error(
      "MetaMask 네트워크를 BlockWill Local로 변경해주세요.",
    );
  }

  const signer = await provider.getSigner();
  const owner = await signer.getAddress();

  if (
    owner.toLowerCase() ===
    input.beneficiary.toLowerCase()
  ) {
    throw new Error(
      "소유자와 상속자는 서로 다른 지갑이어야 합니다.",
    );
  }

  let deposit: bigint;

  try {
    deposit = parseEther(input.depositEth);
  } catch {
    throw new Error(
      "올바른 테스트 ETH 수량을 입력해주세요.",
    );
  }

  if (deposit <= 0n) {
    throw new Error(
      "예치할 테스트 ETH를 입력해주세요.",
    );
  }

  const contract = new Contract(
    CONTRACT_ADDRESS,
    RECOVERY_VAULT_ABI,
    signer,
  );

  const transaction =
    await contract.createRecoveryPlan(
      input.beneficiary,
      input.inactivitySeconds,
      input.recoveryDelaySeconds,
      {
        value: deposit,
      },
    );

  const receipt = await transaction.wait();

  if (!receipt) {
    throw new Error(
      "트랜잭션 처리 결과를 확인하지 못했습니다.",
    );
  }

  let planId = "";

  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);

      if (
        parsed?.name === "RecoveryPlanCreated"
      ) {
        planId = parsed.args.planId.toString();
        break;
      }
    } catch {
      // 다른 컨트랙트 이벤트는 건너뜁니다.
    }
  }

  return {
    planId,
    transactionHash: receipt.hash,
  };
}