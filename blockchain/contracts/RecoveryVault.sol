// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract RecoveryVault {
    enum RecoveryStatus {
        ACTIVE,
        RECOVERY_PENDING,
        EXECUTED
    }

    struct RecoveryPlan {
        address owner;
        address beneficiary;
        uint256 deposit;
        uint256 lastCheckIn;
        uint256 inactivityPeriod;
        uint256 recoveryDelay;
        uint256 recoveryRequestedAt;
        RecoveryStatus status;
    }

    uint256 public planCount;

    mapping(uint256 => RecoveryPlan) private plans;

    event RecoveryPlanCreated(
        uint256 indexed planId,
        address indexed owner,
        address indexed beneficiary,
        uint256 deposit,
        uint256 inactivityPeriod,
        uint256 recoveryDelay
    );

    event CheckedIn(
        uint256 indexed planId,
        uint256 checkedInAt
    );

    event RecoveryRequested(
        uint256 indexed planId,
        address indexed beneficiary,
        uint256 requestedAt
    );

    event RecoveryCancelled(
        uint256 indexed planId,
        uint256 cancelledAt
    );

    event RecoveryExecuted(
        uint256 indexed planId,
        address indexed beneficiary,
        uint256 amount
    );

    modifier planExists(uint256 planId) {
        require(
            plans[planId].owner != address(0),
            "Recovery plan does not exist"
        );
        _;
    }

    modifier onlyOwner(uint256 planId) {
        require(
            msg.sender == plans[planId].owner,
            "Not plan owner"
        );
        _;
    }

    modifier onlyBeneficiary(uint256 planId) {
        require(
            msg.sender == plans[planId].beneficiary,
            "Not beneficiary"
        );
        _;
    }

    function createRecoveryPlan(
        address beneficiary,
        uint256 inactivityPeriod,
        uint256 recoveryDelay
    ) external payable returns (uint256 planId) {
        require(msg.value > 0, "Deposit required");
        require(
            beneficiary != address(0),
            "Invalid beneficiary"
        );
        require(
            beneficiary != msg.sender,
            "Beneficiary must differ from owner"
        );
        require(
            inactivityPeriod > 0,
            "Inactivity period required"
        );
        require(
            recoveryDelay > 0,
            "Recovery delay required"
        );

        planCount += 1;
        planId = planCount;

        plans[planId] = RecoveryPlan({
            owner: msg.sender,
            beneficiary: beneficiary,
            deposit: msg.value,
            lastCheckIn: block.timestamp,
            inactivityPeriod: inactivityPeriod,
            recoveryDelay: recoveryDelay,
            recoveryRequestedAt: 0,
            status: RecoveryStatus.ACTIVE
        });

        emit RecoveryPlanCreated(
            planId,
            msg.sender,
            beneficiary,
            msg.value,
            inactivityPeriod,
            recoveryDelay
        );
    }

    function checkIn(uint256 planId)
        external
        planExists(planId)
        onlyOwner(planId)
    {
        RecoveryPlan storage plan = plans[planId];

        require(
            plan.status == RecoveryStatus.ACTIVE,
            "Plan is not active"
        );

        plan.lastCheckIn = block.timestamp;

        emit CheckedIn(planId, block.timestamp);
    }

    function requestRecovery(uint256 planId)
        external
        planExists(planId)
        onlyBeneficiary(planId)
    {
        RecoveryPlan storage plan = plans[planId];

        require(
            plan.status == RecoveryStatus.ACTIVE,
            "Plan is not active"
        );
        require(
            block.timestamp >=
                plan.lastCheckIn + plan.inactivityPeriod,
            "Owner is still active"
        );

        plan.status = RecoveryStatus.RECOVERY_PENDING;
        plan.recoveryRequestedAt = block.timestamp;

        emit RecoveryRequested(
            planId,
            msg.sender,
            block.timestamp
        );
    }

    function cancelRecovery(uint256 planId)
        external
        planExists(planId)
        onlyOwner(planId)
    {
        RecoveryPlan storage plan = plans[planId];

        require(
            plan.status ==
                RecoveryStatus.RECOVERY_PENDING,
            "Recovery is not pending"
        );

        plan.status = RecoveryStatus.ACTIVE;
        plan.lastCheckIn = block.timestamp;
        plan.recoveryRequestedAt = 0;

        emit RecoveryCancelled(
            planId,
            block.timestamp
        );
    }

    function executeRecovery(uint256 planId)
        external
        planExists(planId)
        onlyBeneficiary(planId)
    {
        RecoveryPlan storage plan = plans[planId];

        require(
            plan.status ==
                RecoveryStatus.RECOVERY_PENDING,
            "Recovery is not pending"
        );
        require(
            block.timestamp >=
                plan.recoveryRequestedAt +
                plan.recoveryDelay,
            "Recovery delay has not passed"
        );

        uint256 amount = plan.deposit;

        require(amount > 0, "No deposit available");

        plan.status = RecoveryStatus.EXECUTED;
        plan.deposit = 0;

        (bool success, ) = payable(
            plan.beneficiary
        ).call{value: amount}("");

        require(success, "Transfer failed");

        emit RecoveryExecuted(
            planId,
            plan.beneficiary,
            amount
        );
    }

    function getPlan(uint256 planId)
        external
        view
        planExists(planId)
        returns (RecoveryPlan memory)
    {
        return plans[planId];
    }

    function isInactive(uint256 planId)
        external
        view
        planExists(planId)
        returns (bool)
    {
        RecoveryPlan memory plan = plans[planId];

        if (plan.status != RecoveryStatus.ACTIVE) {
            return false;
        }

        return block.timestamp >=
            plan.lastCheckIn +
            plan.inactivityPeriod;
    }

    function timeUntilInactive(uint256 planId)
        external
        view
        planExists(planId)
        returns (uint256)
    {
        RecoveryPlan memory plan = plans[planId];

        uint256 inactiveAt =
            plan.lastCheckIn +
            plan.inactivityPeriod;

        if (block.timestamp >= inactiveAt) {
            return 0;
        }

        return inactiveAt - block.timestamp;
    }

    function timeUntilExecution(uint256 planId)
        external
        view
        planExists(planId)
        returns (uint256)
    {
        RecoveryPlan memory plan = plans[planId];

        if (
            plan.status !=
            RecoveryStatus.RECOVERY_PENDING
        ) {
            return 0;
        }

        uint256 executableAt =
            plan.recoveryRequestedAt +
            plan.recoveryDelay;

        if (block.timestamp >= executableAt) {
            return 0;
        }

        return executableAt - block.timestamp;
    }
}