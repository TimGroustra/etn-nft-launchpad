// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWETN, ISwapRouterV3} from "./interfaces/IClubSwap.sol";
import {IMintable} from "./interfaces/IMintable.sol";

interface IEditableERC721 {
    struct BurnConfig {
        uint256 clubBurnAmount;
        bool burnOnMint;
        uint96 royaltyBurnBps;
    }
}

/// @notice ETN mint/royalty proceeds are wrapped to WETN and swapped for CLUB on ElectroSwap V3, then sent to the burn address.
contract EditableERC721 is ERC721URIStorage, ERC2981, Ownable2Step, ReentrancyGuard, IEditableERC721, IMintable {
    uint24 private constant POOL_FEE = 3000;

    IERC20 public immutable clubToken;
    address public immutable WETN;
    ISwapRouterV3 public immutable swapRouter;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    BurnConfig public burnConfig;
    uint256 public maxSupply;
    uint256 public mintPrice;
    uint256 public maxMintPerWallet;
    bool public isMintable;
    uint256 private _nextTokenId;
    string private _baseTokenURI;
    bool private _suppressRoyaltyBurn;

    event BaseURIUpdated(string newBaseURI);
    event BurnConfigUpdated(BurnConfig config);
    event MintPriceUpdated(uint256 newPrice);
    event MintableStatusUpdated(bool isMintable);
    event MaxMintPerWalletUpdated(uint256 maxMintPerWallet);
    event ClubBurned(uint256 clubBurned, uint256 etnUsed);
    event Withdrawn(address indexed owner, uint256 amount);
    event ERC20Withdrawn(address indexed owner, address indexed token, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address clubToken_,
        address wetn_,
        address swapRouter_,
        BurnConfig memory config_,
        uint256 maxSupply_,
        uint96 defaultRoyaltyBps_
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        require(config_.royaltyBurnBps <= 10_000, "Invalid royalty burn bps");
        require(defaultRoyaltyBps_ <= 10_000, "Invalid royalty bps");
        clubToken = IERC20(clubToken_);
        WETN = wetn_;
        swapRouter = ISwapRouterV3(swapRouter_);
        burnConfig = config_;
        maxSupply = maxSupply_;
        _nextTokenId = 1;
        isMintable = false;
        _setDefaultRoyalty(address(this), defaultRoyaltyBps_);
    }

    function setMintable(bool mintable_) external onlyOwner {
        isMintable = mintable_;
        emit MintableStatusUpdated(mintable_);
    }

    function setMaxMintPerWallet(uint256 maxMintPerWallet_) external onlyOwner {
        maxMintPerWallet = maxMintPerWallet_;
        emit MaxMintPerWalletUpdated(maxMintPerWallet_);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        if (_nextTokenId > 1) {
            emit BatchMetadataUpdate(1, _nextTokenId - 1);
        }
        emit BaseURIUpdated(baseURI_);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function setTokenURI(uint256 tokenId, string calldata uri) external onlyOwner {
        _requireOwned(tokenId);
        _setTokenURI(tokenId, uri);
    }

    function batchSetTokenURI(uint256[] calldata tokenIds, string[] calldata uris) external onlyOwner {
        require(tokenIds.length == uris.length, "Length mismatch");
        for (uint256 i = 0; i < tokenIds.length; i++) {
            _requireOwned(tokenIds[i]);
            _setTokenURI(tokenIds[i], uris[i]);
        }
    }

    function setBurnConfig(BurnConfig calldata config_) external onlyOwner {
        require(config_.royaltyBurnBps <= 10_000, "Invalid royalty burn bps");
        burnConfig = config_;
        emit BurnConfigUpdated(config_);
    }

    function setMintPrice(uint256 price) external onlyOwner {
        mintPrice = price;
        emit MintPriceUpdated(price);
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function ownerMint(address to, string calldata uri) external onlyOwner returns (uint256) {
        return _mintWithURI(to, uri);
    }

    function mintableCount(address account) public view returns (uint256) {
        if (!isMintable || mintPrice == 0) return 0;

        uint256 remaining = maxSupply - (_nextTokenId - 1);
        if (remaining == 0) return 0;

        if (maxMintPerWallet == 0) return remaining;

        uint256 owned = balanceOf(account);
        if (owned >= maxMintPerWallet) return 0;
        uint256 walletRemaining = maxMintPerWallet - owned;
        return walletRemaining < remaining ? walletRemaining : remaining;
    }

    /// @inheritdoc IMintable
    function mint(uint256 mintCount) external payable nonReentrant {
        require(isMintable, "Sale not active");
        require(mintCount > 0, "Quantity zero");
        require(bytes(_baseTokenURI).length > 0, "Base URI required");
        require(mintCount <= mintableCount(msg.sender), "Exceeds mintable count");
        require(msg.value == mintPrice * mintCount, "Incorrect payment");

        uint256 firstTokenId = _nextTokenId;
        for (uint256 i = 0; i < mintCount; i++) {
            _mintWithComposedURI(msg.sender);
        }
        if (firstTokenId < _nextTokenId) {
            emit BatchMetadataUpdate(firstTokenId, _nextTokenId - 1);
        }

        if (burnConfig.burnOnMint && burnConfig.clubBurnAmount > 0) {
            _swapEtnForExactClub(burnConfig.clubBurnAmount * mintCount, msg.value);
        }
    }

    function batchMint(address[] calldata recipients, string[] calldata uris) external onlyOwner returns (uint256[] memory) {
        require(recipients.length == uris.length, "Length mismatch");
        uint256[] memory tokenIds = new uint256[](recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            tokenIds[i] = _mintWithURI(recipients[i], uris[i]);
        }
        return tokenIds;
    }

    function _mintWithComposedURI(address to) internal returns (uint256) {
        require(_nextTokenId <= maxSupply, "Max supply reached");
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, _composeTokenURI(tokenId));
        return tokenId;
    }

    function _composeTokenURI(uint256 tokenId) internal pure returns (string memory) {
        return string(abi.encodePacked(Strings.toString(tokenId), ".json"));
    }
    function _mintWithURI(address to, string calldata uri) internal returns (uint256) {
        require(_nextTokenId <= maxSupply, "Max supply reached");
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        return tokenId;
    }

    function _canSwap() private view returns (bool) {
        return address(swapRouter) != address(0) && WETN != address(0);
    }

    function _refundWetn() private {
        uint256 wetnBal = IWETN(WETN).balanceOf(address(this));
        if (wetnBal == 0) return;
        _suppressRoyaltyBurn = true;
        IWETN(WETN).withdraw(wetnBal);
        _suppressRoyaltyBurn = false;
    }

    function _swapWetnForClub(uint256 wetnAmount) private returns (uint256 clubOut) {
        if (wetnAmount == 0) return 0;
        IWETN(WETN).approve(address(swapRouter), wetnAmount);
        ISwapRouterV3.ExactInputParams memory params = ISwapRouterV3.ExactInputParams({
            path: abi.encodePacked(WETN, POOL_FEE, address(clubToken)),
            recipient: DEAD,
            amountIn: wetnAmount,
            amountOutMinimum: 0
        });
        return swapRouter.exactInput(params);
    }

    function _swapEtnForClubBurn(uint256 etnAmount) private returns (uint256 clubOut) {
        if (etnAmount == 0 || !_canSwap()) return 0;

        IWETN(WETN).deposit{value: etnAmount}();
        clubOut = _swapWetnForClub(etnAmount);
        _refundWetn();

        if (clubOut > 0) emit ClubBurned(clubOut, etnAmount);
        return clubOut;
    }

    function _swapEtnForExactClub(uint256 clubOut, uint256 maxEtn) private returns (uint256 etnUsed) {
        if (clubOut == 0 || maxEtn == 0 || !_canSwap()) return 0;

        IWETN(WETN).deposit{value: maxEtn}();
        IWETN(WETN).approve(address(swapRouter), maxEtn);

        ISwapRouterV3.ExactOutputParams memory params = ISwapRouterV3.ExactOutputParams({
            path: abi.encodePacked(address(clubToken), POOL_FEE, WETN),
            recipient: DEAD,
            amountOut: clubOut,
            amountInMaximum: maxEtn
        });

        etnUsed = swapRouter.exactOutput(params);
        _refundWetn();

        if (clubOut > 0) emit ClubBurned(clubOut, etnUsed);
        return etnUsed;
    }

    function _processRoyaltyPayment(uint256 amount) private {
        if (amount == 0 || burnConfig.royaltyBurnBps == 0) return;

        uint256 burnEtn = (amount * uint256(burnConfig.royaltyBurnBps)) / 10_000;
        _swapEtnForClubBurn(burnEtn);
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance");
        address recipient = owner();
        (bool sent, ) = recipient.call{value: balance}("");
        require(sent, "Withdraw failed");
        emit Withdrawn(recipient, balance);
    }

    function withdrawERC20(address token) external onlyOwner nonReentrant {
        require(token != address(0), "Invalid token");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance");
        address recipient = owner();
        IERC20(token).transfer(recipient, balance);
        emit ERC20Withdrawn(recipient, token, balance);
    }

    receive() external payable {
        if (msg.sender == WETN || _suppressRoyaltyBurn) return;
        _processRoyaltyPayment(msg.value);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage, ERC2981) returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }
}
