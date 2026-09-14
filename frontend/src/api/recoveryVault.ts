import {
  BrowserProvider,
  Contract,
  formatEther,
  isAddress,
  parseEther,
} from "ethers";

const CONTRACT_ADDRESS = (
  import.meta.env.VITE_RECOVERY_VAULT_ADDRESS || ""
).trim();

const BLOCKWILL_CHAIN_ID = 31337;

const RECOVERY_VAULT_ABI = [
  "function planCount() view returns (uint256)",
  "function createRecoveryPlan(address beneficiary, uint256 inactivityPeriod, uint256 recoveryDelay) payable returns (uint256 planId)",
  "function getPlan(uint256 planId) view returns (tuple(address owner, address beneficiary, uint256 deposit, uint256 lastCheckIn, uint256 inactivityPeriod, uint256 recoveryDelay, uint256 recoveryRequestedAt, uint8 status))",
  "function timeUntilInactive(uint256 planId) view returns (uint256)",
  "function timeUntilExecution(uint256 planId) view returns (uint256)",
  "function checkIn(uint256 planId)",
  "function requestRecovery(uint256 planId)",
  "function cancelRecovery(uint256 planId)",
  "function executeRecovery(uint256 planId)",  "event RecoveryPlanCreated(uint256 indexed planId, address indexed owner, address indexed beneficiary, uint256 deposit, uint256 inactivityPeriod, uint256 recoveryDelay)",
] as const;

export type RecoveryStatus =
  | "ACTIVE"
  | "RECOVERY_PENDING"
  | "EXECUTED";

export type RecoveryPlan = {
  id: string;
  owner: string;
  beneficiary: string;
  depositEth: string;
  lastCheckIn: number;
  inactivityPeriod: number;
  recoveryDelay: number;
  recoveryRequestedAt: number;
  status: RecoveryStatus;
  secondsUntilInactive: number;
  secondsUntilExecution: number;
};

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

const statusNames: RecoveryStatus[] = [
  "ACTIVE",
  "RECOVERY_PENDING",
  "EXECUTED",
];

function getErrorCode(error: unknown): unknown {
  if (
    error &&
    typeof error === "object" &&
    "code" in error
  ) {
    return (error as { code: unknown }).code;
  }

  return undefined;
}

function parsePlanId(planId: string): bigint {
  if (!/^\d+$/.test(planId.trim())) {
    throw new Error(
      "Plan 번호는 1 이상의 숫자여야 합니다.",
    );
  }

  const value = BigInt(planId.trim());

  if (value <= 0n) {
    throw new Error(
      "Plan 번호는 1 이상의 숫자여야 합니다.",
    );
  }

  return value;
}

async function getProvider(): Promise<BrowserProvider> {
  if (!window.ethereum) {
    throw new Error(
      "MetaMask를 찾을 수 없습니다.",
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

  return provider;
}

function getContract(
  provider: BrowserProvider,
): Contract {
  if (
    !CONTRACT_ADDRESS ||
    !isAddress(CONTRACT_ADDRESS)
  ) {
    throw new Error(
      "RecoveryVault 컨트랙트 주소를 확인해주세요.",
    );
  }

  return new Contract(
    CONTRACT_ADDRESS,
    RECOVERY_VAULT_ABI,
    provider,
  );
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
    "reason" in error &&
    typeof (error as { reason: unknown }).reason ===
      "string"
  ) {
    return (error as { reason: string }).reason;
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

  return "블록체인 요청을 처리하지 못했습니다.";
}

export async function createRecoveryPlan(
  input: CreateRecoveryPlanInput,
): Promise<CreateRecoveryPlanResult> {
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

  const provider = await getProvider();
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

  const contract = getContract(provider).connect(
    signer,
  ) as Contract;

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
      const parsed =
        contract.interface.parseLog(log);

      if (
        parsed?.name === "RecoveryPlanCreated"
      ) {
        planId = parsed.args.planId.toString();
        break;
      }
    } catch {
      // 다른 이벤트는 건너뜁니다.
    }
  }

  if (!planId) {
    planId = (
      await contract.planCount()
    ).toString();
  }

  return {
    planId,
    transactionHash: receipt.hash,
  };
}

