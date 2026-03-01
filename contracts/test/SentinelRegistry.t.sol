// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../SentinelRegistry.sol";

contract SentinelRegistryTest is Test {
    OrbitalSentinelRegistry registry;

    // Mirror the event from the contract for expectEmit (Solidity <0.8.21)
    event HealthRecorded(
        bytes32 indexed snapshotHash,
        string riskLevel,
        uint256 ts
    );

    function setUp() public {
        registry = new OrbitalSentinelRegistry();
    }

    /// @notice Recording health should emit HealthRecorded with correct params
    function test_recordHealth_emitsEvent() public {
        bytes32 hash = keccak256(abi.encode("snapshot1"));
        string memory riskLevel = "ok";

        vm.expectEmit(true, false, false, true);
        emit HealthRecorded(hash, riskLevel, block.timestamp);

        registry.recordHealth(hash, riskLevel);
    }

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

    /// @notice The recorder field should be msg.sender
    function test_recordHealth_storesRecorder() public {
        address sender = address(0xBEEF);
        bytes32 hash = keccak256("recorder-test");

        vm.prank(sender);
        registry.recordHealth(hash, "ok");

        (,,, address recorder) = _decodeRecord(registry.latest());
        assertEq(recorder, sender);
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
