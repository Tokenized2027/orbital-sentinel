// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {Test} from "forge-std/Test.sol";
import {OrbitalSentinelRegistry} from "../SentinelRegistry.sol";

/// @title Deep Audit Tests — Sentinel Registry
/// @notice Phase 4 tests from the March 2026 deep re-audit.
///         Covers: ownership blast radius, gas ceiling for riskLevel strings,
///         O(1) access at scale.
contract DeepAuditSentinelTest is Test {
    OrbitalSentinelRegistry registry;
    address owner = makeAddr("owner");

    function setUp() public {
        vm.prank(owner);
        registry = new OrbitalSentinelRegistry();
    }

    // ═══════════ Check #26: transferOwnership(address(0)) blast radius ═══════════
    // With 2-step ownership, transferring to address(0) is a no-op:
    // address(0) can never call acceptOwnership(), so owner never changes.
    // This eliminates the accidental renouncement blast radius entirely.

    function test_transferOwnership_toZero_cannotComplete() public {
        // Record a health entry first
        vm.prank(owner);
        registry.recordHealth(keccak256("test1"), "treasury:ok");
        assertEq(registry.count(), 1);

        // Initiate transfer to address(0) — sets pendingOwner but doesn't change owner
        vm.prank(owner);
        registry.transferOwnership(address(0));

        // Owner is still the original — 2-step prevents accidental renouncement
        assertEq(registry.owner(), owner);
        assertEq(registry.pendingOwner(), address(0));

        // Owner can still record — contract is NOT locked
        vm.prank(owner);
        registry.recordHealth(keccak256("test2"), "feeds:warning");
        assertEq(registry.count(), 2);

        // Owner can cancel by initiating a new transfer to themselves
        vm.prank(owner);
        registry.transferOwnership(owner);
        assertEq(registry.pendingOwner(), owner);

        // Historical data still readable
        OrbitalSentinelRegistry.Record memory rec = registry.latest();
        assertEq(rec.riskLevel, "feeds:warning");
    }

    // ═══════════ Check #27: O(1) access patterns at scale ═══════════

    function test_O1_accessAtScale() public {
        // Write 500 records and verify O(1) reads
        vm.startPrank(owner);
        for (uint256 i = 1; i <= 500; i++) {
            registry.recordHealth(bytes32(i), "treasury:ok");
        }
        vm.stopPrank();

        assertEq(registry.count(), 500);

        // Access first, middle, last — all O(1)
        (bytes32 hash0, , , ) = registry.records(0);
        (bytes32 hash250, , , ) = registry.records(250);
        (bytes32 hash499, , , ) = registry.records(499);

        assertEq(hash0, bytes32(uint256(1)));
        assertEq(hash250, bytes32(uint256(251)));
        assertEq(hash499, bytes32(uint256(500)));

        // latest() is O(1)
        OrbitalSentinelRegistry.Record memory rec = registry.latest();
        assertEq(rec.snapshotHash, bytes32(uint256(500)));
    }

    // ═══════════ Check #28: riskLevel string gas ceiling ═══════════

    function test_riskLevel_gasWithShortString() public {
        vm.prank(owner);
        uint256 gasBefore = gasleft();
        registry.recordHealth(keccak256("short"), "treasury:ok");
        uint256 gasUsed = gasBefore - gasleft();

        // Short string (<32 bytes) — includes cold SSTORE for new record slot
        assertLt(gasUsed, 200_000, "Short riskLevel should use < 200K gas");
    }

    function test_riskLevel_gasWithLongString() public {
        // 256-byte string — max allowed length
        bytes memory longLevel = new bytes(256);
        for (uint256 i = 0; i < 256; i++) {
            longLevel[i] = "A";
        }

        vm.prank(owner);
        uint256 gasBefore = gasleft();
        registry.recordHealth(keccak256("long"), string(longLevel));
        uint256 gasUsed = gasBefore - gasleft();

        // Long string should still fit in a block (gas < 1M)
        assertLt(gasUsed, 1_000_000, "Long riskLevel should use < 1M gas");
        assertEq(registry.count(), 1);
    }

    function test_riskLevel_tooLongReverts() public {
        // 257-byte string — exceeds max length
        bytes memory tooLong = new bytes(257);
        for (uint256 i = 0; i < 257; i++) {
            tooLong[i] = "B";
        }

        vm.prank(owner);
        vm.expectRevert(OrbitalSentinelRegistry.RiskLevelTooLong.selector);
        registry.recordHealth(keccak256("toolong"), string(tooLong));
    }

    // ═══════════ Ownership transfer then record — no stale owner ═══════════

    function test_ownershipTransfer_newOwnerCanRecord() public {
        address newOwner = makeAddr("newOwner");

        // Step 1: initiate transfer
        vm.prank(owner);
        registry.transferOwnership(newOwner);

        // Step 2: new owner accepts
        vm.prank(newOwner);
        registry.acceptOwnership();

        // New owner can record
        vm.prank(newOwner);
        registry.recordHealth(keccak256("newOwnerRecord"), "morpho:ok");
        assertEq(registry.count(), 1);

        // Old owner cannot
        vm.prank(owner);
        vm.expectRevert(OrbitalSentinelRegistry.NotOwner.selector);
        registry.recordHealth(keccak256("oldOwnerRecord"), "morpho:ok");
    }

    // ═══════════ Fuzz: recordHealth with arbitrary hashes and levels ═══════════

    function testFuzz_deepAudit_recordConsistency(
        bytes32 hash,
        string calldata level
    ) public {
        vm.assume(bytes(level).length > 0);
        vm.assume(bytes(level).length <= 256); // Max allowed length

        vm.prank(owner);
        registry.recordHealth(hash, level);

        assertEq(registry.count(), 1);
        assertTrue(registry.recorded(hash));

        OrbitalSentinelRegistry.Record memory rec = registry.latest();
        assertEq(rec.snapshotHash, hash);
        assertEq(keccak256(bytes(rec.riskLevel)), keccak256(bytes(level)));
        assertEq(rec.recorder, owner);
    }
}
