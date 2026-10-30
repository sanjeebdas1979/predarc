// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ForecastRegistryV2} from "../ForecastRegistryV2.sol";

interface ForecastVm {
    function deal(address, uint256) external;
    function expectRevert(bytes calldata) external;
    function prank(address) external;
    function warp(uint256) external;
}

contract ForecastRegistryV2Test {
    ForecastVm constant vm =
        ForecastVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    ForecastRegistryV2 registry;

    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    uint256 constant FORECAST_ID = 1001;
    uint256 constant START_PRICE = 80_000_00;

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new ForecastRegistryV2();
    }

    function reason(string memory message) internal pure returns (bytes memory) {
        return abi.encodeWithSignature("Error(string)", message);
    }

    function submit(
        address user,
        uint256 id,
        ForecastRegistryV2.Direction direction
    ) internal {
        vm.prank(user);
        registry.submitForecast(id, direction, 300, 100, START_PRICE);
    }

    function testOwnerAndInitialCounters() public view {
        require(registry.owner() == address(this));
        require(!registry.paused());
        require(registry.totalForecasts() == 0);
        require(registry.totalResolvedForecasts() == 0);
        require(registry.totalClaims() == 0);
    }

    function testSubmitStoresForecastAndIncrementsCounter() public {
        submit(ALICE, FORECAST_ID, ForecastRegistryV2.Direction.Higher);

        ForecastRegistryV2.Forecast memory forecast =
            registry.getForecast(FORECAST_ID);

        require(forecast.forecastId == FORECAST_ID);
        require(forecast.user == ALICE);
        require(forecast.direction == ForecastRegistryV2.Direction.Higher);
        require(forecast.duration == 300);
        require(forecast.arenaPoints == 100);
        require(forecast.startPrice == START_PRICE);
        require(forecast.endPrice == 0);
        require(forecast.submittedAt == block.timestamp);
        require(forecast.resolvedAt == 0);
        require(forecast.claimableReward == 0);
        require(forecast.status == ForecastRegistryV2.ForecastStatus.Pending);
        require(!forecast.claimed && forecast.exists);
        require(registry.totalForecasts() == 1);
        require(registry.getClaimableReward(FORECAST_ID) == 0);
        require(!registry.hasClaimed(FORECAST_ID));
    }

    function testSubmitRejectsInvalidInputsAndDuplicateId() public {
        vm.expectRevert(reason("Invalid forecast ID"));
        registry.submitForecast(0, ForecastRegistryV2.Direction.Higher, 60, 1, 1);

        vm.expectRevert(reason("Invalid duration"));
        registry.submitForecast(1, ForecastRegistryV2.Direction.Higher, 120, 1, 1);

        vm.expectRevert(reason("Invalid Arena Points"));
        registry.submitForecast(1, ForecastRegistryV2.Direction.Higher, 60, 0, 1);

        vm.expectRevert(reason("Invalid start price"));
        registry.submitForecast(1, ForecastRegistryV2.Direction.Higher, 60, 1, 0);

        submit(ALICE, FORECAST_ID, ForecastRegistryV2.Direction.Higher);
        vm.expectRevert(reason("Forecast ID already exists"));
        registry.submitForecast(
            FORECAST_ID,
            ForecastRegistryV2.Direction.Lower,
            60,
            1,
            1
        );
    }

    function testEverySupportedDurationIsAccepted() public {
        uint32[4] memory durations = [uint32(60), 300, 900, 3600];

        for (uint256 index = 0; index < durations.length; index++) {
            registry.submitForecast(
                index + 1,
                ForecastRegistryV2.Direction.Higher,
                durations[index],
                1,
                1
            );
        }

        require(registry.totalForecasts() == 4);
    }

    function testHigherAndLowerWinsDoubleArenaPoints() public {
        submit(ALICE, FORECAST_ID, ForecastRegistryV2.Direction.Higher);
        submit(BOB, FORECAST_ID + 1, ForecastRegistryV2.Direction.Lower);

        registry.resolveForecast(FORECAST_ID, START_PRICE + 1);
        registry.resolveForecast(FORECAST_ID + 1, START_PRICE - 1);

        ForecastRegistryV2.Forecast memory higher =
            registry.getForecast(FORECAST_ID);
        ForecastRegistryV2.Forecast memory lower =
            registry.getForecast(FORECAST_ID + 1);

        require(higher.status == ForecastRegistryV2.ForecastStatus.Won);
        require(lower.status == ForecastRegistryV2.ForecastStatus.Won);
        require(higher.claimableReward == 200);
        require(lower.claimableReward == 200);
        require(registry.totalResolvedForecasts() == 2);
    }

    function testLossHasNoClaimableReward() public {
        submit(ALICE, FORECAST_ID, ForecastRegistryV2.Direction.Higher);
        registry.resolveForecast(FORECAST_ID, START_PRICE - 1);

        ForecastRegistryV2.Forecast memory forecast =
            registry.getForecast(FORECAST_ID);
        require(forecast.status == ForecastRegistryV2.ForecastStatus.Lost);
        require(forecast.claimableReward == 0);
        require(registry.getClaimableReward(FORECAST_ID) == 0);

        vm.expectRevert(reason("Forecast did not win"));
        vm.prank(ALICE);
        registry.claimReward(FORECAST_ID);
    }

    function testResolveRequiresOwnerPendingForecastAndPriceMovement() public {
        submit(ALICE, FORECAST_ID, ForecastRegistryV2.Direction.Higher);

        vm.expectRevert(reason("Only owner"));
        vm.prank(ALICE);
        registry.resolveForecast(FORECAST_ID, START_PRICE + 1);

        vm.expectRevert(reason("Forecast not found"));
        registry.resolveForecast(FORECAST_ID + 1, START_PRICE + 1);

        vm.expectRevert(reason("Invalid end price"));
        registry.resolveForecast(FORECAST_ID, 0);

        vm.expectRevert(reason("No price movement"));
        registry.resolveForecast(FORECAST_ID, START_PRICE);

        registry.resolveForecast(FORECAST_ID, START_PRICE + 1);
        vm.expectRevert(reason("Forecast already resolved"));
        registry.resolveForecast(FORECAST_ID, START_PRICE + 2);
    }

    function testOnlyWinnerCanClaimOnceAndCountersStayConsistent() public {
        submit(ALICE, FORECAST_ID, ForecastRegistryV2.Direction.Higher);
        registry.resolveForecast(FORECAST_ID, START_PRICE + 1);

        vm.expectRevert(reason("Not forecast owner"));
        vm.prank(BOB);
        registry.claimReward(FORECAST_ID);

        vm.prank(ALICE);
        registry.claimReward(FORECAST_ID);

        require(registry.hasClaimed(FORECAST_ID));
        require(registry.getClaimableReward(FORECAST_ID) == 0);
        require(registry.totalClaims() == 1);
        require(registry.totalClaimedArenaPoints(ALICE) == 200);

        vm.expectRevert(reason("Reward already claimed"));
        vm.prank(ALICE);
        registry.claimReward(FORECAST_ID);
    }

    function testPauseBlocksStateChangingForecastActions() public {
        registry.setPaused(true);
        require(registry.paused());

        vm.expectRevert(reason("Contract paused"));
        registry.submitForecast(FORECAST_ID, ForecastRegistryV2.Direction.Higher, 60, 1, 1);

        registry.setPaused(false);
        submit(ALICE, FORECAST_ID, ForecastRegistryV2.Direction.Higher);
        registry.setPaused(true);

        vm.expectRevert(reason("Contract paused"));
        registry.resolveForecast(FORECAST_ID, START_PRICE + 1);

        registry.setPaused(false);
        registry.resolveForecast(FORECAST_ID, START_PRICE + 1);
        registry.setPaused(true);

        vm.expectRevert(reason("Contract paused"));
        vm.prank(ALICE);
        registry.claimReward(FORECAST_ID);
    }

    function testPauseAndOwnershipControlsRequireOwner() public {
        vm.expectRevert(reason("Only owner"));
        vm.prank(ALICE);
        registry.setPaused(true);

        vm.expectRevert(reason("Invalid owner"));
        registry.transferOwnership(address(0));

        registry.transferOwnership(ALICE);
        require(registry.owner() == ALICE);

        vm.expectRevert(reason("Only owner"));
        registry.setPaused(true);

        vm.prank(ALICE);
        registry.setPaused(true);
        require(registry.paused());
    }

    function testMissingForecastReadsAreBounded() public {
        require(registry.getClaimableReward(FORECAST_ID) == 0);

        vm.expectRevert(reason("Forecast not found"));
        registry.getForecast(FORECAST_ID);

        vm.expectRevert(reason("Forecast not found"));
        registry.hasClaimed(FORECAST_ID);
    }

    function testContractCannotReceiveEth() public {
        vm.deal(ALICE, 1 ether);
        vm.prank(ALICE);
        (bool ok,) = address(registry).call{value: 1}("");
        require(!ok);
    }
}
