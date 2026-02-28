// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title OrbitalSentinelRegistry
/// @notice On-chain registry for Orbital Sentinel protocol health proofs.
///         Receives verifiable risk assessments written by CRE workflows.
///         Each record anchors: snapshot timestamp + risk level + AI assessment hash.
/// @dev Deployed on Ethereum Sepolia testnet for hackathon demonstration.
///      CRE workflow treasury-risk-ts calls recordHealth() after each monitoring run.
contract OrbitalSentinelRegistry {
    struct Record {
        bytes32 snapshotHash; // keccak256(abi.encode(timestamp, riskLevel, assessmentSnippet))
        string riskLevel;     // "ok" | "warning" | "critical"
        uint256 ts;           // block.timestamp at time of recording
        address recorder;     // EOA or contract that submitted the record
    }

    Record[] public records;

    event HealthRecorded(
        bytes32 indexed snapshotHash,
        string riskLevel,
        uint256 ts
    );

    /// @notice Record a new protocol health snapshot on-chain.
    /// @param snapshotHash  keccak256 hash of the snapshot content (timestamp + risk + assessment)
    /// @param riskLevel     Human-readable risk level: "ok", "warning", or "critical"
    function recordHealth(bytes32 snapshotHash, string calldata riskLevel) external {
        records.push(Record({
            snapshotHash: snapshotHash,
            riskLevel: riskLevel,
            ts: block.timestamp,
            recorder: msg.sender
        }));
        emit HealthRecorded(snapshotHash, riskLevel, block.timestamp);
    }

    /// @notice Returns the total number of recorded health snapshots.
    function count() external view returns (uint256) {
        return records.length;
    }

    /// @notice Returns the most recent health record, or reverts if none exist.
    function latest() external view returns (Record memory) {
        require(records.length > 0, "No records yet");
        return records[records.length - 1];
    }
}
