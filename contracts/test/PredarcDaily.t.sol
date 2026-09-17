// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {PredarcDaily} from "../PredarcDaily.sol";
interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function deal(address, uint256) external;
}
contract PredarcDailyTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    PredarcDaily daily;
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    function setUp() public {
        vm.warp(1_800_000_000);
        daily = new PredarcDaily(address(this));
    }
    function credit(address user, string memory id, uint256 points) internal {
        daily.recordPoints(user, keccak256(bytes(id)), points);
    }
    function testActivationExpiresAtExactBoundary() public {
        vm.prank(ALICE); daily.activate();
        uint256 expiry = block.timestamp + 1 days;
        require(daily.activeUntil(ALICE) == expiry);
        vm.warp(expiry - 1);
        require(daily.isActive(ALICE));
        vm.expectRevert(abi.encodeWithSelector(PredarcDaily.AlreadyActive.selector, expiry));
        vm.prank(ALICE); daily.activate();
        vm.warp(expiry);
        require(!daily.isActive(ALICE));
        vm.prank(ALICE); daily.activate();
        require(daily.activeUntil(ALICE) == expiry + 1 days);
    }
    function testClaimAllAndRejectBeforeBoundary() public {
        credit(ALICE, "win1", 200); credit(ALICE, "win2", 500);
        vm.prank(ALICE); daily.claim();
        require(daily.claimed(ALICE) == 700);
        uint256 ready = block.timestamp + 1 days;
        credit(ALICE, "win3", 100);
        vm.warp(ready - 1);
        vm.expectRevert(abi.encodeWithSelector(PredarcDaily.ClaimCoolingDown.selector, ready));
        vm.prank(ALICE); daily.claim();
        require(daily.claimed(ALICE) == 700);
        vm.warp(ready);
        vm.prank(ALICE); daily.claim();
        require(daily.claimed(ALICE) == 800);
    }
    function testTimersAreIndependent() public {
        vm.prank(ALICE); daily.activate();
        uint256 expiry = daily.activeUntil(ALICE);
        vm.warp(block.timestamp + 2 hours);
        credit(ALICE, "win", 200);
        vm.prank(ALICE); daily.claim();
        uint256 ready = daily.nextClaimAt(ALICE);
        require(ready == expiry + 2 hours);
        require(daily.activeUntil(ALICE) == expiry);
        vm.warp(expiry);
        vm.prank(ALICE); daily.activate();
        require(daily.nextClaimAt(ALICE) == ready);
    }
    function testEmptyClaimRevertsWithoutStartingTimer() public {
        vm.expectRevert(PredarcDaily.NothingToClaim.selector);
        vm.prank(ALICE); daily.claim();
        require(daily.nextClaimAt(ALICE) == 0);
    }
    function testClaimAfterAccessExpiryAndAcrossWallets() public {
        vm.prank(ALICE); daily.activate();
        vm.warp(block.timestamp + 2 days);
        credit(ALICE, "alice", 100); credit(BOB, "bob", 50);
        vm.prank(ALICE); daily.claim();
        vm.prank(BOB); daily.claim();
        require(daily.claimed(ALICE) == 100 && daily.claimed(BOB) == 50);
    }
    function testCannotForgePoints() public {
        vm.expectRevert(PredarcDaily.Unauthorized.selector);
        vm.prank(ALICE); daily.recordPoints(ALICE, keccak256("fake"), 1000000);
        require(daily.earned(ALICE) == 0);
    }
    function testSettlementReplayRejectedAcrossWallets() public {
        credit(ALICE, "one", 100);
        vm.expectRevert(PredarcDaily.DuplicateSettlement.selector);
        credit(BOB, "one", 100);
        require(daily.earned(BOB) == 0);
    }
    function testNoUSDCDeposits() public {
        vm.deal(ALICE, 1 ether);
        vm.prank(ALICE);
        (bool ok,) = address(daily).call{value: 1}(abi.encodeCall(daily.activate, ()));
        require(!ok && daily.activeUntil(ALICE) == 0);
    }
    function testNoReclaimAfterCooldownWithoutNewPoints() public {
        credit(ALICE, "one", 100);
        vm.prank(ALICE); daily.claim();
        uint256 ready = daily.nextClaimAt(ALICE);
        vm.warp(ready);
        vm.expectRevert(PredarcDaily.NothingToClaim.selector);
        vm.prank(ALICE); daily.claim();
        require(daily.nextClaimAt(ALICE) == ready && daily.claimed(ALICE) == 100);
    }
}
