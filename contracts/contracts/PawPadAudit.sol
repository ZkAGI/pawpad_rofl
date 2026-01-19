// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import {Subcall} from "@oasisprotocol/sapphire-contracts/contracts/Subcall.sol";

/**
 * PawPadAudit
 * - Minimal on-chain audit log emitted by ROFL (TEE).
 * - Lets you later prove: "TEE executed action X for user Y with hash Z".
 */
contract PawPadAudit {
    bytes21 public immutable APP_ID;

    event Audit(bytes32 indexed uidHash, string action, bytes32 execHash, string meta);

    constructor(bytes21 appId) {
        APP_ID = appId;
    }

    modifier onlyRofl() {
        Subcall.roflEnsureAuthorizedOrigin(APP_ID);
        _;
    }

    function recordExecution(
        bytes32 uidHash,
        string calldata action,
        bytes32 execHash,
        string calldata meta
    ) external onlyRofl {
        emit Audit(uidHash, action, execHash, meta);
    }
}
