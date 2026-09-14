import { BrowserProvider, formatEther } from "ethers";

type InjectedProvider = {
  request: (request: {
    method: string;
    params?: Array<any> | Record<string, any>;
  }) => Promise<any>;
  on?: (
    event: string,
    listener: (...args: Array<any>) => void,
  ) => void;
  removeListener?: (
    event: string,
    listener: (...args: Array<any>) => void,
  ) => void;
  isMetaMask?: boolean;
};

declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}

export type WalletSnapshot = {
  address: string;
  balanceEth: string;
  chainId: number;
};

export const BLOCKWILL_CHAIN_ID = 31337;
const BLOCKWILL_CHAIN_ID_HEX = "0x7a69";

function getProvider(): InjectedProvider | null {
  return window.ethereum ?? null;
}

function formatBalance(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(4, "0").slice(0, 4)}`;
}

async function createSnapshot(
  provider: InjectedProvider,
  accounts: string[],
): Promise<WalletSnapshot | null> {
  const address = accounts[0];

  if (!address) {
    return null;
  }

  const browserProvider = new BrowserProvider(provider);
  const network = await browserProvider.getNetwork();
  const balance = await browserProvider.getBalance(address);

  return {
    address,
    chainId: Number(network.chainId),
    balanceEth: formatBalance(formatEther(balance)),
  };
}

export function hasInjectedWallet(): boolean {
  return Boolean(getProvider());
}

export async function getExistingWallet(): Promise<WalletSnapshot | null> {
  const provider = getProvider();

  if (!provider) {
    return null;
  }

  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as string[];

  return createSnapshot(provider, accounts);
}

export async function connectWallet(): Promise<WalletSnapshot> {
  const provider = getProvider();

  if (!provider) {
    throw new Error(
      "MetaMask를 찾을 수 없습니다. 브라우저 확장 프로그램을 확인해주세요.",
    );
  }

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  const snapshot = await createSnapshot(provider, accounts);

  if (!snapshot) {
    throw new Error("연결할 지갑 계정을 선택해주세요.");
  }

  return snapshot;
}

export async function switchToBlockWillNetwork(): Promise<void> {
  const provider = getProvider();

  if (!provider) {
    throw new Error("MetaMask를 찾을 수 없습니다.");
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [
        {
          chainId: BLOCKWILL_CHAIN_ID_HEX,
        },
      ],
    });
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error
        ? Number((error as { code: unknown }).code)
        : undefined;

    if (code !== 4902) {
      throw error;
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: BLOCKWILL_CHAIN_ID_HEX,
          chainName: "BlockWill Local",
          nativeCurrency: {
            name: "Test Ethereum",
            symbol: "ETH",
            decimals: 18,
          },
          rpcUrls: ["http://127.0.0.1:8545"],
        },
      ],
    });
  }
}

export function watchWalletChanges(
  listener: () => void,
): () => void {
  const provider = getProvider();

  if (!provider?.on) {
    return () => undefined;
  }

  provider.on("accountsChanged", listener);
  provider.on("chainChanged", listener);

  return () => {
    provider.removeListener?.("accountsChanged", listener);
    provider.removeListener?.("chainChanged", listener);
  };
}

export function walletErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    Number((error as { code: unknown }).code) === 4001
  ) {
    return "MetaMask 요청이 취소되었습니다.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "지갑 요청을 처리하지 못했습니다.";
}