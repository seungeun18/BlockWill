// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Will {

    struct WillData {
        address owner;
        address heir;
        uint256 deposit;
        uint256 lastPingBlock;
        uint256 intervalBlocks;
        string willURI;
        string secretHint;
        bool claimed;
        bool exists;
    }

    uint256 public willCount;
    mapping(uint256 => WillData) public wills;

    /* =======================
            EVENTS
       ======================= */

    event WillCreated(
        uint256 indexed willId,
        address indexed owner,
        address indexed heir,
        uint256 deposit
    );

    event Ping(uint256 indexed willId, uint256 blockNumber);
    event Claimed(uint256 indexed willId, address indexed heir, uint256 amount);

    /* =======================
           MODIFIERS
       ======================= */

    modifier willExists(uint256 willId) {
        require(wills[willId].exists, "Will does not exist");
        _;
    }

    modifier onlyOwner(uint256 willId) {
        require(msg.sender == wills[willId].owner, "Not will owner");
        _;
    }

    modifier onlyHeir(uint256 willId) {
        require(msg.sender == wills[willId].heir, "Not heir");
        _;
    }

    /* =======================
         CREATE WILL
       ======================= */

    function createWill(
        address _heir,
        uint256 _intervalBlocks,
        string calldata _willURI,
        string calldata _secretHint
    ) external payable {
        require(msg.value > 0, "Deposit required");
        require(_heir != address(0), "Invalid heir");
        require(_intervalBlocks >= 3, "Interval too short (min 3 blocks)");

        willCount++;

        wills[willCount] = WillData({
            owner: msg.sender,
            heir: _heir,
            deposit: msg.value,
            lastPingBlock: block.number,
            intervalBlocks: _intervalBlocks,
            willURI: _willURI,
            secretHint: _secretHint,
            claimed: false,
            exists: true
        });

        emit WillCreated(willCount, msg.sender, _heir, msg.value);
    }

    /* =======================
         PING (ALIVE)
       ======================= */

    function ping(uint256 willId)
        external
        willExists(willId)
        onlyOwner(willId)
    {
        require(!wills[willId].claimed, "Already claimed");
        wills[willId].lastPingBlock = block.number;
        emit Ping(willId, block.number);
    }

    /* =======================
        DEATH CHECK
       ======================= */

    function isDead(uint256 willId)
        public
        view
        willExists(willId)
        returns (bool)
    {
        WillData memory w = wills[willId];

        if (w.claimed) {
            return false; // 이미 집행 완료
        }

        return block.number > (w.lastPingBlock + w.intervalBlocks);
    }

    /* =======================
        CLAIM INHERITANCE
       ======================= */

    function claim(uint256 willId)
        external
        willExists(willId)
        onlyHeir(willId)
    {
        WillData storage w = wills[willId];

        require(!w.claimed, "Already claimed");
        require(isDead(willId), "Owner still alive");

        w.claimed = true;

        uint256 amount = w.deposit;
        w.deposit = 0;

        (bool success, ) = payable(w.heir).call{value: amount}("");
        require(success, "Transfer failed");

        emit Claimed(willId, w.heir, amount);
    }

    /* =======================
        VIEW / DEBUG
       ======================= */

    function currentBlock() external view returns (uint256) {
        return block.number;
    }

    function blocksPassed(uint256 willId)
        external
        view
        willExists(willId)
        returns (uint256)
    {
        return block.number - wills[willId].lastPingBlock;
    }

    function blocksLeft(uint256 willId)
        external
        view
        willExists(willId)
        returns (uint256)
    {
        uint256 endBlock = wills[willId].lastPingBlock + wills[willId].intervalBlocks;
        if (block.number >= endBlock) {
            return 0;
        }
        return endBlock - block.number;
    }
}
