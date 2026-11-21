// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IPPassportRegistry.sol";

/**
 * @title ExampleSkillMarket
 * @notice 演示可组合性：Skill 市场上架前调用 registry.getLicenseAt 决定上架状态。
 * @dev 这只是示例逻辑，真实平台的规则由平台自行决定（需求 6.2）。
 */
contract ExampleSkillMarket {
    enum ListingStatus { APPROVED, PENDING_COMMERCIAL_LICENSE, NEEDS_REVIEW }

    struct Listing {
        bytes32 skillId;
        bytes32 sourceWorkId;
        IPPassportRegistry.CommercialPolicy policy;
        ListingStatus status;
        address lister;
        uint64 listedAt;
    }

    IPPassportRegistry public immutable registry;

    mapping(bytes32 => Listing) public listings;

    event SkillListed(bytes32 indexed skillId, bytes32 indexed sourceWorkId, IPPassportRegistry.CommercialPolicy policy, ListingStatus status);
    event ObligationsNotAcknowledged(bytes32 indexed skillId);

    error ObligationsNotAcknowledgedError();
    error UnknownSourceWork();

    constructor(IPPassportRegistry _registry) {
        registry = _registry;
    }

    /**
     * @notice 上架一个基于 sourceWorkId 的 Skill。
     *         PERMISSIVE → 直接上架；
     *         WEAK/STRONG/NETWORK_COPYLEFT → 须 acknowledgeObligations，否则 revert；
     *         NONCOMMERCIAL/SOURCE_AVAILABLE/PROPRIETARY → PENDING_COMMERCIAL_LICENSE；
     *         UNSPECIFIED → NEEDS_REVIEW。
     *         每次调用都写 registry.recordListingCheck。
     */
    function listSkill(bytes32 skillId, bytes32 sourceWorkId, bool acknowledgeObligations) external {
        IPPassportRegistry.Work memory w = registry.getWork(sourceWorkId);
        if (w.owner == address(0)) revert UnknownSourceWork();

        IPPassportRegistry.License memory lic = registry.getLicenseAt(sourceWorkId, uint64(block.timestamp));

        ListingStatus status;
        if (lic.policy == IPPassportRegistry.CommercialPolicy.PERMISSIVE) {
            status = ListingStatus.APPROVED;
        } else if (
            lic.policy == IPPassportRegistry.CommercialPolicy.WEAK_COPYLEFT ||
            lic.policy == IPPassportRegistry.CommercialPolicy.STRONG_COPYLEFT ||
            lic.policy == IPPassportRegistry.CommercialPolicy.NETWORK_COPYLEFT
        ) {
            if (!acknowledgeObligations) {
                emit ObligationsNotAcknowledged(skillId);
                revert ObligationsNotAcknowledgedError();
            }
            status = ListingStatus.APPROVED;
        } else if (
            lic.policy == IPPassportRegistry.CommercialPolicy.NONCOMMERCIAL ||
            lic.policy == IPPassportRegistry.CommercialPolicy.SOURCE_AVAILABLE ||
            lic.policy == IPPassportRegistry.CommercialPolicy.PROPRIETARY
        ) {
            status = ListingStatus.PENDING_COMMERCIAL_LICENSE;
        } else {
            status = ListingStatus.NEEDS_REVIEW;
        }

        listings[skillId] = Listing({
            skillId: skillId,
            sourceWorkId: sourceWorkId,
            policy: lic.policy,
            status: status,
            lister: msg.sender,
            listedAt: uint64(block.timestamp)
        });

        // resultHash = keccak256(policy ‖ status)，演示检查记录摘要
        bytes32 resultHash = keccak256(abi.encodePacked(uint8(lic.policy), uint8(status)));
        registry.recordListingCheck(skillId, sourceWorkId, resultHash, acknowledgeObligations);

        emit SkillListed(skillId, sourceWorkId, lic.policy, status);
    }

    function getListing(bytes32 skillId) external view returns (Listing memory) {
        return listings[skillId];
    }
}
