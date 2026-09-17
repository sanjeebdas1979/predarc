// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Daily access and non-transferable demo points. No deposits or payouts.
/// @dev The immutable scorer is trusted to validate offchain forecasts/results.
///      This contract does not make client-local predictions trustworthy.
contract PredarcDaily {
    uint256 public constant PERIOD = 24 hours;
    address public immutable scorer;
    mapping(address => uint256) public activeUntil;
    mapping(address => uint256) public nextClaimAt;
    mapping(address => uint256) public earned;
    mapping(address => uint256) public claimed;
    mapping(bytes32 => bool) public recordedSettlements;

    error ZeroAddress();
    error AlreadyActive(uint256 until);
    error ClaimCoolingDown(uint256 until);
    error NothingToClaim();
    error Unauthorized();
    error InvalidSettlement();
    error DuplicateSettlement();

    event Activated(address indexed user, uint256 activeUntil);
    event PointsRecorded(address indexed user, bytes32 indexed settlementId, uint256 points);
    event PointsClaimed(address indexed user, uint256 points, uint256 totalClaimed, uint256 nextClaimAt);

    constructor(address scorer_) {
        if (scorer_ == address(0)) revert ZeroAddress();
        scorer = scorer_;
    }

    function activate() external {
        if (block.timestamp < activeUntil[msg.sender]) {
            revert AlreadyActive(activeUntil[msg.sender]);
        }
        uint256 until = block.timestamp + PERIOD;
        activeUntil[msg.sender] = until;
        emit Activated(msg.sender, until);
    }

    function isActive(address user) external view returns (bool) {
        return block.timestamp < activeUntil[user];
    }

    /// @dev Only record settled, server-validated results. Use a unique persistent
    /// settlement ID per result. Do not accept points or prices from the browser.
    function recordPoints(address user, bytes32 settlementId, uint256 points) external {
        if (msg.sender != scorer) revert Unauthorized();
        if (user == address(0)) revert ZeroAddress();
        if (settlementId == bytes32(0) || points == 0) revert InvalidSettlement();
        if (recordedSettlements[settlementId]) revert DuplicateSettlement();
        recordedSettlements[settlementId] = true;
        earned[user] += points;
        emit PointsRecorded(user, settlementId, points);
    }

    /// @notice Claim all recorded points in one transaction; activation is independent.
    function claim() external {
        if (block.timestamp < nextClaimAt[msg.sender]) {
            revert ClaimCoolingDown(nextClaimAt[msg.sender]);
        }
        uint256 amount = earned[msg.sender] - claimed[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimed[msg.sender] = earned[msg.sender];
        uint256 until = block.timestamp + PERIOD;
        nextClaimAt[msg.sender] = until;
        emit PointsClaimed(msg.sender, amount, claimed[msg.sender], until);
    }

    function status(address user) external view returns (
        uint256 activationExpiry, uint256 claimReadyAt,
        uint256 unclaimedPoints, uint256 totalClaimed
    ) {
        return (activeUntil[user], nextClaimAt[user], earned[user] - claimed[user], claimed[user]);
    }
}
