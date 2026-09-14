import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("RecoveryVault", function () {
  const deposit = ethers.parseEther("1");
  const inactivityPeriod = 300n;
  const recoveryDelay = 60n;

  async function deployFixture() {
    const [owner, beneficiary, stranger] =
      await ethers.getSigners();

    const vault =
      await ethers.deployContract("RecoveryVault");

    await vault.waitForDeployment();

    return {
      vault,
      owner,
      beneficiary,
      stranger,
    };
  }

  async function increaseTime(seconds: number) {
    await ethers.provider.send(
      "evm_increaseTime",
      [seconds],
    );

    await ethers.provider.send(
      "evm_mine",
      [],
    );
  }

  it("복구 계획과 테스트 ETH 예치금을 저장한다", async function () {
    const {
      vault,
      owner,
      beneficiary,
    } = await deployFixture();

    await expect(
      vault.createRecoveryPlan(
        beneficiary.address,
        inactivityPeriod,
        recoveryDelay,
        {
          value: deposit,
        },
      ),
    ).to.emit(vault, "RecoveryPlanCreated");

    const plan = await vault.getPlan(1n);

    expect(plan.owner).to.equal(owner.address);
    expect(plan.beneficiary).to.equal(
      beneficiary.address,
    );
    expect(plan.deposit).to.equal(deposit);
    expect(plan.status).to.equal(0n);
  });

  it("자기 자신을 상속자로 지정하거나 예치금 없이 만들 수 없다", async function () {
    const {
      vault,
      owner,
      beneficiary,
    } = await deployFixture();

    await expect(
      vault.createRecoveryPlan(
        owner.address,
        inactivityPeriod,
        recoveryDelay,
        {
          value: deposit,
        },
      ),
    ).to.be.revertedWith(
      "Beneficiary must differ from owner",
    );

    await expect(
      vault.createRecoveryPlan(
        beneficiary.address,
        inactivityPeriod,
        recoveryDelay,
      ),
    ).to.be.revertedWith("Deposit required");
  });

  it("소유자가 활동 시간을 갱신할 수 있다", async function () {
    const {
      vault,
      beneficiary,
    } = await deployFixture();

    await vault.createRecoveryPlan(
      beneficiary.address,
      inactivityPeriod,
      recoveryDelay,
      {
        value: deposit,
      },
    );

    const before = await vault.getPlan(1n);

    await increaseTime(120);
    await vault.checkIn(1n);

    const after = await vault.getPlan(1n);

    expect(after.lastCheckIn).to.be.greaterThan(
      before.lastCheckIn,
    );
    expect(after.status).to.equal(0n);
  });

  it("상속자가 복구를 요청하고 소유자가 취소할 수 있다", async function () {
    const {
      vault,
      beneficiary,
      stranger,
    } = await deployFixture();

    await vault.createRecoveryPlan(
      beneficiary.address,
      inactivityPeriod,
      recoveryDelay,
      {
        value: deposit,
      },
    );

    await expect(
      vault
        .connect(beneficiary)
        .requestRecovery(1n),
    ).to.be.revertedWith("Owner is still active");

    await increaseTime(301);

    await expect(
      vault
        .connect(stranger)
        .requestRecovery(1n),
    ).to.be.revertedWith("Not beneficiary");

    await expect(
      vault
        .connect(beneficiary)
        .requestRecovery(1n),
    ).to.emit(vault, "RecoveryRequested");

    let plan = await vault.getPlan(1n);

    expect(plan.status).to.equal(1n);

    await expect(
      vault.cancelRecovery(1n),
    ).to.emit(vault, "RecoveryCancelled");

    plan = await vault.getPlan(1n);

    expect(plan.status).to.equal(0n);
    expect(plan.recoveryRequestedAt).to.equal(0n);

    await expect(
      vault
        .connect(beneficiary)
        .requestRecovery(1n),
    ).to.be.revertedWith("Owner is still active");
  });

  it("유예기간 후 상속자에게 예치금을 전달한다", async function () {
    const {
      vault,
      beneficiary,
    } = await deployFixture();

    await vault.createRecoveryPlan(
      beneficiary.address,
      inactivityPeriod,
      recoveryDelay,
      {
        value: deposit,
      },
    );

    await increaseTime(301);

    await vault
      .connect(beneficiary)
      .requestRecovery(1n);

    await expect(
      vault
        .connect(beneficiary)
        .executeRecovery(1n),
    ).to.be.revertedWith(
      "Recovery delay has not passed",
    );

    await increaseTime(61);

    await expect(
      vault
        .connect(beneficiary)
        .executeRecovery(1n),
    
    ).to.changeEtherBalances(
      ethers,
      [vault, beneficiary],
      [-deposit, deposit],
    );

    const plan = await vault.getPlan(1n);

    expect(plan.status).to.equal(2n);
    expect(plan.deposit).to.equal(0n);
  });
});