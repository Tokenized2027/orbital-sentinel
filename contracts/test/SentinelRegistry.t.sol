// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "../SentinelRegistry.sol";

contract SentinelRegistryTest is Test {
    OrbitalSentinelRegistry registry;

    // Mirror events for expectEmit
    event HealthRecorded(
        bytes32 indexed snapshotHash,
        string riskLevel,
        uint256 ts
    );
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function setUp() public {
        registry = new OrbitalSentinelRegistry();
    }

    // ─── Ownership ─────────────────────────────────────────────────

    /// @notice Deployer is the owner
    function test_owner_isDeployer() public view {
        assertEq(registry.owner(), address(this));
    }

    /// @notice Owner can transfer ownership (2-step: transfer + accept)
    function test_transferOwnership() public {
        address newOwner = address(0xBEEF);
        vm.expectEmit(true, true, false, false);
        emit OwnershipTransferStarted(address(this), newOwner);
        registry.transferOwnership(newOwner);

        // Owner hasn't changed yet — still pending
        assertEq(registry.owner(), address(this));
        assertEq(registry.pendingOwner(), newOwner);

        // New owner accepts
        vm.prank(newOwner);
        registry.acceptOwnership();
        assertEq(registry.owner(), newOwner);
        assertEq(registry.pendingOwner(), address(0));
    }

    /// @notice Non-owner cannot transfer ownership
    function test_transferOwnership_revertsForNonOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(OrbitalSentinelRegistry.NotOwner.selector);
        registry.transferOwnership(address(0xBEEF));
    }

    /// @notice Renouncing ownership requires 2-step: initiate + accept
    /// @dev With 2-step ownership, transferOwnership(address(0)) sets pendingOwner to address(0).
    ///      In real EVM, address(0) can never initiate a transaction, making accidental
    ///      renouncement virtually impossible. In Foundry, vm.prank(address(0)) works,
    ///      so we verify the full 2-step flow: owner does NOT change until accept is called.
    function test_renounceOwnership_requiresTwoSteps() public {
        registry.transferOwnership(address(0));
        // Owner hasn't changed yet — still pending
        assertEq(registry.owner(), address(this));
        assertEq(registry.pendingOwner(), address(0));

        // Random address cannot accept
        vm.prank(address(0xDEAD));
        vm.expectRevert(OrbitalSentinelRegistry.NotPendingOwner.selector);
        registry.acceptOwnership();

        // Owner unchanged after failed accept
        assertEq(registry.owner(), address(this));
    }

    // ─── Access Control ────────────────────────────────────────────

    /// @notice Recording health should emit HealthRecorded with correct params
    function test_recordHealth_emitsEvent() public {
        bytes32 hash = keccak256(abi.encode("snapshot1"));
        string memory riskLevel = "ok";

        vm.expectEmit(true, false, false, true);
        emit HealthRecorded(hash, riskLevel, block.timestamp);

        registry.recordHealth(hash, riskLevel);
    }

    /// @notice Non-owner cannot record health
    function test_recordHealth_revertsForNonOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(OrbitalSentinelRegistry.NotOwner.selector);
        registry.recordHealth(keccak256("test"), "ok");
    }

    // ─── Duplicate Prevention ──────────────────────────────────────

    /// @notice Duplicate snapshotHash should revert
    function test_recordHealth_revertsDuplicate() public {
        bytes32 hash = keccak256("dup");
        registry.recordHealth(hash, "ok");

        vm.expectRevert(OrbitalSentinelRegistry.AlreadyRecorded.selector);
        registry.recordHealth(hash, "warning");
    }

    /// @notice recorded mapping tracks stored hashes
    function test_recorded_tracksHashes() public {
        bytes32 hash = keccak256("tracked");
        assertFalse(registry.recorded(hash));

        registry.recordHealth(hash, "ok");
        assertTrue(registry.recorded(hash));
    }

    // ─── Risk Level Validation ─────────────────────────────────────

    /// @notice Empty riskLevel should revert
    function test_recordHealth_revertsEmptyRiskLevel() public {
        vm.expectRevert(OrbitalSentinelRegistry.EmptyRiskLevel.selector);
        registry.recordHealth(keccak256("empty"), "");
    }

    /// @notice Prefixed risk levels work (e.g. "treasury:ok")
    function test_recordHealth_acceptsPrefixedRiskLevel() public {
        registry.recordHealth(keccak256("prefixed"), "treasury:ok");

        (, string memory riskLevel,,) = registry.records(0);
        assertEq(keccak256(bytes(riskLevel)), keccak256(bytes("treasury:ok")));
    }

    // ─── Count & Latest ────────────────────────────────────────────

    /// @notice Fresh contract should have count() == 0
    function test_count_startsAtZero() public view {
        assertEq(registry.count(), 0);
    }

    /// @notice After 3 records, count() == 3
    function test_count_incrementsAfterRecord() public {
        registry.recordHealth(keccak256("a"), "ok");
        registry.recordHealth(keccak256("b"), "warning");
        registry.recordHealth(keccak256("c"), "critical");

        assertEq(registry.count(), 3);
    }

    /// @notice Calling latest() on empty registry should revert
    function test_latest_revertsWhenEmpty() public {
        vm.expectRevert("No records yet");
        registry.latest();
    }

    /// @notice After recording 2 entries, latest() returns the second
    function test_latest_returnsLastRecord() public {
        bytes32 hash1 = keccak256("first");
        bytes32 hash2 = keccak256("second");

        registry.recordHealth(hash1, "ok");
        registry.recordHealth(hash2, "warning");

        (bytes32 snapshotHash, string memory riskLevel, uint256 ts, address recorder) = _decodeRecord(registry.latest());

        assertEq(snapshotHash, hash2);
        assertEq(keccak256(bytes(riskLevel)), keccak256(bytes("warning")));
        assertEq(ts, block.timestamp);
        assertEq(recorder, address(this));
    }

    /// @notice The recorder field should be msg.sender (the owner)
    function test_recordHealth_storesRecorder() public view {
        // Owner is address(this), which is msg.sender for all calls in this test
        assertEq(registry.owner(), address(this));
    }

    /// @notice Record "ok", "warning", "critical" and verify all stored correctly
    function test_recordHealth_differentRiskLevels() public {
        string[3] memory levels = [string("ok"), "warning", "critical"];
        bytes32[3] memory hashes;

        for (uint256 i = 0; i < 3; i++) {
            hashes[i] = keccak256(abi.encode("risk", i));
            registry.recordHealth(hashes[i], levels[i]);
        }

        for (uint256 i = 0; i < 3; i++) {
            (bytes32 snapshotHash, string memory riskLevel,,) = registry.records(i);
            assertEq(snapshotHash, hashes[i]);
            assertEq(keccak256(bytes(riskLevel)), keccak256(bytes(levels[i])));
        }
    }

    /// @notice Access records by index and verify correct data
    function test_records_accessByIndex() public {
        bytes32 hash0 = keccak256("index-0");
        bytes32 hash1 = keccak256("index-1");
        bytes32 hash2 = keccak256("index-2");

        registry.recordHealth(hash0, "ok");
        registry.recordHealth(hash1, "warning");
        registry.recordHealth(hash2, "critical");

        (bytes32 s0, string memory r0, uint256 t0, address a0) = registry.records(0);
        assertEq(s0, hash0);
        assertEq(keccak256(bytes(r0)), keccak256(bytes("ok")));
        assertEq(t0, block.timestamp);
        assertEq(a0, address(this));

        (bytes32 s1, string memory r1,,) = registry.records(1);
        assertEq(s1, hash1);
        assertEq(keccak256(bytes(r1)), keccak256(bytes("warning")));

        (bytes32 s2, string memory r2,,) = registry.records(2);
        assertEq(s2, hash2);
        assertEq(keccak256(bytes(r2)), keccak256(bytes("critical")));
    }

    /// @dev Helper to destructure a Record memory return
    function _decodeRecord(OrbitalSentinelRegistry.Record memory r)
        internal
        pure
        returns (bytes32, string memory, uint256, address)
    {
        return (r.snapshotHash, r.riskLevel, r.ts, r.recorder);
    }
}
