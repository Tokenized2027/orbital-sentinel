// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "../SentinelRegistry.sol";

/// @title SentinelRegistry — Fuzz & Invariant Tests
/// @notice Validates append-only registry invariants under random inputs.
contract SentinelRegistryFuzzTest is Test {
    OrbitalSentinelRegistry registry;

    function setUp() public {
        registry = new OrbitalSentinelRegistry();
    }

    // ─── Fuzz Tests ────────────────────────────────────────────────

    /// @notice Any unique snapshotHash + non-empty riskLevel stores correctly (owner only).
    function testFuzz_recordHealth_storesCorrectly(
        bytes32 snapshotHash,
        string calldata riskLevel
    ) public {
        // Skip empty risk levels (would revert)
        if (bytes(riskLevel).length == 0) return;

        uint256 countBefore = registry.count();

        // Called as address(this) which is owner
        registry.recordHealth(snapshotHash, riskLevel);

        assertEq(registry.count(), countBefore + 1);

        (bytes32 storedHash, string memory storedRisk, uint256 ts, address recorder) = registry.records(countBefore);
        assertEq(storedHash, snapshotHash);
        assertEq(keccak256(bytes(storedRisk)), keccak256(bytes(riskLevel)));
        assertEq(ts, block.timestamp);
        assertEq(recorder, address(this));
        assertTrue(registry.recorded(snapshotHash));
    }

    /// @notice latest() always returns the most recently pushed record.
    function testFuzz_latest_alwaysReturnsMostRecent(
        bytes32 hash1,
        bytes32 hash2,
        string calldata risk1,
        string calldata risk2
    ) public {
        // Ensure unique hashes and non-empty risk levels
        vm.assume(hash1 != hash2);
        if (bytes(risk1).length == 0 || bytes(risk2).length == 0) return;

        registry.recordHealth(hash1, risk1);
        registry.recordHealth(hash2, risk2);

        OrbitalSentinelRegistry.Record memory rec = registry.latest();
        assertEq(rec.snapshotHash, hash2);
        assertEq(keccak256(bytes(rec.riskLevel)), keccak256(bytes(risk2)));
    }

    /// @notice count() always equals the number of recordHealth calls.
    function testFuzz_count_matchesRecordCalls(uint8 numRecords) public {
        uint256 n = bound(numRecords, 0, 50);

        for (uint256 i = 0; i < n; i++) {
            registry.recordHealth(bytes32(i), "ok");
        }

        assertEq(registry.count(), n);
    }

    /// @notice Non-owner always reverts, regardless of inputs.
    function testFuzz_nonOwner_alwaysReverts(
        address sender,
        bytes32 hash,
        string calldata riskLevel
    ) public {
        vm.assume(sender != address(this)); // address(this) is owner

        vm.prank(sender);
        vm.expectRevert(OrbitalSentinelRegistry.NotOwner.selector);
        registry.recordHealth(hash, riskLevel);
    }

    /// @notice Duplicate hashes always revert.
    function testFuzz_duplicateHash_reverts(bytes32 hash) public {
        registry.recordHealth(hash, "ok");

        vm.expectRevert(OrbitalSentinelRegistry.AlreadyRecorded.selector);
        registry.recordHealth(hash, "warning");
    }

    /// @notice Empty riskLevel always reverts.
    function testFuzz_emptyRiskLevel_reverts(bytes32 hash) public {
        vm.expectRevert(OrbitalSentinelRegistry.EmptyRiskLevel.selector);
        registry.recordHealth(hash, "");
    }

    /// @notice Two-step ownership transfer works for any non-zero address.
    function testFuzz_transferOwnership(address newOwner) public {
        vm.assume(newOwner != address(this)); // skip self-transfer
        vm.assume(newOwner != address(0));    // address(0) can't call acceptOwnership

        // Step 1: initiate transfer — owner unchanged
        registry.transferOwnership(newOwner);
        assertEq(registry.owner(), address(this));
        assertEq(registry.pendingOwner(), newOwner);

        // Step 2: new owner accepts
        vm.prank(newOwner);
        registry.acceptOwnership();
        assertEq(registry.owner(), newOwner);

        // Old owner (this) can no longer record
        vm.expectRevert(OrbitalSentinelRegistry.NotOwner.selector);
        registry.recordHealth(keccak256("after-transfer"), "ok");

        // New owner can record
        vm.prank(newOwner);
        registry.recordHealth(keccak256("new-owner"), "ok");
        assertEq(registry.count(), 1);
    }
}