export async function getRecoveryPlan(
  planId: string,
): Promise<RecoveryPlan> {
  const parsedPlanId = parsePlanId(planId);
  const provider = await getProvider();
  const contract = getContract(provider);

  const [rawPlan, secondsUntilInactive, secondsUntilExecution,
    
  ] =
    await Promise.all([
      contract.getPlan(parsedPlanId),
      contract.timeUntilInactive(parsedPlanId),
      contract.timeUntilExecution(parsedPlanId),
    ]);

  const statusIndex = Number(rawPlan.status);
  const status =
    statusNames[statusIndex];

  if (!status) {
    throw new Error(
      "알 수 없는 복구 계획 상태입니다.",
    );
  }

  return {
    id: parsedPlanId.toString(),
    owner: rawPlan.owner,
    beneficiary: rawPlan.beneficiary,
    depositEth: formatEther(rawPlan.deposit),
    lastCheckIn: Number(rawPlan.lastCheckIn),
    inactivityPeriod: Number(
      rawPlan.inactivityPeriod,
    ),
    recoveryDelay: Number(rawPlan.recoveryDelay),
    recoveryRequestedAt: Number(
      rawPlan.recoveryRequestedAt,
    ),
    status,
    secondsUntilInactive: Number(
      secondsUntilInactive,
    ),
    secondsUntilExecution: Number(
      secondsUntilExecution,
    ),
  };
}

export async function checkInRecoveryPlan(
  planId: string,
): Promise<string> {
  const parsedPlanId = parsePlanId(planId);
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();
  const readonlyContract = getContract(provider);
  const plan =
    await readonlyContract.getPlan(parsedPlanId);

  if (
    signerAddress.toLowerCase() !==
    plan.owner.toLowerCase()
  ) {
    throw new Error(
      "복구 계획 소유자 계정으로 MetaMask를 변경해주세요.",
    );
  }

  const contract = readonlyContract.connect(
    signer,
  ) as Contract;

  const transaction =
    await contract.checkIn(parsedPlanId);

  const receipt = await transaction.wait();

  if (!receipt) {
    throw new Error(
      "체크인 결과를 확인하지 못했습니다.",
    );
  }

  return receipt.hash;
}

export async function requestRecoveryPlan(
  planId: string,
): Promise<string> {
  const parsedPlanId = parsePlanId(planId);
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();
  const readonlyContract = getContract(provider);
  const plan =
    await readonlyContract.getPlan(parsedPlanId);

  if (
    signerAddress.toLowerCase() !==
    plan.beneficiary.toLowerCase()
  ) {
    throw new Error(
      "상속자 MetaMask 계정으로 변경해주세요.",
    );
  }

  const contract = readonlyContract.connect(
    signer,
  ) as Contract;

  const transaction =
    await contract.requestRecovery(parsedPlanId);

  const receipt = await transaction.wait();

  if (!receipt) {
    throw new Error(
      "복구 요청 결과를 확인하지 못했습니다.",
    );
  }

  return receipt.hash;
}

export async function cancelRecoveryPlan(
  planId: string,
): Promise<string> {
  const parsedPlanId = parsePlanId(planId);
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();
  const readonlyContract = getContract(provider);
  const plan =
    await readonlyContract.getPlan(parsedPlanId);

  if (
    signerAddress.toLowerCase() !==
    plan.owner.toLowerCase()
  ) {
    throw new Error(
      "복구 계획 소유자 계정으로 변경해주세요.",
    );
  }

  const contract = readonlyContract.connect(
    signer,
  ) as Contract;

  const transaction =
    await contract.cancelRecovery(parsedPlanId);

  const receipt = await transaction.wait();

  if (!receipt) {
    throw new Error(
      "복구 취소 결과를 확인하지 못했습니다.",
    );
  }

  return receipt.hash;
}

export async function executeRecoveryPlan(
  planId: string,
): Promise<string> {
  const parsedPlanId = parsePlanId(planId);
  const provider = await getProvider();
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();
  const readonlyContract = getContract(provider);
  const plan =
    await readonlyContract.getPlan(parsedPlanId);

  if (
    signerAddress.toLowerCase() !==
    plan.beneficiary.toLowerCase()
  ) {
    throw new Error(
      "상속자 MetaMask 계정으로 변경해주세요.",
    );
  }

  const contract = readonlyContract.connect(
    signer,
  ) as Contract;

  const transaction =
    await contract.executeRecovery(parsedPlanId);

  const receipt = await transaction.wait();

  if (!receipt) {
    throw new Error(
      "최종 상속 실행 결과를 확인하지 못했습니다.",
    );
  }

  return receipt.hash;
}