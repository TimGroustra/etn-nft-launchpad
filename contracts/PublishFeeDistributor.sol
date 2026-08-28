// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IGemShardsMetadata {
    function notifyMetadataUpdate(uint256 tokenId) external;

    function notifyMetadataBatchUpdate(uint256 fromTokenId, uint256 toTokenId) external;
}

/// @notice Receives launchpad platform fees, sends 50% to treasury, accrues 50% to weighted Gem Shard holders.
contract PublishFeeDistributor is Ownable2Step, ReentrancyGuard {
    uint256 public constant HOLDER_SHARE_BPS = 5000;
    uint256 public constant TOTAL_SHARE_WEIGHT = 500;
    uint256 public constant PRECISION = 1e18;
    uint256 public constant PRIMAL_TOKEN_ID_START = 491;
    uint256 public constant MAX_TOKEN_ID = 495;
    uint256 public constant PRIMAL_TOKEN_ID_END = 495;
    uint256 public constant PRIMAL_SHARE_WEIGHT = 2;
    uint256 public constant NORMAL_SHARE_WEIGHT = 1;

    address public immutable treasury;
    address public gemShards;

    uint256 public accRewardPerWeight;
    uint256 public totalActiveWeight;
    mapping(uint256 => uint256) public rewardDebt;

    event GemShardsUpdated(address gemShards);
    event TreasuryPaid(address treasury, uint256 amount);
    event RewardPoolFunded(uint256 holderShare);
    event RewardClaimed(uint256 indexed tokenId, address indexed claimant, uint256 amount);

    constructor(address initialOwner, address treasury_) Ownable(initialOwner) {
        require(treasury_ != address(0), "Invalid treasury");
        treasury = treasury_;
    }

    function setGemShards(address gemShards_) external onlyOwner {
        require(gemShards_ != address(0), "Invalid gem shards");
        gemShards = gemShards_;
        emit GemShardsUpdated(gemShards_);
    }

    receive() external payable {
        _fundRewardPool(msg.value);
    }

    function shardWeight(uint256 tokenId) public pure returns (uint256) {
        if (tokenId >= PRIMAL_TOKEN_ID_START && tokenId <= PRIMAL_TOKEN_ID_END) {
            return PRIMAL_SHARE_WEIGHT;
        }
        return NORMAL_SHARE_WEIGHT;
    }

    function pendingReward(uint256 tokenId) public view returns (uint256) {
        uint256 weight = shardWeight(tokenId);
        uint256 accumulated = accRewardPerWeight - rewardDebt[tokenId];
        return (accumulated * weight) / PRECISION;
    }

    function claim(uint256 tokenId) external nonReentrant {
        _claimTo(tokenId, msg.sender);
    }

    function claimBatch(uint256[] calldata tokenIds) external nonReentrant {
        require(tokenIds.length > 0, "Empty batch");
        for (uint256 i = 0; i < tokenIds.length; i++) {
            _claimTo(tokenIds[i], msg.sender);
        }
    }

    function onShardTransfer(uint256 tokenId, address from, address to) external {
        require(msg.sender == gemShards, "Only gem shards");
        uint256 weight = shardWeight(tokenId);

        if (from != address(0)) {
            _settle(tokenId, from);
            if (to == address(0)) {
                totalActiveWeight -= weight;
            }
        }
        if (to != address(0)) {
            rewardDebt[tokenId] = accRewardPerWeight;
            if (from == address(0)) {
                totalActiveWeight += weight;
            }
        }
        if (gemShards != address(0)) {
            IGemShardsMetadata(gemShards).notifyMetadataUpdate(tokenId);
        }
    }

    function sweepDust(address payable to) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance");
        (bool sent, ) = to.call{value: balance}("");
        require(sent, "Sweep failed");
    }

    function _fundRewardPool(uint256 amount) private {
        if (amount == 0) return;
        uint256 treasuryShare = (amount * (10_000 - HOLDER_SHARE_BPS)) / 10_000;
        uint256 holderShare = amount - treasuryShare;

        if (treasuryShare > 0) {
            (bool sent, ) = treasury.call{value: treasuryShare}("");
            require(sent, "Treasury transfer failed");
            emit TreasuryPaid(treasury, treasuryShare);
        }

        if (holderShare > 0) {
            if (totalActiveWeight == 0) {
                (bool sentHolder, ) = treasury.call{value: holderShare}("");
                require(sentHolder, "Treasury transfer failed");
                emit TreasuryPaid(treasury, holderShare);
            } else {
                accRewardPerWeight += (holderShare * PRECISION) / totalActiveWeight;
                emit RewardPoolFunded(holderShare);
                if (gemShards != address(0)) {
                    IGemShardsMetadata(gemShards).notifyMetadataBatchUpdate(1, MAX_TOKEN_ID);
                }
            }
        }
    }

    function _claimTo(uint256 tokenId, address claimant) private {
        require(gemShards != address(0), "Gem shards not set");
        require(IERC721(gemShards).ownerOf(tokenId) == claimant, "Not shard owner");

        uint256 amount = pendingReward(tokenId);
        require(amount > 0, "Nothing to claim");

        rewardDebt[tokenId] = accRewardPerWeight;

        (bool sent, ) = claimant.call{value: amount}("");
        require(sent, "Claim transfer failed");

        emit RewardClaimed(tokenId, claimant, amount);
        IGemShardsMetadata(gemShards).notifyMetadataUpdate(tokenId);
    }

    function _settle(uint256 tokenId, address recipient) private {
        uint256 amount = pendingReward(tokenId);
        if (amount == 0) return;
        rewardDebt[tokenId] = accRewardPerWeight;
        (bool sent, ) = recipient.call{value: amount}("");
        require(sent, "Settle transfer failed");
        emit RewardClaimed(tokenId, recipient, amount);
    }
}
