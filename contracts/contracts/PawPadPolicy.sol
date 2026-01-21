// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * PawPadPolicy (Trusted Signer Version)
 * - Stores per-user commitments + wallet identities.
 * - All privileged writes must come from the trusted signer address
 *   (derived deterministically inside ROFL TEE from a fixed key_id).
 * - uidHash is keccak256(uid_string_bytes) computed by backend.
 * 
 * Security: The trusted signer's private key never leaves the TEE.
 *           It's derived deterministically from the ROFL App ID + key_id.
 */
contract PawPadPolicy {
    // The trusted signer address (ROFL-derived wallet)
    address public immutable trustedSigner;

    struct User {
        // Wallet identities
        address evmAddress;      // Base/EVM wallet derived in ROFL (secp256k1)
        bytes32 solanaPubkey;    // Solana pubkey derived in ROFL (ed25519), 32 bytes

        // Auth / backup commitments
        bytes32 totpSecretHash;  // keccak256(totp_secret)
        bytes32 backupBlobHash;  // sha256/keccak256 of encrypted backup JSON bytes

        // Recovery + safety
        uint64  recoveryPendingUntil; // unix timestamp; 0 when inactive
        bool    frozen;               // emergency freeze during recovery or user request
        uint32  flags;                // reserved for future features (limits, KYC, etc.)
    }

    mapping(bytes32 => User) private users; // uidHash -> User

    event UserRegistered(bytes32 indexed uidHash, address evmAddress, bytes32 solanaPubkey);
    event FreezeSet(bytes32 indexed uidHash, bool frozen);
    event RecoveryStarted(bytes32 indexed uidHash, uint64 until);
    event RecoveryCompleted(bytes32 indexed uidHash);

    constructor(address _trustedSigner) {
        require(_trustedSigner != address(0), "invalid signer");
        trustedSigner = _trustedSigner;
    }

    modifier onlyTrusted() {
        require(msg.sender == trustedSigner, "not authorized");
        _;
    }

    function getUser(bytes32 uidHash) external view returns (User memory) {
        return users[uidHash];
    }

    /// Register user identity + commitments (one-time).
    function registerUser(
        bytes32 uidHash,
        address evmAddress,
        bytes32 solanaPubkey,
        bytes32 totpSecretHash,
        bytes32 backupBlobHash
    ) external onlyTrusted {
        User storage u = users[uidHash];
        require(u.evmAddress == address(0), "already registered");
        require(evmAddress != address(0), "bad evm address");

        u.evmAddress = evmAddress;
        u.solanaPubkey = solanaPubkey;
        u.totpSecretHash = totpSecretHash;
        u.backupBlobHash = backupBlobHash;

        u.recoveryPendingUntil = 0;
        u.frozen = false;
        u.flags = 0;

        emit UserRegistered(uidHash, evmAddress, solanaPubkey);
    }

    /// Optional: update commitments (e.g., backup rotation) without changing wallets.
    function updateCommitments(
        bytes32 uidHash,
        bytes32 newTotpSecretHash,
        bytes32 newBackupBlobHash
    ) external onlyTrusted {
        User storage u = users[uidHash];
        require(u.evmAddress != address(0), "unknown user");
        require(!u.frozen, "frozen");

        u.totpSecretHash = newTotpSecretHash;
        u.backupBlobHash = newBackupBlobHash;
    }

    /// Emergency freeze/unfreeze (e.g., user reports device lost).
    function setFreeze(bytes32 uidHash, bool frozen) external onlyTrusted {
        User storage u = users[uidHash];
        require(u.evmAddress != address(0), "unknown user");
        u.frozen = frozen;
        emit FreezeSet(uidHash, frozen);
    }

    /// Start recovery: freeze + timelock
    function startRecovery(bytes32 uidHash, uint64 timelockSeconds) external onlyTrusted {
        User storage u = users[uidHash];
        require(u.evmAddress != address(0), "unknown user");
        require(u.recoveryPendingUntil == 0, "already recovering");

        uint64 until = uint64(block.timestamp) + timelockSeconds;
        u.recoveryPendingUntil = until;
        u.frozen = true;

        emit RecoveryStarted(uidHash, until);
        emit FreezeSet(uidHash, true);
    }

    /// Complete recovery: rotate TOTP commitment (and optionally unfreeze)
    function completeRecovery(bytes32 uidHash, bytes32 newTotpSecretHash) external onlyTrusted {
        User storage u = users[uidHash];
        require(u.evmAddress != address(0), "unknown user");
        require(u.recoveryPendingUntil != 0, "no recovery");
        require(block.timestamp >= u.recoveryPendingUntil, "timelock");

        u.recoveryPendingUntil = 0;
        u.totpSecretHash = newTotpSecretHash;
        u.frozen = false;

        emit RecoveryCompleted(uidHash);
        emit FreezeSet(uidHash, false);
    }

    /// Future-proof: allow wallet rotation if you ever want to re-key.
    function rotateWallets(bytes32 uidHash, address newEvmAddress, bytes32 newSolanaPubkey) external onlyTrusted {
        User storage u = users[uidHash];
        require(u.evmAddress != address(0), "unknown user");
        require(!u.frozen, "frozen");
        require(newEvmAddress != address(0), "bad evm address");

        u.evmAddress = newEvmAddress;
        u.solanaPubkey = newSolanaPubkey;

        emit UserRegistered(uidHash, newEvmAddress, newSolanaPubkey);
    }
}
