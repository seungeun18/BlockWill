import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule(
  "RecoveryVaultModule",
  (module) => {
    const recoveryVault =
      module.contract("RecoveryVault");

    return {
      recoveryVault,
    };
  },
);