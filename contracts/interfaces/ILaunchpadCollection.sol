// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILaunchpadCollection {
    struct BurnConfig {
        uint96 mintBurnBps;
        bool burnOnMint;
        uint96 royaltyBurnBps;
    }
}
