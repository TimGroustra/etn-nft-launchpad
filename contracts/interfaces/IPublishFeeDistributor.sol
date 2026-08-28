// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPublishFeeDistributor {
  function onShardTransfer(uint256 tokenId, address from, address to) external;

  function pendingReward(uint256 tokenId) external view returns (uint256);

  function shardWeight(uint256 tokenId) external pure returns (uint256);
}
