// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Predarc Forecast Registry V2
/// @notice Records Predarc forecasts and their non-transferable Arena Points rewards.
/// @dev This contract never accepts deposits and never pays ETH, USDC or other tokens.
///      The owner is trusted to resolve forecasts using the server-validated market price.
contract ForecastRegistryV2 {
    enum Direction {
        Higher,
        Lower
    }

    enum ForecastStatus {
        Pending,
        Won,
        Lost
    }

    struct Forecast {
        uint256 forecastId;
        address user;
        Direction direction;
        uint32 duration;
        uint256 arenaPoints;
        uint256 startPrice;
        uint256 endPrice;
        uint256 submittedAt;
        uint256 resolvedAt;
        uint256 claimableReward;
        ForecastStatus status;
        bool claimed;
        bool exists;
    }

    address public owner;
    bool public paused;

    uint256 public totalForecasts;
    uint256 public totalResolvedForecasts;
    uint256 public totalClaims;

    mapping(uint256 => Forecast) private forecasts;
    mapping(address => uint256) public totalClaimedArenaPoints;

    event ForecastSubmitted(
        uint256 indexed forecastId,
        address indexed user,
        Direction direction,
        uint32 duration,
        uint256 arenaPoints,
        uint256 startPrice,
        uint256 submittedAt
    );

    event ForecastResolved(
        uint256 indexed forecastId,
        address indexed user,
        ForecastStatus status,
        uint256 endPrice,
        uint256 claimableReward,
        uint256 resolvedAt
    );

    event RewardClaimed(
        uint256 indexed forecastId,
        address indexed user,
        uint256 arenaPoints,
        uint256 claimedAt
    );

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    event PauseUpdated(bool isPaused);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract paused");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function submitForecast(
        uint256 forecastId,
        Direction direction,
        uint32 duration,
        uint256 arenaPoints,
        uint256 startPrice
    ) external whenNotPaused {
        require(forecastId > 0, "Invalid forecast ID");
        require(!forecasts[forecastId].exists, "Forecast ID already exists");
        require(
            duration == 60 ||
                duration == 300 ||
                duration == 900 ||
                duration == 3600,
            "Invalid duration"
        );
        require(arenaPoints > 0, "Invalid Arena Points");
        require(startPrice > 0, "Invalid start price");

        forecasts[forecastId] = Forecast({
            forecastId: forecastId,
            user: msg.sender,
            direction: direction,
            duration: duration,
            arenaPoints: arenaPoints,
            startPrice: startPrice,
            endPrice: 0,
            submittedAt: block.timestamp,
            resolvedAt: 0,
            claimableReward: 0,
            status: ForecastStatus.Pending,
            claimed: false,
            exists: true
        });

        totalForecasts += 1;

        emit ForecastSubmitted(
            forecastId,
            msg.sender,
            direction,
            duration,
            arenaPoints,
            startPrice,
            block.timestamp
        );
    }

    function resolveForecast(
        uint256 forecastId,
        uint256 endPrice
    ) external onlyOwner whenNotPaused {
        Forecast storage forecast = forecasts[forecastId];

        require(forecast.exists, "Forecast not found");
        require(
            forecast.status == ForecastStatus.Pending,
            "Forecast already resolved"
        );
        require(endPrice > 0, "Invalid end price");
        require(endPrice != forecast.startPrice, "No price movement");

        bool won = forecast.direction == Direction.Higher
            ? endPrice > forecast.startPrice
            : endPrice < forecast.startPrice;

        forecast.endPrice = endPrice;
        forecast.resolvedAt = block.timestamp;

        if (won) {
            forecast.status = ForecastStatus.Won;
            forecast.claimableReward = forecast.arenaPoints * 2;
        } else {
            forecast.status = ForecastStatus.Lost;
            forecast.claimableReward = 0;
        }

        totalResolvedForecasts += 1;

        emit ForecastResolved(
            forecastId,
            forecast.user,
            forecast.status,
            endPrice,
            forecast.claimableReward,
            block.timestamp
        );
    }

    function claimReward(uint256 forecastId) external whenNotPaused {
        Forecast storage forecast = forecasts[forecastId];

        require(forecast.exists, "Forecast not found");
        require(forecast.user == msg.sender, "Not forecast owner");
        require(
            forecast.status == ForecastStatus.Won,
            "Forecast did not win"
        );
        require(forecast.claimableReward > 0, "No claimable reward");
        require(!forecast.claimed, "Reward already claimed");

        forecast.claimed = true;
        totalClaims += 1;
        totalClaimedArenaPoints[msg.sender] += forecast.claimableReward;

        emit RewardClaimed(
            forecastId,
            msg.sender,
            forecast.claimableReward,
            block.timestamp
        );
    }

    function getForecast(
        uint256 forecastId
    ) external view returns (Forecast memory) {
        require(forecasts[forecastId].exists, "Forecast not found");
        return forecasts[forecastId];
    }

    function getClaimableReward(
        uint256 forecastId
    ) external view returns (uint256) {
        Forecast memory forecast = forecasts[forecastId];

        if (
            !forecast.exists ||
            forecast.status != ForecastStatus.Won ||
            forecast.claimed
        ) {
            return 0;
        }

        return forecast.claimableReward;
    }

    function hasClaimed(uint256 forecastId) external view returns (bool) {
        require(forecasts[forecastId].exists, "Forecast not found");
        return forecasts[forecastId].claimed;
    }

    function setPaused(bool newPausedState) external onlyOwner {
        paused = newPausedState;
        emit PauseUpdated(newPausedState);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");

        address previousOwner = owner;
        owner = newOwner;

        emit OwnershipTransferred(previousOwner, newOwner);
    }
}
